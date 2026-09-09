import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

const REACH_MAX = 60;

/* ── public queries ─────────────────────────────────────────────── */

export const eldestForebear = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    const people = await ctx.db
      .query("people")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .collect();

    const roots = people.filter((p: any) => !p.fatherId && !p.motherId);
    const pool = roots.length > 0 ? roots : people;
    const sorted = [...pool].sort(
      (a: any, b: any) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999),
    );
    return sorted.length > 0 ? sorted[0] : null;
  },
});

export const householdHub = query({
  args: { familyId: v.id("families"), personId: v.id("people") },
  handler: async (ctx, { familyId, personId }) => {
    const person = await ctx.db.get(personId);
    if (!person || person.familyId !== familyId) return null;

    const spouse = await findSpouse(ctx, personId, familyId);
    const parents = await findParents(ctx, personId, familyId);
    const children = await findChildren(ctx, personId, familyId, spouse?._id);
    const siblingCount = await countSiblings(ctx, person, familyId);

    return {
      person: pv(person),
      spouse,
      parents,
      children,
      siblingCount,
    };
  },
});

export const ancestorsOf = query({
  args: { personId: v.id("people"), familyId: v.id("families") },
  handler: async (ctx: any, { personId, familyId }) => {
    const ids: Id<"people">[] = [];
    const seen = new Set<string>();
    let cur: Id<"people"> | null = personId;

    for (let i = 0; i < REACH_MAX && cur != null; i++) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const node: any = await ctx.db.get(cur);
      if (!node || node.familyId !== familyId) break;
      ids.unshift(node._id);
      cur = (node.fatherId ?? node.motherId) ?? null;
    }

    if (ids.length === 0) return [];

    const all = await ctx.db
      .query("people")
      .withIndex("by_family", (q: any) => q.eq("familyId", familyId))
      .collect();
    return all.filter((p: any) => ids.includes(p._id)).map(pv);
  },
});

export const childrenOf = query({
  args: {
    familyId: v.id("families"),
    personId: v.id("people"),
    spouseId: v.optional(v.id("people")),
  },
  handler: async (ctx, { familyId, personId, spouseId }) => {
    const members = await ctx.db
      .query("people")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .collect();

    const kids: any[] = [];
    for (const m of members) {
      const byFather = m.fatherId === personId;
      const byMother =
        spouseId != null
          ? m.motherId === spouseId
          : m.motherId != null &&
            (await parentOf(ctx, m._id, personId, familyId));
      if (byFather || byMother) kids.push(m);
    }
    kids.sort(
      (a: any, b: any) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999),
    );
    return kids.map(pv);
  },
});

export const allFamilyMembers = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    const members = await ctx.db
      .query("people")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .collect();
    const sorted = members.sort((a: any, b: any) =>
      (a.birthYear ?? 9999) - (b.birthYear ?? 9999) ||
      a.name.localeCompare(b.name),
    );
    return sorted.map(pv);
  },
});

export const removeFamily = mutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    const family = await ctx.db.get(familyId);
    if (!family) throw new Error("Register not found.");

    const userId = await getAuthUserId(ctx);
    if (userId !== family.createdBy) {
      throw new Error("Only the register's curator may dissolve it.");
    }

    const members = await ctx.db
      .query("people")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .collect();
    for (const p of members) {
      await ctx.db.delete(p._id);
    }
    await ctx.db.delete(familyId);
  },
});

/* ── helpers ────────────────────────────────────────────────────── */

type PV = {
  _id: Id<"people">;
  name: string;
  birthYear?: number;
  deathYear?: number;
  sex?: "male" | "female";
  imageUrl?: string;
};

function pv(p: any): PV {
  return {
    _id: p._id,
    name: p.name,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    sex: p.sex,
    imageUrl: p.imageUrl,
  };
}

async function findSpouse(
  ctx: any,
  personId: Id<"people">,
  familyId: Id<"families">,
): Promise<PV | null> {
  const person = await ctx.db.get(personId);
  if (!person) return null;
  if (person.partnerId) {
    const partner = await ctx.db.get(person.partnerId);
    if (partner && partner.familyId === familyId) return pv(partner);
  }
  const members = await ctx.db
    .query("people")
    .withIndex("by_family", (q: any) => q.eq("familyId", familyId))
    .collect();
  for (const m of members) {
    if (m.partnerId === personId) return pv(m);
  }
  return null;
}

async function findParents(
  ctx: any,
  personId: Id<"people">,
  familyId: Id<"families">,
): Promise<PV[]> {
  const person = await ctx.db.get(personId);
  if (!person || person.familyId !== familyId) return [];
  const ids: Id<"people">[] = [];
  if (person.fatherId) ids.push(person.fatherId);
  if (person.motherId) ids.push(person.motherId);
  if (ids.length === 0) return [];
  const parents = await ctx.db.getMany(ids);
  const raw = await ctx.db.getMany(ids);
  const out: PV[] = [];
  for (const p of raw) {
    if (p) out.push(pv(p));
  }
  return out.sort((a: any, b: any) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999));
}

async function findChildren(
  ctx: any,
  personId: Id<"people">,
  familyId: Id<"families">,
  spouseId?: Id<"people">,
): Promise<PV[]> {
  const members = await ctx.db
    .query("people")
    .withIndex("by_family", (q: any) => q.eq("familyId", familyId))
    .collect();
  const kids: any[] = [];
  for (const m of members) {
    const byFather = m.fatherId === personId;
    const byMother =
      spouseId != null
        ? m.motherId === spouseId
        : m.motherId != null &&
          (await parentOf(ctx, m._id, personId, familyId));
    if (byFather || byMother) kids.push(m);
  }
  return kids
    .sort((a: any, b: any) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999))
    .map(pv);
}

async function parentOf(
  ctx: any,
  childId: Id<"people">,
  candidateId: Id<"people">,
  familyId: Id<"families">,
): Promise<boolean> {
  const child = await ctx.db.get(childId);
  if (!child || child.familyId !== familyId) return false;
  return child.fatherId === candidateId || child.motherId === candidateId;
}

async function countSiblings(
  ctx: any,
  person: {
    _id: Id<"people">;
    fatherId?: Id<"people">;
    motherId?: Id<"people">;
  },
  familyId: Id<"families">,
): Promise<number> {
  const members = await ctx.db
    .query("people")
    .withIndex("by_family", (q: any) => q.eq("familyId", familyId))
    .collect();
  let count = 0;
  for (const m of members) {
    if (m._id === person._id) continue;
    if (sameParentSet(m, person)) count++;
  }
  return count;
}

function sameParentSet(
  a: {
    fatherId?: Id<"people">;
    motherId?: Id<"people">;
  },
  b: {
    fatherId?: Id<"people">;
    motherId?: Id<"people">;
  },
): boolean {
  const aF = a.fatherId;
  const aM = a.motherId;
  const bF = b.fatherId;
  const bM = b.motherId;
  if (aF == null && aM == null) return true;
  if (bF == null && bM == null) return true;
  if (aF != null && bF != null && aM != null && bM != null)
    return aF === bF && aM === bM;
  if (aF != null && bF != null) return aF === bF;
  if (aM != null && bM != null) return aM === bM;
  return false;
}

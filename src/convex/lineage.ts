import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { withPhoto } from "./people";
import { requireCurator } from "./families";

/** Case-insensitive name lookup across every register the user owns. Used by
 *  the entry dialog so a new name auto-fills with an existing person's data. */
export const lookupByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const q = name.trim().toLowerCase();
    if (!q) return null;
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const families = await ctx.db
      .query("families")
      .withIndex("by_creator", (f) => f.eq("createdBy", userId))
      .collect();
    for (const family of families) {
      const members = await ctx.db
        .query("people")
        .withIndex("by_family", (m) => m.eq("familyId", family._id))
        .collect();
      for (const m of members) {
        if (m.name.toLowerCase() === q) {
          return {
            _id: m._id,
            name: m.name,
            familyId: m.familyId,
            familyName: family.name,
            familySlug: family.slug,
            sex: m.sex,
            birthYear: m.birthYear,
            deathYear: m.deathYear,
            fatherId: m.fatherId,
            motherId: m.motherId,
            partnerId: m.partnerId,
          };
        }
      }
    }
    return null;
  },
});

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

/** Fetch any people by ID, regardless of register — used by the tree to
 *  resolve cross-register partner/parent links. */
export const peopleByIds = query({
  args: { ids: v.array(v.id("people")) },
  handler: async (ctx, { ids }) => {
    const out: ReturnType<typeof pv>[] = [];
    for (const id of ids.slice(0, 100)) {
      const p = await ctx.db.get(id);
      if (p) out.push(pv(p));
    }
    return out;
  },
});

/** All children of a person across EVERY register, plus the register each
 *  child lives in. Powers the remote-branch expansion. */
export const childrenGlobal = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    // by_parents_father / by_parents_mother are composite (familyId first),
    // so gather all registers this person touches and scan those.
    const person = await ctx.db.get(personId);
    if (!person) return [];
    const familyIds = new Set<Id<"families">>([person.familyId]);

    // Registers where children might live: home register + partner's register.
    if (person.partnerId) {
      const partner = await ctx.db.get(person.partnerId);
      if (partner) familyIds.add(partner.familyId);
    }

    const kids: (PV & { familyId: Id<"families"> })[] = [];
    for (const familyId of familyIds) {
      const members = await ctx.db
        .query("people")
        .withIndex("by_family", (q: any) => q.eq("familyId", familyId))
        .collect();
      for (const m of members) {
        if (m.fatherId === personId || m.motherId === personId) {
          kids.push({ ...pv(m), familyId: m.familyId });
        }
      }
    }
    kids.sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999));
    return kids;
  },
});

/** The cross-register spouse of a person, labelled with the spouse's own
 *  register for the tree canvas's ❦ badge. */
export const remoteBranch = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    const spouse = person?.partnerId ? await ctx.db.get(person.partnerId) : null;
    if (!spouse) return null;
    const family = await ctx.db.get(spouse.familyId);
    return { familyName: family?.name ?? "", spouse: pv(await withPhoto(ctx, spouse)) };
  },
});

export const removeFamily = mutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    const family = await requireCurator(ctx, familyId);

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
  const out: PV[] = [];
  for (const id of ids) {
    const p = await ctx.db.get(id);
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

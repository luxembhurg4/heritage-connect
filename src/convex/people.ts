import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireCurator } from "./families";
import { requireApproved } from "./users";

const personFields = {
  name: v.string(),
  sex: v.optional(v.union(v.literal("male"), v.literal("female"))),
  birthYear: v.optional(v.number()),
  deathYear: v.optional(v.number()),
  fatherId: v.optional(v.id("people")),
  motherId: v.optional(v.id("people")),
  partnerId: v.optional(v.id("people")),
  imageStorageId: v.optional(v.id("_storage")),
};

/** Signed-in curators get a short-lived URL to upload a photograph to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireApproved(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** A photo's URL depends on the deployment serving it (it changed when the
 *  data moved to the cloud), so resolve it on read instead of trusting the
 *  copy stored at upload time. */
export async function withPhoto<
  T extends { imageStorageId?: Id<"_storage">; imageUrl?: string },
>(ctx: QueryCtx, p: T): Promise<T> {
  if (!p.imageStorageId) return p;
  return { ...p, imageUrl: (await ctx.storage.getUrl(p.imageStorageId)) ?? p.imageUrl };
}

/** Everyone in a register. Public — the archive is browsable by anyone. */
export const listByFamily = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    const people = await ctx.db
      .query("people")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .collect();
    return await Promise.all(people.map((p) => withPhoto(ctx, p)));
  },
});

/** Everyone in the signed-in curator's registers, with each register's name:
 *  the people an entry may name as a parent or partner. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const families = await ctx.db
      .query("families")
      .withIndex("by_creator", (q) => q.eq("createdBy", userId))
      .collect();
    const out: (Doc<"people"> & { familyName: string })[] = [];
    for (const family of families) {
      const members = await ctx.db
        .query("people")
        .withIndex("by_family", (q) => q.eq("familyId", family._id))
        .collect();
      out.push(...members.map((m) => ({ ...m, familyName: family.name })));
    }
    return out;
  },
});

export const create = mutation({
  args: {
    familyId: v.id("families"),
    ...personFields,
  },
  handler: async (ctx, args) => {
    const { familyId } = args;
    await requireCurator(ctx, familyId);
    const name = args.name.trim();
    if (!name) throw new Error("Every entry needs a name.");
    validateYears(args.birthYear, args.deathYear);
    const fatherId = args.fatherId || undefined;
    const motherId = args.motherId || undefined;
    const partnerId = args.partnerId || undefined;
    if (fatherId && fatherId === partnerId) {
      throw new Error("A father cannot also be the partner.");
    }
    if (motherId && motherId === partnerId) {
      throw new Error("A mother cannot also be the partner.");
    }
    await assertRelations(ctx, familyId, null, fatherId, motherId, partnerId);
    const imageUrl = args.imageStorageId
      ? ((await ctx.storage.getUrl(args.imageStorageId)) ?? undefined)
      : undefined;
    const newId = await ctx.db.insert("people", {
      ...args,
      name,
      fatherId,
      motherId,
      partnerId,
      imageUrl,
    });
    // Partnerships are reciprocal: if a partner was named, bind them back to
    // the new entry (displacing any prior partner they were joined to).
    if (partnerId) {
      const partner = await ctx.db.get(partnerId);
      if (partner) {
        if (partner.partnerId) {
          const displaced = await ctx.db.get(partner.partnerId);
          if (displaced && displaced.partnerId === partnerId) {
            await ctx.db.patch(displaced._id, { partnerId: undefined });
          }
        }
        await ctx.db.patch(partnerId, { partnerId: newId });
      }
    }
    return newId;
  },
});

export const update = mutation({
  args: {
    personId: v.id("people"),
    ...personFields,
  },
  handler: async (ctx, { personId, ...fields }) => {
    const person = await ctx.db.get(personId);
    if (!person) throw new Error("Entry not found.");
    await requireCurator(ctx, person.familyId);
    const name = fields.name.trim();
    if (!name) throw new Error("Every entry needs a name.");
    validateYears(fields.birthYear, fields.deathYear);
    const fatherId = fields.fatherId || undefined;
    const motherId = fields.motherId || undefined;
    const partnerId = fields.partnerId || undefined;
    if (fatherId === personId || motherId === personId) {
      throw new Error("A person cannot be their own parent.");
    }
    if (partnerId === personId) {
      throw new Error("A person cannot be their own partner.");
    }
    if (fatherId && fatherId === partnerId) {
      throw new Error("A father cannot also be the partner.");
    }
    if (motherId && motherId === partnerId) {
      throw new Error("A mother cannot also be the partner.");
    }
    await assertRelations(
      ctx,
      person.familyId,
      personId,
      fatherId,
      motherId,
      partnerId,
    );
    // Keep partnerships reciprocal.
    if (person.partnerId && person.partnerId !== partnerId) {
      const oldPartner = await ctx.db.get(person.partnerId);
      if (oldPartner && oldPartner.partnerId === personId) {
        await ctx.db.patch(oldPartner._id, { partnerId: undefined });
      }
    }
    if (partnerId) {
      const newPartner = await ctx.db.get(partnerId);
      if (!newPartner) throw new Error("Partner not found.");
      // Cross-register partner bonds are allowed — this is how registers
      // stitch together (a Cenabre-born spouse joined to a Mellomida).
      // Ancestor/descendant guards still apply globally (see assertRelations).
      if (
        partnerId !== person.partnerId &&
        newPartner.partnerId &&
        newPartner.partnerId !== personId
      ) {
        const displaced = await ctx.db.get(newPartner.partnerId);
        if (displaced && displaced.partnerId === newPartner._id) {
          await ctx.db.patch(displaced._id, { partnerId: undefined });
        }
      }
      // Always ensure the named partner points back — even when the bond is
      // unchanged, this heals one-sided bonds left over from older saves.
      if (newPartner.partnerId !== personId) {
        await ctx.db.patch(partnerId, { partnerId: personId });
      }
    }
    await ctx.db.patch(personId, {
      name,
      sex: fields.sex,
      birthYear: fields.birthYear,
      deathYear: fields.deathYear,
      fatherId,
      motherId,
      partnerId,
      imageStorageId: fields.imageStorageId,
      imageUrl: fields.imageStorageId
        ? ((await ctx.storage.getUrl(fields.imageStorageId)) ?? undefined)
        : undefined,
    });
  },
});

/**
 * Detect and undo structurally impossible links (partner-ancestor knots,
 * broken reciprocity) left over from earlier edits. Returns repair count.
 */
export const repairCycles = mutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    await requireCurator(ctx, familyId);
    const members = await ctx.db
      .query("people")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .collect();
    let repairs = 0;
    for (const p of members) {
      const patch: Record<string, any> = {};
      if (
        p.fatherId &&
        (p.fatherId === p.partnerId ||
          (await reachesAncestor(ctx, p.fatherId, p._id)))
      ) {
        patch.fatherId = undefined;
        repairs++;
      }
      if (
        p.motherId &&
        (p.motherId === p.partnerId ||
          (await reachesAncestor(ctx, p.motherId, p._id)))
      ) {
        patch.motherId = undefined;
        repairs++;
      }
      if (p.partnerId) {
        const q = await ctx.db.get(p.partnerId);
        const isDescendant =
          q?.fatherId === p._id || q?.motherId === p._id ||
          (await reachesAncestor(ctx, p.partnerId, p._id));
        const isAncestor = await reachesAncestor(ctx, p._id, p.partnerId);
        // Partner bonds may cross registers — only sever if the partner no
        // longer exists or the bond knots the lineage.
        if (!q || isDescendant || isAncestor) {
          patch.partnerId = undefined;
          repairs++;
        } else if (q.partnerId !== p._id) {
          // Heal broken reciprocity instead of severing the bond.
          await ctx.db.patch(q._id, { partnerId: p._id });
          repairs++;
        }
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(p._id, patch);
      }
    }
    return repairs;
  },
});

export const remove = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) throw new Error("Entry not found.");
    await requireCurator(ctx, person.familyId);
    // Links can come from other registers too (children born there, spouses).
    // shortcut: reads every person — fine to a few thousand; past that, add
    // father/mother indexes and look the links up instead.
    const everyone = await ctx.db.query("people").collect();
    for (const other of everyone) {
      const patch: Record<string, any> = {};
      if (other.fatherId === personId) patch.fatherId = undefined;
      if (other.motherId === personId) patch.motherId = undefined;
      if (other.partnerId === personId) patch.partnerId = undefined;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(other._id, patch);
      }
    }
    await ctx.db.delete(personId);
  },
});

function validateYears(
  birthYear?: number,
  deathYear?: number,
): void {
  if (
    birthYear !== undefined &&
    deathYear !== undefined &&
    deathYear < birthYear
  ) {
    throw new Error("The year of death precedes the year of birth.");
  }
}

/** Ensure relations exist and create no cycles. Parents and partners may live
 *  in another register (that is how registers join), but a new link there
 *  needs its curator too, so no one grafts people onto a register they don't
 *  keep. Links already recorded stay as they are. */
async function assertRelations(
  ctx: any,
  familyId: any,
  selfId: string | null,
  fatherId?: string,
  motherId?: string,
  partnerId?: string,
): Promise<void> {
  const self = selfId ? await ctx.db.get(selfId as any) : null;
  const had = [self?.fatherId, self?.motherId, self?.partnerId];
  for (const relation of [fatherId, motherId, partnerId]) {
    if (!relation) continue;
    if (relation === selfId) {
      throw new Error("A person cannot be related to themselves.");
    }
    const target = await ctx.db.get(relation as any);
    if (!target) throw new Error("Related person not found.");
    if (target.familyId !== familyId && !had.includes(relation)) {
      const register = await ctx.db.get(target.familyId);
      if (register?.createdBy !== (await getAuthUserId(ctx))) {
        throw new Error(`${target.name} is in a register you don't curate.`);
      }
    }
  }
  if (selfId) {
    for (const relation of [fatherId, motherId]) {
      if (!relation) continue;
      if (await reachesAncestor(ctx, relation as string, selfId)) {
        throw new Error(
          "That would make an ancestor their own descendant.",
        );
      }
    }
    // A partner may be neither an ancestor nor a descendant — such a bond
    // would tie the family tree into a knot the tree cannot draw.
    if (partnerId) {
      if (await reachesAncestor(ctx, partnerId, selfId)) {
        throw new Error("A partner cannot be a descendant.");
      }
      if (await reachesAncestor(ctx, selfId, partnerId)) {
        throw new Error("A partner cannot be an ancestor.");
      }
    }
  }
}

/** Walk upward from `start`; returns true if `target` is among the ancestors. */
async function reachesAncestor(
  ctx: any,
  start: string,
  target: string,
): Promise<boolean> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    if (currentId === target) return true;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    const person = await ctx.db.get(currentId as any);
    if (!person) continue;
    if (person.fatherId) stack.push(person.fatherId);
    if (person.motherId) stack.push(person.motherId);
  }
  return false;
}


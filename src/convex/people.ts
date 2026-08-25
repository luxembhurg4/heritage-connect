import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to add photographs.");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Everyone in a register. Public — the archive is browsable by anyone. */
export const listByFamily = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    return await ctx.db
      .query("people")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .collect();
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
    return await ctx.db.insert("people", {
      ...args,
      name,
      fatherId,
      motherId,
      partnerId,
      imageUrl,
    });
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
    if (partnerId && partnerId !== person.partnerId) {
      const newPartner = await ctx.db.get(partnerId);
      if (!newPartner) throw new Error("Partner not found.");
      if (newPartner.familyId !== person.familyId) {
        throw new Error("Partner must belong to the same register.");
      }
      if (
        newPartner.partnerId &&
        newPartner.partnerId !== personId
      ) {
        const displaced = await ctx.db.get(newPartner.partnerId);
        if (displaced && displaced.partnerId === newPartner._id) {
          await ctx.db.patch(displaced._id, { partnerId: undefined });
        }
      }
      await ctx.db.patch(partnerId, { partnerId: personId });
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

export const remove = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) throw new Error("Entry not found.");
    await requireCurator(ctx, person.familyId);
    const members = await ctx.db
      .query("people")
      .withIndex("by_family", (q) => q.eq("familyId", person.familyId))
      .collect();
    for (const other of members) {
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

/** Ensure relations exist, belong to this register, and create no cycles. */
async function assertRelations(
  ctx: any,
  familyId: any,
  selfId: string | null,
  fatherId?: string,
  motherId?: string,
  partnerId?: string,
): Promise<void> {
  for (const relation of [fatherId, motherId, partnerId]) {
    if (!relation) continue;
    if (relation === selfId) {
      throw new Error("A person cannot be related to themselves.");
    }
    const target = await ctx.db.get(relation as any);
    if (!target) throw new Error("Related person not found.");
    if (target.familyId !== familyId) {
      throw new Error("Relatives must belong to the same register.");
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

async function requireCurator(ctx: any, familyId: any) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Sign in to edit this register.");
  const family = await ctx.db.get(familyId);
  if (!family) throw new Error("Register not found.");
  if (family.createdBy !== userId) {
    throw new Error("Only the register's curator may edit it.");
  }
}

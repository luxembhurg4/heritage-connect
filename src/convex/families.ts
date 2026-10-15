import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireApproved } from "./users";

export const DEMO_SLUG = "whitmore-family-archive";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "family-archive";
}

async function uniqueSlug(ctx: any, name: string): Promise<string> {
  let slug = slugify(name);
  const existing = await ctx.db
    .query("families")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .unique();
  if (existing) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return slug;
}

/** All public registers, with member counts. No auth required. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const families = await ctx.db.query("families").order("desc").collect();
    return await Promise.all(
      families.map(async (family) => {
        const members = await ctx.db
          .query("people")
          .withIndex("by_family", (q) => q.eq("familyId", family._id))
          .collect();
        const curator = family.createdBy
          ? await ctx.db.get(family.createdBy)
          : null;
        return {
          ...family,
          memberCount: members.length,
          curatorName: curator?.name ?? null,
        };
      }),
    );
  },
});

/** Registers curated by the signed-in user. */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("families")
      .withIndex("by_creator", (q) => q.eq("createdBy", userId))
      .collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("families")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { name, description }) => {
    const userId = await requireApproved(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Give the register a name.");
    const slug = await uniqueSlug(ctx, trimmed);
    return await ctx.db.insert("families", {
      name: trimmed,
      slug,
      description: description?.trim() || undefined,
      createdBy: userId,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    familyId: v.id("families"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { familyId, name, description }) => {
    await requireCurator(ctx, familyId);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Give the register a name.");
    await ctx.db.patch(familyId, {
      name: trimmed,
      description: description?.trim() || undefined,
    });
  },
});

export const remove = mutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    await requireCurator(ctx, familyId);
    const members = await ctx.db
      .query("people")
      .withIndex("by_family", (q) => q.eq("familyId", familyId))
      .collect();
    const gone = new Set<string>(members.map((p) => p._id));
    // Unlink people in other registers who point here (children recorded
    // there, spouses), so their entries don't keep a link to no one.
    // shortcut: reads every person — fine to a few thousand.
    for (const p of await ctx.db.query("people").collect()) {
      if (gone.has(p._id)) continue;
      const patch: Record<string, undefined> = {};
      for (const key of ["fatherId", "motherId", "partnerId"] as const) {
        if (p[key] && gone.has(p[key])) patch[key] = undefined;
      }
      if (Object.keys(patch).length > 0) await ctx.db.patch(p._id, patch);
    }
    for (const person of members) {
      await ctx.db.delete(person._id);
    }
    await ctx.db.delete(familyId);
  },
});

/**
 * Idempotently restore the specimen archive (The Whitmore Family).
 * Public so visitors can summon the demo even before signing up.
 */
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("families")
      .withIndex("by_slug", (q) => q.eq("slug", DEMO_SLUG))
      .unique();
    if (existing) return existing._id;

    const userId = await getAuthUserId(ctx);
    const familyId = await ctx.db.insert("families", {
      name: "The Whitmore Family",
      slug: DEMO_SLUG,
      description:
        "A five-generation specimen register of the Whitmores of Ashford Vale, compiled for demonstration.",
      createdBy: userId ?? undefined,
      createdAt: Date.now(),
    });

    // alias -> doc id
    const id: Record<string, any> = {};
    const add = async (
      alias: string,
      name: string,
      sex: "male" | "female" | undefined,
      birthYear: number | undefined,
      deathYear: number | undefined,
    ) => {
      id[alias] = await ctx.db.insert("people", {
        familyId,
        name,
        sex,
        birthYear,
        deathYear,
      });
    };

    // Generation I — the founders.
    await add("samuel", "Samuel Whitmore", "male", 1861, 1932);
    await add("edith", "Edith Whitmore", "female", 1865, 1944);

    // Generation II — their children & spouses.
    await add("arthur", "Arthur Whitmore", "male", 1889, 1964);
    await add("rose", "Rose Whitmore", "female", 1892, 1971);
    await add("beatrice", "Beatrice Ellery", "female", 1891, 1980);
    await add("henry", "Henry Ellery", "male", 1888, 1957);
    await add("wilfred", "Wilfred Whitmore", "male", 1894, 1897);

    // Generation III.
    await add("walter", "Walter Whitmore", "male", 1915, 1988);
    await add("margaret", "Margaret Whitmore", "female", 1918, 2001);
    await add("eleanor", "Eleanor Marsh", "female", 1920, 2008);
    await add("james", "James Marsh", "male", 1917, 1996);
    await add("thomas", "Thomas Whitmore", "male", 1923, 1944);
    await add("charles", "Charles Ellery", "male", 1918, 1999);
    await add("alice", "Alice Ellery", "female", 1921, 2003);

    // Generation IV.
    await add("richard", "Richard Whitmore", "male", 1945, undefined);
    await add("diane", "Diane Whitmore", "female", 1947, undefined);
    await add("susan", "Susan Carrow", "female", 1948, undefined);
    await add("robert", "Robert Carrow", "male", 1946, undefined);
    await add("carol", "Carol Bennett", "female", 1950, undefined);
    await add("mark", "Mark Bennett", "male", 1949, undefined);
    await add("david", "David Marsh", "male", 1954, undefined);
    await add("peter", "Peter Ellery", "male", 1949, undefined);

    // Generation V.
    await add("emily", "Emily Whitmore", "female", 1972, undefined);
    await add("jacob", "Jacob Whitmore", "male", 1976, undefined);
    await add("hannah", "Hannah Carrow", "female", 1980, undefined);
    await add("noah", "Noah Bennett", "male", 1978, undefined);
    await add("grace", "Grace Bennett", "female", 1981, undefined);

    // Partnerships (one per person; reciprocal).
    const partner = async (a: string, b: string) => {
      await ctx.db.patch(id[a], { partnerId: id[b] });
      await ctx.db.patch(id[b], { partnerId: id[a] });
    };
    await partner("samuel", "edith");
    await partner("arthur", "rose");
    await partner("beatrice", "henry");
    await partner("walter", "margaret");
    await partner("eleanor", "james");
    await partner("charles", "alice");
    await partner("richard", "diane");
    await partner("susan", "robert");
    await partner("carol", "mark");

    // Lineage — shared parents make siblings automatic.
    const child = async (alias: string, father?: string, mother?: string) => {
      const patch: Record<string, any> = {};
      if (father) patch.fatherId = id[father];
      if (mother) patch.motherId = id[mother];
      await ctx.db.patch(id[alias], patch);
    };
    await child("arthur", "samuel", "edith");
    await child("beatrice", "samuel", "edith");
    await child("wilfred", "samuel", "edith");
    await child("walter", "arthur", "rose");
    await child("eleanor", "arthur", "rose");
    await child("thomas", "arthur", "rose");
    await child("charles", "henry", "beatrice");
    await child("richard", "walter", "margaret");
    await child("susan", "walter", "margaret");
    await child("carol", "james", "eleanor");
    await child("david", "james", "eleanor");
    await child("peter", "charles", "alice");
    await child("emily", "richard", "diane");
    await child("jacob", "richard", "diane");
    await child("hannah", "robert", "susan");
    await child("noah", "mark", "carol");
    await child("grace", "mark", "carol");

    return familyId;
  },
});

/** The signed-in, approved curator who owns this register. Throws otherwise. */
export async function requireCurator(ctx: any, familyId: any) {
  const userId = await requireApproved(ctx);
  const family = await ctx.db.get(familyId);
  if (!family) throw new Error("Register not found.");
  if (family.createdBy !== userId) {
    throw new Error("Only the register's curator may edit it.");
  }
  return family;
}

/**
 * Hand a register to the curator with this email (they must have signed in
 * once). Server-only: run from the Convex dashboard or
 * `npx convex run families:transferRegister '{"slug":"…","email":"…"}'`.
 */
export const transferRegister = internalMutation({
  args: { slug: v.string(), email: v.string() },
  handler: async (ctx, { slug, email }) => {
    const family = await ctx.db
      .query("families")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!family) throw new Error(`No register with slug "${slug}".`);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email.toLowerCase()))
      .first();
    if (!user) throw new Error(`No account with email ${email}; they must sign in once first.`);
    await ctx.db.patch(family._id, { createdBy: user._id });
    return `${family.name} now belongs to ${email}.`;
  },
});

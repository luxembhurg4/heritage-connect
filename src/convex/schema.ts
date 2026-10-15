import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // Curator access, decided by an admin (ADMIN_EMAILS) on the Curator's Desk.
      curatorStatus: v.optional(
        v.union(v.literal("pending"), v.literal("approved"), v.literal("declined")),
      ),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Public family registers (archives).
    families: defineTable({
      name: v.string(),
      slug: v.string(),
      description: v.optional(v.string()),
      createdBy: v.optional(v.id("users")),
      createdAt: v.number(),
    })
      .index("by_slug", ["slug"])
      .index("by_creator", ["createdBy"]),

    // People belonging to a family register.
    // Relationships: fatherId/motherId create lineage (shared parents => siblings,
    // detected automatically); partnerId is a single spouse/partner link.
    // Indexes:
    //   by_family      — full register listing
    //   by_parents     — find siblings efficiently (shared father or mother)
    //   by_descendants — find children of a given person
    //   by_ancestors   — find parents of a given person
    people: defineTable({
      familyId: v.id("families"),
      name: v.string(),
      sex: v.optional(v.union(v.literal("male"), v.literal("female"))),
      birthYear: v.optional(v.number()),
      deathYear: v.optional(v.number()),
      fatherId: v.optional(v.id("people")),
      motherId: v.optional(v.id("people")),
      partnerId: v.optional(v.id("people")),
      imageStorageId: v.optional(v.id("_storage")),
      imageUrl: v.optional(v.string()),
    })
      .index("by_family", ["familyId"])
      .index("by_parents_father", ["familyId", "fatherId"])
      .index("by_parents_mother", ["familyId", "motherId"])
      .index("by_descendants", ["familyId", "fatherId", "motherId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;

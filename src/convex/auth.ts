import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

// Google sign-in only, and only for the curators the owner lists in the
// CURATOR_EMAILS environment variable (comma-separated). Everyone else can
// still browse the archive, which needs no account.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const email = profile.email?.toLowerCase();
      const curators = (process.env.CURATOR_EMAILS ?? "")
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean);
      if (!email || !curators.includes(email)) {
        throw new Error(`${email ?? "This account"} is not on the curator list.`);
      }
      if (existingUserId) return existingUserId;
      // Reuse an account made earlier with the same email (keeps its registers).
      const existing = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), email))
        .first();
      if (existing) return existing._id;
      return await ctx.db.insert("users", {
        email,
        name: profile.name as string | undefined,
        image: profile.image as string | undefined,
        emailVerificationTime: Date.now(),
      });
    },
  },
});

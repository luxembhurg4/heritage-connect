import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { isAdminEmail } from "./users";

// Google sign-in. Anyone may sign in, but only admins (ADMIN_EMAILS) and the
// curators they approve can change anything; newcomers start as "pending" and
// wait on the admin's Access panel. Browsing the archive needs no account.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    // Never throw here: an error would roll back the pending request too.
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      if (existingUserId) return existingUserId;
      const email = profile.email?.toLowerCase();
      // Reuse an account made earlier with the same email (keeps its registers).
      const existing = email
        ? await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("email"), email))
            .first()
        : null;
      if (existing) return existing._id;
      return await ctx.db.insert("users", {
        email,
        name: profile.name as string | undefined,
        image: profile.image as string | undefined,
        emailVerificationTime: Date.now(),
        curatorStatus: isAdminEmail(email) ? "approved" : "pending",
      });
    },
  },
});

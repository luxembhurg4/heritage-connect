import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

/** Admins (ADMIN_EMAILS, comma-separated) approve curators; nobody else can. */
export function isAdminEmail(email?: string) {
  const admins = (process.env.ADMIN_EMAILS ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  return !!email && admins.includes(email.toLowerCase());
}

/** Signed in and allowed to curate (an admin, or approved by one). Throws otherwise. */
export async function requireApproved(ctx: QueryCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error("Sign in to curate.");
  if (!isAdminEmail(user.email) && user.curatorStatus !== "approved") {
    throw new Error("Your curator request is waiting for approval.");
  }
  return user._id;
}

async function requireAdmin(ctx: QueryCtx) {
  const user = await getCurrentUser(ctx);
  if (!user || !isAdminEmail(user.email)) throw new Error("Only an admin can do this.");
}

/** What the signed-in person may do: drives the Curator's Desk. */
export const access = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const isAdmin = isAdminEmail(user.email);
    return { isAdmin, approved: isAdmin || user.curatorStatus === "approved", status: user.curatorStatus };
  },
});

/** Pending requests and approved curators, for the admin's Access panel. */
export const accessList = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || !isAdminEmail(user.email)) return [];
    // shortcut: scans all users; fine for a family's handful — add an index on curatorStatus past a few thousand.
    const users = await ctx.db.query("users").collect();
    return users
      .filter((u) => (u.curatorStatus === "pending" || u.curatorStatus === "approved") && !isAdminEmail(u.email))
      .map((u) => ({ _id: u._id, name: u.name, email: u.email, image: u.image, status: u.curatorStatus! }));
  },
});

/** Approve, decline, or (by declining an approved curator) remove access. Admins only. */
export const setAccess = mutation({
  args: { userId: v.id("users"), status: v.union(v.literal("approved"), v.literal("declined")) },
  handler: async (ctx, { userId, status }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { curatorStatus: status });
  },
});

import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";

export type WorkspaceRole = "OWNER" | "ADMIN" | "VIEWER";
type UserSession = {
  user: User;
  authUser: User;
  supabase: Awaited<ReturnType<typeof serverClient>>;
  workspaceRole: WorkspaceRole;
};

export async function requireUser(): Promise<UserSession> {
  const supabase = await serverClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: deletion, error: deletionError } = await adminClient().from("account_deletions")
    .select("scheduled_for").eq("user_id", authUser.id).maybeSingle();
  if (deletionError) throw new Error(`Could not verify account deletion status: ${deletionError.message}`);
  if (deletion) redirect("/account-deletion-pending");

  const { data: membership, error: membershipError } = await supabase.from("team_memberships")
    .select("merchant_id,role,status").eq("member_id", authUser.id).maybeSingle();
  if (membershipError) throw new Error(`Could not load workspace membership: ${membershipError.message}`);
  if (membership && membership.status !== "ACTIVE") redirect("/workspace-unavailable");
  if (membership) {
    const { data: ownerDeletion, error: ownerDeletionError } = await adminClient().from("account_deletions")
      .select("user_id").eq("user_id", membership.merchant_id).maybeSingle();
    if (ownerDeletionError) throw new Error(`Could not verify workspace status: ${ownerDeletionError.message}`);
    if (ownerDeletion) redirect("/workspace-deletion-pending");
  }
  if (membership) {
    const { data: subscription, error: subscriptionError } = await adminClient().from("merchant_subscriptions")
      .select("plan,status,current_period_end").eq("merchant_id", membership.merchant_id).maybeSingle();
    if (subscriptionError) throw new Error(`Could not verify Business workspace access: ${subscriptionError.message}`);
    if (subscription?.plan !== "BUSINESS" || subscription.status !== "ACTIVE"
      || (subscription.current_period_end && new Date(subscription.current_period_end).getTime() <= Date.now())) {
      redirect("/workspace-unavailable");
    }
  }

  const merchantId = membership?.merchant_id ?? authUser.id;
  const { data: profile, error } = await supabase.from("profiles").select("suspended_at").eq("id", merchantId).maybeSingle();
  if (error) throw new Error(`Could not verify account status: ${error.message}`);
  if (profile?.suspended_at) redirect("/account-suspended");
  const user = { ...authUser, id: merchantId };
  const workspaceRole = membership
    ? membership.role as WorkspaceRole
    : "OWNER";
  return { user, authUser, supabase, workspaceRole };
}

export async function requireEditor(): Promise<UserSession> {
  const session = await requireUser();
  if (session.workspaceRole === "VIEWER") redirect("/dashboard?error=This%20workspace%20role%20is%20read-only.");
  return session;
}

export async function requireOwner(): Promise<UserSession> {
  const session = await requireUser();
  if (session.workspaceRole !== "OWNER") redirect("/dashboard?error=Only%20the%20workspace%20owner%20can%20do%20that.");
  return session;
}

export async function requireWorkspaceAdmin(): Promise<UserSession> {
  const session = await requireUser();
  if (session.workspaceRole === "VIEWER") redirect("/dashboard?error=Only%20workspace%20owners%20and%20admins%20can%20manage%20team%20access.");
  return session;
}

"use server";
import { revalidatePath } from "next/cache";
import { appUrl } from "@/lib/format";
import { requireEditor, requireUser } from "@/lib/session";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { fail, done } from "@/lib/flash";
import { redirect } from "next/navigation";

export async function saveProfile(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const website = String(fd.get("website") ?? "").trim();
  if (website && !/^https?:\/\//.test(website)) fail("/dashboard/settings", "Start the website address with https://");
  const { error } = await supabase.from("profiles").update({
    name: String(fd.get("name") ?? "").trim() || null,
    business_name: String(fd.get("business_name") ?? "").trim() || null,
    business_email: String(fd.get("business_email") ?? "").trim() || null,
    website: website || null,
    match_wrong_amounts: fd.get("match_wrong_amounts") === "on",
  }).eq("id", user.id);
  if (error) fail("/dashboard/settings", "Could not save your settings.");
  await supabase.from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "settings.changed" });
  revalidatePath("/dashboard", "layout");
  done("/dashboard/settings", "Settings saved.");
}

/** Updates the signed-in member's login email. Supabase requires email confirmation. */
export async function changeLoginEmail(fd: FormData) {
  const { authUser, supabase } = await requireUser();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("/dashboard/settings", "Enter a valid email address.");
  }
  if (email === authUser.email?.toLowerCase()) {
    fail("/dashboard/settings", "That is already your sign-in email.");
  }

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${appUrl()}/auth/callback?next=/dashboard/settings` },
  );
  if (error) fail("/dashboard/settings", "Could not start the email change. Check the address and try again.");
  done("/dashboard/settings", "Check your email inboxes and follow the confirmation link to finish changing your sign-in email.");
}

/** Updates the signed-in member's password, then invalidates sessions on all devices. */
export async function changePassword(fd: FormData) {
  const { supabase } = await requireUser();
  const password = String(fd.get("password") ?? "");
  const confirmation = String(fd.get("password_confirmation") ?? "");
  if (password.length < 8) fail("/dashboard/settings", "Choose a password with at least 8 characters.");
  if (password !== confirmation) fail("/dashboard/settings", "The passwords do not match.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail("/dashboard/settings", "Could not update your password. Please try again.");
  await supabase.auth.signOut({ scope: "global" });
  done("/login", "Password updated. Sign in again with your new password.");
}

/** Schedules permanent deletion of this auth account and its workspace data after seven days. */
export async function requestAccountDeletion(fd: FormData) {
  const { authUser } = await requireUser();
  if (fd.get("confirm_deletion") !== "on") {
    fail("/dashboard/settings", "Confirm that you want to schedule your account for deletion.");
  }

  const db = adminClient();
  // A workspace owner's subscription must be set not to renew before their account can be deleted.
  const { data: ownerProfile, error: profileError } = await db.from("profiles")
    .select("id").eq("id", authUser.id).maybeSingle();
  if (profileError) throw new Error(`Could not verify account ownership: ${profileError.message}`);
  if (ownerProfile) {
    const [{ data: subscription, error: subscriptionError }, { data: apiSubscription, error: apiSubscriptionError }] = await Promise.all([
      db.from("merchant_subscriptions").select("plan,status,cancel_at_period_end").eq("merchant_id", authUser.id).maybeSingle(),
      db.from("api_subscriptions").select("status,cancel_at_period_end").eq("merchant_id", authUser.id).maybeSingle(),
    ]);
    if (subscriptionError || apiSubscriptionError) throw new Error(`Could not check subscription status: ${subscriptionError?.message ?? apiSubscriptionError?.message}`);
    if (subscription && subscription.plan !== "FREE" && subscription.status !== "CANCELLED" && !subscription.cancel_at_period_end) {
      fail("/dashboard/billing", "Stop subscription renewal in Plans & billing before scheduling account deletion.");
    }
    if (apiSubscription && apiSubscription.status !== "CANCELLED" && !apiSubscription.cancel_at_period_end) {
      fail("/dashboard/api-billing", "Stop API plan renewal before scheduling account deletion.");
    }
  }

  const { error } = await db.from("account_deletions").insert({ user_id: authUser.id });
  if (error?.code === "23505") redirect("/account-deletion-pending");
  if (error) throw new Error(`Could not schedule account deletion: ${error.message}`);
  redirect("/account-deletion-pending");
}

/** Cancels the grace-period request unless the permanent deletion worker has already claimed it. */
export async function cancelAccountDeletion() {
  const { supabase } = await requirePendingDeletionUser();
  const { data, error } = await supabase.rpc("cancel_account_deletion");
  if (error) throw new Error(`Could not cancel account deletion: ${error.message}`);
  if (!data) fail("/account-deletion-pending", "Permanent deletion has already started and can no longer be cancelled.");
  redirect("/dashboard?message=" + encodeURIComponent("Account deletion cancelled. Your Monifyd access has been restored."));
}

/** This page is the only signed-in app location available to accounts pending deletion. */
async function requirePendingDeletionUser() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await adminClient().from("account_deletions")
    .select("user_id").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(`Could not verify account deletion status: ${error.message}`);
  if (!data) redirect("/dashboard");
  return { supabase };
}

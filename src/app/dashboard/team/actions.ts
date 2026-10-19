"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireWorkspaceAdmin } from "@/lib/session";
import { adminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/format";
import { sendEmail } from "@/lib/email/send";
import { teamInvitationEmail } from "@/lib/email/team-invitation";
import { fail, done } from "@/lib/flash";

const PATH = "/dashboard/team";

export async function inviteTeamMember(fd: FormData) {
  const { user, authUser } = await requireWorkspaceAdmin();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const role = String(fd.get("role") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) fail(PATH, "Enter a valid email address.");
  if (role !== "ADMIN" && role !== "VIEWER") fail(PATH, "Choose a valid team role.");
  if (email === authUser.email?.toLowerCase()) fail(PATH, "You are already the workspace owner.");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const db = adminClient();
  const { data: invitationId, error } = await db.rpc("create_team_invitation", {
    p_merchant_id: user.id, p_email: email, p_role: role, p_token_hash: tokenHash,
  });
  if (error) fail(PATH, error.message);
  const [{ data: profile, error: profileError }] = await Promise.all([
    db.from("profiles").select("business_name,name").eq("id", user.id).maybeSingle(),
  ]);
  if (profileError) throw new Error(`Invitation was created, but the workspace name could not be loaded: ${profileError.message}`);
  const url = `${appUrl()}/dashboard/team/accept?token=${encodeURIComponent(token)}`;
  try {
    await sendEmail({
      to: email,
      ...teamInvitationEmail({
        workspace: profile?.business_name ?? profile?.name ?? "a Monifyd workspace",
        inviter: authUser.email ?? "A Monifyd user",
        role: role === "ADMIN" ? "Admin" : "Viewer",
        url,
      }),
    });
  } catch (sendError) {
    const { error: deleteError } = await db.from("team_invitations")
      .delete().eq("id", invitationId).eq("merchant_id", user.id).is("accepted_at", null);
    if (deleteError) throw new Error(`Invitation email failed, and the pending invitation could not be removed: ${deleteError.message}`);
    fail(PATH, sendError instanceof Error ? sendError.message : "Could not send the invitation email.");
  }
  revalidatePath(PATH);
  done(PATH, `Invitation sent to ${email}.`);
}

export async function revokeTeamMember(fd: FormData) {
  const { user, authUser } = await requireWorkspaceAdmin();
  const id = String(fd.get("id") ?? "");
  const db = adminClient();
  const { data: member, error: lookupError } = await db.from("team_memberships")
    .select("id,member_id,email").eq("id", id).eq("merchant_id", user.id).eq("status", "ACTIVE").maybeSingle();
  if (lookupError) throw new Error(`Could not load team member: ${lookupError.message}`);
  if (!member || member.member_id === authUser.id) fail(PATH, "Choose a different team member.");
  const { error } = await db.from("team_memberships").update({ status: "REVOKED", updated_at: new Date().toISOString() })
    .eq("id", id).eq("merchant_id", user.id).eq("status", "ACTIVE");
  if (error) fail(PATH, "Could not remove the team member.");
  const { error: auditError } = await db.from("audit_logs").insert({
    merchant_id: user.id, actor: authUser.id, action: "team.member_removed", target: member.email,
  });
  if (auditError) throw new Error(`Team member was removed, but the audit record could not be saved: ${auditError.message}`);
  revalidatePath(PATH);
  done(PATH, `${member.email} was removed from the workspace.`);
}

export async function revokeTeamInvitation(fd: FormData) {
  const { user, authUser } = await requireWorkspaceAdmin();
  const id = String(fd.get("id") ?? "");
  const db = adminClient();
  const { data: invitation, error: lookupError } = await db.from("team_invitations")
    .select("id,email").eq("id", id).eq("merchant_id", user.id).is("accepted_at", null).maybeSingle();
  if (lookupError) throw new Error(`Could not load team invitation: ${lookupError.message}`);
  if (!invitation) fail(PATH, "That invitation is no longer pending.");
  const { error } = await db.from("team_invitations").delete()
    .eq("id", id).eq("merchant_id", user.id).is("accepted_at", null);
  if (error) fail(PATH, "Could not revoke the team invitation.");
  const { error: auditError } = await db.from("audit_logs").insert({
    merchant_id: user.id, actor: authUser.id, action: "team.invitation_revoked", target: invitation.email,
  });
  if (auditError) throw new Error(`Invitation was revoked, but the audit record could not be saved: ${auditError.message}`);
  revalidatePath(PATH);
  done(PATH, `Invitation for ${invitation.email} was revoked.`);
}

export async function acceptTeamInvitation(fd: FormData) {
  const { authUser } = await requireUser();
  const token = String(fd.get("token") ?? "");
  if (!authUser.email || token.length < 32 || token.length > 128) fail(PATH, "This team invitation is invalid.");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data: merchantId, error } = await adminClient().rpc("accept_team_invitation", {
    p_email: authUser.email, p_token_hash: tokenHash, p_member_id: authUser.id,
  });
  if (error) fail(`${PATH}/accept?token=${encodeURIComponent(token)}`, error.message);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

import { requireWorkspaceAdmin } from "@/lib/session";
import { adminClient } from "@/lib/supabase/admin";
import { shortDate } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";
import { inviteTeamMember, revokeTeamInvitation, revokeTeamMember } from "./actions";
import { activePlan } from "@/lib/billing/plans";

export const metadata = { title: "Team | Monifyd" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const [sp, session] = await Promise.all([searchParams, requireWorkspaceAdmin()]);
  const { user, workspaceRole } = session;
  const db = adminClient();
  const [
    { data: subscription, error: subscriptionError },
    { data: members, error: membersError },
    { data: invitations, error: invitationsError },
    { data: activity, error: activityError },
  ] = await Promise.all([
    db.from("merchant_subscriptions").select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle(),
    db.from("team_memberships").select("id,email,role,status,created_at,member_id").eq("merchant_id", user.id).order("created_at"),
    db.from("team_invitations").select("id,email,role,expires_at,created_at").eq("merchant_id", user.id).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("created_at"),
    db.from("audit_logs").select("id,actor,action,target,created_at").eq("merchant_id", user.id).like("action", "team.%").order("created_at", { ascending: false }).limit(50),
  ]);
  const errors = [subscriptionError, membersError, invitationsError, activityError].map((error) => error?.message).filter(Boolean);
  if (errors.length) throw new Error(`Could not load team settings: ${errors.join("; ")}`);
  const businessActive = activePlan(subscription) === "BUSINESS";
  const seatsUsed = 1 + (members ?? []).filter((member) => member.status === "ACTIVE").length + (invitations ?? []).length;
  const canManage = workspaceRole === "OWNER" || workspaceRole === "ADMIN";
  return (
    <>
      <div className="head"><h1>Team</h1></div>
      <Flash error={sp.error} message={sp.message} />
      {!businessActive ? (
        <section className="card"><h2>Team accounts are part of Business</h2>
          <p style={{ color: "var(--muted)", margin: "12px 0 16px" }}>Business includes five workspace seats, including the owner, with Owner, Admin, and Viewer roles.</p>
          {workspaceRole === "OWNER" && <a className="btn btn-primary" href="/dashboard/billing">View plans</a>}
        </section>
      ) : (
        <>
          <section className="card"><div className="head"><h2>Workspace members</h2><span>{seatsUsed} of 5 seats used</span></div>
            <div className="tablewrap"><table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
              <tr><td>Workspace owner</td><td>Owner</td><td><StatusBadge status="ACTIVE" /></td><td>Workspace owner</td><td /></tr>
              {(members ?? []).map((member) => (
                <tr key={member.id}><td>{member.email}</td><td>{member.role === "ADMIN" ? "Admin" : "Viewer"}</td><td><StatusBadge status={member.status} /></td><td>{shortDate(member.created_at)}</td>
                  <td>{canManage && member.status === "ACTIVE" && <form action={revokeTeamMember}><input type="hidden" name="id" value={member.id} /><button className="btn btn-sm btn-danger">Remove</button></form>}</td></tr>
              ))}
              {(invitations ?? []).map((invite) => (
                <tr key={invite.id}><td>{invite.email}</td><td>{invite.role === "ADMIN" ? "Admin" : "Viewer"}</td><td><StatusBadge status="PENDING" /></td><td>Invited {shortDate(invite.created_at)}</td><td style={{ display: "flex", gap: 8, alignItems: "center" }}>Expires {shortDate(invite.expires_at)}{canManage && <form action={revokeTeamInvitation}><input type="hidden" name="id" value={invite.id} /><button className="btn btn-sm btn-danger">Revoke</button></form>}</td></tr>
              ))}
            </tbody></table></div>
          </section>
          {canManage && seatsUsed < 5 && <section className="card"><h2>Invite a teammate</h2>
            <p style={{ color: "var(--muted)", marginBottom: 16 }}>Invitations expire after seven days. Teammates must accept using the email address that receives the invitation.</p>
            <form action={inviteTeamMember}>
              <div className="row2">
                <div className="field"><label htmlFor="team-email">Email</label><input id="team-email" name="email" type="email" autoComplete="off" required maxLength={320} /></div>
                <div className="field"><label htmlFor="team-role">Role</label><select id="team-role" name="role" defaultValue="VIEWER"><option value="VIEWER">Viewer — read-only dashboard</option><option value="ADMIN">Admin — manage workspace, except billing and ownership</option></select></div>
              </div>
              <button className="btn btn-primary">Send invitation</button>
            </form>
          </section>}
          <section className="card"><h2>Team activity</h2>
            {(activity ?? []).length === 0 ? <p className="empty">Team changes will appear here.</p> : (
              <div className="tablewrap"><table><thead><tr><th>Time</th><th>Actor account</th><th>Action</th><th>Target</th></tr></thead><tbody>
                {(activity ?? []).map((entry) => <tr key={entry.id}><td>{shortDate(entry.created_at)}</td><td className="mono">{entry.actor}</td><td>{entry.action}</td><td>{entry.target ?? ""}</td></tr>)}
              </tbody></table></div>
            )}
          </section>
        </>
      )}
    </>
  );
}

import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Flash } from "@/components/Flash";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { cancelAccountDeletion } from "@/app/dashboard/settings/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account deletion scheduled | Monifyd" };

export default async function AccountDeletionPendingPage({ searchParams }: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deletion, error } = await adminClient().from("account_deletions")
    .select("requested_at,scheduled_for,claimed_until").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(`Could not load account deletion status: ${error.message}`);
  if (!deletion) redirect("/dashboard");

  const date = new Intl.DateTimeFormat("en-NG", {
    dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lagos",
  }).format(new Date(deletion.scheduled_for));

  return (
    <main className="auth"><div className="box">
      <div style={{ marginBottom: 24 }}><Logo /></div>
      <h1>Account deletion scheduled</h1>
      <Flash error={sp.error} message={sp.message} />
      <p style={{ color: "var(--muted)", margin: "12px 0 16px" }}>
        Your Monifyd account is scheduled for permanent deletion on <strong>{date} WAT</strong>.
        You cannot use the dashboard or API while deletion is pending. If you own a workspace, its payment and business records will also be permanently deleted.
      </p>
      {deletion.claimed_until && <p className="flash err" role="status" style={{ marginBottom: 12 }}>
        The deletion worker may be processing your request. You can still try to cancel; the request will be rejected if permanent deletion has already started.
      </p>}
      <form action={cancelAccountDeletion}>
        <button className="btn btn-primary" style={{ width: "100%" }}>Cancel account deletion</button>
      </form>
      <p className="hint" style={{ marginTop: 16 }}>If you do nothing, deletion begins after the seven-day grace period.</p>
    </div></main>
  );
}

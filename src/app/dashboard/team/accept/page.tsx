import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { Flash } from "@/components/Flash";
import { acceptTeamInvitation } from "../actions";

export const metadata = { title: "Accept team invitation | Monifyd" };

export default async function AcceptTeamInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  if (token.length < 32 || token.length > 128) redirect("/login?error=This%20team%20invitation%20is%20invalid.");
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/dashboard/team/accept?token=${token}`)}`);
  return (
    <section className="card">
      <h1>Accept workspace invitation</h1>
      <Flash error={sp.error} />
      <p style={{ color: "var(--muted)", margin: "12px 0 16px" }}>You are signed in as {user.email}. Accepting joins that account to the invited workspace.</p>
      <form action={acceptTeamInvitation}><input type="hidden" name="token" value={token} /><button className="btn btn-primary">Accept invitation</button></form>
    </section>
  );
}

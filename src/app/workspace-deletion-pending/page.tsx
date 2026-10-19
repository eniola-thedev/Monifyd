import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { serverClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/actions";

export const metadata = { title: "Workspace unavailable | Monifyd" };

export default async function WorkspaceDeletionPendingPage() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="auth"><div className="box">
      <div style={{ marginBottom: 24 }}><Logo /></div>
      <h1>Workspace unavailable</h1>
      <p style={{ color: "var(--muted)", margin: "12px 0 20px" }}>
        The workspace owner has scheduled account deletion. Workspace access is paused. The owner can cancel deletion during the seven-day grace period to restore access.
      </p>
      <form action={logout}><button className="btn btn-primary" style={{ width: "100%" }}>Log out</button></form>
    </div></main>
  );
}

import Link from "next/link";

export const metadata = { title: "Workspace access unavailable | Monifyd" };

export default function WorkspaceUnavailablePage() {
  return (
    <main className="auth"><section className="box">
      <h1>Workspace access unavailable</h1>
      <p style={{ color: "var(--muted)", margin: "12px 0 20px" }}>Your team membership was removed or the workspace no longer has an active Business plan. Contact the workspace owner if you think this is a mistake.</p>
      <Link className="btn btn-primary" href="/login">Return to sign in</Link>
    </section></main>
  );
}

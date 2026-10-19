import { logout } from "@/app/(auth)/actions";

export const metadata = { title: "Account suspended | Monifyd" };

export default function AccountSuspendedPage() {
  return (
    <main className="auth">
      <section className="box">
        <h1>Account suspended</h1>
        <p style={{ margin: "12px 0 20px", color: "var(--muted)" }}>This merchant account is currently unable to access Monifyd or accept payments. Contact support if you believe this is a mistake.</p>
        <form action={logout}><button className="btn btn-primary">Log out</button></form>
      </section>
    </main>
  );
}

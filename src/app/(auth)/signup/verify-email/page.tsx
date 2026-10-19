import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Verify your email | Monifyd" };

export default function VerifyEmailPage() {
  return (
    <main className="auth"><section className="box">
      <Link href="/" className="logo" aria-label="Monifyd home"><Logo /></Link>
      <h1>Check your email</h1>
      <p style={{ color: "var(--muted)", margin: "12px 0 20px" }}>
        We sent you a confirmation link. Open it to verify your email and finish creating your Monifyd account.
      </p>
      <p style={{ color: "var(--muted)", fontSize: ".9rem" }}>If it doesn’t arrive, check your spam folder. The link may expire, so use the newest confirmation email.</p>
      <p style={{ marginTop: 20 }}><Link href="/login">Back to log in</Link></p>
    </section></main>
  );
}

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Flash } from "@/components/Flash";
import { GoogleButton } from "@/components/GoogleButton";
import { EmailOtpForm } from "../EmailOtpForm";

export const metadata = { title: "Log in | Monifyd" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") && !sp.next.includes("\\") ? sp.next : "/dashboard";
  return (
    <main className="auth"><div className="box">
      <Link href="/" className="logo" aria-label="Monifyd home"><Logo /></Link>
      <h1>Log in</h1>
      <Flash error={sp.error} message={sp.message} />
      <GoogleButton label="Continue with Google" next={next} />
      <EmailOtpForm mode="login" next={next} />
      <p style={{ marginTop: 16 }}>New to Monifyd? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </div></main>
  );
}

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Flash } from "@/components/Flash";
import { GoogleButton } from "@/components/GoogleButton";
import { EmailOtpForm } from "../EmailOtpForm";

export const metadata = { title: "Create account | Monifyd" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") && !sp.next.includes("\\") ? sp.next : "/dashboard";
  return (
    <main className="auth"><div className="box">
      <Link href="/" className="logo" aria-label="Monifyd home"><Logo /></Link>
      <h1>Create your account</h1>
      <Flash error={sp.error} />
      <GoogleButton label="Sign up with Google" next={next} />
      <EmailOtpForm mode="signup" next={next} />
      <p style={{ marginTop: 16 }}>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></p>
    </div></main>
  );
}

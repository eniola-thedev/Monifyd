import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Flash } from "@/components/Flash";
import { GoogleButton } from "@/components/GoogleButton";
import { signup } from "../actions";
import { PasswordField } from "./PasswordField";

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
      <form action={signup}>
        <input type="hidden" name="next" value={next} />
        <div className="field"><label htmlFor="business">Business name</label><input id="business" name="business" type="text" autoComplete="organization" placeholder="Northwind Studio" /></div>
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required placeholder="name@example.com" /><small>Use a non-disposable email address.</small></div>
        <PasswordField />
        <PasswordField id="confirm-password" name="confirmPassword" label="Confirm password" />
        <button className="btn btn-primary" style={{ width: "100%" }}>Create account</button>
      </form>
      <p style={{ marginTop: 16 }}>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></p>
    </div></main>
  );
}

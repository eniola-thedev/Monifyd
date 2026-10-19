import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Flash } from "@/components/Flash";
import { GoogleButton } from "@/components/GoogleButton";
import { login } from "../actions";
import { LoginPasswordField } from "./LoginPasswordField";

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
      <form action={login}>
        <input type="hidden" name="next" value={next} />
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></div>
        <LoginPasswordField />
        <button className="btn btn-primary" style={{ width: "100%" }}>Log in</button>
      </form>
      <p style={{ marginTop: 16 }}>New to Monifyd? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </div></main>
  );
}

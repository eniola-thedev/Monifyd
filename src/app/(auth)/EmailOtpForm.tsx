"use client";
import { useState, useTransition, type FormEvent } from "react";
import { sendEmailOtp, verifyEmailOtp } from "./actions";

export function EmailOtpForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const signup = mode === "signup";
  const [email, setEmail] = useState("");
  const [business, setBusiness] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, run] = useTransition();

  const requestCode = (event?: FormEvent) => {
    event?.preventDefault();
    setError("");
    run(async () => {
      const result = await sendEmailOtp(mode, email, business);
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  };

  const confirmCode = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    run(async () => {
      const result = await verifyEmailOtp(email, token, business, next);
      if (!result.ok) setError(result.error);
    });
  };

  if (sent) return (
    <form onSubmit={confirmCode}>
      <p className="hint" style={{ marginBottom: 12 }}>Enter the six-digit code sent to <strong>{email}</strong>.</p>
      <div className="field">
        <label htmlFor={`${mode}-otp`}>Email code</label>
        <input id={`${mode}-otp`} name="token" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
      </div>
      {error && <p className="flash err" role="alert">{error}</p>}
      <button className="btn btn-primary" style={{ width: "100%" }} disabled={pending || token.length !== 6}>{pending ? "Verifying…" : "Verify code"}</button>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
        <button type="button" className="btn btn-sm" onClick={() => { setSent(false); setToken(""); setError(""); }}>Change email</button>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => requestCode()}>{pending ? "Sending…" : "Send a new code"}</button>
      </div>
    </form>
  );

  return (
    <form onSubmit={requestCode}>
      {signup && <div className="field"><label htmlFor="business">Business name</label><input id="business" name="business" type="text" autoComplete="organization" placeholder="Northwind Studio" value={business} onChange={(event) => setBusiness(event.target.value)} /></div>}
      <div className="field"><label htmlFor={`${mode}-email`}>Email</label><input id={`${mode}-email`} name="email" type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
      {error && <p className="flash err" role="alert">{error}</p>}
      <button className="btn btn-primary" style={{ width: "100%" }} disabled={pending}>{pending ? "Sending code…" : signup ? "Create account with email" : "Continue with email"}</button>
    </form>
  );
}

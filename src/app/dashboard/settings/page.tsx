import { requireUser } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { changeLoginEmail, changePassword, requestAccountDeletion, saveProfile } from "./actions";
import { logoutEverywhere } from "@/app/(auth)/actions";
import { DeveloperSettings } from "./DeveloperSettings";

export const metadata = { title: "Settings | Monifyd" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { user, supabase, workspaceRole } = await requireUser();
  const { data: p } = await supabase.from("profiles").select("name,business_name,business_email,website,match_wrong_amounts").eq("id", user.id).maybeSingle();
  return (
    <>
      <div className="head"><h1>Settings</h1></div>
      <Flash error={sp.error} message={sp.message} />
      <section className="card"><h2>Business profile</h2>
        {workspaceRole === "VIEWER" ? <p style={{ color: "var(--muted)" }}>Your workspace role is read-only.</p> : (
        <form action={saveProfile}>
          <div className="row2">
            <div className="field"><label htmlFor="name">Your name</label><input id="name" name="name" type="text" defaultValue={p?.name ?? ""} autoComplete="name" /></div>
            <div className="field"><label htmlFor="business_name">Business name</label><input id="business_name" name="business_name" type="text" defaultValue={p?.business_name ?? ""} autoComplete="organization" /><span className="hint">Shown to customers at checkout and in invoice emails.</span></div>
          </div>
          <div className="row2">
            <div className="field"><label htmlFor="business_email">Business email</label><input id="business_email" name="business_email" type="email" defaultValue={p?.business_email ?? ""} /></div>
            <div className="field"><label htmlFor="website">Website</label><input id="website" name="website" type="text" defaultValue={p?.website ?? ""} placeholder="https://example.com" /></div>
          </div>
          <div className="field"><label className="check" style={{ width: "fit-content" }}><input type="checkbox" name="match_wrong_amounts" defaultChecked={!!p?.match_wrong_amounts} /><span>Automatically match other wrong-amount transfers</span></label>
            <span className="hint">To support split payments, smaller transfers are automatically added to the only open payment on a wallet. This can associate unrelated deposits, so use a wallet dedicated to Monifyd payments. When enabled, other transfers between 1% and 300% of the requested amount can also be automatically assigned. Leave this off if you want those other wrong amounts to appear under Payments for manual review.</span></div>
          <button className="btn btn-primary">Save changes</button>
        </form>)}
      </section>
      <section className="card"><h2>Account security</h2>
        <h3>Change sign-in email</h3>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Current email: {user.email}. We will send confirmation instructions before the new address becomes your sign-in email.</p>
        <form action={changeLoginEmail}>
          <div className="field"><label htmlFor="login_email">New sign-in email</label><input id="login_email" name="email" type="email" autoComplete="email" required /></div>
          <button className="btn btn-primary">Send confirmation</button>
        </form>
        <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid var(--border)" }} />
        <h3>Change password</h3>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Use at least 8 characters. Changing your password signs you out on all devices.</p>
        <form action={changePassword}>
          <div className="row2">
            <div className="field"><label htmlFor="new_password">New password</label><input id="new_password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
            <div className="field"><label htmlFor="password_confirmation">Confirm new password</label><input id="password_confirmation" name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required /></div>
          </div>
          <button className="btn btn-primary">Update password</button>
        </form>
      </section>
      <DeveloperSettings />
      <section className="card"><h2>Sessions</h2>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>You are signed in as {user.email}. You stay signed in on this device until you log out. If you used a shared or lost device, end every session.</p>
        <form action={logoutEverywhere}><button className="btn btn-danger">Sign out on all devices</button></form>
      </section>
      <section className="card"><h2>Delete account</h2>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          Deletion is scheduled seven days after you confirm. During that time, dashboard and API access are disabled, and you can cancel from the deletion page. If you own a workspace, its payment history, invoices, and other workspace data will also be permanently deleted. Stop subscription renewal first.
        </p>
        <form action={requestAccountDeletion}>
          <div className="field">
            <label className="check" style={{ width: "fit-content", alignItems: "flex-start", paddingTop: 10, paddingBottom: 10 }}>
              <input type="checkbox" name="confirm_deletion" required />
              <span>I understand that account and workspace data will be permanently deleted if I do not cancel within seven days.</span>
            </label>
          </div>
          <button className="btn btn-danger">Schedule account deletion</button>
        </form>
      </section>
    </>
  );
}

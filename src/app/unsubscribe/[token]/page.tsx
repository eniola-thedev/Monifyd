import { Logo } from "@/components/Logo";
import { adminClient } from "@/lib/supabase/admin";
import { unsubscribeInvoiceReminders } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Invoice reminder preferences | Monifyd",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const validToken = TOKEN_PATTERN.test(token);
  const { data: preference, error } = validToken
    ? await adminClient().from("invoice_reminder_unsubscribes").select("unsubscribed_at").eq("token", token).maybeSingle()
    : { data: null, error: null };
  if (error) throw new Error(`Could not load invoice reminder preferences: ${error.message}`);

  return (
    <main className="auth"><div className="box">
      <div style={{ marginBottom: 24 }}><Logo /></div>
      {!preference ? <>
        <h1>Link unavailable</h1>
        <p style={{ color: "var(--muted)", marginTop: 12 }}>This invoice-reminder link is invalid. If you still need help, contact <a href="mailto:monifyd1@gmail.com">monifyd1@gmail.com</a>.</p>
      </> : preference.unsubscribed_at ? <>
        <h1>Invoice reminders stopped</h1>
        <p style={{ color: "var(--muted)", marginTop: 12 }}>Automatic invoice reminders will no longer be sent to this address. Invoice, payment, refund, and account emails are not affected.</p>
      </> : <>
        <h1>Stop invoice reminders?</h1>
        <p style={{ color: "var(--muted)", margin: "12px 0 16px" }}>This stops future automatic invoice reminders sent to this address. Invoice, payment, refund, and account emails are not affected.</p>
        <form action={unsubscribeInvoiceReminders}>
          <input type="hidden" name="token" value={token} />
          <button className="btn btn-primary" style={{ width: "100%" }}>Unsubscribe from invoice reminders</button>
        </form>
      </>}
    </div></main>
  );
}

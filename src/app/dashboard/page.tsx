import Link from "next/link";
import { requireUser } from "@/lib/session";
import { money, shortDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { adminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Overview | Monifyd" };
const PENDING = ["CREATED", "AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING"];
const FAILED = ["FAILED", "EXPIRED", "CANCELLED"];

export default async function Overview() {
  const { user, supabase } = await requireUser();
  const [{ data }, { count: walletCount }, { count: linkCount }, { count: paidCount }, detectionHealthResult] = await Promise.all([
    supabase.from("payments").select("id,status,amount_cents,fee_cents,asset,network,currency,created_at").eq("merchant_id", user.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("wallets").select("id", { count: "exact", head: true }).eq("merchant_id", user.id),
    supabase.from("payment_links").select("id", { count: "exact", head: true }).eq("merchant_id", user.id),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("merchant_id", user.id).eq("livemode", true).eq("status", "PAID"),
    adminClient().from("chain_detection_health").select("status,last_run_at,last_success_at,groups_scanned,error_count").eq("singleton", true).maybeSingle(),
  ]);
  const detectionHealth = detectionHealthResult.error ? null : detectionHealthResult.data;
  const detectionIsDelayed = detectionHealth && Date.now() - new Date(detectionHealth.last_run_at).getTime() > 3 * 60_000;
  const detectionStatus = !detectionHealth ? "UNKNOWN" : detectionIsDelayed ? "DELAYED" : detectionHealth.status === "degraded" ? "DEGRADED" : "HEALTHY";
  const rows = data ?? [];
  const paid = rows.filter((r: any) => r.status === "PAID");
  const sum = (a: any[], k: string) => a.reduce((t, r) => t + Number(r[k]), 0);
  const onboardingSteps = [
    { label: "Add a receiving wallet", done: (walletCount ?? 0) > 0, href: "/dashboard/wallets", action: "Add wallet", detail: "Choose a network and add the address where you want to receive funds." },
    { label: "Create a payment link", done: (linkCount ?? 0) > 0, href: "/dashboard/links", action: "Create link", detail: "Choose which coins and networks your customer can use." },
    { label: "Receive your first payment", done: (paidCount ?? 0) > 0, href: "/dashboard/payments", action: "View payments", detail: "Share your link and watch for the payment to confirm." },
  ];
  const completedSteps = onboardingSteps.filter((step) => step.done).length;
  return (
    <>
      <div className="head"><h1>Overview</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/dashboard/links">Create payment link</Link>
          <Link className="btn" href="/dashboard/invoices">Create invoice</Link>
        </div>
      </div>
      <div className="stats">
        <div className="stat"><p>Payment volume</p><strong>{money(sum(paid, "amount_cents"))}</strong></div>
        <div className="stat"><p>Successful payments</p><strong>{paid.length}</strong></div>
        <div className="stat"><p>Pending</p><strong>{rows.filter((r: any) => PENDING.includes(r.status)).length}</strong></div>
        <div className="stat"><p>Failed or expired</p><strong>{rows.filter((r: any) => FAILED.includes(r.status)).length}</strong></div>
        <div className="stat"><p>Recorded transaction fees</p><strong>{money(sum(paid, "fee_cents"))}</strong></div>
      </div>
      {completedSteps < onboardingSteps.length && <section className="card" aria-labelledby="onboarding-title">
        <div className="head" style={{ marginBottom: 8 }}>
          <div><h2 id="onboarding-title">Get started</h2><p className="hint" style={{ marginTop: 4 }}>{completedSteps} of {onboardingSteps.length} steps complete</p></div>
          <progress aria-label="Setup progress" value={completedSteps} max={onboardingSteps.length} style={{ width: 120, accentColor: "var(--accent)" }} />
        </div>
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {onboardingSteps.map((step, index) => <li key={step.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: 16, padding: "14px 0", borderTop: "1px solid var(--border)" }}>
            <div>
              <strong>{index + 1}. {step.label}{step.done ? <span className="badge badge-good" style={{ marginLeft: 8 }}>Done</span> : null}</strong>
              <p className="hint" style={{ marginTop: 4 }}>{step.detail}</p>
            </div>
            <Link className={`btn btn-sm ${step.done ? "" : "btn-primary"}`} href={step.href}>{step.done ? "View" : step.action}</Link>
          </li>)}
        </ol>
      </section>}
      <section className="card" aria-labelledby="detection-health-title">
        <div className="head" style={{ marginBottom: 8 }}>
          <div><h2 id="detection-health-title">Payment detection</h2><p className="hint" style={{ marginTop: 4 }}>Scheduled checks watch for transfers to your open payment addresses.</p></div>
          <StatusBadge status={detectionStatus} />
        </div>
        {!detectionHealth ? <p className="hint">No scheduled scan has reported yet.</p> : detectionIsDelayed ? (
          <p className="hint">The detector has not reported in over three minutes. Last check: {shortDate(detectionHealth.last_run_at)}.</p>
        ) : detectionHealth.status === "degraded" ? (
          <p className="hint">Some scans failed on the last run. The detector will retry on its next scheduled pass. Last check: {shortDate(detectionHealth.last_run_at)}.</p>
        ) : (
          <p className="hint">Last check: {shortDate(detectionHealth.last_run_at)}. {detectionHealth.groups_scanned === 0 ? "No active payment addresses needed scanning." : `${detectionHealth.groups_scanned} payment address group${detectionHealth.groups_scanned === 1 ? "" : "s"} scanned.`}</p>
        )}
      </section>
      <section className="card"><h2>Recent payments</h2>
        {rows.length === 0 ? (
          <div className="empty"><strong>No payments yet</strong>Add a wallet, then create a payment link to get started.<div style={{ marginTop: 14 }}><Link className="btn btn-primary btn-sm" href="/dashboard/wallets">Add a wallet</Link></div></div>
        ) : (
          <div className="tablewrap"><table><thead><tr><th>Payment</th><th>Status</th><th>Amount</th><th>Coin</th><th>Date</th></tr></thead><tbody>
            {rows.slice(0, 8).map((r: any) => (
              <tr key={r.id}><td><Link href={`/dashboard/payments/${r.id}`}>{r.id}</Link></td><td><StatusBadge status={r.status} /></td><td className="num">{money(r.amount_cents, r.currency)}</td><td>{r.asset} on {r.network}</td><td>{shortDate(r.created_at)}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}

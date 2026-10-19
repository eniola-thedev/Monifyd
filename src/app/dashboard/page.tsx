import Link from "next/link";
import { requireUser } from "@/lib/session";
import { money, shortDate } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Overview | Monifyd" };
const PENDING = ["CREATED", "AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING"];
const FAILED = ["FAILED", "EXPIRED", "CANCELLED"];

export default async function Overview() {
  const { user, supabase } = await requireUser();
  const { data } = await supabase.from("payments").select("id,status,amount_cents,fee_cents,asset,network,currency,created_at").eq("merchant_id", user.id).order("created_at", { ascending: false }).limit(500);
  const rows = data ?? [];
  const paid = rows.filter((r: any) => r.status === "PAID");
  const sum = (a: any[], k: string) => a.reduce((t, r) => t + Number(r[k]), 0);
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

import Link from "next/link";
import { requireUser } from "@/lib/session";
import { StatusBadge } from "@/components/StatusBadge";
import { Flash } from "@/components/Flash";
import { money, shortDate } from "@/lib/format";
import { assignTransfer, ignoreTransfer } from "./actions";

export const metadata = { title: "Payments | Monifyd" };
const STATUSES = ["AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING", "PAID", "UNDERPAID", "OVERPAID", "EXPIRED", "FAILED"];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { user, supabase, workspaceRole } = await requireUser();
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const search = (sp.q ?? "").replace(/[^a-zA-Z0-9@._-]/g, "").slice(0, 80);
  let q = supabase.from("payments").select("id,status,amount_cents,fee_cents,currency,asset,network,created_at,payment_link_id,invoice_id", { count: "exact" })
    .eq("merchant_id", user.id).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (sp.status && STATUSES.includes(sp.status)) q = q.eq("status", sp.status);
  if (search) q = q.ilike("id", `%${search}%`);
  const [{ data, count, error }, { data: unmatched }, { data: candidates }] = await Promise.all([
    q,
    supabase.from("unmatched_transfers").select("id,network,asset,address,tx_hash,amount,seen_at").eq("merchant_id", user.id).eq("status", "UNMATCHED").order("seen_at", { ascending: false }).limit(50),
    supabase.from("payments").select("id,network,asset,receiving_address,crypto_amount,status,created_at").eq("merchant_id", user.id).in("status", ["AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING", "EXPIRED"]).order("created_at", { ascending: false }).limit(100),
  ]);
  if (error) throw new Error(`Could not load payments: ${error.message}`);
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (sp.status && STATUSES.includes(sp.status)) params.set("status", sp.status);
    if (search) params.set("q", search);
    params.set("page", String(target));
    return `/dashboard/payments?${params}`;
  };
  return (
    <>
      <div className="head"><h1>Payments</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn btn-sm" href="/dashboard/exports/payments">Export CSV</a>
          <form method="get"><label htmlFor="payment-search" className="sr-only">Search payment ID</label><input id="payment-search" name="q" type="text" defaultValue={search} placeholder="Search payment ID" style={{ width: 180, display: "inline-block" }} />{" "}
            <label htmlFor="status" className="sr-only">Filter by status</label>
            <select id="status" name="status" defaultValue={sp.status ?? ""} style={{ width: "auto", display: "inline-block" }}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}</select>{" "}
            <button className="btn btn-sm">Filter</button></form>
        </div>
      </div>
      <Flash error={sp.error} message={sp.message} />

      {(unmatched ?? []).length > 0 && (
        <section className="card" style={{ borderColor: "var(--warn)" }}><h2>Incoming transfers that matched no payment</h2>
          <p style={{ color: "var(--muted)", marginBottom: 16 }}>These arrived at one of your wallets with an amount that did not match any open payment. If a customer paid late or sent the wrong amount, assign the transfer to their payment. If it is unrelated, ignore it.</p>
          <div className="tablewrap"><table><thead><tr><th>Received</th><th>Network</th><th>Seen</th><th>Assign to</th><th><span className="sr-only">Ignore</span></th></tr></thead><tbody>
            {(unmatched ?? []).map((t: any) => {
              const options = (candidates ?? []).filter((c: any) => c.network === t.network && c.asset === t.asset && c.receiving_address === t.address);
              return (
                <tr key={t.id}><td className="num">{t.amount} {t.asset}</td><td>{t.network}</td><td>{shortDate(t.seen_at)}</td>
                  <td>{workspaceRole === "VIEWER" ? <span style={{ color: "var(--muted)" }}>Read-only</span> : options.length === 0 ? <span style={{ color: "var(--muted)" }}>No open or expired payment on this wallet</span> : (
                    <form action={assignTransfer} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input type="hidden" name="transfer" value={t.id} />
                      <label className="sr-only" htmlFor={`pay-${t.id}`}>Payment</label>
                      <select id={`pay-${t.id}`} name="payment" style={{ width: "auto", minWidth: 220 }}>{options.map((c: any) => <option key={c.id} value={c.id}>{c.id.slice(0, 12)}… asked {c.crypto_amount} ({c.status.toLowerCase().replace(/_/g, " ")})</option>)}</select>
                      <button className="btn btn-sm btn-primary">Assign</button>
                    </form>)}</td>
                  <td>{workspaceRole !== "VIEWER" && <form action={ignoreTransfer}><input type="hidden" name="transfer" value={t.id} /><button className="btn btn-sm">Ignore</button></form>}</td></tr>
              );
            })}
          </tbody></table></div>
        </section>
      )}

      <section className="card">
        {(data ?? []).length === 0 ? <div className="empty"><strong>No payments found</strong>Payments appear here as soon as a customer starts checkout.</div> : (
          <div className="tablewrap"><table><thead><tr><th>Payment</th><th>Source</th><th>Status</th><th>Amount</th><th>Fee</th><th>Coin</th><th>Date</th></tr></thead><tbody>
            {(data ?? []).map((p: any) => (
              <tr key={p.id}><td><Link href={`/dashboard/payments/${p.id}`}>{p.id}</Link></td><td>{p.invoice_id ? "Invoice" : "Payment link"}</td><td><StatusBadge status={p.status} /></td><td className="num">{money(p.amount_cents, p.currency)}</td><td className="num">{money(p.fee_cents, p.currency)}</td><td>{p.asset} on {p.network}</td><td>{shortDate(p.created_at)}</td></tr>
            ))}
          </tbody></table></div>
        )}
        {(count ?? 0) > pageSize && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span>Page {page} of {pageCount} ({count} payments)</span>
          <div style={{ display: "flex", gap: 8 }}>
            {page > 1 && <Link className="btn btn-sm" href={pageHref(page - 1)}>Previous</Link>}
            {page < pageCount && <Link className="btn btn-sm" href={pageHref(page + 1)}>Next</Link>}
          </div>
        </div>}
      </section>
    </>
  );
}

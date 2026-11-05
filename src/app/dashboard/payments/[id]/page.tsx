import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { StatusBadge } from "@/components/StatusBadge";
import { Flash } from "@/components/Flash";
import { money, shortDate } from "@/lib/format";
import { fromBase, toBase } from "@/lib/payments/amounts";
import { acceptUnderpayment, closeUnderpayment, createRefund, updateRefund } from "../actions";
import { StatusRefresh } from "../../StatusRefresh";

export const metadata = { title: "Payment | Monifyd" };

const EXPLORER: Record<string, string> = {
  bitcoin: "https://mempool.space/tx/", ethereum: "https://etherscan.io/tx/", base: "https://basescan.org/tx/",
  polygon: "https://polygonscan.com/tx/", bnb: "https://bscscan.com/tx/", solana: "https://solscan.io/tx/",
};

export default async function PaymentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; message?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, supabase, workspaceRole } = await requireUser();
  const { data: p } = await supabase.from("payments").select("*").eq("id", id).eq("merchant_id", user.id).maybeSingle();
  if (!p) notFound();
  const [{ data: txs }, { data: log }, { data: an }, { data: refunds, error: refundsError }] = await Promise.all([
    supabase.from("payment_transactions").select("tx_hash,amount,confirmations,detected_at").eq("payment_id", id),
    supabase.from("payment_status_log").select("from_status,to_status,created_at").eq("payment_id", id).order("created_at"),
    supabase.from("asset_networks").select("decimals").eq("asset", p.asset).eq("network", p.network).maybeSingle(),
    supabase.from("refunds").select("id,amount,asset,network,destination,customer_email,tx_hash,status,created_at").eq("payment_id", id).eq("merchant_id", user.id).order("created_at", { ascending: false }),
  ]);
  if (refundsError) throw new Error(`Could not load refund records: ${refundsError.message}`);
  let invoiceEmail: string | null = null;
  if (p.invoice_id) {
    const { data: invoice, error: invoiceError } = await supabase.from("invoices").select("customer_email")
      .eq("id", p.invoice_id).eq("merchant_id", user.id).maybeSingle();
    if (invoiceError) throw new Error(`Could not load invoice customer email: ${invoiceError.message}`);
    invoiceEmail = invoice?.customer_email ?? null;
  }
  const updateRows = (refunds ?? []).length
    ? await supabase.from("refund_customer_updates").select("refund_id,event_status,status,sent_at,last_error")
      .in("refund_id", refunds!.map((refund) => refund.id))
    : { data: [], error: null };
  if (updateRows.error) throw new Error(`Could not load refund email delivery status: ${updateRows.error.message}`);
  const dec: number = an?.decimals ?? 8;
  const received = toBase(String(p.received_amount ?? "0"), dec);
  const expected = toBase(String(p.crypto_amount), dec);
  const reserved = (refunds ?? []).reduce((total, refund) =>
    refund.status === "FAILED" ? total : total + toBase(String(refund.amount), dec), 0n);
  const refundable = received > reserved ? received - reserved : 0n;
  const canRefund = ["PAID", "OVERPAID", "UNDERPAID", "EXPIRED"].includes(p.status) && received > 0n;
  return (
    <>
      {["AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING"].includes(p.status) && <StatusRefresh />}
      <div className="head"><h1>Payment</h1><Link className="btn btn-sm" href="/dashboard/payments">All payments</Link></div>
      <Flash error={sp.error} message={sp.message} />

      {p.status === "UNDERPAID" && (
        <section className="card" style={{ borderColor: "var(--warn)" }}><h2>The customer paid less than the amount due</h2>
          <dl className="kv" style={{ marginBottom: 16 }}>
            <dt>Required</dt><dd>{p.crypto_amount} {p.asset}</dd>
            <dt>Received</dt><dd>{p.received_amount} {p.asset}</dd>
            <dt>Remaining</dt><dd><strong>{fromBase(expected - received, dec)} {p.asset}</strong></dd>
          </dl>
          <p style={{ color: "var(--muted)", marginBottom: 16 }}>The funds are already in your wallet. You can accept the smaller amount as full payment, or close this as unpaid and arrange a refund or the rest of the payment with your customer yourself.</p>
          {workspaceRole === "VIEWER" ? <p className="hint">Your workspace role is read-only.</p> : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <form action={acceptUnderpayment}><input type="hidden" name="id" value={p.id} /><button className="btn btn-primary">Accept as paid</button></form>
              <form action={closeUnderpayment}><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger">Close as unpaid</button></form>
            </div>
          )}
        </section>
      )}
      {p.status === "OVERPAID" && (
        <section className="card" style={{ borderColor: "var(--warn)" }}><h2>The customer paid more than the amount due</h2>
          <dl className="kv" style={{ marginBottom: 16 }}>
            <dt>Required</dt><dd>{p.crypto_amount} {p.asset}</dd>
            <dt>Received</dt><dd>{p.received_amount} {p.asset}</dd>
            <dt>Extra</dt><dd><strong>{fromBase(received - expected, dec)} {p.asset}</strong></dd>
          </dl>
          <p style={{ color: "var(--muted)" }}>The payment is counted as paid in full. The extra amount is in your wallet, and any refund is up to you.</p>
        </section>
      )}

      <section className="card"><dl className="kv">
        <dt>Payment ID</dt><dd className="mono">{p.id}</dd>
        <dt>Status</dt><dd><StatusBadge status={p.status} /></dd>
        <dt>You receive</dt><dd>{money(p.amount_cents, p.currency)}</dd>
        <dt>Recorded transaction fee</dt><dd>{money(p.fee_cents, p.currency)}</dd>
        <dt>Customer pays</dt><dd>{money(p.total_cents, p.currency)} ({p.crypto_amount} {p.asset} on {p.network})</dd>
        <dt>Received so far</dt><dd>{p.received_amount} {p.asset}</dd>
        <dt>Receiving address</dt><dd className="mono">{p.receiving_address}</dd>
        <dt>Created</dt><dd>{shortDate(p.created_at)}</dd>
        <dt>Detected</dt><dd>{shortDate(p.detected_at) || "Not yet"}</dd>
        <dt>Confirmed</dt><dd>{shortDate(p.confirmed_at) || "Not yet"}</dd>
      </dl></section>
      <section className="card"><h2>Transactions</h2>
        {(txs ?? []).length === 0 ? <p className="empty">No transaction detected yet.</p> : (txs ?? []).map((t: any) => <p key={t.tx_hash} className="mono"><a href={`${EXPLORER[p.network] ?? ""}${t.tx_hash}`} target="_blank" rel="noreferrer">{t.tx_hash}</a> ({t.confirmations} confirmations)</p>)}
      </section>
      <section className="card"><h2>Refund tracking</h2>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Refunds are sent manually from your wallet. Monifyd only records the amount and status; it does not initiate or verify transfers.</p>
        <dl className="kv" style={{ marginBottom: 16 }}>
          <dt>Refundable received amount</dt><dd>{fromBase(refundable, dec)} {p.asset}</dd>
          <dt>Network</dt><dd>{p.network}</dd>
        </dl>
        {workspaceRole !== "VIEWER" && canRefund && refundable > 0n && <form action={createRefund} style={{ marginBottom: 20 }}>
          <input type="hidden" name="payment" value={p.id} />
          <div className="row2">
            <div className="field"><label htmlFor="refund-amount">Refund amount ({p.asset})</label><input id="refund-amount" name="amount" type="text" inputMode="decimal" autoComplete="off" required placeholder={fromBase(refundable, dec)} /><span className="hint">Cannot exceed the remaining amount received for this payment.</span></div>
            <div className="field"><label htmlFor="refund-destination">Destination address</label><input id="refund-destination" name="destination" type="text" autoComplete="off" maxLength={256} required /></div>
          </div>
          <div className="field"><label htmlFor="refund-customer-email">Customer email for status updates</label><input id="refund-customer-email" name="customer_email" type="email" autoComplete="email" maxLength={320} defaultValue={invoiceEmail ?? ""} placeholder="Optional for payment-link payments" /><span className="hint">We email the customer when you mark the refund sent, confirmed, or failed. Email delivery is retried automatically.</span></div>
          <button className="btn btn-primary">Record refund</button>
        </form>}
        {(refunds ?? []).length === 0 ? <p className="empty">No refunds recorded.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Amount</th><th>Destination</th><th>Status</th><th>Transaction</th><th>Customer updates</th><th>Recorded</th><th>Update</th></tr></thead><tbody>
            {(refunds ?? []).map((refund: any) => (
              <tr key={refund.id}><td className="num">{refund.amount} {refund.asset}</td><td className="mono">{refund.destination}</td>
                <td><StatusBadge status={refund.status} /></td><td className="mono">{refund.tx_hash ? <a href={`${EXPLORER[refund.network] ?? ""}${refund.tx_hash}`} target="_blank" rel="noreferrer">{refund.tx_hash}</a> : "—"}</td>
                <td>{refund.customer_email ? <>{refund.customer_email}<br />{(updateRows.data ?? []).filter((update) => update.refund_id === refund.id).map((update) => <span key={update.event_status} className="hint">{update.event_status.toLowerCase()}: {update.status.toLowerCase()}{update.last_error ? ` (${update.last_error})` : ""}<br /></span>)}</> : "Not configured"}</td>
                <td>{shortDate(refund.created_at)}</td><td>
                  {workspaceRole !== "VIEWER" && refund.status === "PENDING" && <form action={updateRefund} style={{ display: "grid", gap: 6 }}>
                    <input type="hidden" name="payment" value={p.id} /><input type="hidden" name="refund" value={refund.id} />
                    <label className="sr-only" htmlFor={`hash-${refund.id}`}>Refund transaction hash</label><input id={`hash-${refund.id}`} name="tx_hash" type="text" autoComplete="off" placeholder="Transaction hash" maxLength={256} />
                    <div style={{ display: "flex", gap: 6 }}><button className="btn btn-sm btn-primary" name="status" value="SENT">Mark sent</button><button className="btn btn-sm btn-danger" name="status" value="FAILED">Mark failed</button></div>
                  </form>}
                  {workspaceRole !== "VIEWER" && refund.status === "SENT" && <form action={updateRefund} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="payment" value={p.id} /><input type="hidden" name="refund" value={refund.id} /><input type="hidden" name="tx_hash" value={refund.tx_hash ?? ""} />
                    <button className="btn btn-sm btn-primary" name="status" value="CONFIRMED">Mark confirmed</button><button className="btn btn-sm btn-danger" name="status" value="FAILED">Mark failed</button>
                  </form>}
                </td></tr>
            ))}
          </tbody></table></div>
        )}
        {!canRefund && <p className="hint">Refund tracking is available after the payment has received confirmed funds.</p>}
      </section>
      <section className="card"><h2>Status history</h2>
        {(log ?? []).length === 0 ? <p className="empty">No changes yet.</p> : <ul>{(log ?? []).map((l: any, i: number) => <li key={i}>{shortDate(l.created_at)}: {(l.from_status ?? "none").toLowerCase().replace(/_/g, " ")} to {l.to_status.toLowerCase().replace(/_/g, " ")}</li>)}</ul>}
      </section>
    </>
  );
}

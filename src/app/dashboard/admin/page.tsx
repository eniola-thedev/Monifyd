import { requireAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/admin";
import { Flash } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";
import { money, shortDate } from "@/lib/format";
import { resolveOperationalEvent, setMerchantSuspension } from "./actions";

export const metadata = { title: "Admin | Monifyd" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; merchant_page?: string; payment_page?: string; payment_q?: string }> }) {
  const sp = await searchParams;
  await requireAdmin();
  const db = adminClient();
  const merchantPage = Math.max(1, Number.parseInt(sp.merchant_page ?? "1", 10) || 1);
  const paymentPage = Math.max(1, Number.parseInt(sp.payment_page ?? "1", 10) || 1);
  const paymentSearch = (sp.payment_q ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  let paymentsQuery = db.from("payments").select("id,merchant_id,status,amount_cents,fee_cents,currency,asset,network,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range((paymentPage - 1) * 50, paymentPage * 50 - 1);
  if (paymentSearch) paymentsQuery = paymentsQuery.ilike("id", `%${paymentSearch}%`);
  const [
    merchantsResult, paymentsResult, feesResult, activityResult, unmatchedResult, operationalResult, failedWebhooksResult, failedRemindersResult,
    merchantCountResult, paymentCountResult, suspendedCountResult, feeSummaryResult,
  ] = await Promise.all([
    db.from("profiles").select("id,name,business_name,business_email,role,suspended_at,created_at", { count: "exact" }).order("created_at", { ascending: false }).range((merchantPage - 1) * 50, merchantPage * 50 - 1),
    paymentsQuery,
    db.from("platform_fees").select("payment_id,total_fee_cents,asset,network,created_at,payments!inner(currency)").order("created_at", { ascending: false }).limit(50),
    db.from("audit_logs").select("id,merchant_id,actor,action,target,created_at").order("created_at", { ascending: false }).limit(50),
    db.from("unmatched_transfers").select("id,merchant_id,network,asset,address,tx_hash,amount,confirmations,status,seen_at").order("seen_at", { ascending: false }).limit(100),
    db.from("operational_events").select("id,source,severity,message,details,occurrences,first_seen_at,last_seen_at,resolved_at").order("last_seen_at", { ascending: false }).limit(100),
    db.from("webhook_deliveries").select("id,event_type,response_code,error,attempt,last_attempt_at,webhook_endpoints!inner(merchant_id,url)").eq("status", "FAILED").order("last_attempt_at", { ascending: false }).limit(50),
    db.from("invoice_reminders").select("id,invoice_id,reminder_type,attempt,last_error,invoice:invoices!inner(invoice_number,merchant_id)").eq("status", "FAILED").order("created_at", { ascending: false }).limit(50),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "merchant"),
    db.from("payments").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).not("suspended_at", "is", null),
    db.rpc("get_admin_fee_summary"),
  ]);
  const errors = [merchantsResult, paymentsResult, feesResult, activityResult, unmatchedResult, operationalResult, failedWebhooksResult, failedRemindersResult, merchantCountResult, paymentCountResult, suspendedCountResult, feeSummaryResult]
    .map((result) => result.error?.message).filter(Boolean);
  if (errors.length) throw new Error(`Could not load admin dashboard: ${errors.join("; ")}`);
  const merchants = merchantsResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const fees = feesResult.data ?? [];
  const activity = activityResult.data ?? [];
  const unmatched = unmatchedResult.data ?? [];
  const operationalEvents = operationalResult.data ?? [];
  const failedWebhooks = failedWebhooksResult.data ?? [];
  const failedReminders = failedRemindersResult.data ?? [];
  const merchantCount = merchantCountResult.count;
  const paymentCount = paymentCountResult.count;
  const suspendedCount = suspendedCountResult.count;
  const feeSummary = feeSummaryResult.data ?? [];
  const merchantPages = Math.max(1, Math.ceil((merchantsResult.count ?? 0) / 50));
  const paymentPages = Math.max(1, Math.ceil((paymentsResult.count ?? 0) / 50));
  const merchantHref = (page: number) => `/dashboard/admin?merchant_page=${page}&payment_page=${paymentPage}${paymentSearch ? `&payment_q=${encodeURIComponent(paymentSearch)}` : ""}`;
  const paymentHref = (page: number) => `/dashboard/admin?merchant_page=${merchantPage}&payment_page=${page}${paymentSearch ? `&payment_q=${encodeURIComponent(paymentSearch)}` : ""}`;
  const merchantNames = new Map((merchants ?? []).map((merchant: any) => [
    merchant.id, merchant.business_name ?? merchant.name ?? merchant.business_email ?? merchant.id,
  ]));
  return (
    <>
      <div className="head"><h1>Admin dashboard</h1></div>
      <Flash error={sp.error} message={sp.message} />
      <div className="stats">
        <div className="stat"><p>Merchants</p><strong>{merchantCount ?? 0}</strong></div>
        <div className="stat"><p>Suspended merchants</p><strong>{suspendedCount ?? 0}</strong></div>
        <div className="stat"><p>Payments</p><strong>{paymentCount ?? 0}</strong></div>
      </div>

      <section className="card"><div className="head"><h2>Merchants</h2><span>Page {merchantPage} of {merchantPages} ({merchantsResult.count ?? 0})</span></div>
        {(merchants ?? []).length === 0 ? <p className="empty">No merchants yet.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Business</th><th>Email</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {(merchants ?? []).map((merchant: any) => (
              <tr key={merchant.id}>
                <td>{merchantNames.get(merchant.id)}</td><td>{merchant.business_email ?? ""}</td><td>{shortDate(merchant.created_at)}</td>
                <td>{merchant.suspended_at ? "Suspended" : "Active"}</td>
                <td>{merchant.role === "merchant" && <form action={setMerchantSuspension}>
                  <input type="hidden" name="merchant_id" value={merchant.id} />
                  <input type="hidden" name="suspend" value={merchant.suspended_at ? "0" : "1"} />
                  <button className={`btn btn-sm ${merchant.suspended_at ? "" : "btn-danger"}`}>{merchant.suspended_at ? "Reinstate" : "Suspend"}</button>
                </form>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        {merchantPages > 1 && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {merchantPage > 1 && <a className="btn btn-sm" href={merchantHref(merchantPage - 1)}>Previous merchants</a>}
          {merchantPage < merchantPages && <a className="btn btn-sm" href={merchantHref(merchantPage + 1)}>Next merchants</a>}
        </div>}
      </section>

      <section className="card"><div className="head"><h2>Payments</h2><form method="get">
        <input type="hidden" name="merchant_page" value={merchantPage} />
        <label className="sr-only" htmlFor="admin-payment-search">Search payment ID</label>
        <input id="admin-payment-search" name="payment_q" type="text" defaultValue={paymentSearch} placeholder="Search payment ID" style={{ width: 200, display: "inline-block" }} />{" "}
        <button className="btn btn-sm">Search</button>
      </form></div>
        {(payments ?? []).length === 0 ? <p className="empty">No payments yet.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Payment</th><th>Merchant</th><th>Status</th><th>Amount</th><th>Fee</th><th>Coin</th><th>Created</th></tr></thead><tbody>
            {(payments ?? []).map((payment: any) => (
              <tr key={payment.id}><td className="mono">{payment.id}</td><td>{merchantNames.get(payment.merchant_id) ?? payment.merchant_id}</td>
                <td><StatusBadge status={payment.status} /></td><td>{money(payment.amount_cents, payment.currency)}</td>
                <td>{money(payment.fee_cents, payment.currency)}</td><td>{payment.asset} on {payment.network}</td><td>{shortDate(payment.created_at)}</td></tr>
            ))}
          </tbody></table></div>
        )}
        {paymentPages > 1 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span>Page {paymentPage} of {paymentPages} ({paymentsResult.count ?? 0} payments)</span>
          <div style={{ display: "flex", gap: 8 }}>
            {paymentPage > 1 && <a className="btn btn-sm" href={paymentHref(paymentPage - 1)}>Previous</a>}
            {paymentPage < paymentPages && <a className="btn btn-sm" href={paymentHref(paymentPage + 1)}>Next</a>}
          </div>
        </div>}
      </section>

      <section className="card"><h2>All-time monthly platform fees</h2>
        {(feeSummary ?? []).length === 0 ? <p className="empty">No fee records yet.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Month</th><th>Currency</th><th>Payments</th><th>Merchant amount</th><th>Customer fees</th></tr></thead><tbody>
            {(feeSummary ?? []).map((row: any) => (
              <tr key={`${row.month}-${row.currency}`}><td>{shortDate(`${row.month}T00:00:00Z`)}</td><td>{row.currency}</td>
                <td>{row.payment_count}</td><td>{money(Number(row.merchant_cents), row.currency)}</td>
                <td>{money(Number(row.customer_fee_cents), row.currency)}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <section className="card"><h2>Recent platform fees</h2>
        {(fees ?? []).length === 0 ? <p className="empty">No fee records yet.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Payment</th><th>Fee</th><th>Asset</th><th>Network</th><th>Created</th></tr></thead><tbody>
            {(fees ?? []).map((fee: any) => (
              <tr key={fee.payment_id}><td className="mono">{fee.payment_id}</td><td>{money(fee.total_fee_cents, fee.payments?.currency ?? "USD")}</td>
                <td>{fee.asset}</td><td>{fee.network}</td><td>{shortDate(fee.created_at)}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <section className="card"><h2>Recent activity</h2>
        {(activity ?? []).length === 0 ? <p className="empty">No activity yet.</p> : (
          <div className="tablewrap"><table><thead><tr><th>When</th><th>Merchant</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>
            {(activity ?? []).map((entry: any) => (
              <tr key={entry.id}><td>{shortDate(entry.created_at)}</td><td>{merchantNames.get(entry.merchant_id) ?? entry.merchant_id ?? "—"}</td>
                <td className="mono">{entry.actor}</td><td>{entry.action}</td><td className="mono">{entry.target ?? ""}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <section className="card"><h2>Unmatched transfers</h2>
        {unmatched.length === 0 ? <p className="empty">No unmatched transfers.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Seen</th><th>Merchant</th><th>Transfer</th><th>Amount</th><th>Confirmations</th><th>Status</th></tr></thead><tbody>
            {unmatched.map((transfer: any) => (
              <tr key={transfer.id}><td>{shortDate(transfer.seen_at)}</td><td>{merchantNames.get(transfer.merchant_id) ?? transfer.merchant_id}</td>
                <td className="mono">{transfer.network}: {transfer.tx_hash}</td><td>{transfer.amount} {transfer.asset}</td>
                <td>{transfer.confirmations}</td><td>{transfer.status}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <section className="card"><h2>Operational alerts</h2>
        {operationalEvents.length === 0 ? <p className="empty">No recorded operational alerts.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Severity</th><th>Source</th><th>Message</th><th>Occurrences</th><th>Last seen</th><th>Status</th><th></th></tr></thead><tbody>
            {operationalEvents.map((event: any) => (
              <tr key={event.id}><td>{event.severity}</td><td>{event.source}</td><td>{event.message}</td><td>{event.occurrences}</td>
                <td>{shortDate(event.last_seen_at)}</td><td>{event.resolved_at ? "Resolved" : "Open"}</td>
                {!event.resolved_at && <td><form action={resolveOperationalEvent}><input type="hidden" name="id" value={event.id} /><button className="btn btn-sm">Resolve</button></form></td>}
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <section className="card"><h2>Failed webhook deliveries</h2>
        {failedWebhooks.length === 0 ? <p className="empty">No failed webhook deliveries.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Last attempt</th><th>Merchant</th><th>Event</th><th>HTTP</th><th>Attempts</th><th>Error</th></tr></thead><tbody>
            {failedWebhooks.map((delivery: any) => (
              <tr key={delivery.id}><td>{shortDate(delivery.last_attempt_at)}</td>
                <td>{merchantNames.get(delivery.webhook_endpoints.merchant_id) ?? delivery.webhook_endpoints.merchant_id}</td>
                <td>{delivery.event_type}</td><td>{delivery.response_code ?? "—"}</td><td>{delivery.attempt}</td><td>{delivery.error}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>

      <section className="card"><h2>Failed invoice reminders</h2>
        {failedReminders.length === 0 ? <p className="empty">No failed invoice reminders.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Invoice</th><th>Merchant</th><th>Reminder</th><th>Attempts</th><th>Error</th></tr></thead><tbody>
            {failedReminders.map((reminder: any) => (
              <tr key={reminder.id}><td>{reminder.invoice.invoice_number}</td>
                <td>{merchantNames.get(reminder.invoice.merchant_id) ?? reminder.invoice.merchant_id}</td>
                <td>{reminder.reminder_type}</td><td>{reminder.attempt}</td><td>{reminder.last_error}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}

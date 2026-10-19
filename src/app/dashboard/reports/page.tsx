import { requireUser } from "@/lib/session";
import { money, shortDate } from "@/lib/format";
import { adminClient } from "@/lib/supabase/admin";
import { activePlan } from "@/lib/billing/plans";

export const metadata = { title: "Reports | Monifyd" };

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; page?: string }> }) {
  const [sp, { user, supabase }] = await Promise.all([searchParams, requireUser()]);
  const { data: subscription, error: subscriptionError } = await adminClient().from("merchant_subscriptions")
    .select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle();
  if (subscriptionError) throw new Error(`Could not load reporting plan: ${subscriptionError.message}`);
  const plan = activePlan(subscription);
  const start = validDate(sp.start);
  const end = validDate(sp.end);
  const invalidRange = (!!sp.start && !start) || (!!sp.end && !end) || (!!start && !!end && start > end);
  const pageSize = 25;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [{ data, error }, detailsResult, rangeSummaryResult] = await Promise.all([
    supabase.rpc("get_workspace_fee_summary"),
    plan === "FREE" || invalidRange
      ? Promise.resolve({ data: [], error: null })
      : supabase.rpc("get_workspace_fee_details", { p_start: start, p_end: end }),
    plan === "FREE" || invalidRange
      ? Promise.resolve({ data: [], error: null })
      : supabase.rpc("get_workspace_fee_range_summary", { p_start: start, p_end: end }),
  ]);
  if (error || detailsResult.error || rangeSummaryResult.error) {
    throw new Error(`Could not load fee report: ${error?.message ?? detailsResult.error?.message ?? rangeSummaryResult.error?.message}`);
  }
  const details = detailsResult.data ?? [];
  const detailCount = details.length;
  const pageCount = Math.max(1, Math.ceil(detailCount / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleDetails = details.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const href = (target: number) => {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    params.set("page", String(target));
    return `/dashboard/reports?${params}`;
  };
  return (
    <>
      <div className="head"><h1>Reports</h1></div>
      <section className="card">
        <h2>Monthly payment and fee summary</h2>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Merchant amount is the amount received by your wallet. Recorded fee totals include historical payments; no transaction fee is currently added to new payments.</p>
        {(data ?? []).length === 0 ? <p className="empty">Settled payment reports will appear here.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Month</th><th>Currency</th><th>Settled payments</th><th>Merchant amount</th><th>Customer fees</th></tr></thead><tbody>
            {(data ?? []).map((row: any) => (
              <tr key={`${row.month}-${row.currency}`}><td>{shortDate(`${row.month}T00:00:00Z`)}</td><td>{row.currency}</td>
                <td>{row.payment_count}</td><td className="num">{money(Number(row.merchant_cents), row.currency)}</td>
                <td className="num">{money(Number(row.customer_fee_cents), row.currency)}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      {plan === "FREE" ? <section className="card">
        <h2>Advanced fee reporting</h2>
        <p style={{ color: "var(--muted)" }}>Pro adds date-range filters and a per-payment fee breakdown. Current monthly summaries remain available on Free.</p>
        <a className="btn btn-primary" style={{ marginTop: 16 }} href="/dashboard/billing">View Pro and Business plans</a>
      </section> : (
        <section className="card"><div className="head"><h2>Fee and revenue details</h2>
          <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label htmlFor="report-start" className="sr-only">Start date</label><input id="report-start" name="start" type="date" defaultValue={start ?? ""} />
            <label htmlFor="report-end" className="sr-only">End date</label><input id="report-end" name="end" type="date" defaultValue={end ?? ""} />
            <button className="btn btn-sm">Apply dates</button>
          </form>
        </div>
          {invalidRange && <p className="flash error">Choose valid dates and make sure the start date is not after the end date.</p>}
          {(rangeSummaryResult.data ?? []).length > 0 && <div className="tablewrap" style={{ marginBottom: 16 }}>
            <table><thead><tr><th>Currency</th><th>Settled payments</th><th>Merchant amount</th><th>Customer fees</th></tr></thead><tbody>
              {(rangeSummaryResult.data ?? []).map((row: any) => <tr key={row.currency}><td>{row.currency}</td><td>{row.payment_count}</td><td className="num">{money(Number(row.merchant_cents), row.currency)}</td><td className="num">{money(Number(row.customer_fee_cents), row.currency)}</td></tr>)}
            </tbody></table>
          </div>}
          {visibleDetails.length === 0 ? <p className="empty">No settled payment fee records in this date range.</p> : <>
            <div className="tablewrap"><table><thead><tr><th>Payment</th><th>Date</th><th>Status</th><th>Merchant amount</th><th>Customer fee</th><th>Asset</th></tr></thead><tbody>
              {visibleDetails.map((row: any) => <tr key={row.payment_id}><td className="mono">{row.payment_id}</td><td>{shortDate(row.created_at)}</td><td>{row.status.toLowerCase().replace(/_/g, " ")}</td><td className="num">{money(row.merchant_cents, row.currency)}</td><td className="num">{money(row.customer_fee_cents, row.currency)}</td><td>{row.asset} on {row.network}</td></tr>)}
            </tbody></table></div>
            {pageCount > 1 && <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <span>Page {currentPage} of {pageCount} (up to 5,000 records)</span>
              <div style={{ display: "flex", gap: 8 }}>
                {currentPage > 1 && <a className="btn btn-sm" href={href(currentPage - 1)}>Previous</a>}
                {currentPage < pageCount && <a className="btn btn-sm" href={href(currentPage + 1)}>Next</a>}
              </div>
            </div>}
          </>}
        </section>
      )}
    </>
  );
}

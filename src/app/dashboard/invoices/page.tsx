import { requireUser } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { CoinPicker } from "@/components/CoinPicker";
import { StatusBadge } from "@/components/StatusBadge";
import { money } from "@/lib/format";
import { activePlan } from "@/lib/billing/plans";
import { DEFAULT_INVOICE_DESIGN, parseInvoiceDesign } from "@/lib/invoices/design";
import { adminClient } from "@/lib/supabase/admin";
import { InvoiceComposer } from "./InvoiceComposer";
import { SendInvoiceButton } from "./SendInvoiceButton";
import { createInvoice, cancelInvoice } from "./actions";

export const metadata = { title: "Invoices | Monifyd" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const { user, supabase, workspaceRole } = await requireUser();
  const [{ data: subscription }, { data: profile }] = await Promise.all([
    adminClient().from("merchant_subscriptions").select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle(),
    adminClient().from("profiles").select("business_name,logo_url,invoice_design,invoice_design_presets").eq("id", user.id).maybeSingle(),
  ]);
  const plan = activePlan(subscription);
  const initialDesign = plan === "FREE"
    ? parseInvoiceDesign(DEFAULT_INVOICE_DESIGN)
    : parseInvoiceDesign(profile?.invoice_design, { ...DEFAULT_INVOICE_DESIGN, logoUrl: profile?.logo_url ?? "" });
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = 25;
  const search = (sp.q ?? "").replace(/[^a-zA-Z0-9@._-]/g, "").slice(0, 80);
  const statuses = ["DRAFT", "SENT", "AWAITING_PAYMENT", "PAYMENT_DETECTED", "CONFIRMING", "PAID", "UNDERPAID", "OVERPAID", "EXPIRED", "CANCELLED"];
  let invoiceQuery = supabase.from("invoices").select("id,invoice_number,customer_email,title,amount_cents,currency,status,due_date", { count: "exact" })
    .eq("merchant_id", user.id).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (sp.status && statuses.includes(sp.status)) invoiceQuery = invoiceQuery.eq("status", sp.status);
  if (search) invoiceQuery = invoiceQuery.or(`id.ilike.%${search}%,invoice_number.ilike.%${search}%,customer_email.ilike.%${search}%,title.ilike.%${search}%`);
  const [{ data: pairs }, { data: networks }, { data: wallets }, { data: invoices, count, error }] = await Promise.all([
    supabase.from("asset_networks").select("asset,network").eq("enabled", true).order("asset"),
    supabase.from("supported_networks").select("id,name"),
    supabase.from("wallets").select("network").eq("merchant_id", user.id),
    invoiceQuery,
  ]);
  if (error) throw new Error(`Could not load invoices: ${error.message}`);
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (sp.status && statuses.includes(sp.status)) params.set("status", sp.status);
    if (search) params.set("q", search);
    params.set("page", String(target));
    return `/dashboard/invoices?${params}`;
  };
  const have = new Set((wallets ?? []).map((w: any) => w.network as string));
  return (
    <div className="invoices-page">
      <header className="invoices-heading">
        <div><h1>Invoices</h1><p>Send payment requests and keep track of what customers owe.</p></div>
        <a className="btn" href="/dashboard/exports/invoices">Export CSV</a>
      </header>
      <Flash error={sp.error} message={sp.message} />
      <details className="card invoice-create" open={(count ?? 0) === 0 && workspaceRole !== "VIEWER"}>
        <summary>
          <span><strong>Create an invoice</strong><span className="hint">Add a customer, line items and payment details.</span></span>
          <span className="btn btn-primary invoice-create-action">New invoice</span>
        </summary>
        <div className="invoice-create-content">
        {workspaceRole === "VIEWER" ? <p className="hint">Your workspace role is read-only.</p> : <>
        <InvoiceComposer action={createInvoice} plan={plan} businessName={profile?.business_name ?? ""} initialDesign={initialDesign} presets={Array.isArray(profile?.invoice_design_presets) ? profile.invoice_design_presets : []} issuedDate={new Date().toLocaleDateString("en-GB")} paymentOptions={<CoinPicker pairs={pairs ?? []} networks={networks ?? []} haveNetworks={have} />} />
        </>}
        </div>
      </details>
      <section className="card invoice-list" aria-labelledby="invoice-list-title"><div className="invoice-list-heading"><div><h2 id="invoice-list-title">Your invoices</h2><p className="hint">{count ?? 0} total</p></div>
        <form method="get" className="invoice-filters">
          <div className="field"><label htmlFor="invoice-search">Search</label><input id="invoice-search" name="q" type="search" defaultValue={search} placeholder="Number, customer or title" /></div>
          <div className="field"><label htmlFor="invoice-status">Status</label><select id="invoice-status" name="status" defaultValue={sp.status ?? ""}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ").toLowerCase()}</option>)}</select></div>
          <button className="btn btn-sm">Apply filters</button>
        </form>
      </div>
        {(invoices ?? []).length === 0 ? <div className="empty"><strong>{search || sp.status ? "No invoices found" : "No invoices yet"}</strong>{search || sp.status ? "Try changing your search or status filter." : workspaceRole === "VIEWER" ? "Ask a workspace owner or admin to create the first invoice." : "Create an invoice and Monifyd can email it with a payment link."}</div> : (
          <div className="tablewrap invoice-table-wrap"><table className="invoice-table"><thead><tr><th>Number</th><th>Customer</th><th>Title</th><th>Amount</th><th>Status</th><th>Due</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {(invoices ?? []).map((i: any) => (
              <tr key={i.id}><td className="num" data-label="Number">{i.invoice_number}</td><td data-label="Customer">{i.customer_email}</td><td data-label="Title">{i.title}</td><td className="num" data-label="Amount">{money(i.amount_cents, i.currency)}</td><td data-label="Status"><StatusBadge status={i.status} /></td><td data-label="Due">{i.due_date ?? "—"}</td>
                <td className="invoice-actions" data-label="Actions">
                  <a className="btn btn-sm" href={`/pay/${i.id}`} target="_blank" rel="noreferrer">View</a>
                  {workspaceRole !== "VIEWER" && ["DRAFT", "SENT", "AWAITING_PAYMENT"].includes(i.status) && <>
                    <SendInvoiceButton invoiceId={i.id} label={i.status === "DRAFT" ? "Send" : "Resend"} />
                    <form action={cancelInvoice}><input type="hidden" name="id" value={i.id} /><button className="btn btn-sm btn-danger">Cancel</button></form></>}
                </td></tr>
            ))}
          </tbody></table></div>
        )}
        {(count ?? 0) > pageSize && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span>Page {page} of {pageCount} ({count} invoices)</span>
          <div style={{ display: "flex", gap: 8 }}>
            {page > 1 && <a className="btn btn-sm" href={pageHref(page - 1)}>Previous</a>}
            {page < pageCount && <a className="btn btn-sm" href={pageHref(page + 1)}>Next</a>}
          </div>
        </div>}
      </section>
    </div>
  );
}

import { requireUser } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { CoinPicker } from "@/components/CoinPicker";
import { StatusBadge } from "@/components/StatusBadge";
import { money } from "@/lib/format";
import { activePlan } from "@/lib/billing/plans";
import { DEFAULT_INVOICE_DESIGN, parseInvoiceDesign } from "@/lib/invoices/design";
import { adminClient } from "@/lib/supabase/admin";
import { InvoiceComposer } from "./InvoiceComposer";
import { createInvoice, sendInvoice, cancelInvoice } from "./actions";

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
    <>
      <div className="head"><h1>Invoices</h1><a className="btn btn-sm" href="/dashboard/exports/invoices">Export CSV</a></div>
      <Flash error={sp.error} message={sp.message} />
      <section className="card"><h2>Create an invoice</h2>
        {workspaceRole === "VIEWER" ? <p className="hint">Your workspace role is read-only.</p> : <>
        <InvoiceComposer action={createInvoice} plan={plan} businessName={profile?.business_name ?? ""} initialDesign={initialDesign} presets={Array.isArray(profile?.invoice_design_presets) ? profile.invoice_design_presets : []} issuedDate={new Date().toLocaleDateString("en-GB")} paymentOptions={<CoinPicker pairs={pairs ?? []} networks={networks ?? []} haveNetworks={have} />} />
        </>}
      </section>
      <section className="card"><div className="head"><h2>Your invoices</h2>
        <form method="get"><label htmlFor="invoice-search" className="sr-only">Search invoices</label><input id="invoice-search" name="q" type="text" defaultValue={search} placeholder="Search invoice, email or title" style={{ width: 240, display: "inline-block" }} />{" "}
          <label htmlFor="invoice-status" className="sr-only">Filter invoices by status</label><select id="invoice-status" name="status" defaultValue={sp.status ?? ""} style={{ width: "auto", display: "inline-block" }}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ").toLowerCase()}</option>)}</select>{" "}
          <button className="btn btn-sm">Filter</button></form>
      </div>
        {(invoices ?? []).length === 0 ? <div className="empty"><strong>No invoices yet</strong>Create one above and Monifyd will email it with a Pay invoice button.</div> : (
          <div className="tablewrap"><table><thead><tr><th>Number</th><th>Customer</th><th>Title</th><th>Amount</th><th>Status</th><th>Due</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {(invoices ?? []).map((i: any) => (
              <tr key={i.id}><td className="num">{i.invoice_number}</td><td>{i.customer_email}</td><td>{i.title}</td><td className="num">{money(i.amount_cents, i.currency)}</td><td><StatusBadge status={i.status} /></td><td>{i.due_date ?? ""}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <a className="btn btn-sm" href={`/pay/${i.id}`} target="_blank" rel="noreferrer">View</a>
                  {workspaceRole !== "VIEWER" && ["DRAFT", "SENT", "AWAITING_PAYMENT"].includes(i.status) && <>
                    <form action={sendInvoice}><input type="hidden" name="id" value={i.id} /><button className="btn btn-sm">{i.status === "DRAFT" ? "Send" : "Resend"}</button></form>
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
    </>
  );
}

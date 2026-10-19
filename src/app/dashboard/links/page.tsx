import { requireUser } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { CoinPicker } from "@/components/CoinPicker";
import { StatusBadge } from "@/components/StatusBadge";
import { appUrl, money, shortDate } from "@/lib/format";
import { createLink, disableLink } from "./actions";

export const metadata = { title: "Payment links | Monifyd" };

export default async function LinksPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { user, supabase, workspaceRole } = await requireUser();
  const [{ data: pairs }, { data: networks }, { data: wallets }, { data: links }] = await Promise.all([
    supabase.from("asset_networks").select("asset,network").eq("enabled", true).order("asset"),
    supabase.from("supported_networks").select("id,name"),
    supabase.from("wallets").select("network").eq("merchant_id", user.id),
    supabase.from("payment_links").select("id,status,amount_cents,currency,description,created_at").eq("merchant_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const have = new Set((wallets ?? []).map((w: any) => w.network as string));
  return (
    <>
      <div className="head"><h1>Payment links</h1></div>
      <Flash error={sp.error} message={sp.message} />
      <section className="card"><h2>Create a payment link</h2>
        {workspaceRole === "VIEWER" ? <p className="hint">Your workspace role is read-only.</p> : <>
        {have.size === 0 && <p className="flash err" role="note">Add a receiving wallet before creating a link.</p>}
        <form action={createLink}>
          <div className="row2">
            <div className="field"><label htmlFor="amount">Amount (USD)</label><input id="amount" name="amount" type="number" step="0.01" min="0.5" required inputMode="decimal" /><span className="hint">Your customer pays this amount.</span></div>
            <div className="field"><label htmlFor="reference">Reference (optional)</label><input id="reference" name="reference" type="text" placeholder="ORDER-123" /></div>
          </div>
          <div className="field"><label htmlFor="description">Description</label><input id="description" name="description" type="text" placeholder="Website development" /></div>
          <CoinPicker pairs={pairs ?? []} networks={networks ?? []} haveNetworks={have} />
          <button className="btn btn-primary">Create link</button>
        </form></>}
      </section>
      <section className="card"><h2>Your links</h2>
        {(links ?? []).length === 0 ? <div className="empty"><strong>No payment links yet</strong>Create your first link above and share it with a customer.</div> : (
          <div className="tablewrap"><table><thead><tr><th>Description</th><th>Amount</th><th>Status</th><th>Created</th><th>Checkout link</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {(links ?? []).map((l: any) => (
              <tr key={l.id}><td>{l.description ?? "Payment"}</td><td className="num">{money(l.amount_cents, l.currency)}</td><td><StatusBadge status={l.status} /></td><td>{shortDate(l.created_at)}</td>
                <td className="mono"><a href={`/pay/${l.id}`} target="_blank" rel="noreferrer">{appUrl()}/pay/{l.id}</a></td>
                <td>{workspaceRole !== "VIEWER" && l.status === "ACTIVE" && <form action={disableLink}><input type="hidden" name="id" value={l.id} /><button className="btn btn-sm btn-danger">Disable</button></form>}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}

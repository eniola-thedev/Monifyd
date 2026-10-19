import { requireUser } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { shortDate } from "@/lib/format";
import { addWallet, removeWallet } from "./actions";

export const metadata = { title: "Wallets | Monifyd" };

export default async function WalletsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { user, supabase, workspaceRole } = await requireUser();
  const [{ data: networks }, { data: wallets }] = await Promise.all([
    supabase.from("supported_networks").select("id,name").order("name"),
    supabase.from("wallets").select("id,network,address,label,created_at").eq("merchant_id", user.id).order("created_at", { ascending: false }),
  ]);
  return (
    <>
      <div className="head"><h1>Wallets</h1></div>
      <Flash error={sp.error} message={sp.message} />
      <section className="card"><h2>Add a receiving wallet</h2>
        <p className="hint" style={{ marginBottom: 16, color: "var(--muted)" }}>Payments go straight to this address. Monifyd never asks for a seed phrase or private key.</p>
        {workspaceRole === "VIEWER" ? <p className="hint">Your workspace role is read-only.</p> : (
        <form action={addWallet}>
          <div className="row2">
            <div className="field"><label htmlFor="network">Network</label><select id="network" name="network" required>{(networks ?? []).map((n: any) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></div>
            <div className="field"><label htmlFor="label">Label (optional)</label><input id="label" name="label" type="text" placeholder="Main USDC wallet" /></div>
          </div>
          <div className="field"><label htmlFor="address">Wallet address</label><input id="address" name="address" type="text" required autoComplete="off" spellCheck={false} /><span className="hint">Double-check the address. Funds sent to a wrong address cannot be recovered.</span></div>
          <button className="btn btn-primary">Add wallet</button>
        </form>)}
      </section>
      <section className="card"><h2>Your wallets</h2>
        {(wallets ?? []).length === 0 ? <div className="empty"><strong>No wallets yet</strong>Add one above to start accepting payments.</div> : (
          <div className="tablewrap"><table><thead><tr><th>Network</th><th>Address</th><th>Label</th><th>Added</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {(wallets ?? []).map((w: any) => (
              <tr key={w.id}><td>{w.network}</td><td className="mono">{w.address}</td><td>{w.label}</td><td>{shortDate(w.created_at)}</td>
                <td>{workspaceRole !== "VIEWER" && <form action={removeWallet}><input type="hidden" name="id" value={w.id} /><button className="btn btn-sm btn-danger" aria-label={`Remove ${w.network} wallet`}>Remove</button></form>}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}

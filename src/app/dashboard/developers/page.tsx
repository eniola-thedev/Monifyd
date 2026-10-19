import Link from "next/link";
import { requireUser } from "@/lib/session";
import { shortDate, appUrl } from "@/lib/format";
import { CreateKeyForm } from "./CreateKeyForm";
import { revokeApiKey } from "./actions";

export const metadata = { title: "API keys | Monifyd" };

export default async function DevelopersPage() {
  const { user, supabase, workspaceRole } = await requireUser();
  const { data: keys } = await supabase.from("api_keys").select("id,name,mode,key_prefix,last_used_at,revoked_at,created_at").eq("merchant_id", user.id).order("created_at", { ascending: false });
  return (
    <>
      <div className="head"><h1>API keys</h1><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="btn btn-sm" href="/dashboard/api-billing">API plans</Link><Link className="btn btn-sm" href="/dashboard/settings#developer-settings">Settings</Link></div></div>
      <section className="card"><h2>Get an API key</h2>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Create a key for your server integration. The full key is shown only once. Keep it on your server and never put it in browser code or a public repository.</p>
        {workspaceRole === "VIEWER" ? <p className="hint">Your workspace role is read-only.</p> : <CreateKeyForm />}
      </section>
      <section className="card"><h2>Your keys</h2>
        {(keys ?? []).length === 0 ? <div className="empty"><strong>No API keys yet</strong>Create a key above to call the API.</div> : (
          <div className="tablewrap"><table><thead><tr><th>Name</th><th>Key</th><th>Mode</th><th>Last used</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {(keys ?? []).map((k: any) => (
              <tr key={k.id}><td>{k.name || "-"}</td><td className="mono">{k.key_prefix}...</td><td>{k.mode}</td><td>{shortDate(k.last_used_at) || "Never"}</td><td>{shortDate(k.created_at)}</td>
                <td>{k.revoked_at ? <span className="badge badge-bad">Revoked</span> : workspaceRole !== "VIEWER" && <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="btn btn-sm btn-danger">Revoke</button></form>}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      <section className="card"><div className="head"><h2>API docs and quick start</h2><Link className="btn btn-sm" href="/docs">Open documentation</Link></div>
        <pre className="code" tabIndex={0}>{`curl ${appUrl()}/api/v1/payment-links \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: order-123" \\
  -H "Content-Type: application/json" \\
  -d '{"amount":500,"currency":"USD","accepted_payments":[{"asset":"USDC","networks":["base"]}]}'`}</pre>
      </section>
    </>
  );
}

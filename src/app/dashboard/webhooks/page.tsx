import Link from "next/link";
import { requireUser } from "@/lib/session";
import { StatusBadge } from "@/components/StatusBadge";
import { shortDate } from "@/lib/format";
import { EVENT_TYPES } from "@/lib/webhooks/rules";
import { activeApiPlan, activePlan } from "@/lib/billing/plans";
import { CreateEndpointForm } from "./CreateEndpointForm";
import { toggleEndpoint, deleteEndpoint, sendTestEvent, replayDelivery } from "./actions";

export const metadata = { title: "Webhooks | Monifyd" };

export default async function WebhooksPage() {
  const { user, supabase, workspaceRole } = await requireUser();
  const [{ data: endpoints }, { data: directApi }, { data: dashboard }] = await Promise.all([
    supabase.from("webhook_endpoints").select("id,url,events,enabled,created_at").eq("merchant_id", user.id).order("created_at", { ascending: false }),
    supabase.from("api_subscriptions").select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle(),
    supabase.from("merchant_subscriptions").select("plan,status,current_period_end,legacy_api_access").eq("merchant_id", user.id).maybeSingle(),
  ]);
  const directPlan = activeApiPlan(directApi);
  const legacyPlan = dashboard?.legacy_api_access ? activePlan(dashboard) : "FREE";
  const apiPlan = directPlan !== "FREE" ? directPlan : legacyPlan === "PRO" ? "GROWTH" : legacyPlan === "BUSINESS" ? "SCALE" : "FREE";
  const canReplay = apiPlan !== "FREE";
  const ids = (endpoints ?? []).map((e: any) => e.id);
  const { data: deliveries } = ids.length
    ? await supabase.from("webhook_deliveries").select("id,endpoint_id,event_type,status,attempt,response_code,error,last_attempt_at,next_attempt_at,payload").in("endpoint_id", ids).order("created_at", { ascending: false }).limit(50)
    : { data: [] as any[] };
  const urlOf = (id: string) => (endpoints ?? []).find((e: any) => e.id === id)?.url ?? "";
  return (
    <>
      <div className="head"><h1>Webhooks</h1><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="btn btn-sm" href="/dashboard/api-billing">API plans</Link><Link className="btn btn-sm" href="/dashboard/settings#developer-settings">Settings</Link><Link className="btn btn-sm" href="/docs#webhooks">How to verify events</Link></div></div>
      <section className="card"><h2>Add an endpoint</h2>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Monifyd sends a signed POST request to your server when a payment or invoice changes. Endpoint limits are set by your API plan. Reply with any 2xx status within 8 seconds.</p>
        {workspaceRole === "VIEWER" ? <p className="hint">Your workspace role is read-only.</p> : <CreateEndpointForm events={EVENT_TYPES} />}
      </section>
      <section className="card"><h2>Your endpoints</h2>
        {(endpoints ?? []).length === 0 ? <div className="empty"><strong>No endpoints yet</strong>Add one above to start receiving events.</div> : (
          <div className="tablewrap"><table><thead><tr><th>URL</th><th>Events</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {(endpoints ?? []).map((e: any) => (
              <tr key={e.id}><td className="mono">{e.url}</td><td>{e.events.length} of {EVENT_TYPES.length}</td>
                <td>{e.enabled ? <span className="badge badge-good">Enabled</span> : <span className="badge badge-bad">Disabled</span>}</td>
                <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {workspaceRole !== "VIEWER" && <>
                  <form action={sendTestEvent}><input type="hidden" name="id" value={e.id} /><button className="btn btn-sm" disabled={!e.enabled}>Send test</button></form>
                  <form action={toggleEndpoint}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="enable" value={e.enabled ? "0" : "1"} /><button className="btn btn-sm">{e.enabled ? "Disable" : "Enable"}</button></form>
                  <form action={deleteEndpoint}><input type="hidden" name="id" value={e.id} /><button className="btn btn-sm btn-danger">Delete</button></form>
                  </>}
                </td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      <section className="card"><h2>Recent deliveries</h2>
        {(deliveries ?? []).length === 0 ? <div className="empty"><strong>No deliveries yet</strong>Events appear here as they are sent.</div> : (
          <div className="tablewrap"><table><thead><tr><th>Event</th><th>Endpoint</th><th>Status</th><th>Response</th><th>Attempts</th><th>Next retry</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {(deliveries ?? []).map((d: any) => (
              <tr key={d.id}>
                <td><details><summary>{d.event_type}</summary><pre className="code" tabIndex={0} style={{ marginTop: 8 }}>{JSON.stringify(d.payload, null, 2)}{d.error ? `\n\nError: ${d.error}` : ""}</pre></details></td>
                <td className="mono" style={{ maxWidth: 220 }}>{urlOf(d.endpoint_id)}</td>
                <td><StatusBadge status={d.status} /></td><td className="num">{d.response_code ?? ""}</td><td className="num">{d.attempt}</td>
                <td>{d.status === "PENDING" ? shortDate(d.next_attempt_at) : ""}</td>
                <td>{workspaceRole !== "VIEWER" && canReplay && <form action={replayDelivery}><input type="hidden" name="id" value={d.id} /><button className="btn btn-sm">Replay</button></form>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}

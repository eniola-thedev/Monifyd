"use client";
import { useActionState } from "react";
import { createEndpoint, type EndpointState } from "./actions";

export function CreateEndpointForm({ events }: { events: readonly string[] }) {
  const [state, action, pending] = useActionState<EndpointState, FormData>(createEndpoint, {});
  return (
    <form action={action}>
      {state.error && <p className="flash err" role="alert">{state.error}</p>}
      {state.secret && (
        <div role="status">
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Endpoint added. Copy the signing secret now. You will not be able to see it again.</p>
          <p className="secret mono">{state.secret}</p>
        </div>
      )}
      <div className="field"><label htmlFor="url">Endpoint URL</label><input id="url" name="url" type="text" inputMode="url" required placeholder="https://example.com/webhooks/monifyd" /><span className="hint">Must be a public https address.</span></div>
      <fieldset className="field"><legend>Events to receive</legend>
        <div className="checks">{events.map((e) => <label key={e} className="check"><input type="checkbox" name="event" value={e} defaultChecked /><span>{e}</span></label>)}</div>
      </fieldset>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Adding…" : "Add endpoint"}</button>
    </form>
  );
}

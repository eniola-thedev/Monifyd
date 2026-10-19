"use client";
import { useActionState } from "react";
import { createApiKey, type KeyState } from "./actions";

export function CreateKeyForm() {
  const [state, action, pending] = useActionState<KeyState, FormData>(createApiKey, {});
  return (
    <form action={action}>
      {state.error && <p className="flash err" role="alert">{state.error}</p>}
      {state.key && (
        <div role="status">
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Copy this key now. You will not be able to see it again.</p>
          <p className="secret mono">{state.key}</p>
        </div>
      )}
      <div className="field"><label htmlFor="api_key_name">Key name (optional)</label><input id="api_key_name" name="name" type="text" placeholder="Production server" /></div>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Creating…" : "Create API key"}</button>
    </form>
  );
}

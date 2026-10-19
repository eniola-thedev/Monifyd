import Link from "next/link";

export function DeveloperSettings() {
  return (
    <section className="card" id="developer-settings">
      <h2>Developer settings</h2>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>Connect your own app to Monifyd. API usage and webhooks have their own optional subscription, separate from dashboard plans.</p>
      <div className="row2">
        <div>
          <h3>API keys</h3>
          <p style={{ color: "var(--muted)", marginBottom: 12 }}>Create and revoke secret keys, view usage, and follow the API quick start.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="btn btn-primary" href="/dashboard/developers">Get API key</Link><Link className="btn" href="/dashboard/api-billing">API plans</Link></div>
        </div>
        <div>
          <h3>Webhooks</h3>
          <p style={{ color: "var(--muted)", marginBottom: 12 }}>Configure event endpoints, manage signing secrets, and review delivery attempts.</p>
          <Link className="btn btn-primary" href="/dashboard/webhooks">Set up webhooks</Link>
        </div>
      </div>
    </section>
  );
}

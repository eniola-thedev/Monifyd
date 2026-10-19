import Link from "next/link";
import { Logo } from "@/components/Logo";
import { appUrl } from "@/lib/format";

export const metadata = { title: "API docs | Monifyd" };

const Code = ({ children }: { children: string }) => <pre className="code" tabIndex={0}>{children}</pre>;

export default function Docs() {
  const base = `${appUrl()}/api/v1`;
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <Link href="/" aria-label="Monifyd home"><Logo /></Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="btn btn-sm" href="/dashboard/developers">Get an API key</Link><Link className="btn btn-sm" href="/dashboard/api-billing">API plans</Link></div>
      </div>
      <h1>API documentation</h1>
      <p style={{ margin: "12px 0 28px", color: "var(--muted)" }}>Create payment links from your server, then send customers to the hosted checkout. Payments are detected on-chain automatically and confirmed once they reach the required depth.</p>

      <h2>Authentication</h2>
      <p style={{ margin: "8px 0 12px" }}>Send your secret key as a bearer token. Keys start with <code>sk_live_</code>. Keep them on your server.</p>
      <Code>{`Authorization: Bearer sk_live_...`}</Code>

      <h2 style={{ marginTop: 32 }}>Create a payment link</h2>
      <p style={{ margin: "8px 0 12px" }}><code>POST {base}/payment-links</code>. Send an <code>Idempotency-Key</code> header so retries never create duplicates. API request limits use a separate API subscription from Dashboard plans. Customers currently pay the requested amount with no added transaction fee.</p>
      <Code>{`{
  "amount": 500,
  "currency": "USD",
  "description": "Website development",
  "accepted_payments": [
    { "asset": "USDC", "networks": ["base", "solana"] },
    { "asset": "BTC", "networks": ["bitcoin"] }
  ],
  "metadata": { "order_id": "ORDER-123" },
  "success_url": "https://example.com/success"
}

201 { "id": "plink_...", "status": "ACTIVE", "checkout_url": "${appUrl()}/pay/plink_..." }`}</Code>

      <h2 style={{ marginTop: 32 }}>Invoices</h2>
      <p style={{ margin: "8px 0 12px" }}>Create an invoice in draft state, then send it to the customer. Invoice amounts are in major currency units; checkout currently charges the requested amount without an added transaction fee.</p>
      <Code>{`POST ${base}/invoices
Idempotency-Key: invoice-order-123

{
  "amount": 125,
  "currency": "USD",
  "customer_email": "customer@example.com",
  "title": "Design work",
  "due_date": "2026-10-20",
  "accepted_payments": [{ "asset": "USDC", "networks": ["base"] }]
}

POST ${base}/invoices/:id/send
POST ${base}/invoices/:id/cancel
GET  ${base}/invoices
GET  ${base}/invoices/:id

GET  ${base}/payment-links        List your payment links
GET  ${base}/payments             List payments
GET  ${base}/payments/:id         Get one payment`}</Code>
      <p style={{ margin: "12px 0" }}>Invoices with due dates are emailed a reminder three days before the due date and on the due date. Configure Resend to send invoice emails; the regular cron job also processes reminders.</p>

      <h2 style={{ marginTop: 32 }}>Errors</h2>
      <p style={{ margin: "8px 0 12px" }}>Errors share one shape.</p>
      <Code>{`{ "error": { "code": "UNSUPPORTED_ASSET_NETWORK", "message": "USDT is not supported on base." } }`}</Code>

      <h2 id="webhooks" style={{ marginTop: 32 }}>Webhooks</h2>
      <p style={{ margin: "8px 0 12px" }}>Add an endpoint in <Link href="/dashboard/webhooks">Dashboard, Webhooks</Link>. Monifyd sends a POST with a JSON body. Reply with any 2xx status within 8 seconds. Anything else is retried after 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours and 24 hours, then marked failed. You can replay any event from the dashboard.</p>
      <Code>{`Events: payment.created, payment.detected, payment.confirming, payment.paid,
        payment.partial, payment.underpaid, payment.overpaid, payment.expired, payment.failed,
        invoice.created, invoice.sent, invoice.paid, invoice.underpaid, invoice.overpaid, invoice.cancelled

Headers:
  X-Monifyd-Event-Id     evt_...   (use it to ignore duplicates)
  X-Monifyd-Timestamp    unix seconds
  X-Monifyd-Signature    hex HMAC-SHA256 of "<timestamp>.<raw body>" with your signing secret

Body:
{ "id": "evt_...", "type": "payment.paid", "created": 1760000000,
  "data": { "id": "pay_...", "status": "PAID", "amount_cents": 50000, "reference": "ORDER-123", ... } }`}</Code>
      <p style={{ margin: "16px 0 12px" }}>Verify the signature against the raw request body before you trust an event. Mark an order as paid only on <code>payment.paid</code> or <code>invoice.paid</code>.</p>
      <Code>{`import crypto from "node:crypto";

export function verify(rawBody, headers, secret) {
  const ts = headers["x-monifyd-timestamp"];
  const sig = headers["x-monifyd-signature"] ?? "";
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // too old
  const expected = crypto.createHmac("sha256", secret).update(ts + "." + rawBody).digest("hex");
  return sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}`}</Code>

      <h2 style={{ marginTop: 32 }}>Wrong-amount payments</h2>
      <p style={{ margin: "8px 0 12px" }}>If a customer sends the wrong amount, the payment ends as <code>UNDERPAID</code> or <code>OVERPAID</code> once the transfer is confirmed. The payload carries <code>received_amount</code>, <code>shortfall</code> and <code>excess</code>. Do not fulfil an <code>payment.underpaid</code> order. Treat <code>payment.overpaid</code> as paid in full, and refund the extra yourself if you choose. The merchant can accept an underpayment or close it from the dashboard, and an accepted underpayment then sends <code>payment.paid</code>.</p>

      <h2 style={{ marginTop: 32 }}>Node.js integration</h2>
      <p style={{ margin: "8px 0 12px" }}>You can call the REST API directly from your server with Node.js. Save your API key and Monifyd URL as server-side environment variables; never expose the key in browser code. Get a key from <Link href="/dashboard/settings#developer-settings">Settings, Developer settings</Link>.</p>
      <Code>{`// .env.local (keep this file out of source control)
MONIFYD_API_KEY=sk_live_...
MONIFYD_BASE_URL=${appUrl()}

// Server-side Node.js code
const response = await fetch(\`${"${process.env.MONIFYD_BASE_URL}"}/api/v1/payment-links\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer ${"${process.env.MONIFYD_API_KEY}"}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": "order-123"
  },
  body: JSON.stringify({
    amount: 500,
    currency: "USD",
    accepted_payments: [{ asset: "USDC", networks: ["base"] }]
  })
});

const paymentLink = await response.json();
if (!response.ok) throw new Error(paymentLink.error?.message ?? "Request failed");
console.log(paymentLink.checkout_url);`}</Code>
      <p style={{ marginTop: 8, color: "var(--muted)" }}>The JavaScript SDK source is included in the Monifyd project repository, but the example above works without installing a separate package.</p>
    </main>
  );
}

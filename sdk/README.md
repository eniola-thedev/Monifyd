# Monifyd JavaScript SDK

Node.js client for the Monifyd REST API. Requires Node.js 18 or newer.

```sh
npm install @monifyd/sdk
```

```js
import { Monifyd } from "@monifyd/sdk";

const monifyd = new Monifyd({
  apiKey: process.env.MONIFYD_API_KEY,
  baseUrl: process.env.MONIFYD_BASE_URL,
});

const invoice = await monifyd.invoices.create({
  amount: 125,
  currency: "USD",
  customer_email: "customer@example.com",
  title: "Design work",
  due_date: "2026-10-20",
  accepted_payments: [{ asset: "USDC", networks: ["base"] }],
}, { idempotencyKey: "invoice-order-123" });

await monifyd.invoices.send(invoice.id);
console.log(invoice.checkout_url);
```

The API key is sent as a bearer token. Keep it server-side. Set `baseUrl` to the origin of your Monifyd deployment. The SDK uses the built-in Fetch API and accepts a Fetch-compatible implementation for testing.

Available methods:

- `paymentLinks.create(body, { idempotencyKey })`, `paymentLinks.list()`
- `payments.list()`, `payments.get(id)`
- `invoices.create(body, { idempotencyKey })`, `invoices.list({ limit, offset })`, `invoices.get(id)`, `invoices.send(id)`, `invoices.cancel(id)`

Non-2xx responses throw `MonifydError`, which includes `code` and `status`.

This directory is a standalone npm package. Publish it from this directory with your npm credentials and release process.

import assert from "node:assert/strict";
import test from "node:test";
import { Monifyd, MonifydError } from "../index.js";

test("invoice operations authenticate and send idempotency keys", async () => {
  const calls = [];
  const client = new Monifyd({
    apiKey: "sk_live_example",
    baseUrl: "https://merchant.example/",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ id: "inv_123" }, { status: 201 });
    },
  });

  const result = await client.invoices.create({ title: "Order" }, { idempotencyKey: "order-123" });
  assert.equal(result.id, "inv_123");
  assert.equal(calls[0].url, "https://merchant.example/api/v1/invoices");
  assert.equal(calls[0].init.headers.authorization, "Bearer sk_live_example");
  assert.equal(calls[0].init.headers["idempotency-key"], "order-123");
  assert.equal(calls[0].init.body, JSON.stringify({ title: "Order" }));
});

test("API errors preserve the server code and status", async () => {
  const client = new Monifyd({
    apiKey: "sk_live_example",
    baseUrl: "https://merchant.example",
    fetch: async () => Response.json({ error: { code: "INVOICE_NOT_FOUND", message: "Missing" } }, { status: 404 }),
  });
  await assert.rejects(client.invoices.get("inv_missing"), (error) => {
    assert.ok(error instanceof MonifydError);
    assert.equal(error.code, "INVOICE_NOT_FOUND");
    assert.equal(error.status, 404);
    return true;
  });
});

test("invoice list query and paths encode identifiers", async () => {
  const urls = [];
  const client = new Monifyd({
    apiKey: "sk_live_example",
    baseUrl: "https://merchant.example",
    fetch: async (url) => { urls.push(url); return Response.json({ data: [] }); },
  });
  await client.invoices.list({ limit: 10, offset: 20 });
  await client.invoices.send("inv/a");
  assert.equal(urls[0], "https://merchant.example/api/v1/invoices?limit=10&offset=20");
  assert.equal(urls[1], "https://merchant.example/api/v1/invoices/inv%2Fa/send");
});

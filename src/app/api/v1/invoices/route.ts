import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/api/auth";
import { apiAuthError, apiError } from "@/lib/api/errors";
import { publicId } from "@/lib/security/ids";
import { emitEvent } from "@/lib/webhooks/emit";
import { invoiceData } from "@/lib/webhooks/payload";
import { appUrl } from "@/lib/format";

const InvoiceBody = z.object({
  amount: z.number().positive().max(1_000_000),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  customer_email: z.string().email().max(320),
  customer_name: z.string().max(200).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accepted_payments: z.array(z.object({
    asset: z.string().min(2).max(10),
    networks: z.array(z.string().min(1)).min(1),
  })).min(1),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
  metadata: z.record(z.string(), z.string().max(500)).optional(),
});

export async function POST(req: Request) {
  const ctx = await authenticate(req);
  const authError = apiAuthError(ctx);
  if (authError) return authError;
  if (!ctx) return apiError("INVALID_API_KEY", "Missing or invalid API key.", 401);

  const raw = await req.text();
  let json: unknown;
  try { json = JSON.parse(raw); }
  catch { return apiError("VALIDATION_ERROR", "Request body must be valid JSON.", 400); }
  const parsed = InvoiceBody.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "), 400);
  }
  const body = parsed.data;
  if (body.due_date) {
    const date = new Date(`${body.due_date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== body.due_date) {
      return apiError("VALIDATION_ERROR", "due_date must be a valid calendar date in YYYY-MM-DD format.", 400);
    }
  }
  const db = adminClient();
  const idemKey = req.headers.get("idempotency-key")?.trim() || null;
  if (idemKey && (idemKey.length > 200 || /[\r\n]/.test(idemKey))) {
    return apiError("VALIDATION_ERROR", "Idempotency-Key must be at most 200 characters and contain no line breaks.", 400);
  }
  const requestHash = createHash("sha256").update(raw).digest("hex");

  const { data: pairs, error: pairError } = await db.from("asset_networks").select("asset,network").eq("enabled", true);
  if (pairError) return apiError("INTERNAL_ERROR", "Could not check supported assets.", 500);
  const allowed = new Set((pairs ?? []).map((pair: any) => `${pair.asset}:${pair.network}`));
  const assets = body.accepted_payments.map((item) => ({
    asset: item.asset.toUpperCase(),
    networks: [...new Set(item.networks.map((network) => network.toLowerCase()))],
  }));
  const networksUsed = new Set<string>();
  for (const item of assets) {
    for (const network of item.networks) {
      if (!allowed.has(`${item.asset}:${network}`)) {
        return apiError("UNSUPPORTED_ASSET_NETWORK", `${item.asset} is not supported on ${network}.`, 400);
      }
      networksUsed.add(network);
    }
  }
  const { data: wallets, error: walletError } = await db.from("wallets").select("network")
    .eq("merchant_id", ctx.merchantId).in("network", [...networksUsed]);
  if (walletError) return apiError("INTERNAL_ERROR", "Could not check merchant wallets.", 500);
  const have = new Set((wallets ?? []).map((wallet: any) => wallet.network));
  const missing = [...networksUsed].filter((network) => !have.has(network));
  if (missing.length) return apiError("INVALID_WALLET_ADDRESS", `Add a receiving wallet for: ${missing.join(", ")}.`, 400);

  const id = publicId("inv");
  const invoiceInput = {
    id,
    amount_cents: Math.round(body.amount * 100),
    currency: body.currency,
    customer_email: body.customer_email,
    customer_name: body.customer_name ?? null,
    title: body.title,
    description: body.description ?? null,
    notes: body.notes ?? null,
    due_date: body.due_date ?? null,
    accepted_payments: assets,
    success_url: body.success_url ?? null,
    cancel_url: body.cancel_url ?? null,
    metadata: body.metadata ?? {},
  };
  if (idemKey) {
    const { data, error } = await db.rpc("create_invoice_idempotent", {
      p_merchant_id: ctx.merchantId, p_mode: ctx.mode === "live", p_key: idemKey,
      p_hash: requestHash, p_invoice: invoiceInput, p_app_url: appUrl(),
    });
    if (error) return apiError("INTERNAL_ERROR", "Could not safely create the invoice.", 500);
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) return apiError("INTERNAL_ERROR", "Invoice creation returned no result.", 500);
    if (result.result === "CONFLICT") return apiError("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used with a different request.", 422);
    if (result.result === "PENDING") return NextResponse.json(
      { error: { code: "IDEMPOTENCY_CONFLICT", message: "A request with this Idempotency-Key is still being processed." } },
      { status: 409, headers: { "retry-after": "2" } },
    );
    if (result.result === "CREATED") await emitEvent(ctx.merchantId, "invoice.created", invoiceData(result.response));
    return NextResponse.json(result.response, { status: result.status ?? 201 });
  }

  const { data: invoice, error } = await db.from("invoices").insert({
    ...invoiceInput, merchant_id: ctx.merchantId, livemode: ctx.mode === "live",
  }).select("*").single();
  if (error || !invoice) return apiError("INTERNAL_ERROR", "Could not create the invoice.", 500);

  const response = { ...invoice, checkout_url: `${appUrl()}/pay/${id}` };
  await emitEvent(ctx.merchantId, "invoice.created", invoiceData(invoice));
  return NextResponse.json(response, { status: 201 });
}

export async function GET(req: Request) {
  const ctx = await authenticate(req);
  const authError = apiAuthError(ctx);
  if (authError) return authError;
  if (!ctx) return apiError("INVALID_API_KEY", "Missing or invalid API key.", 401);
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.min(100_000, Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0));
  const { data, error } = await adminClient().from("invoices")
    .select("id,invoice_number,customer_email,customer_name,title,amount_cents,currency,status,due_date,created_at,updated_at,paid_at")
    .eq("merchant_id", ctx.merchantId).eq("livemode", ctx.mode === "live")
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) return apiError("INTERNAL_ERROR", "Could not load invoices.", 500);
  return NextResponse.json({ data });
}

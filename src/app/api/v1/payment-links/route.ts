import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { authenticate } from "@/lib/api/auth";
import { apiAuthError, apiError } from "@/lib/api/errors";
import { publicId } from "@/lib/security/ids";
import { appUrl } from "@/lib/format";

const Body = z.object({
  amount: z.number().positive().max(1_000_000),
  currency: z.string().length(3).transform((c) => c.toUpperCase()),
  description: z.string().max(500).optional(),
  reference: z.string().max(120).optional(),
  accepted_payments: z
    .array(z.object({ asset: z.string().min(2).max(10), networks: z.array(z.string()).min(1) }))
    .min(1),
  expires_at: z.string().datetime().optional(),
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
  try { json = JSON.parse(raw); } catch { return apiError("VALIDATION_ERROR", "Request body must be valid JSON.", 400); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
  }
  const body = parsed.data;
  const db = adminClient();

  // Idempotency: same key + same body returns the stored response; same key + different body is a conflict.
  const idemKey = req.headers.get("idempotency-key")?.trim() || null;
  if (idemKey && (idemKey.length > 200 || /[\r\n]/.test(idemKey))) {
    return apiError("VALIDATION_ERROR", "Idempotency-Key must be at most 200 characters and contain no line breaks.", 400);
  }
  const requestHash = createHash("sha256").update(raw).digest("hex");

  // Every asset/network pair must exist, and the merchant needs a wallet on every network used.
  const { data: pairs } = await db.from("asset_networks").select("asset, network").eq("enabled", true);
  const allowed = new Set((pairs ?? []).map((p) => `${p.asset}:${p.network}`));
  const networksUsed = new Set<string>();
  for (const item of body.accepted_payments) {
    const asset = item.asset.toUpperCase();
    for (const network of item.networks.map((n) => n.toLowerCase())) {
      if (!allowed.has(`${asset}:${network}`)) {
        return apiError("UNSUPPORTED_ASSET_NETWORK", `${asset} is not supported on ${network}.`, 400);
      }
      networksUsed.add(network);
    }
  }
  const { data: wallets } = await db.from("wallets").select("network").eq("merchant_id", ctx.merchantId).in("network", [...networksUsed]);
  const have = new Set((wallets ?? []).map((w) => w.network));
  const missing = [...networksUsed].filter((n) => !have.has(n));
  if (missing.length) {
    return apiError("INVALID_WALLET_ADDRESS", `Add a receiving wallet for: ${missing.join(", ")}.`, 400);
  }

  const id = publicId("plink");
  const linkInput = {
    id,
    amount_cents: Math.round(body.amount * 100),
    currency: body.currency,
    description: body.description ?? null,
    reference: body.reference ?? null,
    accepted_payments: body.accepted_payments.map((a) => ({
      asset: a.asset.toUpperCase(),
      networks: a.networks.map((n) => n.toLowerCase()),
    })),
    expires_at: body.expires_at ?? null,
    success_url: body.success_url ?? null,
    cancel_url: body.cancel_url ?? null,
    metadata: body.metadata ?? {},
  };

  if (idemKey) {
    const { data, error } = await db.rpc("create_payment_link_idempotent", {
      p_merchant_id: ctx.merchantId, p_mode: ctx.mode === "live", p_key: idemKey,
      p_hash: requestHash, p_link: linkInput, p_app_url: appUrl(),
    });
    if (error) return apiError("INTERNAL_ERROR", "Could not safely create the payment link.", 500);
    const result = Array.isArray(data) ? data[0] : data;
    if (!result) return apiError("INTERNAL_ERROR", "Payment link creation returned no result.", 500);
    if (result.result === "CONFLICT") return apiError("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was already used with a different request.", 422);
    if (result.result === "PENDING") return NextResponse.json(
      { error: { code: "IDEMPOTENCY_CONFLICT", message: "A request with this Idempotency-Key is still being processed." } },
      { status: 409, headers: { "retry-after": "2" } },
    );
    return NextResponse.json(result.response, { status: result.status ?? 201 });
  }

  const { error } = await db.from("payment_links").insert({
    ...linkInput, merchant_id: ctx.merchantId, livemode: ctx.mode === "live",
  });
  if (error) return apiError("INTERNAL_ERROR", "Could not create the payment link.", 500);
  const response = { id, status: "ACTIVE", checkout_url: `${appUrl()}/pay/${id}` };
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
  const { data, error } = await adminClient()
    .from("payment_links")
    .select("id, status, amount_cents, currency, description, reference, created_at")
    .eq("merchant_id", ctx.merchantId).eq("livemode", ctx.mode === "live")
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) return apiError("INTERNAL_ERROR", "Could not load payment links.", 500);
  return NextResponse.json({ data });
}

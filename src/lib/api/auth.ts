import { adminClient } from "@/lib/supabase/admin";
import { hashApiKey, parseKeyMode, type KeyMode } from "@/lib/security/api-keys";
import { activeApiPlan, activePlan, apiEntitlements } from "@/lib/billing/plans";

export type ApiContext = { merchantId: string; mode: KeyMode; keyId: string; rateLimited?: boolean; retryAfter?: number };

export async function authenticate(req: Request): Promise<ApiContext | null> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const mode = parseKeyMode(key);
  if (!mode) return null;

  const { data } = await adminClient()
    .from("api_keys")
    .select("id, merchant_id, mode")
    .eq("key_hash", hashApiKey(key))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data || data.mode !== mode) return null;
  const { data: profile, error } = await adminClient().from("profiles").select("suspended_at").eq("id", data.merchant_id).maybeSingle();
  if (error) throw new Error(`Could not verify merchant account status: ${error.message}`);
  if (!profile || profile.suspended_at) return null;
  const { data: deletion, error: deletionError } = await adminClient().from("account_deletions")
    .select("user_id").eq("user_id", data.merchant_id).maybeSingle();
  if (deletionError) throw new Error(`Could not verify merchant account status: ${deletionError.message}`);
  if (deletion) return null;

  const db = adminClient();
  const [{ data: apiSubscription, error: apiSubscriptionError }, { data: dashboardSubscription, error: dashboardSubscriptionError }] = await Promise.all([
    db.from("api_subscriptions").select("plan,status,current_period_end").eq("merchant_id", data.merchant_id).maybeSingle(),
    db.from("merchant_subscriptions").select("plan,status,current_period_end,legacy_api_access").eq("merchant_id", data.merchant_id).maybeSingle(),
  ]);
  if (apiSubscriptionError || dashboardSubscriptionError) {
    throw new Error(`Could not load API plan entitlements: ${apiSubscriptionError?.message ?? dashboardSubscriptionError?.message}`);
  }
  const dedicatedApiPlan = activeApiPlan(apiSubscription);
  const legacyApiPlan = dashboardSubscription?.legacy_api_access
    ? activePlan(dashboardSubscription)
    : "FREE";
  const apiPlan = dedicatedApiPlan !== "FREE"
    ? dedicatedApiPlan
    : legacyApiPlan === "PRO" ? "GROWTH" : legacyApiPlan === "BUSINESS" ? "SCALE" : "FREE";
  const limits = apiEntitlements(apiPlan);
  const limit = req.method === "GET" ? limits.readsPerMinute : limits.writesPerMinute;
  const bucket = req.method === "GET" ? "read" : "write";
  const { data: limitResult, error: limitError } = await adminClient()
    .rpc("consume_api_rate_limit", { p_api_key_id: data.id, p_bucket: bucket, p_limit: limit });
  if (limitError) throw new Error(`Could not enforce API rate limit: ${limitError.message}`);
  const limitState = Array.isArray(limitResult) ? limitResult[0] : limitResult;
  if (!limitState?.allowed) {
    return { merchantId: data.merchant_id, mode, keyId: data.id, rateLimited: true, retryAfter: Number(limitState?.retry_after ?? 60) };
  }

  const { error: usageError } = await adminClient().from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  if (usageError) throw new Error(`Could not update API key usage: ${usageError.message}`);
  return { merchantId: data.merchant_id, mode, keyId: data.id };
}

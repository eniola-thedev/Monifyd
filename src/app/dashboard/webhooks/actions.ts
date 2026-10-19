"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/session";
import { activeApiPlan, activePlan, apiEntitlements } from "@/lib/billing/plans";
import { adminClient } from "@/lib/supabase/admin";
import { EVENT_TYPES, validateWebhookUrl } from "@/lib/webhooks/rules";
import { attemptDelivery } from "@/lib/webhooks/deliver";
import { emitEvent } from "@/lib/webhooks/emit";
import { encryptWebhookSecret } from "@/lib/security/webhook-secrets";

const PATH = "/dashboard/webhooks";
const MAX_ENDPOINTS = 25;

export type EndpointState = { secret?: string; error?: string };

/** The signing secret is returned once. Store it on your server to verify events. */
export async function createEndpoint(_prev: EndpointState, fd: FormData): Promise<EndpointState> {
  const { user, authUser, supabase } = await requireEditor();
  const url = String(fd.get("url") ?? "").trim();
  const problem = validateWebhookUrl(url);
  if (problem) return { error: problem };
  const events = fd.getAll("event").map(String).filter((e) => (EVENT_TYPES as readonly string[]).includes(e));
  if (events.length === 0) return { error: "Choose at least one event to receive." };
  const [{ count }, { data: apiSubscription, error: apiSubscriptionError }, { data: dashboardSubscription, error: dashboardSubscriptionError }] = await Promise.all([
    supabase.from("webhook_endpoints").select("id", { count: "exact", head: true }).eq("merchant_id", user.id),
    supabase.from("api_subscriptions").select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle(),
    supabase.from("merchant_subscriptions").select("plan,status,current_period_end,legacy_api_access").eq("merchant_id", user.id).maybeSingle(),
  ]);
  if (apiSubscriptionError || dashboardSubscriptionError) throw new Error(`Could not load API plan entitlements: ${apiSubscriptionError?.message ?? dashboardSubscriptionError?.message}`);
  const directApiPlan = activeApiPlan(apiSubscription);
  const legacyDashboardPlan = dashboardSubscription?.legacy_api_access ? activePlan(dashboardSubscription) : "FREE";
  const apiPlan = directApiPlan !== "FREE" ? directApiPlan : legacyDashboardPlan === "PRO" ? "GROWTH" : legacyDashboardPlan === "BUSINESS" ? "SCALE" : "FREE";
  const maxEndpoints = Math.min(MAX_ENDPOINTS, apiEntitlements(apiPlan).webhookEndpoints);
  if ((count ?? 0) >= maxEndpoints) return { error: `Your API plan allows up to ${maxEndpoints} endpoints. Upgrade for more.` };
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  let storedSecret: string;
  try { storedSecret = encryptWebhookSecret(secret); }
  catch { return { error: "Webhook signing secrets are not configured securely. Contact the Monifyd administrator." }; }
  const { error } = await supabase.from("webhook_endpoints").insert({ merchant_id: user.id, url, secret: storedSecret, events });
  if (error) return { error: "Could not save the endpoint. Try again." };
  await supabase.from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "webhook.created", target: url });
  revalidatePath(PATH);
  return { secret };
}

export async function toggleEndpoint(fd: FormData) {
  const { user, supabase } = await requireEditor();
  await supabase.from("webhook_endpoints").update({ enabled: fd.get("enable") === "1" }).eq("id", String(fd.get("id"))).eq("merchant_id", user.id);
  revalidatePath(PATH);
}

export async function deleteEndpoint(fd: FormData) {
  const { user, authUser, supabase } = await requireEditor();
  const id = String(fd.get("id"));
  await supabase.from("webhook_endpoints").delete().eq("id", id).eq("merchant_id", user.id);
  await supabase.from("audit_logs").insert({ merchant_id: user.id, actor: authUser.id, action: "webhook.deleted", target: id });
  revalidatePath(PATH);
}

export async function sendTestEvent(fd: FormData) {
  const { user, supabase } = await requireEditor();
  const id = String(fd.get("id"));
  const { data: ep } = await supabase.from("webhook_endpoints").select("id").eq("id", id).eq("merchant_id", user.id).maybeSingle();
  if (ep) await emitEvent(user.id, "webhook.test", { message: "This is a test event from Monifyd." }, ep.id);
  revalidatePath(PATH);
}

/** Resets a delivery and sends it again now. */
export async function replayDelivery(fd: FormData) {
  const { user, supabase } = await requireEditor();
  const [{ data: apiSubscription, error: apiError }, { data: dashboardSubscription, error: dashboardError }] = await Promise.all([
    supabase.from("api_subscriptions").select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle(),
    supabase.from("merchant_subscriptions").select("plan,status,current_period_end,legacy_api_access").eq("merchant_id", user.id).maybeSingle(),
  ]);
  if (apiError || dashboardError) throw new Error(`Could not load API plan: ${apiError?.message ?? dashboardError?.message}`);
  const direct = activeApiPlan(apiSubscription);
  const legacy = dashboardSubscription?.legacy_api_access ? activePlan(dashboardSubscription) : "FREE";
  const apiPlan = direct !== "FREE" ? direct : legacy === "PRO" ? "GROWTH" : legacy === "BUSINESS" ? "SCALE" : "FREE";
  if (apiPlan === "FREE") return;
  const id = String(fd.get("id"));
  const { data: d } = await supabase.from("webhook_deliveries").select("id").eq("id", id).maybeSingle(); // row-level security limits this to your own deliveries
  if (d) {
    await adminClient().from("webhook_deliveries").update({ status: "PENDING", attempt: 0, error: null, next_attempt_at: new Date().toISOString() }).eq("id", id);
    await attemptDelivery(id);
  }
  revalidatePath(PATH);
}

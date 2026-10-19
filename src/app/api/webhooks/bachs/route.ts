import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { recordOperationalEvent } from "@/lib/operations/events";
import { isBachsSignatureValid } from "@/lib/billing/bachs";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function iso(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function periodEnd(data: Record<string, any>, interval: string) {
  const direct = iso(data.current_period_end ?? data.next_billed_at);
  if (direct) return direct;
  const end = new Date();
  if (interval === "annually") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end.toISOString();
}

async function findAttempt(db: ReturnType<typeof adminClient>, data: Record<string, any>) {
  const metadata = record(data.metadata);
  const reference = typeof metadata.reference === "string" ? metadata.reference : "";
  const checkoutId = typeof metadata.checkout_id === "string" ? metadata.checkout_id :
    typeof data.checkout_id === "string" ? data.checkout_id : "";
  if (reference) {
    const [{ data: dashboard, error: dashboardError }, { data: api, error: apiError }] = await Promise.all([
      db.from("billing_checkout_attempts").select("*").eq("reference", reference).eq("billing_provider", "BACHS").maybeSingle(),
      db.from("api_billing_checkout_attempts").select("*").eq("reference", reference).eq("billing_provider", "BACHS").maybeSingle(),
    ]);
    if (dashboardError || apiError) throw new Error(`Could not map BACHS checkout reference: ${dashboardError?.message ?? apiError?.message}`);
    if (dashboard || api) return { attempt: dashboard ?? api, table: dashboard ? "merchant_subscriptions" : "api_subscriptions", attemptsTable: dashboard ? "billing_checkout_attempts" : "api_billing_checkout_attempts" };
  }
  if (checkoutId) {
    const [{ data: dashboard, error: dashboardError }, { data: api, error: apiError }] = await Promise.all([
      db.from("billing_checkout_attempts").select("*").eq("provider_checkout_id", checkoutId).maybeSingle(),
      db.from("api_billing_checkout_attempts").select("*").eq("provider_checkout_id", checkoutId).maybeSingle(),
    ]);
    if (dashboardError || apiError) throw new Error(`Could not map BACHS checkout ID: ${dashboardError?.message ?? apiError?.message}`);
    if (dashboard || api) return { attempt: dashboard ?? api, table: dashboard ? "merchant_subscriptions" : "api_subscriptions", attemptsTable: dashboard ? "billing_checkout_attempts" : "api_billing_checkout_attempts" };
  }
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  const rawBody = await req.text();
  if (!secret || !isBachsSignatureValid(rawBody, req.headers, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let event: Record<string, any>;
  try { event = record(JSON.parse(rawBody)); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof event.id !== "string" || typeof event.type !== "string") return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  const db = adminClient();
  const { error: claimError } = await db.from("bachs_processed_events").insert({ event_id: event.id });
  if (claimError?.code === "23505") return NextResponse.json({ received: true });
  if (claimError) return NextResponse.json({ error: "Could not claim event" }, { status: 500 });

  const data = record(event.data);
  let failed = false;
  try {
    const subscriptionId = typeof data.id === "string" && data.id.startsWith("sub_") ? data.id :
      typeof data.subscription_id === "string" ? data.subscription_id : "";

    if (event.type === "customer.subscription.created") {
      const mapped = await findAttempt(db, data);
      if (!mapped) throw new Error(`Could not map BACHS subscription ${subscriptionId || "(missing ID)"} to a checkout.`);
      const { attempt, table, attemptsTable } = mapped;
      const currency = typeof data.currency === "string" ? data.currency : "";
      const amountMinor = typeof data.amount === "string" || typeof data.amount === "number" ? Math.round(Number(data.amount) * 100) : null;
      if (currency !== attempt.billing_currency || amountMinor !== Number(attempt.amount_minor)) {
        throw new Error(`BACHS subscription ${subscriptionId} did not match checkout currency or amount.`);
      }
      if (!subscriptionId) throw new Error("BACHS subscription event did not include its subscription ID.");
      const customerId = typeof record(data.customer).customer_id === "string" ? record(data.customer).customer_id :
        typeof data.customer_id === "string" ? data.customer_id : null;
      const interval = attempt.billing_interval;
      const { error } = await db.from(table).upsert({
        merchant_id: attempt.merchant_id, plan: attempt.plan, status: "ACTIVE", billing_interval: interval,
        billing_country: attempt.billing_country, billing_currency: attempt.billing_currency,
        current_period_end: periodEnd(data, interval), cancel_at_period_end: false, billing_provider: "BACHS",
        bachs_subscription_id: subscriptionId, bachs_customer_id: customerId,
        bachs_event_created_at: iso(event.created_at),
        updated_at: new Date().toISOString(),
      }, { onConflict: "merchant_id" });
      if (error) throw new Error(`Could not activate BACHS subscription: ${error.message}`);
      const { error: attemptError } = await db.from(attemptsTable).update({ status: "SUCCEEDED", completed_at: new Date().toISOString() }).eq("reference", attempt.reference);
      if (attemptError) throw new Error(`Could not record successful BACHS checkout: ${attemptError.message}`);
    } else if (["customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"].includes(event.type)) {
      const id = subscriptionId || (typeof record(data.subscription).id === "string" ? record(data.subscription).id : "");
      if (!id) return NextResponse.json({ received: true });
      const [{ data: dashboard, error: dashboardError }, { data: api, error: apiError }] = await Promise.all([
        db.from("merchant_subscriptions").select("merchant_id,billing_interval,bachs_event_created_at").eq("bachs_subscription_id", id).maybeSingle(),
        db.from("api_subscriptions").select("merchant_id,billing_interval,bachs_event_created_at").eq("bachs_subscription_id", id).maybeSingle(),
      ]);
      if (dashboardError || apiError) throw new Error(`Could not locate BACHS subscription: ${dashboardError?.message ?? apiError?.message}`);
      const row = dashboard ?? api;
      const table = dashboard ? "merchant_subscriptions" : "api_subscriptions";
      if (row) {
        const eventCreatedAt = iso(event.created_at);
        if (eventCreatedAt && row.bachs_event_created_at && Date.parse(eventCreatedAt) <= Date.parse(row.bachs_event_created_at)) {
          return NextResponse.json({ received: true });
        }
        const status = event.type === "invoice.payment_failed" ? "PAST_DUE" :
          event.type === "customer.subscription.deleted" ? "CANCELLED" :
          ["past_due", "unpaid"].includes(data.status) ? "PAST_DUE" : data.status === "canceled" ? "CANCELLED" : "ACTIVE";
        const update: Record<string, unknown> = { status, updated_at: new Date().toISOString(), ...(eventCreatedAt ? { bachs_event_created_at: eventCreatedAt } : {}) };
        if (typeof data.cancel_at_period_end === "boolean") update.cancel_at_period_end = data.cancel_at_period_end;
        const end = iso(data.current_period_end ?? data.next_billed_at) ?? iso(record(data.subscription).current_period_end);
        if (end) update.current_period_end = end;
        const { error } = await db.from(table).update(update).eq("merchant_id", row.merchant_id);
        if (error) throw new Error(`Could not sync BACHS subscription state: ${error.message}`);
      }
    }
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : "BACHS webhook processing failed.";
    await recordOperationalEvent({
      source: "bachs_billing", severity: "error", message,
      details: { event: event.type, event_id: event.id },
      fingerprint: `bachs_billing:${event.type}:${event.id}`,
    });
  }
  if (failed) {
    await db.from("bachs_processed_events").delete().eq("event_id", event.id);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

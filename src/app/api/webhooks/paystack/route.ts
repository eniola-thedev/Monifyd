import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { recordOperationalEvent } from "@/lib/operations/events";
import { validPaystackSignature } from "@/lib/billing/paystack";

export const dynamic = "force-dynamic";
const obj = (v: unknown): Record<string, any> => v && typeof v === "object" ? v as Record<string, any> : {};
const endOfPeriod = (interval: string) => { const d = new Date(); interval === "annually" ? d.setUTCFullYear(d.getUTCFullYear() + 1) : d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString(); };

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validPaystackSignature(raw, req.headers.get("x-paystack-signature"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let event: Record<string, any>;
  try { event = obj(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof event.event !== "string" || !event.data) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const db = adminClient();
  const eventId = String(obj(event.data).id ?? `${event.event}:${obj(event.data).subscription_code ?? obj(event.data).reference ?? "unknown"}`);
  const { error: claimError } = await db.from("paystack_processed_events").insert({ event_id: eventId });
  if (claimError?.code === "23505") return NextResponse.json({ received: true });
  if (claimError) return NextResponse.json({ error: "Could not claim event" }, { status: 500 });
  const data = obj(event.data);
  try {
    if (event.event === "subscription.create") {
      const customer = obj(data.customer), plan = obj(data.plan);
      const email = String(customer.email ?? "").toLowerCase();
      const planCode = String(plan.plan_code ?? data.plan_code ?? "");
      const [{ data: dash, error: dashErr }, { data: api, error: apiErr }] = await Promise.all([
        db.from("billing_checkout_attempts").select("*").eq("customer_email", email).eq("paystack_plan_code", planCode).eq("billing_provider", "PAYSTACK").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("api_billing_checkout_attempts").select("*").eq("customer_email", email).eq("paystack_plan_code", planCode).eq("billing_provider", "PAYSTACK").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (dashErr || apiErr) throw new Error(`Could not map Paystack subscription: ${dashErr?.message ?? apiErr?.message}`);
      const attempt = dash ?? api;
      const code = String(data.subscription_code ?? "");
      if (attempt && code) {
        const product = dash ? "dashboard" : "api";
        const table = dash ? "merchant_subscriptions" : "api_subscriptions";
        const { error } = await db.from(table).update({ paystack_subscription_code: code, paystack_customer_code: customer.customer_code ?? null, updated_at: new Date().toISOString() }).eq("merchant_id", attempt.merchant_id);
        if (error) throw new Error(`Could not save Paystack subscription ID: ${error.message}`);
        if (typeof data.email_token === "string") {
          const { error: tokenError } = await db.from("paystack_subscription_tokens").upsert({ merchant_id: attempt.merchant_id, product, email_token: data.email_token, updated_at: new Date().toISOString() }, { onConflict: "merchant_id,product" });
          if (tokenError) throw new Error(`Could not save Paystack cancellation token: ${tokenError.message}`);
        }
      }
    } else if (event.event === "charge.success") {
      if (data.status !== "success" || data.currency !== "NGN") throw new Error("Paystack payment was not a successful NGN charge.");
      const reference = typeof data.reference === "string" ? data.reference : "";
      const [{ data: dash, error: dashErr }, { data: api, error: apiErr }] = await Promise.all([
        db.from("billing_checkout_attempts").select("*").eq("reference", reference).eq("billing_provider", "PAYSTACK").maybeSingle(),
        db.from("api_billing_checkout_attempts").select("*").eq("reference", reference).eq("billing_provider", "PAYSTACK").maybeSingle(),
      ]);
      if (dashErr || apiErr) throw new Error(`Could not map Paystack checkout: ${dashErr?.message ?? apiErr?.message}`);
      const attempt = dash ?? api;
      if (!attempt) {
        const code = String(data.subscription_code ?? obj(data.subscription).subscription_code ?? "");
        if (code) for (const table of ["merchant_subscriptions", "api_subscriptions"] as const) {
          const { data: current, error } = await db.from(table).select("merchant_id,billing_interval").eq("paystack_subscription_code", code).maybeSingle();
          if (error) throw new Error(`Could not find Paystack subscription renewal: ${error.message}`);
          if (current) {
            const { error: updateError } = await db.from(table).update({ status: "ACTIVE", current_period_end: endOfPeriod(current.billing_interval), updated_at: new Date().toISOString() }).eq("merchant_id", current.merchant_id);
            if (updateError) throw new Error(`Could not apply Paystack renewal: ${updateError.message}`);
          }
        }
        return NextResponse.json({ received: true });
      }
      if (Number(data.amount) !== Number(attempt.amount_minor)) throw new Error("Paystack payment did not match the expected amount.");
      const customer = obj(data.customer), auth = obj(data.authorization);
      const sub = obj(data.subscription);
      const subscriptionCode = String(data.subscription_code ?? sub.subscription_code ?? "");
      const table = dash ? "merchant_subscriptions" : "api_subscriptions";
      const product = dash ? "dashboard" : "api";
      const update: Record<string, unknown> = {
        merchant_id: attempt.merchant_id, plan: attempt.plan, status: "ACTIVE", billing_interval: attempt.billing_interval,
        billing_country: attempt.billing_country, billing_currency: "NGN", current_period_end: endOfPeriod(attempt.billing_interval),
        cancel_at_period_end: false, billing_provider: "PAYSTACK", paystack_subscription_code: subscriptionCode || null,
        paystack_customer_code: customer.customer_code ?? null, updated_at: new Date().toISOString(),
      };
      const { error } = await db.from(table).upsert(update, { onConflict: "merchant_id" });
      if (error) throw new Error(`Could not activate Paystack subscription: ${error.message}`);
      if (auth.email_token && subscriptionCode) {
        const { error: tokenError } = await db.from("paystack_subscription_tokens").upsert({ merchant_id: attempt.merchant_id, product, email_token: auth.email_token, updated_at: new Date().toISOString() }, { onConflict: "merchant_id,product" });
        if (tokenError) throw new Error(`Could not save Paystack cancellation token: ${tokenError.message}`);
      }
      const { error: attemptError } = await db.from(dash ? "billing_checkout_attempts" : "api_billing_checkout_attempts").update({ status: "SUCCEEDED", completed_at: new Date().toISOString() }).eq("reference", reference);
      if (attemptError) throw new Error(`Could not record Paystack checkout: ${attemptError.message}`);
    } else if (["invoice.payment_failed", "subscription.disable"].includes(event.event)) {
      const code = String(data.subscription_code ?? obj(data.subscription).subscription_code ?? "");
      if (code) {
        for (const table of ["merchant_subscriptions", "api_subscriptions"] as const) {
          const update = event.event === "invoice.payment_failed"
            ? { status: "PAST_DUE", updated_at: new Date().toISOString() }
            : { cancel_at_period_end: true, updated_at: new Date().toISOString() };
          const { error } = await db.from(table).update(update).eq("paystack_subscription_code", code);
          if (error) throw new Error(`Could not update Paystack subscription: ${error.message}`);
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Paystack webhook processing failed.";
    await recordOperationalEvent({ source: "paystack_billing", severity: "error", message, details: { event: event.event, event_id: eventId }, fingerprint: `paystack_billing:${eventId}` });
    await db.from("paystack_processed_events").delete().eq("event_id", eventId);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { adminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/format";
import { planPrice, type BillingInterval, type PaidPlan } from "@/lib/billing/plans";
import { bachsDelete, bachsPost, bachsProductEnvName } from "@/lib/billing/bachs";
import { fail, done } from "@/lib/flash";
import { availableBillingIntervals, billingLocation } from "@/lib/billing/location";

export async function startSubscription(fd: FormData) {
  const { user, authUser, supabase } = await requireOwner();
  const plan = String(fd.get("plan") ?? "");
  const interval = String(fd.get("interval") ?? "");
  if (plan !== "PRO" && plan !== "BUSINESS") fail("/dashboard/billing", "Choose a valid plan.");
  if (interval !== "monthly" && interval !== "annually") fail("/dashboard/billing", "Choose a valid billing period.");
  const { country, currency } = await billingLocation();
  if (currency === "NGN" && process.env.BACHS_NGN_SUBSCRIPTIONS_ENABLED !== "true") {
    fail("/dashboard/billing", "BACHS NGN subscriptions are not enabled for this account yet. Contact BACHS before offering NGN billing.");
  }
  if (!availableBillingIntervals(currency).some((available) => available === interval)) {
    fail("/dashboard/billing", "Choose a valid billing period.");
  }
  if (!authUser.email) fail("/dashboard/billing", "Your account needs an email address for subscription billing.");
  const { data: current, error: currentError } = await supabase.from("merchant_subscriptions")
    .select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle();
  if (currentError) throw new Error(`Could not check current subscription: ${currentError.message}`);
  const subscriptionUnexpired = current?.plan !== "FREE"
    && ["ACTIVE", "PAST_DUE"].includes(current?.status ?? "")
    && (!current?.current_period_end || new Date(current.current_period_end).getTime() > Date.now());
  if (subscriptionUnexpired) fail("/dashboard/billing", "Your current subscription has not ended. Cancel auto-renewal or wait for it to expire before starting another plan.");

  const selectedPlan = plan as PaidPlan;
  const selectedInterval = interval as BillingInterval;
  const productName = bachsProductEnvName("DASHBOARD", selectedPlan, currency, selectedInterval);
  const bachsProductId = process.env[productName];
  if (!bachsProductId) fail("/dashboard/billing", `Billing is not configured yet: add ${productName} from your BACHS catalog.`);
  const reference = `mon_${randomUUID().replace(/-/g, "")}`;
  const amount = planPrice(selectedPlan, currency, selectedInterval);
  const db = adminClient();
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const { error: expireError } = await db.from("billing_checkout_attempts")
    .update({ status: "FAILED", completed_at: new Date().toISOString() })
    .eq("merchant_id", user.id).eq("status", "PENDING").lt("created_at", staleBefore);
  if (expireError) throw new Error(`Could not expire an abandoned checkout: ${expireError.message}`);
  const { error: insertError } = await db.from("billing_checkout_attempts").insert({
    reference,
    merchant_id: user.id,
    plan: selectedPlan,
    billing_interval: selectedInterval,
    billing_country: country,
    billing_currency: currency,
    billing_provider: "BACHS",
    amount_minor: amount,
    customer_email: authUser.email,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      fail("/dashboard/billing", "A checkout is already in progress. Finish it, or try again 30 minutes after it was started.");
    }
    throw new Error(`Could not create billing checkout: ${insertError.message}`);
  }

  let checkoutUrl: string;
  try {
    const checkout = await bachsPost<{ checkout_id: string; checkout_url: string }>("/checkout-sessions", {
      product_cart: [{ product_id: bachsProductId, quantity: 1 }],
      customer: { email: authUser.email },
      billing_currency: currency,
      success_url: `${appUrl()}/dashboard/billing?reference=${encodeURIComponent(reference)}`,
      cancel_url: `${appUrl()}/dashboard/billing?error=${encodeURIComponent("Checkout was cancelled.")}`,
      metadata: { reference, merchant_id: user.id, product: "dashboard", plan: selectedPlan, interval: selectedInterval, country, currency },
    }, reference);
    checkoutUrl = checkout.checkout_url;
    const { error } = await db.from("billing_checkout_attempts").update({ provider_checkout_id: checkout.checkout_id }).eq("reference", reference);
    if (error) throw new Error(`BACHS checkout started, but Monifyd could not record its checkout ID: ${error.message}`);
  } catch (error) {
    const { error: updateError } = await db.from("billing_checkout_attempts")
      .update({ status: "FAILED", completed_at: new Date().toISOString() }).eq("reference", reference).eq("status", "PENDING");
    if (updateError) throw new Error(`Checkout failed and its attempt could not be updated: ${updateError.message}`);
    throw error;
  }
  redirect(checkoutUrl);
}

export async function cancelSubscription() {
  const { user } = await requireOwner();
  const db = adminClient();
  const { data: subscription, error: subscriptionError } = await db.from("merchant_subscriptions")
    .select("bachs_subscription_id,cancel_at_period_end,current_period_end").eq("merchant_id", user.id).maybeSingle();
  if (subscriptionError) throw new Error("Could not load your subscription details.");
  if (subscription?.bachs_subscription_id) {
    if (subscription.cancel_at_period_end) fail("/dashboard/billing", "Your subscription is already set to stop renewing.");
    try { await bachsDelete(`/subscriptions/${encodeURIComponent(subscription.bachs_subscription_id)}`, { cancel_at_period_end: true, reason: "Customer requested" }); }
    catch (error) { fail("/dashboard/billing", error instanceof Error ? error.message : "Could not cancel your subscription."); }
    const { error } = await db.from("merchant_subscriptions").update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq("merchant_id", user.id);
    if (error) throw new Error(`BACHS stopped renewal, but Monifyd could not update your subscription: ${error.message}`);
    done("/dashboard/billing", "Auto-renewal has been stopped. Your paid access remains available until the current period ends.");
  }
  fail("/dashboard/billing", "This subscription has no BACHS cancellation ID. Contact support to migrate it to BACHS.");
}

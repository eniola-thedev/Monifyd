"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/session";
import { adminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/format";
import { apiPlanPrice, type ApiPaidPlan, type BillingInterval } from "@/lib/billing/plans";
import { done, fail } from "@/lib/flash";
import { availableBillingIntervals, billingLocation } from "@/lib/billing/location";
import { bachsDelete, bachsPost, bachsProductEnvName } from "@/lib/billing/bachs";

const PATH = "/dashboard/api-billing";

export async function startApiSubscription(fd: FormData) {
  const { user, authUser } = await requireOwner();
  const plan = String(fd.get("plan") ?? "");
  const interval = String(fd.get("interval") ?? "");
  if (plan !== "GROWTH" && plan !== "SCALE") fail(PATH, "Choose a valid API plan.");
  if (interval !== "monthly" && interval !== "annually") fail(PATH, "Choose a valid billing period.");
  const { country, currency } = await billingLocation();
  if (currency === "NGN" && process.env.BACHS_NGN_SUBSCRIPTIONS_ENABLED !== "true") {
    fail(PATH, "BACHS NGN subscriptions are not enabled for this account yet. Contact BACHS before offering NGN billing.");
  }
  if (!availableBillingIntervals(currency).some((available) => available === interval)) {
    fail(PATH, "Choose a valid billing period.");
  }
  if (!authUser.email) fail(PATH, "Your account needs an email address for subscription billing.");

  const db = adminClient();
  const { data: current, error: currentError } = await db.from("api_subscriptions")
    .select("plan,status,current_period_end").eq("merchant_id", user.id).maybeSingle();
  if (currentError) throw new Error(`Could not check current API subscription: ${currentError.message}`);
  const subscriptionUnexpired = !!current && ["ACTIVE", "PAST_DUE"].includes(current.status)
    && (!current.current_period_end || new Date(current.current_period_end).getTime() > Date.now());
  if (subscriptionUnexpired) fail(PATH, "Your API subscription is still active. Cancel auto-renewal or wait for it to end before starting another plan.");

  const selectedPlan = plan as ApiPaidPlan;
  const selectedInterval = interval as BillingInterval;
  const productName = bachsProductEnvName("API", selectedPlan, currency, selectedInterval);
  const bachsProductId = process.env[productName];
  if (!bachsProductId) fail(PATH, `API billing is not configured yet: add ${productName} from your BACHS catalog.`);
  const reference = `api_${randomUUID().replace(/-/g, "")}`;
  const amount = apiPlanPrice(selectedPlan, currency, selectedInterval);
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const { error: expireError } = await db.from("api_billing_checkout_attempts")
    .update({ status: "FAILED", completed_at: new Date().toISOString() })
    .eq("merchant_id", user.id).eq("status", "PENDING").lt("created_at", staleBefore);
  if (expireError) throw new Error(`Could not expire an abandoned API checkout: ${expireError.message}`);
  const { error: insertError } = await db.from("api_billing_checkout_attempts").insert({
    reference, merchant_id: user.id, plan: selectedPlan, billing_interval: selectedInterval,
    billing_country: country, billing_currency: currency, billing_provider: "BACHS",
    amount_minor: amount, customer_email: authUser.email,
  });
  if (insertError) {
    if (insertError.code === "23505") fail(PATH, "An API checkout is already in progress. Finish it, or try again 30 minutes after it was started.");
    throw new Error(`Could not create API billing checkout: ${insertError.message}`);
  }

  let checkoutUrl: string;
  try {
    const checkout = await bachsPost<{ checkout_id: string; checkout_url: string }>("/checkout-sessions", {
      product_cart: [{ product_id: bachsProductId, quantity: 1 }], customer: { email: authUser.email },
      billing_currency: currency,
      success_url: `${appUrl()}${PATH}?reference=${encodeURIComponent(reference)}`,
      cancel_url: `${appUrl()}${PATH}?error=${encodeURIComponent("Checkout was cancelled.")}`,
      metadata: { reference, merchant_id: user.id, product: "api", plan: selectedPlan, interval: selectedInterval, country, currency },
    }, reference);
    checkoutUrl = checkout.checkout_url;
    const { error } = await db.from("api_billing_checkout_attempts").update({ provider_checkout_id: checkout.checkout_id }).eq("reference", reference);
    if (error) throw new Error(`BACHS checkout started, but Monifyd could not record its checkout ID: ${error.message}`);
  } catch (error) {
    const { error: updateError } = await db.from("api_billing_checkout_attempts")
      .update({ status: "FAILED", completed_at: new Date().toISOString() }).eq("reference", reference).eq("status", "PENDING");
    if (updateError) throw new Error(`Checkout failed and its attempt could not be updated: ${updateError.message}`);
    throw error;
  }
  redirect(checkoutUrl);
}

export async function cancelApiSubscription() {
  const { user } = await requireOwner();
  const db = adminClient();
  const { data: subscription, error: subscriptionError } = await db.from("api_subscriptions")
    .select("bachs_subscription_id,cancel_at_period_end").eq("merchant_id", user.id).maybeSingle();
  if (subscriptionError) throw new Error("Could not load your API subscription details.");
  if (subscription?.bachs_subscription_id) {
    if (subscription.cancel_at_period_end) fail(PATH, "Your API subscription is already set to stop renewing.");
    try { await bachsDelete(`/subscriptions/${encodeURIComponent(subscription.bachs_subscription_id)}`, { cancel_at_period_end: true, reason: "Customer requested" }); }
    catch (error) { fail(PATH, error instanceof Error ? error.message : "Could not cancel your API subscription."); }
    const { error } = await db.from("api_subscriptions").update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq("merchant_id", user.id);
    if (error) throw new Error(`BACHS stopped API renewal, but Monifyd could not update the subscription: ${error.message}`);
    revalidatePath(PATH);
    done(PATH, "API auto-renewal has been stopped. Your API plan stays active until the current period ends.");
  }
  fail(PATH, "This subscription has no BACHS cancellation ID. Contact support to migrate it to BACHS.");
}

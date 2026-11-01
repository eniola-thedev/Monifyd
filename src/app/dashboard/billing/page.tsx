import { requireOwner } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { StatusBadge } from "@/components/StatusBadge";
import { activePlan, formatPlanPrice, planFeatures, planPrice } from "@/lib/billing/plans";
import { cancelSubscription, startSubscription } from "./actions";
import { availableBillingIntervals, billingLocation } from "@/lib/billing/location";

export const metadata = { title: "Upgrade | Monifyd" };

const PLANS = [
  { id: "FREE", name: "Free", intervalPrices: null },
  { id: "PRO", name: "Pro" },
  { id: "BUSINESS", name: "Business" },
] as const;

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; reference?: string }> }) {
  const [sp, session, location] = await Promise.all([searchParams, requireOwner(), billingLocation()]);
  const { user, supabase } = session;
  const [{ data: subscription, error }, attemptResult] = await Promise.all([
    supabase.from("merchant_subscriptions").select("plan,status,billing_interval,billing_country,billing_currency,current_period_end,cancel_at_period_end,bachs_subscription_id,paystack_subscription_code,billing_provider")
      .eq("merchant_id", user.id).maybeSingle(),
    sp.reference
      ? supabase.from("billing_checkout_attempts").select("status,billing_provider").eq("merchant_id", user.id).eq("reference", sp.reference).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (error || attemptResult.error) throw new Error(`Could not load billing details: ${error?.message ?? attemptResult.error?.message}`);
  const { currency } = location;
  const currentPlan = activePlan(subscription);
  const paidActive = currentPlan !== "FREE";
  return (
    <>
      <div className="head"><h1>Upgrade</h1><a className="btn btn-sm" href="/dashboard/api-billing">API plans</a></div>
      <Flash error={sp.error} message={sp.message} />
      <p className="hint" style={{ marginBottom: 12 }}>{currency === "NGN" ? "Nigerian naira subscriptions are processed by Paystack." : "USD subscriptions are processed by BACHS."}</p>
      {attemptResult.data?.status === "PENDING" && <section className="card">
        <p>{attemptResult.data.billing_provider} is confirming your subscription. This page will show your plan once confirmation arrives; refresh in a moment.</p>
      </section>}
      <section className="card"><div className="head"><h2>Current plan</h2><StatusBadge status={subscription?.status === "PAST_DUE" ? "FAILED" : currentPlan} /></div>
        <p style={{ color: "var(--muted)" }}>
          {paidActive
            ? `${currentPlan === "PRO" ? "Pro" : "Business"} is billed ${subscription?.billing_currency ?? currency} ${subscription?.billing_interval ?? "monthly"}.`
            : "You are on Free. Current payment links, invoices, payment tracking, basic reports and CSV exports remain available."}
        </p>
        {subscription?.current_period_end && <p style={{ marginTop: 8 }}>{subscription.cancel_at_period_end ? "Access ends" : "Next renewal"}: {new Date(subscription.current_period_end).toLocaleDateString("en-GB", { dateStyle: "medium" })}</p>}
        {paidActive && !subscription?.cancel_at_period_end && (subscription?.bachs_subscription_id || subscription?.paystack_subscription_code) && <form action={cancelSubscription} style={{ marginTop: 16 }}>
          <button className="btn btn-danger">Stop auto-renewal</button>
        </form>}
        {paidActive && !subscription?.cancel_at_period_end && !subscription?.bachs_subscription_id && !subscription?.paystack_subscription_code
          && <p className="hint" style={{ marginTop: 8 }}>This subscription predates online billing management. Contact support to migrate it.</p>}
        {subscription?.cancel_at_period_end && <p className="hint" style={{ marginTop: 8 }}>Auto-renewal is stopped; paid access remains until the current period ends.</p>}
        {subscription?.status === "PAST_DUE" && <p className="hint" style={{ marginTop: 8 }}>The latest subscription payment failed. Your provider may retry; paid benefits continue until the current period ends.</p>}
      </section>
      <div className="row2">
        {PLANS.map((plan) => {
          const selected = plan.id === currentPlan;
          return (
            <section className="card" key={plan.id} style={{ borderColor: selected ? "var(--accent)" : undefined }}>
              <div className="head"><h2>{plan.name}</h2>{selected && <span className="badge badge-good">Current</span>}</div>
              <p style={{ color: "var(--muted)", marginBottom: 16 }}>{plan.id === "FREE" ? "For getting started with crypto payments." : plan.id === "PRO" ? "For growing merchants who need deeper financial insight." : "For established merchants working with a team."}</p>
              <ul style={{ margin: "0 0 20px", paddingLeft: 20 }}>
                {planFeatures[plan.id].map((feature) => <li key={feature} style={{ marginBottom: 8 }}>{feature}</li>)}
              </ul>
              {plan.id === "FREE" ? <strong>{formatPlanPrice(0, currency)}</strong> : (
                <div style={{ display: "grid", gap: 8 }}>
                  {availableBillingIntervals(currency).map((interval) => {
                    const amount = planPrice(plan.id, currency, interval);
                    return (
                      <form action={startSubscription} key={interval}>
                        <input type="hidden" name="plan" value={plan.id} />
                        <input type="hidden" name="interval" value={interval} />
                        <button className={`btn ${selected ? "" : "btn-primary"}`} style={{ width: "100%" }} disabled={paidActive}>
                          {formatPlanPrice(amount, currency)} / {interval === "monthly" ? "month" : "year"}
                        </button>
                      </form>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <section className="card"><h2>Dashboard plan features</h2>
        <p style={{ color: "var(--muted)" }}>These plans cover dashboard reporting and team seats. API request limits and webhook endpoints use a separate API subscription. Only the workspace owner can purchase, change, or cancel this plan.</p>
        <a className="btn btn-primary" style={{ marginTop: 12 }} href="/dashboard/api-billing">View API plans</a>
      </section>
    </>
  );
}

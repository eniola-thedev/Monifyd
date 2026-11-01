import Link from "next/link";
import { requireOwner } from "@/lib/session";
import { Flash } from "@/components/Flash";
import { activeApiPlan, activePlan, apiPlanFeatures, apiPlanPrice, formatPlanPrice, type ApiPaidPlan } from "@/lib/billing/plans";
import { cancelApiSubscription, startApiSubscription } from "./actions";
import { availableBillingIntervals, billingLocation } from "@/lib/billing/location";
export const metadata = { title: "API plans & billing | Monifyd" };
const PLANS = [
  { id: "FREE", name: "Free", intervals: null },
  { id: "GROWTH", name: "Growth" },
  { id: "SCALE", name: "Scale" },
] as const;
export default async function ApiBillingPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; reference?: string }> }) {
  const [sp, session, location] = await Promise.all([searchParams, requireOwner(), billingLocation()]);
  const { user, supabase } = session;
  const { currency } = location;
  const [{ data: subscription, error }, attemptResult, { data: dashboardSubscription, error: dashboardError }] = await Promise.all([
    supabase.from("api_subscriptions").select("plan,status,billing_interval,current_period_end,cancel_at_period_end,bachs_subscription_id,paystack_subscription_code,billing_provider").eq("merchant_id", user.id).maybeSingle(),
    sp.reference
      ? supabase.from("api_billing_checkout_attempts").select("status,billing_provider").eq("merchant_id", user.id).eq("reference", sp.reference).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("merchant_subscriptions").select("plan,status,current_period_end,legacy_api_access").eq("merchant_id", user.id).maybeSingle(),
  ]);
  if (error || attemptResult.error || dashboardError) {
    throw new Error(`Could not load API billing details: ${error?.message ?? attemptResult.error?.message ?? dashboardError?.message}`);
  }
  const directPlan = activeApiPlan(subscription);
  const dashboardLegacyPlan = dashboardSubscription?.legacy_api_access ? activePlan(dashboardSubscription) : "FREE";
  const legacyApiPlan = dashboardLegacyPlan === "PRO" ? "GROWTH" : dashboardLegacyPlan === "BUSINESS" ? "SCALE" : "FREE";
  const currentPlan = directPlan !== "FREE" ? directPlan : legacyApiPlan;
  const apiPlanActive = directPlan !== "FREE";
  const now = Date.now();
  const currentPeriodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end).getTime() : null;
  const paidActive = apiPlanActive && (!currentPeriodEnd || currentPeriodEnd > now);
  return (
    <>
      <div className="head"><h1>API plans &amp; billing</h1><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="btn btn-sm" href="/dashboard/developers">API keys</Link><Link className="btn btn-sm" href="/dashboard/billing">Dashboard plans</Link></div></div>
      <Flash error={sp.error} message={sp.message} />
      <p className="hint" style={{ marginBottom: 12 }}>{currency === "NGN" ? "Nigerian naira subscriptions are processed by Paystack." : "USD subscriptions are processed by BACHS."}</p>
      {attemptResult.data?.status === "PENDING" && <section className="card"><p>{attemptResult.data.billing_provider} is confirming your API subscription. Refresh in a moment to see the updated plan.</p></section>}
      <section className="card"><h2>Current API plan</h2>
        {apiPlanActive ? <>
          <p style={{ color: "var(--muted)" }}>{currentPlan} API plan{subscription?.billing_interval ? `, billed ${subscription.billing_interval}` : ""}{subscription?.current_period_end ? ` until ${new Date(subscription.current_period_end).toLocaleDateString("en-GB", { dateStyle: "medium" })}` : ""}.</p>
          {subscription?.cancel_at_period_end && <p className="hint" style={{ marginTop: 8 }}>API auto-renewal is stopped; your current plan remains active through the period shown above.</p>}
          {subscription?.status === "PAST_DUE" && <p className="hint" style={{ marginTop: 8 }}>The latest API subscription payment failed. Your provider may retry; paid API access continues until the current period ends.</p>}
          {!subscription?.cancel_at_period_end && (subscription?.bachs_subscription_id || subscription?.paystack_subscription_code) && <form action={cancelApiSubscription} style={{ marginTop: 16 }}><button className="btn btn-danger">Stop API auto-renewal</button></form>}
          {!subscription?.cancel_at_period_end && !subscription?.bachs_subscription_id && !subscription?.paystack_subscription_code && <p className="hint" style={{ marginTop: 8 }}>This subscription predates online billing management. Contact support to migrate it.</p>}
        </> : legacyApiPlan !== "FREE" ? <>
          <p style={{ color: "var(--muted)" }}>You have legacy API access through your existing {dashboardLegacyPlan} Dashboard plan. Choose a separate API plan below to manage API usage independently.</p>
          <p className="hint" style={{ marginTop: 8 }}>Your Dashboard subscription and its renewal are managed separately on <Link href="/dashboard/billing">Dashboard plans</Link>.</p>
        </> : <p style={{ color: "var(--muted)" }}>You are on the Free API plan. Dashboard plans and API plans are separate subscriptions.</p>}
      </section>
      <div className="row2">
        {PLANS.map((plan) => {
          const selected = plan.id === currentPlan;
          return (
            <section className="card" key={plan.id} style={{ borderColor: selected ? "var(--accent)" : undefined }}>
              <div className="head"><h2>{plan.name}</h2>{selected && <span className="badge badge-good">Current</span>}</div>
              <p style={{ color: "var(--muted)", marginBottom: 16 }}>{plan.id === "FREE" ? "For testing and small integrations." : plan.id === "GROWTH" ? "For production integrations with growing traffic." : "For high-volume integrations that need more capacity."}</p>
              <ul style={{ margin: "0 0 20px", paddingLeft: 20 }}>
                {apiPlanFeatures[plan.id].map((feature) => <li key={feature} style={{ marginBottom: 8 }}>{feature}</li>)}
              </ul>
              {plan.id === "FREE" ? <strong>{formatPlanPrice(0, currency)}</strong> : (
                <div style={{ display: "grid", gap: 8 }}>
                  {availableBillingIntervals(currency).map((interval) => {
                    const amount = apiPlanPrice(plan.id as ApiPaidPlan, currency, interval);
                    return <form action={startApiSubscription} key={interval}>
                      <input type="hidden" name="plan" value={plan.id} /><input type="hidden" name="interval" value={interval} />
                      <button className={`btn ${selected ? "" : "btn-primary"}`} style={{ width: "100%" }} disabled={paidActive}>
                        {formatPlanPrice(amount, currency)} / {interval === "monthly" ? "month" : "year"}
                      </button>
                    </form>;
                  })}
                </div>
              )}
              {plan.id !== "FREE" && <p className="hint" style={{ marginTop: 12 }}>Dashboard subscriptions are charged separately.</p>}
            </section>
          );
        })}
      </div>
      <section className="card"><h2>Separate products</h2><p style={{ color: "var(--muted)" }}>API plans set request limits and webhook endpoint limits. Dashboard plans cover advanced reports and team seats. Each paid plan has its own subscription and cancellation controls.</p></section>
    </>
  );
}

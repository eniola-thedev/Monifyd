-- Before applying this migration, cancel any active pre-BACHS subscriptions
-- with their original provider. BACHS cannot inherit another provider's mandate.

-- Mark pre-BACHS subscription rows as legacy so the app won't expose BACHS
-- cancellation controls for them. New rows default to BACHS.
alter table merchant_subscriptions drop constraint if exists merchant_subscriptions_billing_provider_check;
alter table billing_checkout_attempts drop constraint if exists billing_checkout_attempts_billing_provider_check;
alter table api_subscriptions drop constraint if exists api_subscriptions_billing_provider_check;
alter table api_billing_checkout_attempts drop constraint if exists api_billing_checkout_attempts_billing_provider_check;

update merchant_subscriptions
set billing_provider = case when bachs_subscription_id is null then 'LEGACY' else 'BACHS' end;
update api_subscriptions
set billing_provider = case when bachs_subscription_id is null then 'LEGACY' else 'BACHS' end;
update billing_checkout_attempts
set status = 'FAILED', completed_at = coalesce(completed_at, now()), billing_provider = 'LEGACY'
where billing_provider <> 'BACHS' and status = 'PENDING';
update billing_checkout_attempts set billing_provider = 'LEGACY' where billing_provider <> 'BACHS';
update api_billing_checkout_attempts
set status = 'FAILED', completed_at = coalesce(completed_at, now()), billing_provider = 'LEGACY'
where billing_provider <> 'BACHS' and status = 'PENDING';
update api_billing_checkout_attempts set billing_provider = 'LEGACY' where billing_provider <> 'BACHS';

alter table merchant_subscriptions alter column billing_provider set default 'BACHS';
alter table merchant_subscriptions add constraint merchant_subscriptions_billing_provider_check
  check (billing_provider in ('BACHS', 'LEGACY'));
alter table billing_checkout_attempts alter column billing_provider set default 'BACHS';
alter table billing_checkout_attempts add constraint billing_checkout_attempts_billing_provider_check
  check (billing_provider in ('BACHS', 'LEGACY'));
alter table api_subscriptions alter column billing_provider set default 'BACHS';
alter table api_subscriptions add constraint api_subscriptions_billing_provider_check
  check (billing_provider in ('BACHS', 'LEGACY'));
alter table api_billing_checkout_attempts alter column billing_provider set default 'BACHS';
alter table api_billing_checkout_attempts add constraint api_billing_checkout_attempts_billing_provider_check
  check (billing_provider in ('BACHS', 'LEGACY'));

-- Remove provider credentials, tokens, and integration state that are no longer used.
drop table if exists billing_checkout_private;
drop table if exists api_billing_checkout_private;
drop table if exists billing_provider_private;
drop table if exists api_billing_provider_private;
drop table if exists paystack_processed_events;
drop function if exists claim_paystack_event(text);

alter table merchant_subscriptions
  drop column if exists paystack_customer_code,
  drop column if exists paystack_customer_id,
  drop column if exists paystack_subscription_code,
  drop column if exists paystack_plan_code;
alter table billing_checkout_attempts drop column if exists paystack_plan_code;
alter table api_subscriptions
  drop column if exists paystack_customer_code,
  drop column if exists paystack_customer_id,
  drop column if exists paystack_plan_code,
  drop column if exists paystack_subscription_code;
alter table api_billing_checkout_attempts drop column if exists paystack_plan_code;

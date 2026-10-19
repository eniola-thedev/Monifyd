-- NGN recurring subscriptions use Paystack; USD recurring subscriptions use BACHS.
alter table merchant_subscriptions drop constraint if exists merchant_subscriptions_billing_provider_check;
alter table merchant_subscriptions add constraint merchant_subscriptions_billing_provider_check check (billing_provider in ('BACHS', 'PAYSTACK', 'LEGACY'));
alter table api_subscriptions drop constraint if exists api_subscriptions_billing_provider_check;
alter table api_subscriptions add constraint api_subscriptions_billing_provider_check check (billing_provider in ('BACHS', 'PAYSTACK', 'LEGACY'));
alter table billing_checkout_attempts drop constraint if exists billing_checkout_attempts_billing_provider_check;
alter table billing_checkout_attempts add constraint billing_checkout_attempts_billing_provider_check check (billing_provider in ('BACHS', 'PAYSTACK', 'LEGACY'));
alter table api_billing_checkout_attempts drop constraint if exists api_billing_checkout_attempts_billing_provider_check;
alter table api_billing_checkout_attempts add constraint api_billing_checkout_attempts_billing_provider_check check (billing_provider in ('BACHS', 'PAYSTACK', 'LEGACY'));

alter table merchant_subscriptions add column if not exists paystack_subscription_code text;
alter table merchant_subscriptions add column if not exists paystack_customer_code text;
alter table api_subscriptions add column if not exists paystack_subscription_code text;
alter table api_subscriptions add column if not exists paystack_customer_code text;
alter table billing_checkout_attempts add column if not exists paystack_plan_code text;
alter table api_billing_checkout_attempts add column if not exists paystack_plan_code text;

create table if not exists paystack_processed_events (event_id text primary key, created_at timestamptz not null default now());
alter table paystack_processed_events enable row level security;
create table if not exists paystack_subscription_tokens (
  merchant_id uuid not null references profiles(id) on delete cascade,
  product text not null check (product in ('dashboard', 'api')),
  email_token text not null,
  updated_at timestamptz not null default now(),
  primary key (merchant_id, product)
);
alter table paystack_subscription_tokens enable row level security;

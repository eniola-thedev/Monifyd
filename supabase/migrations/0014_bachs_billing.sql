-- Add provider-neutral identifiers for the BACHS integration.
alter table merchant_subscriptions
  add column if not exists billing_provider text not null default 'LEGACY'
    check (billing_provider in ('LEGACY', 'BACHS')),
  add column if not exists bachs_subscription_id text,
  add column if not exists bachs_customer_id text,
  add column if not exists bachs_event_created_at timestamptz;

alter table billing_checkout_attempts
  add column if not exists billing_provider text not null default 'LEGACY'
    check (billing_provider in ('LEGACY', 'BACHS')),
  add column if not exists provider_checkout_id text;
create unique index if not exists billing_checkout_provider_id_unique
  on billing_checkout_attempts (provider_checkout_id) where provider_checkout_id is not null;

alter table api_subscriptions
  add column if not exists billing_provider text not null default 'LEGACY'
    check (billing_provider in ('LEGACY', 'BACHS')),
  add column if not exists bachs_subscription_id text,
  add column if not exists bachs_customer_id text,
  add column if not exists bachs_event_created_at timestamptz;

alter table api_billing_checkout_attempts
  add column if not exists billing_provider text not null default 'LEGACY'
    check (billing_provider in ('LEGACY', 'BACHS')),
  add column if not exists provider_checkout_id text;
create unique index if not exists api_billing_checkout_provider_id_unique
  on api_billing_checkout_attempts (provider_checkout_id) where provider_checkout_id is not null;

create table if not exists bachs_processed_events (
  event_id text primary key,
  created_at timestamptz not null default now()
);
alter table bachs_processed_events enable row level security;

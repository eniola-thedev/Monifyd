-- Keep the existing dashboard subscription independent from the API product.
-- Paid subscribers at rollout retain the API entitlements they already purchased.
alter table merchant_subscriptions
  add column if not exists legacy_api_access boolean not null default false;
alter table merchant_subscriptions
  add column if not exists paystack_plan_code text;

update merchant_subscriptions
set legacy_api_access = true
where plan in ('PRO', 'BUSINESS')
  and status in ('ACTIVE', 'PAST_DUE')
  and (current_period_end is null or current_period_end > now());

create table api_subscriptions (
  merchant_id uuid primary key references profiles(id) on delete cascade,
  plan text not null check (plan in ('GROWTH', 'SCALE')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAST_DUE', 'CANCELLED')),
  billing_interval text not null check (billing_interval in ('monthly', 'annually')),
  billing_country text not null,
  billing_currency text not null check (billing_currency = 'NGN'),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  paystack_customer_code text,
  paystack_customer_id bigint,
  paystack_plan_code text,
  paystack_subscription_code text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table api_billing_checkout_attempts (
  reference text primary key,
  merchant_id uuid not null references profiles(id) on delete cascade,
  plan text not null check (plan in ('GROWTH', 'SCALE')),
  billing_interval text not null check (billing_interval in ('monthly', 'annually')),
  billing_country text not null,
  billing_currency text not null check (billing_currency = 'NGN'),
  paystack_plan_code text not null,
  amount_minor bigint not null check (amount_minor > 0),
  customer_email text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SUCCEEDED', 'FAILED')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index api_billing_checkout_pending on api_billing_checkout_attempts (customer_email, created_at desc) where status = 'PENDING';
create unique index api_billing_one_pending_checkout_per_merchant on api_billing_checkout_attempts (merchant_id) where status = 'PENDING';

create table api_billing_provider_private (
  merchant_id uuid primary key references api_subscriptions(merchant_id) on delete cascade,
  paystack_email_token text,
  updated_at timestamptz not null default now()
);
alter table api_billing_provider_private enable row level security;

create table api_billing_checkout_private (
  reference text primary key references api_billing_checkout_attempts(reference) on delete cascade,
  paystack_customer_code text,
  paystack_customer_id bigint,
  paystack_subscription_code text,
  paystack_email_token text,
  updated_at timestamptz not null default now()
);
alter table api_billing_checkout_private enable row level security;

alter table api_subscriptions enable row level security;
alter table api_billing_checkout_attempts enable row level security;
create policy read_api_subscription on api_subscriptions
  for select using (workspace_role(merchant_id) = 'OWNER');
create policy read_api_billing_attempts on api_billing_checkout_attempts
  for select using (workspace_role(merchant_id) = 'OWNER');

-- Monifyd core schema (phase 1). Non-custodial: no private keys or seed phrases are ever stored.

create type link_status    as enum ('ACTIVE','EXPIRED','DISABLED','PAID');
create type invoice_status as enum ('DRAFT','SENT','AWAITING_PAYMENT','PAYMENT_DETECTED','CONFIRMING','PAID','UNDERPAID','OVERPAID','EXPIRED','CANCELLED');
create type payment_status as enum ('CREATED','AWAITING_PAYMENT','PAYMENT_DETECTED','CONFIRMING','PAID','UNDERPAID','OVERPAID','EXPIRED','FAILED','CANCELLED');
create type key_mode       as enum ('test','live');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text, business_name text, business_email text, website text, logo_url text,
  description text, default_currency text not null default 'USD',
  suspended_at timestamptz, created_at timestamptz not null default now()
);

-- Reference data: assets and networks are modelled separately, joined by asset_networks.
create table supported_assets   (symbol text primary key, name text not null, decimals int not null);
create table supported_networks (id text primary key, name text not null, family text not null check (family in ('bitcoin','evm','solana')), required_confirmations int not null);
create table asset_networks (
  asset text references supported_assets(symbol), network text references supported_networks(id),
  token_contract text, decimals int, enabled boolean not null default true,
  primary key (asset, network)
);

create table wallets (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  network text not null references supported_networks(id),
  address text not null, label text, is_default boolean not null default true,
  created_at timestamptz not null default now(),
  unique (merchant_id, network, address)
);

create table payment_links (
  id text primary key,                         -- plink_<random>, never sequential
  merchant_id uuid not null references profiles(id) on delete cascade,
  livemode boolean not null default true,
  status link_status not null default 'ACTIVE',
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null, description text, reference text,
  accepted_payments jsonb not null,            -- [{asset, networks[]}]
  expires_at timestamptz, success_url text, cancel_url text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create sequence invoice_number_seq;
create table invoices (
  id text primary key,                         -- inv_<random>
  merchant_id uuid not null references profiles(id) on delete cascade,
  livemode boolean not null default true,
  invoice_number text not null unique default ('INMF-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  customer_name text, customer_email text not null,
  title text not null, description text, notes text,
  amount_cents bigint not null check (amount_cents > 0), currency text not null,
  status invoice_status not null default 'DRAFT',
  accepted_payments jsonb not null,
  due_date date, expires_at timestamptz, success_url text, cancel_url text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), paid_at timestamptz
);

create table price_quotes (
  id uuid primary key default gen_random_uuid(),
  asset text not null, network text not null,
  fiat_currency text not null, rate numeric not null,
  crypto_amount numeric not null, quoted_at timestamptz not null default now(), expires_at timestamptz not null
);

create table payments (
  id text primary key,                         -- pay_<random>
  merchant_id uuid not null references profiles(id) on delete cascade,
  livemode boolean not null default true,
  payment_link_id text references payment_links(id),
  invoice_id text references invoices(id),
  quote_id uuid references price_quotes(id),
  amount_cents bigint not null,                -- what the merchant receives
  fee_cents bigint not null,                   -- platform fee, paid by the customer on top
  total_cents bigint not null,                 -- amount_cents + fee_cents, what the customer pays
  currency text not null,
  asset text not null, network text not null,
  crypto_amount numeric not null,              -- priced from total_cents
  receiving_address text not null,             -- fixed at creation, never silently changed
  status payment_status not null default 'CREATED',
  received_amount numeric not null default 0,
  confirmations int not null default 0,
  expires_at timestamptz, last_scanned_at timestamptz,
  created_at timestamptz not null default now(), detected_at timestamptz, confirmed_at timestamptz,
  check ((payment_link_id is not null) <> (invoice_id is not null))
);

create table payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null references payments(id),
  network text not null, tx_hash text not null, amount numeric not null,
  confirmations int not null default 0, detected_at timestamptz not null default now(),
  unique (network, tx_hash)                    -- one transaction can only ever belong to one payment
);

create table payment_status_log (
  id bigserial primary key, payment_id text not null references payments(id),
  from_status payment_status, to_status payment_status not null, reason text,
  created_at timestamptz not null default now()
);

-- Where the payment detector last looked for each receiving address.
create table scan_cursors (
  network text not null, asset text not null, address text not null,
  cursor text, updated_at timestamptz not null default now(),
  primary key (network, asset, address)
);
alter table scan_cursors enable row level security;

create table platform_fees (
  payment_id text primary key references payments(id),
  amount_cents bigint not null, percentage_fee_cents bigint not null, fixed_fee_cents bigint not null,
  total_fee_cents bigint not null, customer_total_cents bigint not null, merchant_cents bigint not null,
  asset text not null, network text not null, created_at timestamptz not null default now()
);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  mode key_mode not null, name text, key_prefix text not null,
  key_hash text not null unique,               -- SHA-256 only; the secret is shown once
  last_used_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);

create table idempotency_keys (
  merchant_id uuid not null references profiles(id) on delete cascade,
  key text not null, endpoint text not null, request_hash text not null,
  response jsonb not null, status int not null, created_at timestamptz not null default now(),
  primary key (merchant_id, key, endpoint)
);

create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  url text not null, secret text not null, events text[] not null default '{}',
  enabled boolean not null default true, created_at timestamptz not null default now()
);

create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references webhook_endpoints(id) on delete cascade,
  event_id text not null, event_type text not null, payload jsonb not null,
  attempt int not null default 0, status text not null default 'PENDING',
  response_code int, error text, next_attempt_at timestamptz, last_attempt_at timestamptz,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  type text not null, body text not null, read_at timestamptz, created_at timestamptz not null default now()
);

create table audit_logs (
  id bigserial primary key, merchant_id uuid, actor text not null,
  action text not null, target text, details jsonb, created_at timestamptz not null default now()
);

create index on payments (merchant_id, created_at desc);
create index on payments (status) where status in ('AWAITING_PAYMENT','PAYMENT_DETECTED','CONFIRMING');
create index on payment_links (merchant_id, created_at desc);
create index on invoices (merchant_id, created_at desc);
create index on webhook_deliveries (next_attempt_at) where status = 'PENDING';

-- Row Level Security: merchants only ever see their own rows. Workers and the API use the service role.
alter table profiles enable row level security;
alter table wallets enable row level security;
alter table payment_links enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
alter table platform_fees enable row level security;
alter table api_keys enable row level security;
alter table webhook_endpoints enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table idempotency_keys enable row level security;
alter table payment_transactions enable row level security;
alter table payment_status_log enable row level security;
alter table webhook_deliveries enable row level security;
alter table price_quotes enable row level security;

create policy own_profile on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy own_wallets on wallets for all using (merchant_id = auth.uid()) with check (merchant_id = auth.uid());
create policy own_links on payment_links for all using (merchant_id = auth.uid()) with check (merchant_id = auth.uid());
create policy own_invoices on invoices for all using (merchant_id = auth.uid()) with check (merchant_id = auth.uid());
create policy own_endpoints on webhook_endpoints for all using (merchant_id = auth.uid()) with check (merchant_id = auth.uid());
create policy own_payments on payments for select using (merchant_id = auth.uid());
create policy own_fees on platform_fees for select using (exists (select 1 from payments p where p.id = payment_id and p.merchant_id = auth.uid()));
create policy own_keys on api_keys for select using (merchant_id = auth.uid());
create policy own_notifications on notifications for select using (merchant_id = auth.uid());
create policy own_audit on audit_logs for select using (merchant_id = auth.uid());
create policy own_txs on payment_transactions for select using (exists (select 1 from payments p where p.id = payment_id and p.merchant_id = auth.uid()));
create policy own_status_log on payment_status_log for select using (exists (select 1 from payments p where p.id = payment_id and p.merchant_id = auth.uid()));
create policy own_deliveries on webhook_deliveries for select using (exists (select 1 from webhook_endpoints e where e.id = endpoint_id and e.merchant_id = auth.uid()));

alter table supported_assets enable row level security;
alter table supported_networks enable row level security;
alter table asset_networks enable row level security;
create policy read_assets on supported_assets for select using (true);
create policy read_networks on supported_networks for select using (true);
create policy read_asset_networks on asset_networks for select using (true);

-- Create a profile automatically when someone signs up.
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles (id, business_email, name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Seed: MVP assets and networks from the PRD. Token contract addresses are filled in when providers are chosen.
insert into supported_assets values ('BTC','Bitcoin',8),('ETH','Ether',18),('SOL','Solana',9),('USDC','USD Coin',6),('USDT','Tether USD',6);
insert into supported_networks values
  ('bitcoin','Bitcoin','bitcoin',3),('ethereum','Ethereum','evm',12),('base','Base','evm',12),
  ('solana','Solana','solana',32),('polygon','Polygon','evm',64),('bnb','BNB Chain','evm',15);
insert into asset_networks (asset, network, decimals) values
  ('BTC','bitcoin',8),('ETH','ethereum',18),('USDC','ethereum',6),('USDT','ethereum',6),
  ('ETH','base',18),('USDC','base',6),('SOL','solana',9),('USDC','solana',6),('USDT','solana',6),
  ('USDC','polygon',6),('USDT','bnb',18);

-- Token contracts / mints. Verify these against the issuers' official pages before launch.
update asset_networks set token_contract='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' where asset='USDC' and network='ethereum';
update asset_networks set token_contract='0xdAC17F958D2ee523a2206206994597C13D831ec7' where asset='USDT' and network='ethereum';
update asset_networks set token_contract='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' where asset='USDC' and network='base';
update asset_networks set token_contract='0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' where asset='USDC' and network='polygon';
update asset_networks set token_contract='0x55d398326f99059fF775485246999027B3197955' where asset='USDT' and network='bnb';
update asset_networks set token_contract='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' where asset='USDC' and network='solana';
update asset_networks set token_contract='Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' where asset='USDT' and network='solana';
-- Native ETH detection is not built yet, so it stays off at launch.
update asset_networks set enabled=false where asset='ETH';

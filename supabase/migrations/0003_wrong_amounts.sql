-- Crypto amounts must be exact. Store them as text so no precision is ever lost.
alter table payments alter column crypto_amount type text using crypto_amount::text;
alter table payments alter column received_amount drop default;
alter table payments alter column received_amount type text using received_amount::text;
alter table payments alter column received_amount set default '0';

-- Opt-in: match a transfer with the wrong amount to the only open payment on the wallet.
alter table profiles add column if not exists match_wrong_amounts boolean not null default false;

-- Incoming transfers that matched no payment. The merchant can assign or ignore them.
create table if not exists unmatched_transfers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  network text not null, asset text not null, address text not null,
  tx_hash text not null, amount text not null, confirmations int not null default 0,
  status text not null default 'UNMATCHED' check (status in ('UNMATCHED','ASSIGNED','IGNORED')),
  assigned_payment_id text references payments(id),
  seen_at timestamptz not null default now(),
  unique (network, tx_hash)
);
alter table unmatched_transfers enable row level security;
create policy own_unmatched on unmatched_transfers for select using (merchant_id = auth.uid());
create index if not exists unmatched_merchant on unmatched_transfers (merchant_id, status, seen_at desc);

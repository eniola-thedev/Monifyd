create table refunds (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  payment_id text not null references payments(id) on delete cascade,
  amount numeric not null check (amount > 0),
  asset text not null,
  network text not null,
  destination text not null check (length(trim(destination)) between 1 and 256),
  customer_email text check (customer_email is null or length(customer_email) <= 320),
  tx_hash text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SENT', 'CONFIRMED', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('SENT', 'CONFIRMED') or nullif(trim(tx_hash), '') is not null)
);

create index refunds_payment_created on refunds (payment_id, created_at desc);
create index refunds_merchant_created on refunds (merchant_id, created_at desc);
alter table refunds enable row level security;
create policy own_refunds on refunds for select using (merchant_id = auth.uid());

create table refund_customer_updates (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references refunds(id) on delete cascade,
  event_status text not null check (event_status in ('SENT', 'CONFIRMED', 'FAILED')),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempt int not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (refund_id, event_status)
);
create index refund_customer_updates_due on refund_customer_updates (next_attempt_at) where status = 'PENDING';
alter table refund_customer_updates enable row level security;
create policy own_refund_customer_updates on refund_customer_updates for select
  using (exists (select 1 from refunds r where r.id = refund_id and r.merchant_id = auth.uid()));

create function create_refund_record(
  p_merchant_id uuid,
  p_payment_id text,
  p_amount numeric,
  p_destination text,
  p_customer_email text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_reserved numeric;
  v_refund_id uuid;
begin
  if p_amount is null or p_amount <= 0 or length(trim(coalesce(p_destination, ''))) not between 1 and 256 then
    raise exception 'Enter a positive refund amount and a valid destination.';
  end if;

  select * into v_payment
  from payments
  where id = p_payment_id and merchant_id = p_merchant_id
  for update;

  if not found then raise exception 'Payment not found.'; end if;
  if v_payment.status not in ('PAID', 'OVERPAID', 'UNDERPAID', 'EXPIRED') then
    raise exception 'Refunds can only be recorded for confirmed payments.';
  end if;
  if v_payment.received_amount::numeric <= 0 then
    raise exception 'There are no confirmed funds available to refund.';
  end if;

  select coalesce(sum(amount), 0) into v_reserved
  from refunds
  where payment_id = p_payment_id and status <> 'FAILED';

  if p_amount + v_reserved > v_payment.received_amount::numeric then
    raise exception 'Refund amount exceeds the remaining refundable amount.';
  end if;

  if nullif(trim(coalesce(p_customer_email, '')), '') is not null
    and (length(trim(p_customer_email)) > 320 or trim(p_customer_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Enter a valid customer email address.';
  end if;

  insert into refunds (merchant_id, payment_id, amount, asset, network, destination, customer_email)
  values (p_merchant_id, p_payment_id, p_amount, v_payment.asset, v_payment.network, trim(p_destination), nullif(trim(p_customer_email), ''))
  returning id into v_refund_id;

  return v_refund_id;
end $$;

create function update_refund_record(
  p_merchant_id uuid,
  p_refund_id uuid,
  p_status text,
  p_tx_hash text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_refund refunds%rowtype;
  v_hash text := nullif(trim(coalesce(p_tx_hash, '')), '');
begin
  select * into v_refund
  from refunds
  where id = p_refund_id and merchant_id = p_merchant_id
  for update;

  if not found then raise exception 'Refund record not found.'; end if;
  if not (
    (v_refund.status = 'PENDING' and p_status in ('SENT', 'FAILED'))
    or (v_refund.status = 'SENT' and p_status in ('CONFIRMED', 'FAILED'))
  ) then
    raise exception 'That refund status change is not allowed.';
  end if;
  if p_status in ('SENT', 'CONFIRMED') and v_hash is null then
    raise exception 'Enter the transaction hash before marking the refund sent or confirmed.';
  end if;

  update refunds
  set status = p_status,
      tx_hash = coalesce(v_hash, tx_hash),
      updated_at = now()
  where id = p_refund_id;

  if v_refund.customer_email is not null and p_status in ('SENT', 'CONFIRMED', 'FAILED') then
    insert into refund_customer_updates (refund_id, event_status)
    values (p_refund_id, p_status)
    on conflict (refund_id, event_status) do nothing;
  end if;

  return p_refund_id;
end $$;

revoke all on function create_refund_record(uuid, text, numeric, text, text) from public, anon, authenticated;
revoke all on function update_refund_record(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function create_refund_record(uuid, text, numeric, text, text) to service_role;
grant execute on function update_refund_record(uuid, uuid, text, text) to service_role;

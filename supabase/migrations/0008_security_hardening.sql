-- Do not expose webhook signing secrets to authenticated PostgREST clients.
revoke select on table public.webhook_endpoints from public, anon, authenticated;
grant select (id, merchant_id, url, events, enabled, created_at)
  on table public.webhook_endpoints to authenticated;

create table if not exists domain_event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  merchant_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,
  data_type text not null check (data_type in ('payment', 'invoice')),
  event_data jsonb not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_until timestamptz,
  dispatched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists domain_event_outbox_due on domain_event_outbox(next_attempt_at)
  where dispatched_at is null;
create unique index if not exists webhook_deliveries_endpoint_event_unique
  on webhook_deliveries(endpoint_id, event_id);
alter table domain_event_outbox enable row level security;
revoke all on table domain_event_outbox from public, anon, authenticated;
grant all on table domain_event_outbox to service_role;

create function enqueue_domain_event(p_merchant_id uuid, p_event_type text, p_data_type text, p_event_data jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_event_id text := 'evt_' || replace(gen_random_uuid()::text, '-', '');
begin
  insert into domain_event_outbox (event_id, merchant_id, event_type, data_type, event_data)
  values (v_event_id, p_merchant_id, p_event_type, p_data_type, p_event_data);
  return v_event_id;
end;
$$;

create function claim_domain_event_outbox(p_limit integer default 25)
returns setof domain_event_outbox
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select id from domain_event_outbox
    where dispatched_at is null and next_attempt_at <= now()
      and (claimed_until is null or claimed_until <= now())
    order by next_attempt_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update domain_event_outbox e
  set claimed_until = now() + interval '2 minutes', attempts = attempts + 1
  from due
  where e.id = due.id
  returning e.*;
end;
$$;

-- Keep payment state changes and their audit trail in one database transaction.
create or replace function transition_payment_state(
  p_payment_id text,
  p_from_status text,
  p_to_status text,
  p_received_amount numeric default null,
  p_confirmations integer default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_invoice invoices%rowtype;
  v_allowed boolean := false;
  v_event_type text;
begin
  v_allowed := case p_from_status
    when 'CREATED' then p_to_status in ('AWAITING_PAYMENT', 'CANCELLED', 'EXPIRED')
    when 'AWAITING_PAYMENT' then p_to_status in ('PAYMENT_DETECTED', 'EXPIRED', 'CANCELLED', 'FAILED')
    when 'PAYMENT_DETECTED' then p_to_status in ('CONFIRMING', 'UNDERPAID', 'OVERPAID', 'FAILED')
    when 'CONFIRMING' then p_to_status in ('PAID', 'UNDERPAID', 'OVERPAID', 'FAILED')
    when 'UNDERPAID' then p_to_status in ('PAID', 'EXPIRED')
    when 'EXPIRED' then p_to_status = 'PAYMENT_DETECTED'
    else false
  end;
  if not v_allowed then raise exception 'Payment status transition is not allowed.'; end if;
  if p_received_amount is not null and p_received_amount < 0 then raise exception 'Received amount cannot be negative.'; end if;
  if p_confirmations is not null and p_confirmations < 0 then raise exception 'Confirmation count cannot be negative.'; end if;

  update payments
  set status = p_to_status::payment_status,
      received_amount = coalesce(p_received_amount, received_amount),
      confirmations = coalesce(p_confirmations, confirmations),
      detected_at = case when p_to_status = 'PAYMENT_DETECTED' then now() else detected_at end,
      confirmed_at = case when p_to_status = 'PAID' then now() else confirmed_at end
  where id = p_payment_id and status = p_from_status::payment_status
  returning * into v_payment;
  if not found then return null; end if;

  insert into payment_status_log (payment_id, from_status, to_status)
  values (v_payment.id, p_from_status::payment_status, p_to_status::payment_status);

  v_event_type := case p_to_status
    when 'PAYMENT_DETECTED' then 'payment.detected'
    when 'CONFIRMING' then 'payment.confirming'
    when 'UNDERPAID' then 'payment.underpaid'
    when 'OVERPAID' then 'payment.overpaid'
    when 'EXPIRED' then 'payment.expired'
    when 'FAILED' then 'payment.failed'
    else null
  end;
  if v_event_type is not null then
    perform enqueue_domain_event(v_payment.merchant_id, v_event_type, 'payment', to_jsonb(v_payment));
  end if;

  if p_to_status in ('UNDERPAID', 'OVERPAID') and v_payment.invoice_id is not null then
    update invoices set status = p_to_status::invoice_status, updated_at = now()
    where id = v_payment.invoice_id returning * into v_invoice;
    if found then
      perform enqueue_domain_event(v_payment.merchant_id, 'invoice.' || lower(p_to_status), 'invoice', to_jsonb(v_invoice));
    end if;
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'invoice', case when v_payment.invoice_id is not null and p_to_status in ('UNDERPAID', 'OVERPAID') then to_jsonb(v_invoice) else null end
  );
end;
$$;

create or replace function settle_payment(
  p_payment_id text,
  p_expected_status text,
  p_final_status text,
  p_fixed_fee_cents integer,
  p_actor text default 'system',
  p_audit_action text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_invoice invoices%rowtype;
  v_event_type text;
begin
  if not ((p_expected_status = 'CONFIRMING' and p_final_status in ('PAID', 'OVERPAID'))
      or (p_expected_status = 'UNDERPAID' and p_final_status = 'PAID')) then
    raise exception 'Payment settlement transition is not allowed.';
  end if;

  update payments
  set status = p_final_status::payment_status, confirmed_at = coalesce(confirmed_at, now())
  where id = p_payment_id and status = p_expected_status::payment_status
  returning * into v_payment;
  if not found then return null; end if;
  if p_fixed_fee_cents < 0 or p_fixed_fee_cents > v_payment.fee_cents then
    raise exception 'Payment fee configuration is invalid.';
  end if;
  if p_expected_status = 'CONFIRMING' and p_final_status = 'PAID' and v_payment.received_amount::numeric < v_payment.crypto_amount::numeric then
    raise exception 'The confirmed amount is below the payment amount.';
  end if;
  if p_expected_status = 'CONFIRMING' and p_final_status = 'OVERPAID' and v_payment.received_amount::numeric <= v_payment.crypto_amount::numeric then
    raise exception 'The confirmed amount does not exceed the payment amount.';
  end if;
  if p_expected_status = 'UNDERPAID' and v_payment.received_amount::numeric <= 0 then
    raise exception 'There are no confirmed funds to accept.';
  end if;

  insert into payment_status_log (payment_id, from_status, to_status)
  values (v_payment.id, p_expected_status::payment_status, p_final_status::payment_status);

  insert into platform_fees (
    payment_id, amount_cents, percentage_fee_cents, fixed_fee_cents, total_fee_cents,
    customer_total_cents, merchant_cents, asset, network
  ) values (
    v_payment.id, v_payment.amount_cents, v_payment.fee_cents - p_fixed_fee_cents, p_fixed_fee_cents, v_payment.fee_cents,
    v_payment.total_cents, v_payment.amount_cents, v_payment.asset, v_payment.network
  );

  if v_payment.payment_link_id is not null then
    update payment_links set status = 'PAID' where id = v_payment.payment_link_id;
  end if;
  if v_payment.invoice_id is not null then
    update invoices set status = p_final_status::invoice_status, paid_at = now(), updated_at = now()
    where id = v_payment.invoice_id returning * into v_invoice;
  end if;

  insert into notifications (merchant_id, type, body)
  values (
    v_payment.merchant_id,
    'payment.' || lower(p_final_status),
    case when p_final_status = 'PAID' then 'Payment ' || v_payment.id || ' was confirmed.'
      else 'Payment ' || v_payment.id || ' was confirmed, but the customer sent more than requested.' end
  );
  insert into audit_logs (merchant_id, actor, action, target)
  values (v_payment.merchant_id, p_actor, coalesce(p_audit_action, 'payment.' || lower(p_final_status)), v_payment.id);

  v_event_type := 'payment.' || lower(p_final_status);
  perform enqueue_domain_event(v_payment.merchant_id, v_event_type, 'payment', to_jsonb(v_payment));
  if v_payment.invoice_id is not null then
    perform enqueue_domain_event(v_payment.merchant_id, 'invoice.' || lower(p_final_status), 'invoice', to_jsonb(v_invoice));
  end if;

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'invoice', case when v_payment.invoice_id is not null then to_jsonb(v_invoice) else null end
  );
end;
$$;

revoke all on function transition_payment_state(text, text, text, numeric, integer) from public, anon, authenticated;
revoke all on function settle_payment(text, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function enqueue_domain_event(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function claim_domain_event_outbox(integer) from public, anon, authenticated;
grant execute on function transition_payment_state(text, text, text, numeric, integer) to service_role;
grant execute on function settle_payment(text, text, text, integer, text, text) to service_role;
grant execute on function claim_domain_event_outbox(integer) to service_role;

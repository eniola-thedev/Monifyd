create table api_rate_limits (
  api_key_id uuid not null references api_keys(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  request_count int not null default 0,
  primary key (api_key_id, bucket, window_start)
);
alter table api_rate_limits enable row level security;
create index api_rate_limits_window on api_rate_limits (window_start);

create function consume_api_rate_limit(p_api_key_id uuid, p_bucket text, p_limit int)
returns table(allowed boolean, remaining int, retry_after int)
language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_count int;
begin
  insert into api_rate_limits(api_key_id, bucket, window_start, request_count)
  values (p_api_key_id, p_bucket, v_window, 1)
  on conflict (api_key_id, bucket, window_start)
  do update set request_count = api_rate_limits.request_count + 1
  returning request_count into v_count;
  return query select v_count <= p_limit, greatest(0, p_limit - v_count),
    greatest(1, ceil(extract(epoch from (v_window + interval '1 minute' - now())))::int);
end $$;

create table api_idempotency (
  merchant_id uuid not null references profiles(id) on delete cascade,
  key text not null,
  endpoint text not null,
  request_hash text not null,
  state text not null default 'PENDING' check (state in ('PENDING', 'COMPLETE')),
  response jsonb,
  response_status int,
  created_at timestamptz not null default now(),
  primary key (merchant_id, key, endpoint)
);
alter table api_idempotency enable row level security;

create function create_invoice_idempotent(p_merchant_id uuid, p_mode boolean, p_key text, p_hash text, p_invoice jsonb, p_app_url text)
returns table(result text, response jsonb, status int)
language plpgsql security definer set search_path = public as $$
declare
  v_idem api_idempotency%rowtype;
  v_invoice jsonb;
  v_response jsonb;
  v_created boolean;
begin
  insert into api_idempotency(merchant_id, key, endpoint, request_hash)
    values (p_merchant_id, p_key, 'POST /v1/invoices', p_hash)
    on conflict (merchant_id, key, endpoint) do nothing;
  v_created := found;
  if not v_created then
    select * into v_idem from api_idempotency
      where merchant_id = p_merchant_id and key = p_key and endpoint = 'POST /v1/invoices'
      for update;
    if v_idem.request_hash <> p_hash then return query select 'CONFLICT'::text, null::jsonb, null::int; return; end if;
    if v_idem.state = 'COMPLETE' then return query select 'REPLAY'::text, v_idem.response, v_idem.response_status; return; end if;
    if v_idem.created_at >= now() - interval '5 minutes' then return query select 'PENDING'::text, null::jsonb, null::int; return; end if;
    update api_idempotency set created_at = now()
      where merchant_id = p_merchant_id and key = p_key and endpoint = 'POST /v1/invoices';
  end if;

  insert into invoices (
    id, merchant_id, livemode, amount_cents, currency, customer_email, customer_name,
    title, description, notes, due_date, accepted_payments, success_url, cancel_url, metadata
  ) values (
    p_invoice->>'id', p_merchant_id, p_mode, (p_invoice->>'amount_cents')::bigint,
    p_invoice->>'currency', p_invoice->>'customer_email', p_invoice->>'customer_name',
    p_invoice->>'title', p_invoice->>'description', p_invoice->>'notes',
    nullif(p_invoice->>'due_date', '')::date, p_invoice->'accepted_payments',
    p_invoice->>'success_url', p_invoice->>'cancel_url', coalesce(p_invoice->'metadata', '{}'::jsonb)
  ) returning to_jsonb(invoices) into v_invoice;
  v_response := v_invoice || jsonb_build_object('checkout_url', p_app_url || '/pay/' || (p_invoice->>'id'));
  update api_idempotency set state = 'COMPLETE', response = v_response, response_status = 201
    where merchant_id = p_merchant_id and key = p_key and endpoint = 'POST /v1/invoices';
  return query select 'CREATED'::text, v_response, 201;
end $$;

create function create_payment_link_idempotent(p_merchant_id uuid, p_mode boolean, p_key text, p_hash text, p_link jsonb, p_app_url text)
returns table(result text, response jsonb, status int)
language plpgsql security definer set search_path = public as $$
declare
  v_idem api_idempotency%rowtype;
  v_response jsonb;
  v_created boolean;
begin
  insert into api_idempotency(merchant_id, key, endpoint, request_hash)
    values (p_merchant_id, p_key, 'POST /v1/payment-links', p_hash)
    on conflict (merchant_id, key, endpoint) do nothing;
  v_created := found;
  if not v_created then
    select * into v_idem from api_idempotency
      where merchant_id = p_merchant_id and key = p_key and endpoint = 'POST /v1/payment-links'
      for update;
    if v_idem.request_hash <> p_hash then return query select 'CONFLICT'::text, null::jsonb, null::int; return; end if;
    if v_idem.state = 'COMPLETE' then return query select 'REPLAY'::text, v_idem.response, v_idem.response_status; return; end if;
    if v_idem.created_at >= now() - interval '5 minutes' then return query select 'PENDING'::text, null::jsonb, null::int; return; end if;
    update api_idempotency set created_at = now()
      where merchant_id = p_merchant_id and key = p_key and endpoint = 'POST /v1/payment-links';
  end if;

  insert into payment_links (
    id, merchant_id, livemode, amount_cents, currency, description, reference, accepted_payments,
    expires_at, success_url, cancel_url, metadata
  ) values (
    p_link->>'id', p_merchant_id, p_mode, (p_link->>'amount_cents')::bigint,
    p_link->>'currency', p_link->>'description', p_link->>'reference', p_link->'accepted_payments',
    nullif(p_link->>'expires_at', '')::timestamptz, p_link->>'success_url', p_link->>'cancel_url',
    coalesce(p_link->'metadata', '{}'::jsonb)
  );
  v_response := jsonb_build_object(
    'id', p_link->>'id', 'status', 'ACTIVE',
    'checkout_url', p_app_url || '/pay/' || (p_link->>'id')
  );
  update api_idempotency set state = 'COMPLETE', response = v_response, response_status = 201
    where merchant_id = p_merchant_id and key = p_key and endpoint = 'POST /v1/payment-links';
  return query select 'CREATED'::text, v_response, 201;
end $$;

create table operational_events (
  id bigserial primary key,
  source text not null,
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  message text not null,
  details jsonb not null default '{}',
  fingerprint text,
  occurrences int not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table operational_events enable row level security;
create unique index operational_events_active_fingerprint
  on operational_events (fingerprint) where resolved_at is null and fingerprint is not null;
create index operational_events_recent on operational_events (last_seen_at desc);

create function record_operational_event(p_source text, p_severity text, p_message text, p_details jsonb, p_fingerprint text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  insert into operational_events(source, severity, message, details, fingerprint)
    values (p_source, p_severity, p_message, coalesce(p_details, '{}'::jsonb), p_fingerprint)
    on conflict (fingerprint) where resolved_at is null and fingerprint is not null
    do update set occurrences = operational_events.occurrences + 1,
      last_seen_at = now(), severity = excluded.severity, message = excluded.message, details = excluded.details
    returning id into v_id;
  return v_id;
end $$;

create function cleanup_api_state()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from api_rate_limits where window_start < now() - interval '1 hour';
  delete from api_idempotency where created_at < now() - interval '30 days';
end $$;

create or replace function get_merchant_fee_summary()
returns table(month date, currency text, payment_count bigint, merchant_cents numeric, customer_fee_cents numeric)
language sql stable security invoker set search_path = public as $$
  select date_trunc('month', f.created_at)::date, p.currency, count(*),
    sum(f.merchant_cents), sum(f.total_fee_cents)
  from platform_fees f
  join payments p on p.id = f.payment_id
  where p.merchant_id = auth.uid()
  group by date_trunc('month', f.created_at)::date, p.currency
  order by date_trunc('month', f.created_at)::date desc, p.currency
$$;

create function get_admin_fee_summary()
returns table(month date, currency text, payment_count bigint, merchant_cents numeric, customer_fee_cents numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc('month', f.created_at)::date, p.currency, count(*),
    sum(f.merchant_cents), sum(f.total_fee_cents)
  from platform_fees f
  join payments p on p.id = f.payment_id
  group by date_trunc('month', f.created_at)::date, p.currency
  order by date_trunc('month', f.created_at)::date desc, p.currency
$$;

revoke all on function consume_api_rate_limit(uuid, text, int) from public, anon, authenticated;
revoke all on function create_invoice_idempotent(uuid, boolean, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function create_payment_link_idempotent(uuid, boolean, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function record_operational_event(text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function cleanup_api_state() from public, anon, authenticated;
revoke all on function get_admin_fee_summary() from public, anon, authenticated;
grant execute on function consume_api_rate_limit(uuid, text, int) to service_role;
grant execute on function create_invoice_idempotent(uuid, boolean, text, text, jsonb, text) to service_role;
grant execute on function create_payment_link_idempotent(uuid, boolean, text, text, jsonb, text) to service_role;
grant execute on function record_operational_event(text, text, text, jsonb, text) to service_role;
grant execute on function cleanup_api_state() to service_role;
grant execute on function get_admin_fee_summary() to service_role;
grant execute on function get_merchant_fee_summary() to authenticated;

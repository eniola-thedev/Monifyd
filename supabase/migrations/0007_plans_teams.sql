create table merchant_subscriptions (
  merchant_id uuid primary key references profiles(id) on delete cascade,
  plan text not null default 'FREE' check (plan in ('FREE', 'PRO', 'BUSINESS')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAST_DUE', 'CANCELLED')),
  billing_interval text check (billing_interval in ('monthly', 'annually')),
  billing_country text,
  billing_currency text check (billing_currency in ('NGN', 'USD')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  paystack_customer_code text,
  paystack_customer_id bigint,
  paystack_subscription_code text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((plan = 'FREE') or (billing_interval is not null and billing_country is not null and billing_currency is not null))
);

create table billing_checkout_attempts (
  reference text primary key,
  merchant_id uuid not null references profiles(id) on delete cascade,
  plan text not null check (plan in ('PRO', 'BUSINESS')),
  billing_interval text not null check (billing_interval in ('monthly', 'annually')),
  billing_country text not null,
  billing_currency text not null check (billing_currency in ('NGN', 'USD')),
  paystack_plan_code text not null,
  amount_minor bigint not null check (amount_minor > 0),
  customer_email text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SUCCEEDED', 'FAILED')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index billing_checkout_pending on billing_checkout_attempts (customer_email, created_at desc) where status = 'PENDING';
create unique index billing_one_pending_checkout_per_merchant on billing_checkout_attempts (merchant_id) where status = 'PENDING';

create table billing_provider_private (
  merchant_id uuid primary key references merchant_subscriptions(merchant_id) on delete cascade,
  paystack_email_token text,
  updated_at timestamptz not null default now()
);
alter table billing_provider_private enable row level security;

create table billing_checkout_private (
  reference text primary key references billing_checkout_attempts(reference) on delete cascade,
  paystack_customer_code text,
  paystack_customer_id bigint,
  paystack_subscription_code text,
  paystack_email_token text,
  updated_at timestamptz not null default now()
);
alter table billing_checkout_private enable row level security;

create table paystack_processed_events (
  event_key text primary key,
  created_at timestamptz not null default now()
);
alter table paystack_processed_events enable row level security;

create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  member_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('ADMIN', 'VIEWER')),
  status text not null default 'INVITED' check (status in ('INVITED', 'ACTIVE', 'REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, email),
  unique (member_id)
);
create index team_memberships_owner on team_memberships (merchant_id, status);

create table team_invitations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  email text not null,
  role text not null check (role in ('ADMIN', 'VIEWER')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (merchant_id, email)
);
create index team_invitations_expiry on team_invitations (expires_at) where accepted_at is null;

create function create_team_invitation(
  p_merchant_id uuid, p_email text, p_role text, p_token_hash text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_seats int;
begin
  if p_role not in ('ADMIN', 'VIEWER') or length(trim(p_email)) > 320
    or trim(p_email) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email and team role.';
  end if;
  perform 1 from profiles where id = p_merchant_id for update;
  if not found then raise exception 'Workspace not found.'; end if;
  if not exists (
    select 1 from merchant_subscriptions s
    where s.merchant_id = p_merchant_id and s.plan = 'BUSINESS'
      and (s.status = 'ACTIVE' or (s.status = 'PAST_DUE' and s.current_period_end > now()))
  ) then raise exception 'Business plan is required to invite team members.'; end if;
  if exists (
    select 1 from team_memberships m
    where m.merchant_id = p_merchant_id and lower(m.email) = lower(trim(p_email)) and m.status = 'ACTIVE'
  ) then raise exception 'That email is already a team member.'; end if;

  select count(*) into v_seats
  from (
    select m.id from team_memberships m
    where m.merchant_id = p_merchant_id and m.status = 'ACTIVE'
    union all
    select i.id from team_invitations i
    where i.merchant_id = p_merchant_id and i.accepted_at is null and i.expires_at > now()
      and lower(i.email) <> lower(trim(p_email))
  ) seats;
  if v_seats >= 4 then raise exception 'Business includes up to five total seats, including the owner.'; end if;

  insert into team_invitations (merchant_id, email, role, token_hash, expires_at, accepted_at)
  values (p_merchant_id, lower(trim(p_email)), p_role, p_token_hash, now() + interval '7 days', null)
  on conflict (merchant_id, email) do update set
    role = excluded.role, token_hash = excluded.token_hash,
    expires_at = excluded.expires_at, accepted_at = null, created_at = now()
  returning id into v_id;
  return v_id;
end $$;

create function accept_team_invitation(
  p_email text, p_token_hash text, p_member_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invitation team_invitations%rowtype;
begin
  select * into v_invitation from team_invitations
  where token_hash = p_token_hash and accepted_at is null and expires_at > now()
  for update;
  if not found then raise exception 'This team invitation has expired or was already used.'; end if;
  if lower(v_invitation.email) <> lower(trim(p_email)) then
    raise exception 'Sign in with the email address that received this invitation.';
  end if;
  if not exists (
    select 1 from merchant_subscriptions s
    where s.merchant_id = v_invitation.merchant_id and s.plan = 'BUSINESS'
      and (s.status = 'ACTIVE' or (s.status = 'PAST_DUE' and s.current_period_end > now()))
  ) then raise exception 'The workspace no longer has an active Business plan.'; end if;

  insert into team_memberships (merchant_id, member_id, email, role, status)
  values (v_invitation.merchant_id, p_member_id, lower(trim(p_email)), v_invitation.role, 'ACTIVE')
  on conflict (merchant_id, email) do update set
    member_id = excluded.member_id, role = excluded.role, status = 'ACTIVE', updated_at = now();
  update team_invitations set accepted_at = now() where id = v_invitation.id;
  return v_invitation.merchant_id;
end $$;

create function claim_paystack_event(p_event_key text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into paystack_processed_events (event_key) values (p_event_key)
  on conflict (event_key) do nothing;
  return found;
end $$;

create or replace function workspace_role(p_merchant_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() = p_merchant_id then 'OWNER'
    when exists (
      select 1 from team_memberships m
      join merchant_subscriptions s on s.merchant_id = m.merchant_id
      where m.merchant_id = p_merchant_id and m.member_id = auth.uid()
        and m.status = 'ACTIVE' and s.plan = 'BUSINESS'
        and (s.status = 'ACTIVE' or (s.status = 'PAST_DUE' and s.current_period_end > now()))
        and (s.current_period_end is null or s.current_period_end > now())
    ) then (
      select m.role from team_memberships m
      join merchant_subscriptions s on s.merchant_id = m.merchant_id
      where m.merchant_id = p_merchant_id and m.member_id = auth.uid()
        and m.status = 'ACTIVE' and s.plan = 'BUSINESS'
        and (s.status = 'ACTIVE' or (s.status = 'PAST_DUE' and s.current_period_end > now()))
        and (s.current_period_end is null or s.current_period_end > now())
      limit 1
    )
    else null
  end
$$;

create or replace function workspace_can_write(p_merchant_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(workspace_role(p_merchant_id) in ('OWNER', 'ADMIN'), false)
$$;

alter table merchant_subscriptions enable row level security;
alter table billing_checkout_attempts enable row level security;
alter table team_memberships enable row level security;
alter table team_invitations enable row level security;

create policy read_merchant_subscription on merchant_subscriptions
  for select using (workspace_role(merchant_id) = 'OWNER');
create policy read_billing_attempts on billing_checkout_attempts
  for select using (workspace_role(merchant_id) = 'OWNER');
create policy read_team_memberships on team_memberships
  for select using (
    workspace_role(merchant_id) in ('OWNER', 'ADMIN')
    or member_id = auth.uid()
  );
create policy read_team_invitations on team_invitations
  for select using (workspace_role(merchant_id) in ('OWNER', 'ADMIN'));

drop policy if exists own_profile on profiles;
create policy workspace_read_profiles on profiles for select using (workspace_role(id) is not null);
create policy workspace_update_profiles on profiles for update
  using (workspace_can_write(id)) with check (workspace_can_write(id));

drop policy if exists own_wallets on wallets;
create policy workspace_wallets_read on wallets for select using (workspace_role(merchant_id) is not null);
create policy workspace_wallets_write on wallets for all using (workspace_can_write(merchant_id)) with check (workspace_can_write(merchant_id));

drop policy if exists own_links on payment_links;
create policy workspace_links_read on payment_links for select using (workspace_role(merchant_id) is not null);
create policy workspace_links_write on payment_links for all using (workspace_can_write(merchant_id)) with check (workspace_can_write(merchant_id));

drop policy if exists own_invoices on invoices;
create policy workspace_invoices_read on invoices for select using (workspace_role(merchant_id) is not null);
create policy workspace_invoices_write on invoices for all using (workspace_can_write(merchant_id)) with check (workspace_can_write(merchant_id));

drop policy if exists own_endpoints on webhook_endpoints;
create policy workspace_endpoints_read on webhook_endpoints for select using (workspace_role(merchant_id) is not null);
create policy workspace_endpoints_write on webhook_endpoints for all using (workspace_can_write(merchant_id)) with check (workspace_can_write(merchant_id));

drop policy if exists own_payments on payments;
create policy workspace_payments_read on payments for select using (workspace_role(merchant_id) is not null);

drop policy if exists own_fees on platform_fees;
create policy workspace_fees_read on platform_fees for select
  using (exists (select 1 from payments p where p.id = payment_id and workspace_role(p.merchant_id) is not null));

drop policy if exists own_keys on api_keys;
create policy workspace_keys_read on api_keys for select using (workspace_role(merchant_id) is not null);

drop policy if exists own_notifications on notifications;
create policy workspace_notifications_read on notifications for select using (workspace_role(merchant_id) is not null);
create policy workspace_notifications_update on notifications for update
  using (workspace_role(merchant_id) is not null) with check (workspace_role(merchant_id) is not null);

drop policy if exists own_audit on audit_logs;
create policy workspace_audit_read on audit_logs for select
  using (merchant_id is not null and workspace_role(merchant_id) is not null);

drop policy if exists own_txs on payment_transactions;
create policy workspace_txs_read on payment_transactions for select
  using (exists (select 1 from payments p where p.id = payment_id and workspace_role(p.merchant_id) is not null));

drop policy if exists own_status_log on payment_status_log;
create policy workspace_status_log_read on payment_status_log for select
  using (exists (select 1 from payments p where p.id = payment_id and workspace_role(p.merchant_id) is not null));

drop policy if exists own_deliveries on webhook_deliveries;
create policy workspace_deliveries_read on webhook_deliveries for select
  using (exists (
    select 1 from webhook_endpoints e
    where e.id = endpoint_id and workspace_role(e.merchant_id) is not null
  ));

drop policy if exists own_refunds on refunds;
create policy workspace_refunds_read on refunds for select using (workspace_role(merchant_id) is not null);
drop policy if exists own_refund_customer_updates on refund_customer_updates;
create policy workspace_refund_updates_read on refund_customer_updates for select
  using (exists (select 1 from refunds r where r.id = refund_id and workspace_role(r.merchant_id) is not null));

drop policy if exists own_unmatched on unmatched_transfers;
create policy workspace_unmatched_read on unmatched_transfers for select using (workspace_role(merchant_id) is not null);

create function get_workspace_fee_summary()
returns table(month date, currency text, payment_count bigint, merchant_cents numeric, customer_fee_cents numeric)
language sql stable security invoker set search_path = public as $$
  select date_trunc('month', f.created_at)::date, p.currency, count(*),
    sum(f.merchant_cents), sum(f.total_fee_cents)
  from platform_fees f
  join payments p on p.id = f.payment_id
  where workspace_role(p.merchant_id) is not null
  group by date_trunc('month', f.created_at)::date, p.currency
  order by date_trunc('month', f.created_at)::date desc, p.currency
$$;

create function get_workspace_fee_details(p_start date, p_end date)
returns table(payment_id text, created_at timestamptz, status payment_status, currency text,
  merchant_cents bigint, customer_fee_cents bigint, asset text, network text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.created_at, p.status, p.currency, f.merchant_cents, f.total_fee_cents, f.asset, f.network
  from platform_fees f
  join payments p on p.id = f.payment_id
  where workspace_role(p.merchant_id) is not null
    and (p_start is null or f.created_at >= p_start::timestamptz)
    and (p_end is null or f.created_at < (p_end + 1)::timestamptz)
  order by f.created_at desc
  limit 5000
$$;

create function get_workspace_fee_range_summary(p_start date, p_end date)
returns table(currency text, payment_count bigint, merchant_cents numeric, customer_fee_cents numeric)
language sql stable security invoker set search_path = public as $$
  select p.currency, count(*), sum(f.merchant_cents), sum(f.total_fee_cents)
  from platform_fees f
  join payments p on p.id = f.payment_id
  where workspace_role(p.merchant_id) is not null
    and (p_start is null or f.created_at >= p_start::timestamptz)
    and (p_end is null or f.created_at < (p_end + 1)::timestamptz)
  group by p.currency
  order by p.currency
$$;

revoke all on function workspace_role(uuid) from public, anon;
revoke all on function workspace_can_write(uuid) from public, anon;
revoke all on function get_workspace_fee_summary() from public, anon;
revoke all on function get_workspace_fee_details(date, date) from public, anon;
revoke all on function get_workspace_fee_range_summary(date, date) from public, anon;
revoke all on function create_team_invitation(uuid, text, text, text) from public, anon, authenticated;
revoke all on function accept_team_invitation(text, text, uuid) from public, anon, authenticated;
revoke all on function claim_paystack_event(text) from public, anon, authenticated;
grant execute on function workspace_role(uuid) to authenticated, service_role;
grant execute on function workspace_can_write(uuid) to authenticated, service_role;
grant execute on function get_workspace_fee_summary() to authenticated, service_role;
grant execute on function get_workspace_fee_details(date, date) to authenticated, service_role;
grant execute on function get_workspace_fee_range_summary(date, date) to authenticated, service_role;
grant execute on function create_team_invitation(uuid, text, text, text) to service_role;
grant execute on function accept_team_invitation(text, text, uuid) to service_role;
grant execute on function claim_paystack_event(text) to service_role;

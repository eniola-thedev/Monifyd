-- Give account owners and team members a seven-day window to cancel permanent deletion.
create table account_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '7 days'),
  claimed_until timestamptz,
  check (scheduled_for > requested_at)
);
create index account_deletions_due on account_deletions (scheduled_for);
alter table account_deletions enable row level security;
revoke all on table account_deletions from public, anon, authenticated;

-- A database claim makes cancellation and the irreversible auth deletion mutually exclusive.
create function claim_due_account_deletions(p_limit integer default 25)
returns table(user_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'Invalid deletion batch size.'; end if;
  return query
  with due as (
    select d.user_id
    from account_deletions d
    where d.scheduled_for <= now()
      and (d.claimed_until is null or d.claimed_until <= now())
    order by d.scheduled_for
    for update skip locked
    limit p_limit
  )
  update account_deletions d
  set claimed_until = now() + interval '5 minutes'
  from due
  where d.user_id = due.user_id
  returning d.user_id;
end;
$$;

create function cancel_account_deletion()
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  delete from account_deletions d
  where d.user_id = auth.uid()
    and (d.claimed_until is null or d.claimed_until <= now());
  return found;
end;
$$;
revoke all on function claim_due_account_deletions(integer) from public, anon, authenticated;
grant execute on function claim_due_account_deletions(integer) to service_role;
revoke all on function cancel_account_deletion() from public, anon;
grant execute on function cancel_account_deletion() to authenticated;

-- Keep workspace RLS closed while an owner or member has a deletion pending.
create or replace function workspace_role(p_merchant_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from account_deletions d where d.user_id = auth.uid()) then null
    when exists (select 1 from account_deletions d where d.user_id = p_merchant_id) then null
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

-- Remove payment-owned rows when an account's auth user is permanently deleted.
alter table payment_transactions drop constraint payment_transactions_payment_id_fkey;
alter table payment_transactions add constraint payment_transactions_payment_id_fkey
  foreign key (payment_id) references payments(id) on delete cascade;
alter table payment_status_log drop constraint payment_status_log_payment_id_fkey;
alter table payment_status_log add constraint payment_status_log_payment_id_fkey
  foreign key (payment_id) references payments(id) on delete cascade;
alter table platform_fees drop constraint platform_fees_payment_id_fkey;
alter table platform_fees add constraint platform_fees_payment_id_fkey
  foreign key (payment_id) references payments(id) on delete cascade;
alter table unmatched_transfers drop constraint unmatched_transfers_assigned_payment_id_fkey;
alter table unmatched_transfers add constraint unmatched_transfers_assigned_payment_id_fkey
  foreign key (assigned_payment_id) references payments(id) on delete set null;

-- Workspace audit rows are removed with an owner's data; actions by deleted team users are anonymized.
create function cleanup_deleted_auth_user_audit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from audit_logs where merchant_id = old.id;
  update audit_logs
  set actor = case when actor = old.id::text then 'deleted-account' else actor end,
      target = case when target = old.id::text then null else target end
  where actor = old.id::text or target = old.id::text;
  return old;
end;
$$;
create trigger cleanup_deleted_auth_user_audit_trigger
before delete on auth.users
for each row execute function cleanup_deleted_auth_user_audit();

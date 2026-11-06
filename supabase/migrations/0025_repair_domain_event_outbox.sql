create table if not exists public.domain_event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  merchant_id uuid not null references public.profiles(id) on delete cascade,
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

create index if not exists domain_event_outbox_due
  on public.domain_event_outbox(next_attempt_at)
  where dispatched_at is null;

alter table public.domain_event_outbox enable row level security;
revoke all on table public.domain_event_outbox from public, anon, authenticated;
grant all on table public.domain_event_outbox to service_role;

create or replace function public.enqueue_domain_event(
  p_merchant_id uuid,
  p_event_type text,
  p_data_type text,
  p_event_data jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_event_id text := 'evt_' || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.domain_event_outbox (event_id, merchant_id, event_type, data_type, event_data)
  values (v_event_id, p_merchant_id, p_event_type, p_data_type, p_event_data);
  return v_event_id;
end;
$$;

create or replace function public.claim_domain_event_outbox(p_limit integer default 25)
returns setof public.domain_event_outbox
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select id from public.domain_event_outbox
    where dispatched_at is null and next_attempt_at <= now()
      and (claimed_until is null or claimed_until <= now())
    order by next_attempt_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update public.domain_event_outbox e
  set claimed_until = now() + interval '2 minutes', attempts = attempts + 1
  from due
  where e.id = due.id
  returning e.*;
end;
$$;

revoke all on function public.enqueue_domain_event(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_domain_event_outbox(integer) from public, anon, authenticated;
grant execute on function public.enqueue_domain_event(uuid, text, text, jsonb) to service_role;
grant execute on function public.claim_domain_event_outbox(integer) to service_role;

notify pgrst, 'reload schema';

create table public.login_security_limits (
  bucket text not null check (bucket in ('ip', 'email')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (bucket, key_hash)
);

alter table public.login_security_limits enable row level security;
revoke all on table public.login_security_limits from public, anon, authenticated;
grant all on table public.login_security_limits to service_role;
create index login_security_limits_updated_at on public.login_security_limits (updated_at);

create function public.consume_login_ip_limit(p_key_hash text, p_limit integer, p_window_seconds integer)
returns table(allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_window_start timestamptz;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
    or p_limit is null or p_limit < 1
    or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'Invalid login IP rate limit parameters';
  end if;

  insert into public.login_security_limits as stored (bucket, key_hash, window_started_at, attempt_count, updated_at)
  values ('ip', p_key_hash, now(), 1, now())
  on conflict (bucket, key_hash) do update
  set window_started_at = case
        when stored.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
        else stored.window_started_at
      end,
      attempt_count = case
        when stored.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
        else stored.attempt_count + 1
      end,
      updated_at = now()
  returning attempt_count, window_started_at into v_count, v_window_start;

  return query select
    v_count <= p_limit,
    case when v_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (
        v_window_start + make_interval(secs => p_window_seconds) - now()
      )))::integer)
    end;
end
$$;

create function public.check_login_account_lock(p_key_hash text)
returns table(locked boolean, retry_after integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locked_until timestamptz;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid login account key';
  end if;

  select limits.locked_until into v_locked_until
  from public.login_security_limits as limits
  where limits.bucket = 'email' and limits.key_hash = p_key_hash;

  return query select
    coalesce(v_locked_until > now(), false),
    case when v_locked_until > now()
      then greatest(1, ceil(extract(epoch from (v_locked_until - now())))::integer)
      else 0
    end;
end
$$;

create function public.record_login_failure(
  p_key_hash text,
  p_failure_limit integer,
  p_window_seconds integer,
  p_lock_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$'
    or p_failure_limit is null or p_failure_limit < 1
    or p_window_seconds is null or p_window_seconds < 1
    or p_lock_seconds is null or p_lock_seconds < 1 then
    raise exception 'Invalid login account lock parameters';
  end if;

  insert into public.login_security_limits as stored (
    bucket, key_hash, window_started_at, attempt_count, locked_until, updated_at
  )
  values (
    'email', p_key_hash, now(), 1,
    case when p_failure_limit <= 1 then now() + make_interval(secs => p_lock_seconds) else null end,
    now()
  )
  on conflict (bucket, key_hash) do update
  set window_started_at = case
        when stored.locked_until <= now()
          or stored.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then now()
        else stored.window_started_at
      end,
      attempt_count = case
        when stored.locked_until <= now()
          or stored.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then 1
        when stored.locked_until > now() then stored.attempt_count
        else stored.attempt_count + 1
      end,
      locked_until = case
        when stored.locked_until > now() then stored.locked_until
        when stored.locked_until <= now()
          or stored.window_started_at <= now() - make_interval(secs => p_window_seconds)
          then case when p_failure_limit <= 1 then now() + make_interval(secs => p_lock_seconds) else null end
        when stored.attempt_count + 1 >= p_failure_limit then now() + make_interval(secs => p_lock_seconds)
        else null
      end,
      updated_at = now();
end
$$;

create function public.clear_login_failures(p_key_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid login account key';
  end if;

  delete from public.login_security_limits
  where bucket = 'email' and key_hash = p_key_hash;
end
$$;

create or replace function public.cleanup_api_state()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.api_rate_limits where window_start < now() - interval '1 hour';
  delete from public.api_idempotency where created_at < now() - interval '30 days';
  delete from public.login_security_limits where updated_at < now() - interval '1 hour';
end
$$;

revoke all on function public.consume_login_ip_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.check_login_account_lock(text) from public, anon, authenticated;
revoke all on function public.record_login_failure(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_login_failures(text) from public, anon, authenticated;
revoke all on function public.cleanup_api_state() from public, anon, authenticated;
grant execute on function public.consume_login_ip_limit(text, integer, integer) to service_role;
grant execute on function public.check_login_account_lock(text) to service_role;
grant execute on function public.record_login_failure(text, integer, integer, integer) to service_role;
grant execute on function public.clear_login_failures(text) to service_role;
grant execute on function public.cleanup_api_state() to service_role;

create table chain_detection_health (
  singleton boolean primary key default true check (singleton),
  status text not null check (status in ('healthy', 'degraded')),
  last_run_at timestamptz not null default now(),
  last_success_at timestamptz,
  groups_scanned integer not null default 0 check (groups_scanned >= 0),
  error_count integer not null default 0 check (error_count >= 0)
);
alter table chain_detection_health enable row level security;
revoke all on table chain_detection_health from public, anon, authenticated;
grant all on table chain_detection_health to service_role;

create function record_chain_detection_health(p_status text, p_groups_scanned integer, p_error_count integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('healthy', 'degraded') or p_groups_scanned < 0 or p_error_count < 0 then
    raise exception 'Invalid chain detection health report.';
  end if;
  insert into chain_detection_health(singleton, status, last_run_at, last_success_at, groups_scanned, error_count)
  values (true, p_status, now(), case when p_status = 'healthy' then now() else null end, p_groups_scanned, p_error_count)
  on conflict (singleton) do update set
    status = excluded.status,
    last_run_at = excluded.last_run_at,
    last_success_at = coalesce(excluded.last_success_at, chain_detection_health.last_success_at),
    groups_scanned = excluded.groups_scanned,
    error_count = excluded.error_count;
end;
$$;
revoke all on function record_chain_detection_health(text, integer, integer) from public, anon, authenticated;
grant execute on function record_chain_detection_health(text, integer, integer) to service_role;

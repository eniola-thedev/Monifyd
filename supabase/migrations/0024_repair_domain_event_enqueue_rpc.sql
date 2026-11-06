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

revoke all on function public.enqueue_domain_event(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_domain_event(uuid, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';

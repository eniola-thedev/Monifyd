create table public.invoice_reminder_unsubscribes (
  email text primary key check (email = lower(btrim(email)) and email <> ''),
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

alter table public.invoice_reminder_unsubscribes enable row level security;
revoke all on table public.invoice_reminder_unsubscribes from public, anon, authenticated;
grant select, update on table public.invoice_reminder_unsubscribes to service_role;

create function public.get_or_create_invoice_reminder_unsubscribe_token(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  unsubscribe_token uuid;
begin
  if normalized_email = '' then
    raise exception 'An email address is required.';
  end if;

  insert into public.invoice_reminder_unsubscribes (email)
  values (normalized_email)
  on conflict (email) do update
    set email = excluded.email
    where invoice_reminder_unsubscribes.unsubscribed_at is null
  returning token into unsubscribe_token;

  return unsubscribe_token;
end;
$$;

revoke all on function public.get_or_create_invoice_reminder_unsubscribe_token(text) from public, anon, authenticated;
grant execute on function public.get_or_create_invoice_reminder_unsubscribe_token(text) to service_role;

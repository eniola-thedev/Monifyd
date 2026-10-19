alter table profiles
  add column role text not null default 'merchant'
  check (role in ('merchant', 'admin'));

create function prevent_profile_role_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if (
    (tg_op = 'INSERT' and (new.role <> 'merchant' or new.suspended_at is not null))
    or (tg_op = 'UPDATE' and (new.role is distinct from old.role or new.suspended_at is distinct from old.suspended_at))
  ) and coalesce(auth.role(), '') <> 'service_role'
    and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Profile access controls can only be changed by an administrator.';
  end if;
  return new;
end $$;

create trigger protect_profile_role
before insert or update of role, suspended_at on profiles
for each row execute function prevent_profile_role_change();

create table invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null references invoices(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('three_days_before', 'due_today')),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempt int not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (invoice_id, reminder_type)
);
alter table invoice_reminders enable row level security;
create index invoice_reminders_due on invoice_reminders (next_attempt_at) where status = 'PENDING';

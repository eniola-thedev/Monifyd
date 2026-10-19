alter table invoices
  add column design jsonb not null default '{}'::jsonb,
  add column line_items jsonb not null default '[]'::jsonb;

alter table profiles
  add column invoice_design jsonb not null default '{}'::jsonb,
  add column invoice_design_presets jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-logos', 'invoice-logos', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 524288,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create policy "Invoice logos are public" on storage.objects for select
  using (bucket_id = 'invoice-logos');

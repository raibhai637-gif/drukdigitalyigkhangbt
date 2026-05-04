
-- Public template bucket
insert into storage.buckets (id, name, public) values ('template-pdfs', 'template-pdfs', true)
on conflict (id) do nothing;

create policy "template_pdfs_public_read"
on storage.objects for select
using (bucket_id = 'template-pdfs');

create policy "template_pdfs_admin_write"
on storage.objects for insert
with check (bucket_id = 'template-pdfs' and public.has_role(auth.uid(), 'admin'));

create policy "template_pdfs_admin_update"
on storage.objects for update
using (bucket_id = 'template-pdfs' and public.has_role(auth.uid(), 'admin'));

create policy "template_pdfs_admin_delete"
on storage.objects for delete
using (bucket_id = 'template-pdfs' and public.has_role(auth.uid(), 'admin'));

-- App settings
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

create policy "app_settings_read_all_auth"
on public.app_settings for select to authenticated
using (true);

create policy "app_settings_admin_write"
on public.app_settings for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

insert into public.app_settings (key, value) values
  ('usdt_trc20_wallet', 'TW3JxnjjZvkMHD1nCj6wjwxCjcDTh8SD9R'),
  ('admin_email', 'soyongbibek@gmail.com')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Templates extra columns
alter table public.templates add column if not exists category text;
alter table public.templates add column if not exists source_url text;

-- Allow public templates to be created with no user_id (system seeds)
alter table public.templates alter column user_id drop not null;

-- Public templates can be read by ANY authenticated user (already exists)
-- Add anon read for browse-before-login
create policy "templates_public_read_anon"
on public.templates for select to anon
using (is_public = true);

-- Promote to admin helper (idempotent)
create or replace function public.promote_to_admin_by_email(_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = _email limit 1;
  if uid is null then return; end if;
  insert into public.user_roles (user_id, role) values (uid, 'admin')
  on conflict do nothing;
end;
$$;

select public.promote_to_admin_by_email('soyongbibek@gmail.com');

-- Auto-promote on signup if email matches admin_email
create or replace function public.auto_admin_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_em text;
begin
  select value into admin_em from public.app_settings where key = 'admin_email';
  if admin_em is not null and lower(new.email) = lower(admin_em) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_auto_admin on auth.users;
create trigger on_auth_user_auto_admin
after insert on auth.users
for each row execute function public.auto_admin_on_signup();

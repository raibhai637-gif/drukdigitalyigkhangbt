
-- signatures
create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  data_url text not null,
  created_at timestamptz not null default now()
);
alter table public.signatures enable row level security;
create policy "signatures_owner_all" on public.signatures for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- password reset requests
create type public.reset_status as enum ('pending','done','rejected');
create table public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  status reset_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
alter table public.password_reset_requests enable row level security;
create policy "prr_insert_own" on public.password_reset_requests for insert to authenticated
  with check (auth.uid() = user_id);
create policy "prr_select_own" on public.password_reset_requests for select to authenticated
  using (auth.uid() = user_id);
create policy "prr_admin_all" on public.password_reset_requests for all to authenticated
  using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));

-- profiles flag
alter table public.profiles add column if not exists must_change_password boolean not null default false;

-- payments screenshot
alter table public.payments add column if not exists screenshot_path text;

-- avatars bucket
insert into storage.buckets (id, name, public) values ('avatars','avatars',true)
  on conflict (id) do nothing;
create policy "avatars_public_read" on storage.objects for select using (bucket_id='avatars');
create policy "avatars_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_owner_update" on storage.objects for update to authenticated
  using (bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id='avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- payment-screenshots bucket (private)
insert into storage.buckets (id, name, public) values ('payment-screenshots','payment-screenshots',false)
  on conflict (id) do nothing;
create policy "psh_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id='payment-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "psh_owner_read" on storage.objects for select to authenticated
  using (bucket_id='payment-screenshots' and (auth.uid()::text = (storage.foldername(name))[1] or has_role(auth.uid(),'admin')));

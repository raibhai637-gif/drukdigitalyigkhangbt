
-- =========================================================
-- ENUMS
-- =========================================================
create type public.app_role as enum ('admin', 'user');
create type public.payment_status as enum ('pending', 'confirmed', 'rejected');
create type public.ledger_kind as enum ('signup_bonus', 'purchase', 'spend', 'admin_adjust');

-- =========================================================
-- PROFILES
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- =========================================================
-- USER ROLES (separate table — security best practice)
-- =========================================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "user_roles_select_own" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);
create policy "user_roles_admin_all" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- CREDITS
-- =========================================================
create table public.credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.credits enable row level security;

create policy "credits_select_own" on public.credits
  for select to authenticated using (auth.uid() = user_id);
create policy "credits_admin_all" on public.credits
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- DOCUMENTS
-- =========================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  storage_path text not null,
  page_count integer,
  language text not null default 'en', -- 'en' | 'dz'
  overlays jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.documents enable row level security;

create policy "documents_owner_all" on public.documents
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index documents_user_id_idx on public.documents(user_id);

-- =========================================================
-- TEMPLATES
-- =========================================================
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  storage_path text not null,
  page_count integer,
  language text not null default 'en',
  overlays jsonb not null default '[]'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.templates enable row level security;

create policy "templates_owner_all" on public.templates
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "templates_public_read" on public.templates
  for select to authenticated using (is_public = true);

create index templates_user_id_idx on public.templates(user_id);

-- =========================================================
-- STAMPS (user uploaded)
-- =========================================================
create table public.stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);
alter table public.stamps enable row level security;

create policy "stamps_owner_all" on public.stamps
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================
-- PAYMENTS (USDT TRC20)
-- =========================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usdt numeric(12,2) not null,
  credits integer not null,
  tx_hash text,
  wallet_address text,
  status public.payment_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id)
);
alter table public.payments enable row level security;

create policy "payments_select_own" on public.payments
  for select to authenticated using (auth.uid() = user_id);
create policy "payments_insert_own" on public.payments
  for insert to authenticated with check (auth.uid() = user_id);
create policy "payments_update_own_pending" on public.payments
  for update to authenticated
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id);
create policy "payments_admin_all" on public.payments
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create index payments_status_idx on public.payments(status);
create index payments_user_id_idx on public.payments(user_id);

-- =========================================================
-- CREDIT LEDGER (audit trail)
-- =========================================================
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  kind public.ledger_kind not null,
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);
alter table public.credit_ledger enable row level security;

create policy "ledger_select_own" on public.credit_ledger
  for select to authenticated using (auth.uid() = user_id);
create policy "ledger_admin_all" on public.credit_ledger
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- TRIGGERS
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_documents_updated before update on public.documents
  for each row execute function public.set_updated_at();
create trigger trg_templates_updated before update on public.templates
  for each row execute function public.set_updated_at();
create trigger trg_credits_updated before update on public.credits
  for each row execute function public.set_updated_at();

-- New user setup: profile + 1 free credit + default 'user' role
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.credits (user_id, balance) values (new.id, 1);

  insert into public.credit_ledger (user_id, delta, kind, note)
  values (new.id, 1, 'signup_bonus', 'Welcome free credit');

  insert into public.user_roles (user_id, role) values (new.id, 'user');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- STORAGE BUCKETS
-- =========================================================
insert into storage.buckets (id, name, public) values
  ('pdfs', 'pdfs', false),
  ('stamps', 'stamps', false),
  ('signatures', 'signatures', false),
  ('exports', 'exports', false);

-- Storage policies: users can only access objects under their own user_id folder
create policy "pdfs_owner_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'pdfs' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'pdfs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "stamps_owner_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'stamps' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'stamps' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "signatures_owner_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'signatures' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'signatures' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "exports_owner_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'exports' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'exports' and auth.uid()::text = (storage.foldername(name))[1]);

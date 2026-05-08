
alter table public.password_reset_requests alter column user_id drop not null;
drop policy if exists "prr_insert_own" on public.password_reset_requests;
create policy "prr_insert_anyone" on public.password_reset_requests for insert to anon, authenticated with check (true);

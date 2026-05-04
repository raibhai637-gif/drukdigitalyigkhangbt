
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.auto_admin_on_signup() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.promote_to_admin_by_email(text) from public, anon, authenticated;

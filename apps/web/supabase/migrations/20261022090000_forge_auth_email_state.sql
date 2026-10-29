-- Sign-in hardening (PR #10): public pages no longer receive a user directory.
-- Register and checkout still need one answer for the single email a visitor typed: is there an
-- existing account that has not been confirmed yet? Supabase `signUp` "succeeds" for such an email
-- without changing its password, so without this check the page would report a new account whose
-- password never works. Only the service role (server actions) may call this.

create or replace function public.forge_auth_email_state(p_email text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when count(u.id) = 0 then 'none'
    when bool_or(u.email_confirmed_at is not null) then 'confirmed'
    else 'unconfirmed'
  end
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
    and u.deleted_at is null
    and coalesce(u.is_sso_user, false) = false
    and coalesce(u.is_anonymous, false) = false;
$$;

revoke all on function public.forge_auth_email_state(text) from public, anon, authenticated;
grant execute on function public.forge_auth_email_state(text) to service_role;

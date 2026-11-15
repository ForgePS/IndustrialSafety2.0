-- Portability phase 1: who a signed-in 1.0 (Cognito) user is in 2.0.
--
-- Inside 1.0, people sign in with Cognito and 2.0 never sees Supabase Auth. Each Cognito subject is
-- linked to one 2.0 user id here. The link is made the first time the person opens 2.0: an existing
-- 2.0 user with the same email is linked, otherwise a user row is created. The sign-in itself is
-- checked by the app before it calls this (apps/web/src/lib/platform/identity.ts).

create table if not exists public.forge_identity_links (
  provider text not null check (provider in ('cognito')),
  subject text not null check (length(subject) between 1 and 200),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (provider, subject),
  unique (provider, user_id)
);

alter table public.forge_identity_links enable row level security;

revoke all on public.forge_identity_links from public, anon, authenticated;
grant select, insert, update, delete on public.forge_identity_links to service_role;

-- Returns the 2.0 user id for a verified provider subject, linking or creating the user on first use.
-- An existing user is linked by email only when no other subject of the same provider holds it.
create or replace function public.forge_identity_link_user(
  p_provider text,
  p_subject text,
  p_email text,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_user_id uuid;
begin
  if p_provider is distinct from 'cognito' or coalesce(btrim(p_subject), '') = '' then
    raise exception 'A provider and subject are required.' using errcode = '22023';
  end if;

  -- A first page load sends several requests at once; link each subject once.
  perform pg_advisory_xact_lock(hashtextextended('forge_identity_link:' || p_provider || ':' || p_subject, 0));

  select l.user_id into v_user_id
  from public.forge_identity_links l
  where l.provider = p_provider and l.subject = p_subject;

  if v_user_id is not null then
    update public.forge_identity_links
    set last_seen_at = now(), email = coalesce(v_email, email)
    where provider = p_provider and subject = p_subject;

    return v_user_id;
  end if;

  if v_email is not null then
    select u.user_id into v_user_id
    from public.users u
    where lower(u.email) = v_email
      and not exists (
        select 1 from public.forge_identity_links l
        where l.provider = p_provider and l.user_id = u.user_id
      )
    order by u.id
    limit 1;
  end if;

  if v_user_id is null then
    if v_email is null then
      raise exception 'An email is required to create a user.' using errcode = '22023';
    end if;

    v_user_id := gen_random_uuid();

    -- Supabase Auth's table needs its token columns as empty strings; the Aurora stand-in has only
    -- the common columns. Both are written through the same name, which the translator maps.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = 'confirmation_token'
    ) then
      execute 'insert into auth.users (id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at,
                 confirmation_token, recovery_token, email_change_token_new, email_change)
               values ($1, ''authenticated'', ''authenticated'', $2, $3, now(), now(), now(), '''', '''', '''', '''')'
        using v_user_id, v_email, jsonb_build_object('name', v_name, 'email', v_email);
    else
      execute 'insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
               values ($1, $2, $3, now(), now(), now())'
        using v_user_id, v_email, jsonb_build_object('name', v_name, 'email', v_email);
    end if;

    -- The directory row; a trigger on auth.users may already have written it.
    insert into public.users (user_id, name, email)
    select v_user_id, v_name, v_email
    where not exists (select 1 from public.users u where u.user_id = v_user_id);
  end if;

  insert into public.forge_identity_links (provider, subject, user_id, email)
  values (p_provider, p_subject, v_user_id, v_email);

  return v_user_id;
end;
$$;

revoke all on function public.forge_identity_link_user(text, text, text, text) from public, anon, authenticated;
grant execute on function public.forge_identity_link_user(text, text, text, text) to service_role;

-- Workers' comp case forms: a tenant's own paper forms (employee injury guidelines acknowledgment, HIPAA
-- authorization), filled in and signed digitally, then printed or emailed exactly like the paper copy.
--
-- Templates are tenant documents: each company uploads its original PDF, kept in the private forge-wc-forms
-- bucket. A form only appears for tenants that uploaded that template. Signed forms never change. A correction
-- is a void (with a reason) plus a new form.
--
-- Access is enforced by the app with existing permissions:
--   templates                    workers_comp.configure
--   guidelines acknowledgment    view: workers_comp.view, fill/sign/void/email: workers_comp.edit
--   HIPAA authorization          view: workers_comp.medical.view, fill/sign/void/email: workers_comp.medical.manage
-- Every table and function here is service-role only. HIPAA forms are not stored as case evidence, because
-- evidence on a case is visible to anyone with workers' comp access.

create table if not exists public.forge_wc_form_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  form_key text not null check (form_key in ('injury_guidelines_ack', 'hipaa_authorization')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  storage_path text not null check (char_length(storage_path) <= 400),
  file_name text not null check (char_length(file_name) between 1 and 255),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count smallint not null check (page_count between 1 and 4),
  -- Optional per-template position overrides (see forgeWcFormsRules.layoutFor).
  layout jsonb not null default '{}'::jsonb check (jsonb_typeof(layout) = 'object'),
  is_active boolean not null default true,
  archived_at timestamptz,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_wc_form_templates_archive check (is_active = (archived_at is null))
);

create unique index if not exists forge_wc_form_templates_active_idx
  on public.forge_wc_form_templates (organization_id, form_key) where is_active;

create table if not exists public.forge_wc_case_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.forge_wc_cases(id) on delete cascade,
  -- No action (checked at statement end), not restrict, so deleting a whole organization can cascade cleanly.
  template_id uuid not null references public.forge_wc_form_templates(id),
  form_key text not null check (form_key in ('injury_guidelines_ack', 'hipaa_authorization')),
  status text not null default 'draft' check (status in ('draft', 'signed', 'voided')),
  field_data jsonb not null default '{}'::jsonb check (jsonb_typeof(field_data) = 'object' and pg_column_size(field_data) <= 8192),
  signature_path text check (signature_path is null or char_length(signature_path) <= 400),
  signer_name text check (signer_name is null or char_length(btrim(signer_name)) between 1 and 120),
  signer_relationship text check (signer_relationship is null or char_length(signer_relationship) <= 60),
  signed_at timestamptz,
  signed_by uuid references auth.users(id) on delete set null,
  void_reason text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 500),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  constraint forge_wc_case_forms_signed check (
    signed_at is null or (signature_path is not null and signer_name is not null)
  ),
  constraint forge_wc_case_forms_status_signed check (status <> 'signed' or signed_at is not null),
  constraint forge_wc_case_forms_voided check (
    (status = 'voided') = (voided_at is not null) and (status <> 'voided' or void_reason is not null)
  )
);

create index if not exists forge_wc_case_forms_case_idx on public.forge_wc_case_forms (organization_id, case_id, created_at desc);

-- Append-only trail of what happened to each form: created, updated, signed, voided, printed, downloaded, emailed.
create table if not exists public.forge_wc_case_form_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.forge_wc_cases(id) on delete cascade,
  case_form_id uuid not null references public.forge_wc_case_forms(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'updated', 'signed', 'voided', 'printed', 'downloaded', 'emailed', 'email_failed')),
  actor_user_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists forge_wc_case_form_events_form_idx on public.forge_wc_case_form_events (case_form_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

create or replace function public.forge_wc_form_template_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.form_key <> old.form_key or new.storage_path <> old.storage_path
       or new.sha256 <> old.sha256 or new.size_bytes <> old.size_bytes then
      raise exception 'A form template file cannot be changed. Upload a new template instead.' using errcode = '42501';
    end if;

    if not old.is_active and new.is_active then
      raise exception 'An archived form template cannot be reactivated. Upload it again.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists forge_wc_form_template_guard on public.forge_wc_form_templates;
create trigger forge_wc_form_template_guard
before update on public.forge_wc_form_templates
for each row execute function public.forge_wc_form_template_guard();

create or replace function public.forge_wc_case_form_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_template public.forge_wc_form_templates%rowtype;
  v_case_status text;
begin
  if tg_op = 'DELETE' then
    -- Signed and voided forms are records. Only drafts may be deleted, unless the whole case or organization
    -- is being deleted (cascades can reach forms before or after their case).
    if old.status <> 'draft'
       and exists (select 1 from public.forge_wc_cases where id = old.case_id)
       and exists (select 1 from public.organizations where id = old.organization_id) then
      raise exception 'Signed or voided forms cannot be deleted. Void the form instead.' using errcode = '42501';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    perform public.forge_assert_same_org('public.forge_wc_cases'::regclass, new.case_id, new.organization_id, 'Workers'' comp case');

    select * into v_template from public.forge_wc_form_templates where id = new.template_id;

    if not found or v_template.organization_id <> new.organization_id then
      raise exception 'Form template not found for this organization.' using errcode = '23503';
    end if;

    if v_template.form_key <> new.form_key then
      raise exception 'The form does not match its template.' using errcode = '23514';
    end if;

    if not v_template.is_active then
      raise exception 'This form template has been replaced. Start the form again.' using errcode = '23514';
    end if;

    select status into v_case_status from public.forge_wc_cases where id = new.case_id;

    if v_case_status = 'archived' then
      raise exception 'Archived cases cannot take new forms.' using errcode = '23514';
    end if;

    if new.status <> 'draft' or new.signed_at is not null or new.voided_at is not null then
      raise exception 'New forms start as drafts.' using errcode = '23514';
    end if;

    new.row_version := 1;

    return new;
  end if;

  -- UPDATE
  if new.organization_id <> old.organization_id or new.case_id <> old.case_id or new.template_id <> old.template_id
     or new.form_key <> old.form_key or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'A form cannot move to another case or template.' using errcode = '42501';
  end if;

  if old.status = 'voided' then
    raise exception 'Voided forms cannot be changed.' using errcode = '42501';
  end if;

  if old.status = 'signed' then
    -- The only change a signed form allows is being voided.
    if new.status <> 'voided'
       or new.field_data <> old.field_data
       or new.signature_path is distinct from old.signature_path
       or new.signer_name is distinct from old.signer_name
       or new.signer_relationship is distinct from old.signer_relationship
       or new.signed_at is distinct from old.signed_at
       or new.signed_by is distinct from old.signed_by then
      raise exception 'Signed forms cannot be changed. Void the form and start a new one.' using errcode = '42501';
    end if;
  end if;

  if old.status = 'draft' and new.status = 'signed' and (new.signature_path is null or new.signer_name is null) then
    raise exception 'A signature and the signer''s name are required to sign.' using errcode = '23514';
  end if;

  new.updated_at := now();
  new.row_version := old.row_version + 1;

  return new;
end;
$$;

drop trigger if exists forge_wc_case_form_guard on public.forge_wc_case_forms;
create trigger forge_wc_case_form_guard
before insert or update or delete on public.forge_wc_case_forms
for each row execute function public.forge_wc_case_form_guard();

create or replace function public.forge_wc_case_form_event_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.forge_assert_same_org('public.forge_wc_case_forms'::regclass, new.case_form_id, new.organization_id, 'Workers'' comp form');

    if not exists (select 1 from public.forge_wc_case_forms where id = new.case_form_id and case_id = new.case_id) then
      raise exception 'The form event does not match its case.' using errcode = '23514';
    end if;

    return new;
  end if;

  -- Events are append-only; they go only when their form, case or organization is deleted.
  if tg_op = 'DELETE' and (
    not exists (select 1 from public.forge_wc_case_forms where id = old.case_form_id)
    or not exists (select 1 from public.forge_wc_cases where id = old.case_id)
    or not exists (select 1 from public.organizations where id = old.organization_id)
  ) then
    return old;
  end if;

  raise exception 'Form history cannot be changed.' using errcode = '42501';
end;
$$;

drop trigger if exists forge_wc_case_form_event_guard on public.forge_wc_case_form_events;
create trigger forge_wc_case_form_event_guard
before insert or update or delete on public.forge_wc_case_form_events
for each row execute function public.forge_wc_case_form_event_guard();

-- ---------------------------------------------------------------------------
-- Sign and void: one locked step each, with the history entry
-- ---------------------------------------------------------------------------

create or replace function public.forge_sign_wc_case_form(
  p_organization_id uuid,
  p_form_id uuid,
  p_expected_version integer,
  p_field_data jsonb,
  p_signer_name text,
  p_signer_relationship text,
  p_signature_path text,
  p_actor_user_id uuid
) returns public.forge_wc_case_forms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.forge_wc_case_forms%rowtype;
begin
  select * into v_form from public.forge_wc_case_forms
  where id = p_form_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Form not found.' using errcode = 'P0002';
  end if;

  if v_form.status <> 'draft' then
    raise exception 'Only draft forms can be signed.' using errcode = '42501';
  end if;

  if v_form.row_version <> p_expected_version then
    raise exception 'This form changed since you opened it. Reload and try again.' using errcode = '40001';
  end if;

  if p_signature_path is null or p_signature_path !~ ('^' || p_organization_id::text || '/' || v_form.case_id::text || '/' || p_form_id::text || '/') then
    raise exception 'The signature does not belong to this form.' using errcode = '23514';
  end if;

  update public.forge_wc_case_forms
  set status = 'signed',
      field_data = coalesce(p_field_data, '{}'::jsonb),
      signer_name = btrim(p_signer_name),
      signer_relationship = nullif(btrim(coalesce(p_signer_relationship, '')), ''),
      signature_path = p_signature_path,
      signed_at = now(),
      signed_by = p_actor_user_id,
      updated_by = p_actor_user_id
  where id = p_form_id
  returning * into v_form;

  insert into public.forge_wc_case_form_events (organization_id, case_id, case_form_id, event_type, actor_user_id, detail)
  values (p_organization_id, v_form.case_id, p_form_id, 'signed', p_actor_user_id, jsonb_build_object('form_key', v_form.form_key));

  return v_form;
end;
$$;

create or replace function public.forge_void_wc_case_form(
  p_organization_id uuid,
  p_form_id uuid,
  p_expected_version integer,
  p_reason text,
  p_actor_user_id uuid
) returns public.forge_wc_case_forms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_form public.forge_wc_case_forms%rowtype;
begin
  select * into v_form from public.forge_wc_case_forms
  where id = p_form_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Form not found.' using errcode = 'P0002';
  end if;

  if v_form.status = 'voided' then
    raise exception 'This form is already void.' using errcode = '42501';
  end if;

  if v_form.row_version <> p_expected_version then
    raise exception 'This form changed since you opened it. Reload and try again.' using errcode = '40001';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for voiding the form.' using errcode = '23514';
  end if;

  update public.forge_wc_case_forms
  set status = 'voided', void_reason = btrim(p_reason), voided_at = now(), voided_by = p_actor_user_id, updated_by = p_actor_user_id
  where id = p_form_id
  returning * into v_form;

  insert into public.forge_wc_case_form_events (organization_id, case_id, case_form_id, event_type, actor_user_id, detail)
  values (p_organization_id, v_form.case_id, p_form_id, 'voided', p_actor_user_id, jsonb_build_object('reason', btrim(p_reason)));

  return v_form;
end;
$$;

-- Uploading a template replaces the active one for that form in a single step. Existing forms keep the
-- template they were filled on, so their printouts never change.
create or replace function public.forge_replace_wc_form_template(
  p_organization_id uuid,
  p_form_key text,
  p_title text,
  p_storage_path text,
  p_file_name text,
  p_size_bytes integer,
  p_sha256 text,
  p_page_count smallint,
  p_actor_user_id uuid
) returns public.forge_wc_form_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.forge_wc_form_templates%rowtype;
begin
  if p_storage_path !~ ('^' || p_organization_id::text || '/templates/') then
    raise exception 'The template file does not belong to this organization.' using errcode = '23514';
  end if;

  update public.forge_wc_form_templates
  set is_active = false, archived_at = now()
  where organization_id = p_organization_id and form_key = p_form_key and is_active;

  insert into public.forge_wc_form_templates (organization_id, form_key, title, storage_path, file_name, size_bytes, sha256, page_count, uploaded_by)
  values (p_organization_id, p_form_key, btrim(p_title), p_storage_path, p_file_name, p_size_bytes, p_sha256, p_page_count, p_actor_user_id)
  returning * into v_template;

  return v_template;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage, RLS and grants
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('forge-wc-forms', 'forge-wc-forms', false, 5242880, array['application/pdf', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf', 'image/png'];

alter table public.forge_wc_form_templates enable row level security;
alter table public.forge_wc_case_forms enable row level security;
alter table public.forge_wc_case_form_events enable row level security;

revoke all on public.forge_wc_form_templates, public.forge_wc_case_forms, public.forge_wc_case_form_events from anon, authenticated;
grant all on public.forge_wc_form_templates, public.forge_wc_case_forms, public.forge_wc_case_form_events to service_role;

revoke all on function public.forge_sign_wc_case_form(uuid, uuid, integer, jsonb, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.forge_void_wc_case_form(uuid, uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.forge_sign_wc_case_form(uuid, uuid, integer, jsonb, text, text, text, uuid) to service_role;
grant execute on function public.forge_void_wc_case_form(uuid, uuid, integer, text, uuid) to service_role;

revoke all on function public.forge_replace_wc_form_template(uuid, text, text, text, text, integer, text, smallint, uuid) from public, anon, authenticated;
grant execute on function public.forge_replace_wc_form_template(uuid, text, text, text, text, integer, text, smallint, uuid) to service_role;

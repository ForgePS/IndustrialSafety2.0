-- Port slice 4 (Industrial 1.0 -> 2.0): Lockout / Tagout parity.
--
-- 1.0 reference (legacy/forge-platform):
--   apps/platform-api/src/modules/industrial/industrial-domain.service.ts (LOTO create/issue/verify/close/workflow)
--   apps/platform-api/src/modules/industrial/loto-print.ts (printable procedure sheet)
--   apps/industrial-web/src/lib/loto.ts, loto-image-annotations.ts (energy letters, precautions, arrows)
--   apps/field-web/src/app/loto/[machineId]/loto-client.tsx (field lockout runner)
--
-- Adds what 1.0 had and 2.0 lacked, and tightens what 1.0 left loose:
--   * procedure precautions, print page-2 text, shutdown/restore sequences and restoration checks
--   * equipment and energy-source photos with arrow annotations (private bucket forge-loto)
--   * return-for-correction from review, with history
--   * lockouts: numbered, frozen procedure snapshot, per-step checklist stored server side,
--     issued -> verified -> completed / canceled, enforced in the database
--   * group lockout: one row per lock holder; every lock must be removed before close
--   * optional authorized-employee training check per tenant
--   * asset QR codes can open a public, read-only view of the asset's approved LOTO procedures
--
-- Every LOTO table is service-role only; access goes through server actions that check loto.* permissions.

-- ---------------------------------------------------------------------------
-- Procedure content
-- ---------------------------------------------------------------------------

alter table public.forge_loto_procedures
  add column if not exists precautions jsonb not null default '[]'::jsonb,
  add column if not exists print_purpose text,
  add column if not exists print_scope text,
  add column if not exists print_enforcement text,
  add column if not exists shutdown_sequence jsonb not null default '[]'::jsonb,
  add column if not exists restore_sequence jsonb not null default '[]'::jsonb,
  add column if not exists restoration_checks jsonb not null default '[]'::jsonb;

alter table public.forge_loto_procedures drop constraint if exists forge_loto_procedures_content_shape_check;
alter table public.forge_loto_procedures
  add constraint forge_loto_procedures_content_shape_check check (
    jsonb_typeof(precautions) = 'array'
    and jsonb_typeof(shutdown_sequence) = 'array'
    and jsonb_typeof(restore_sequence) = 'array'
    and jsonb_typeof(restoration_checks) = 'array'
  );

alter table public.forge_loto_energy_sources
  add column if not exists energy_code text;

-- 1.0 tags each isolation point with a code such as "E-1" or "P-2"; the letter picks the badge colour.
insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_hide, can_reorder, can_change_required, can_change_input_type, can_change_lookup)
select fd.id, 'energy_code', 'Energy Tag Code', 'Code printed on the isolation-point tag. The letter sets the badge colour (E electrical, P pneumatic, H hydraulic, M mechanical, G gravity, CG controlled gravity, C chemical, T thermal, W water).', 'E-1', 'text', null,
       'source', 'Energy Source', 15, 'half', false, true, true, true, false, false
from public.forge_form_definitions fd
where fd.form_key = 'loto.energy_source'
on conflict (form_id, field_key) do update
set label = excluded.label, help_text = excluded.help_text, placeholder = excluded.placeholder, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

create table if not exists public.forge_loto_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  procedure_id uuid not null references public.forge_loto_procedures(id) on delete cascade,
  energy_source_id uuid references public.forge_loto_energy_sources(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  caption text,
  annotations jsonb not null default '[]'::jsonb check (jsonb_typeof(annotations) = 'array'),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_loto_photos_slot_idx
  on public.forge_loto_photos (organization_id, procedure_id, energy_source_id, sort_order);

create or replace function public.forge_loto_photos_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_row public.forge_loto_photos%rowtype;
  v_status text;
  v_count integer;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;

  select status into v_status
  from public.forge_loto_procedures
  where id = v_row.procedure_id and organization_id = v_row.organization_id;

  -- The procedure itself is being deleted (cascade): let its photo rows go.
  if v_status is null and tg_op = 'DELETE' then return old; end if;

  if v_status is null then
    raise exception 'LOTO procedure does not belong to this organization.' using errcode = '23503';
  end if;

  if v_status not in ('draft','review') then
    raise exception 'Photos can only change while the procedure is Draft or Under Review. Create a revision first.' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;

  if new.energy_source_id is not null and not exists (
    select 1 from public.forge_loto_energy_sources s
    where s.id = new.energy_source_id and s.procedure_id = new.procedure_id and s.organization_id = new.organization_id
  ) then
    raise exception 'Energy source does not belong to this procedure.' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    select count(*) into v_count
    from public.forge_loto_photos p
    where p.procedure_id = new.procedure_id
      and p.energy_source_id is not distinct from new.energy_source_id;

    if v_count >= 6 then
      raise exception 'A LOTO photo slot holds at most 6 photos.' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and (new.procedure_id <> old.procedure_id or new.storage_path <> old.storage_path) then
    raise exception 'A LOTO photo cannot move to another procedure or file.' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_loto_photos_guard on public.forge_loto_photos;
create trigger forge_loto_photos_guard
before insert or update or delete on public.forge_loto_photos
for each row execute function public.forge_loto_photos_guard();

insert into storage.buckets (id, name, public, file_size_limit)
values ('forge-loto', 'forge-loto', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- ---------------------------------------------------------------------------
-- Return for correction
-- ---------------------------------------------------------------------------

create table if not exists public.forge_loto_review_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  procedure_id uuid not null references public.forge_loto_procedures(id) on delete cascade,
  revision_number integer not null,
  notes text not null check (length(btrim(notes)) > 0),
  returned_by uuid references auth.users(id) on delete set null,
  returned_at timestamptz not null default now()
);

create index if not exists forge_loto_review_returns_procedure_idx
  on public.forge_loto_review_returns (organization_id, procedure_id, returned_at desc);

create or replace function public.forge_loto_return_for_correction(
  p_organization_id uuid,
  p_procedure_id uuid,
  p_notes text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_procedure public.forge_loto_procedures%rowtype;
  v_id uuid;
begin
  select * into v_procedure
  from public.forge_loto_procedures
  where id = p_procedure_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'LOTO procedure not found.' using errcode = 'P0002';
  end if;

  if v_procedure.status <> 'review' then
    raise exception 'Only procedures Under Review can be returned for correction.' using errcode = '23514';
  end if;

  if p_notes is null or length(btrim(p_notes)) = 0 then
    raise exception 'Say what needs to be corrected.' using errcode = '23514';
  end if;

  insert into public.forge_loto_review_returns (organization_id, procedure_id, revision_number, notes, returned_by)
  values (p_organization_id, p_procedure_id, v_procedure.revision_number, btrim(p_notes), p_actor_user_id)
  returning id into v_id;

  update public.forge_loto_procedures
  set status = 'draft', updated_by = p_actor_user_id, updated_at = now()
  where id = p_procedure_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenant settings: authorized-employee training
-- ---------------------------------------------------------------------------

create table if not exists public.forge_loto_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  authorized_course_id uuid references public.forge_training_courses(id) on delete set null,
  require_authorized_training boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (not require_authorized_training or authorized_course_id is not null)
);

create or replace function public.forge_loto_settings_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.forge_training_courses', new.authorized_course_id, new.organization_id, 'Training course');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_loto_settings_guard on public.forge_loto_settings;
create trigger forge_loto_settings_guard
before insert or update on public.forge_loto_settings
for each row execute function public.forge_loto_settings_guard();

-- Current = an approved, passed/completed completion that has not expired (same rule as the training matrix).
create or replace function public.forge_loto_person_authorized(
  p_organization_id uuid,
  p_personnel_id uuid,
  p_course_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.forge_training_completions c
    where c.organization_id = p_organization_id
      and c.personnel_id = p_personnel_id
      and c.course_id = p_course_id
      and c.approval_status = 'approved'
      and c.result in ('passed','completed')
      and (c.expires_at is null or c.expires_at >= current_date)
  );
$$;

create or replace function public.forge_loto_assert_lock_holder(
  p_organization_id uuid,
  p_personnel_id uuid,
  p_holder_name text
)
returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_settings public.forge_loto_settings%rowtype;
  v_course_title text;
begin
  if p_holder_name is null or length(btrim(p_holder_name)) = 0 then
    raise exception 'Every lock needs the name of the person who holds it.' using errcode = '23514';
  end if;

  perform public.forge_assert_same_org('public.forge_personnel', p_personnel_id, p_organization_id, 'Lock holder');

  select * into v_settings from public.forge_loto_settings where organization_id = p_organization_id;

  if not found or not v_settings.require_authorized_training then
    return;
  end if;

  select title into v_course_title from public.forge_training_courses where id = v_settings.authorized_course_id;

  if p_personnel_id is null then
    raise exception '% must be picked from personnel so their % training can be checked.', btrim(p_holder_name), coalesce(v_course_title, 'authorized employee')
      using errcode = '23514';
  end if;

  if not public.forge_loto_person_authorized(p_organization_id, p_personnel_id, v_settings.authorized_course_id) then
    raise exception '% is not authorized for lockout: no current % training.', btrim(p_holder_name), coalesce(v_course_title, 'authorized employee')
      using errcode = '23514';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lockouts (forge_loto_applications)
-- ---------------------------------------------------------------------------

alter table public.forge_loto_sequences
  add column if not exists next_lockout_value bigint not null default 1;

alter table public.forge_loto_applications
  add column if not exists lockout_number text,
  add column if not exists revision_number integer,
  add column if not exists work_description text,
  add column if not exists affected_employees text,
  add column if not exists try_start_required boolean not null default true,
  add column if not exists try_start_completed boolean not null default false,
  add column if not exists zero_energy_confirmed boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists step_checks jsonb not null default '{}'::jsonb,
  add column if not exists restoration_checks_done jsonb not null default '[]'::jsonb,
  add column if not exists procedure_snapshot jsonb,
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text;

alter table public.forge_loto_applications drop constraint if exists forge_loto_applications_status_check;
alter table public.forge_loto_applications
  add constraint forge_loto_applications_status_check check (status in ('in_progress','verified','completed','canceled'));

drop index if exists public.forge_loto_applications_one_active_idx;
create unique index if not exists forge_loto_applications_one_active_idx
  on public.forge_loto_applications (procedure_id)
  where status in ('in_progress','verified');

-- Number the lockouts that already exist, oldest first, and move each tenant's counter past them.
with numbered as (
  select id, organization_id, row_number() over (partition by organization_id order by started_at, id) as n
  from public.forge_loto_applications
  where lockout_number is null
)
update public.forge_loto_applications a
set lockout_number = 'LKO-' || lpad(numbered.n::text, 6, '0')
from numbered
where a.id = numbered.id;

insert into public.forge_loto_sequences (organization_id, next_value, next_lockout_value)
select organization_id, 1, count(*) + 1
from public.forge_loto_applications
group by organization_id
on conflict (organization_id) do update
set next_lockout_value = greatest(public.forge_loto_sequences.next_lockout_value, excluded.next_lockout_value);

create unique index if not exists forge_loto_applications_number_idx
  on public.forge_loto_applications (organization_id, lockout_number)
  where lockout_number is not null;

create or replace function public.next_forge_lockout_number(p_organization_id uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_value bigint;
begin
  insert into public.forge_loto_sequences (organization_id, next_value, next_lockout_value)
  values (p_organization_id, 1, 2)
  on conflict (organization_id) do update
  set next_lockout_value = public.forge_loto_sequences.next_lockout_value + 1
  returning next_lockout_value - 1 into v_value;

  return 'LKO-' || lpad(v_value::text, 6, '0');
end;
$$;

create table if not exists public.forge_loto_application_locks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.forge_loto_applications(id) on delete cascade,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  holder_name text not null,
  lock_tag_id text,
  applied_at timestamptz not null default now(),
  applied_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  removal_note text
);

create index if not exists forge_loto_application_locks_app_idx
  on public.forge_loto_application_locks (organization_id, application_id, applied_at);

create unique index if not exists forge_loto_application_locks_tag_idx
  on public.forge_loto_application_locks (application_id, lower(lock_tag_id))
  where removed_at is null and lock_tag_id is not null;

-- Snapshot of what the crew is working from. Restoration checks fall back to one "area clear" check.
create or replace function public.forge_loto_build_snapshot(p_procedure_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'procedure', jsonb_build_object(
      'id', p.id,
      'procedure_number', p.procedure_number,
      'title', p.title,
      'revision_number', p.revision_number,
      'required_ppe', p.required_ppe,
      'special_precautions', p.special_precautions,
      'precautions', p.precautions
    ),
    'energy_sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'energy_type', s.energy_type, 'energy_code', s.energy_code, 'source_name', s.source_name,
        'magnitude', s.magnitude, 'isolation_location', s.isolation_location, 'isolation_device', s.isolation_device,
        'lockout_device', s.lockout_device, 'stored_energy_method', s.stored_energy_method,
        'verification_method', s.verification_method
      ) order by s.sort_order, s.created_at)
      from public.forge_loto_energy_sources s where s.procedure_id = p.id
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'step_type', st.step_type, 'title', st.title, 'instructions', st.instructions,
        'warning_text', st.warning_text, 'verification_instructions', st.verification_instructions
      ) order by st.sort_order, st.created_at)
      from public.forge_loto_steps st where st.procedure_id = p.id
    ), '[]'::jsonb),
    'restoration_checks', case
      when jsonb_array_length(p.restoration_checks) > 0 then p.restoration_checks
      else jsonb_build_array(jsonb_build_object('key', 'area_clear', 'label', 'Restoration complete: tools removed, guards replaced, area clear and affected employees notified.'))
    end
  )
  from public.forge_loto_procedures p
  where p.id = p_procedure_id;
$$;

-- Lockouts still open from before this slice get a snapshot so the crew can finish them in the new runner.
update public.forge_loto_applications
set procedure_snapshot = public.forge_loto_build_snapshot(procedure_id),
    revision_number = coalesce(revision_number, (select p.revision_number from public.forge_loto_procedures p where p.id = procedure_id))
where procedure_snapshot is null
  and status in ('in_progress','verified');

create or replace function public.forge_loto_issue_lockout(
  p_organization_id uuid,
  p_procedure_id uuid,
  p_actor_user_id uuid,
  p_work_description text,
  p_affected_employees text,
  p_affected_notified boolean,
  p_try_start_required boolean,
  p_holders jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_procedure public.forge_loto_procedures%rowtype;
  v_application_id uuid;
  v_holder jsonb;
  v_snapshot jsonb;
begin
  select * into v_procedure
  from public.forge_loto_procedures
  where id = p_procedure_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'LOTO procedure not found.' using errcode = 'P0002';
  end if;

  if v_procedure.status <> 'approved' then
    raise exception 'Approve the procedure before issuing a lockout.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.forge_loto_applications
    where procedure_id = p_procedure_id and status in ('in_progress','verified')
  ) then
    raise exception 'This procedure already has an open lockout. Add your lock to it instead.' using errcode = '23514';
  end if;

  if p_work_description is null or length(btrim(p_work_description)) = 0 then
    raise exception 'Describe the work being done under this lockout.' using errcode = '23514';
  end if;

  if not coalesce(p_affected_notified, false) then
    raise exception 'Notify affected employees before issuing the lockout.' using errcode = '23514';
  end if;

  if p_holders is null or jsonb_typeof(p_holders) <> 'array' or jsonb_array_length(p_holders) = 0 then
    raise exception 'Add at least one lock holder.' using errcode = '23514';
  end if;

  for v_holder in select * from jsonb_array_elements(p_holders) loop
    perform public.forge_loto_assert_lock_holder(
      p_organization_id,
      nullif(v_holder->>'personnel_id', '')::uuid,
      v_holder->>'holder_name'
    );
  end loop;

  v_snapshot := public.forge_loto_build_snapshot(p_procedure_id);

  if jsonb_array_length(v_snapshot->'steps') = 0 then
    raise exception 'The approved procedure has no steps to follow.' using errcode = '23514';
  end if;

  insert into public.forge_loto_applications (
    organization_id, procedure_id, asset_id, status, started_at, started_by,
    lockout_number, revision_number, work_description, affected_employees,
    affected_employees_notified, energy_control_verified, restoration_verified,
    try_start_required, procedure_snapshot
  )
  values (
    p_organization_id, p_procedure_id, v_procedure.asset_id, 'in_progress', now(), p_actor_user_id,
    public.next_forge_lockout_number(p_organization_id), v_procedure.revision_number,
    btrim(p_work_description), nullif(btrim(coalesce(p_affected_employees, '')), ''),
    true, false, false,
    coalesce(p_try_start_required, true), v_snapshot
  )
  returning id into v_application_id;

  insert into public.forge_loto_application_locks (organization_id, application_id, personnel_id, holder_name, lock_tag_id, applied_by)
  select p_organization_id, v_application_id,
         nullif(h->>'personnel_id', '')::uuid,
         btrim(h->>'holder_name'),
         nullif(btrim(coalesce(h->>'lock_tag_id', '')), ''),
         p_actor_user_id
  from jsonb_array_elements(p_holders) h;

  return v_application_id;
end;
$$;

create or replace function public.forge_loto_lock_application(
  p_organization_id uuid,
  p_application_id uuid
)
returns public.forge_loto_applications
language plpgsql
set search_path = public
as $$
declare
  v_application public.forge_loto_applications%rowtype;
begin
  select * into v_application
  from public.forge_loto_applications
  where id = p_application_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Lockout not found.' using errcode = 'P0002';
  end if;

  return v_application;
end;
$$;

create or replace function public.forge_loto_check_step(
  p_organization_id uuid,
  p_application_id uuid,
  p_step_id text,
  p_checked boolean,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_application public.forge_loto_applications%rowtype;
  v_checks jsonb;
begin
  v_application := public.forge_loto_lock_application(p_organization_id, p_application_id);

  if v_application.status <> 'in_progress' then
    raise exception 'Steps can only be checked off before the lockout is verified.' using errcode = '23514';
  end if;

  if v_application.procedure_snapshot is null or not exists (
    select 1 from jsonb_array_elements(v_application.procedure_snapshot->'steps') s where s->>'id' = p_step_id
  ) then
    raise exception 'That step is not part of this lockout.' using errcode = '23514';
  end if;

  if coalesce(p_checked, false) then
    v_checks := v_application.step_checks || jsonb_build_object(p_step_id, jsonb_build_object('at', now(), 'by', p_actor_user_id));
  else
    v_checks := v_application.step_checks - p_step_id;
  end if;

  update public.forge_loto_applications
  set step_checks = v_checks, updated_at = now()
  where id = p_application_id;

  return v_checks;
end;
$$;

create or replace function public.forge_loto_add_lock(
  p_organization_id uuid,
  p_application_id uuid,
  p_personnel_id uuid,
  p_holder_name text,
  p_lock_tag_id text,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_application public.forge_loto_applications%rowtype;
  v_id uuid;
begin
  v_application := public.forge_loto_lock_application(p_organization_id, p_application_id);

  if v_application.status not in ('in_progress','verified') then
    raise exception 'Locks can only be added to an open lockout.' using errcode = '23514';
  end if;

  perform public.forge_loto_assert_lock_holder(p_organization_id, p_personnel_id, p_holder_name);

  insert into public.forge_loto_application_locks (organization_id, application_id, personnel_id, holder_name, lock_tag_id, applied_by)
  values (p_organization_id, p_application_id, p_personnel_id, btrim(p_holder_name), nullif(btrim(coalesce(p_lock_tag_id, '')), ''), p_actor_user_id)
  returning id into v_id;

  update public.forge_loto_applications set updated_at = now() where id = p_application_id;

  return v_id;
end;
$$;

-- 29 CFR 1910.147(e)(3): each lock is removed by the employee who applied it. When someone else removes it,
-- the record must say why.
create or replace function public.forge_loto_remove_lock(
  p_organization_id uuid,
  p_lock_id uuid,
  p_note text,
  p_actor_user_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_lock public.forge_loto_application_locks%rowtype;
  v_application public.forge_loto_applications%rowtype;
  v_holder_user uuid;
begin
  select * into v_lock
  from public.forge_loto_application_locks
  where id = p_lock_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Lock not found.' using errcode = 'P0002';
  end if;

  v_application := public.forge_loto_lock_application(p_organization_id, v_lock.application_id);

  if v_application.status not in ('in_progress','verified') then
    raise exception 'This lockout is already closed.' using errcode = '23514';
  end if;

  if v_lock.removed_at is not null then
    raise exception 'This lock has already been removed.' using errcode = '23514';
  end if;

  select auth_user_id into v_holder_user from public.forge_personnel where id = v_lock.personnel_id;

  if (v_holder_user is null or v_holder_user <> p_actor_user_id)
     and (p_note is null or length(btrim(p_note)) = 0) then
    raise exception 'You are removing someone else''s lock. Record why and who authorized it.' using errcode = '23514';
  end if;

  update public.forge_loto_application_locks
  set removed_at = now(), removed_by = p_actor_user_id, removal_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_lock_id;

  update public.forge_loto_applications set updated_at = now() where id = v_lock.application_id;
end;
$$;

create or replace function public.forge_loto_verify_lockout(
  p_organization_id uuid,
  p_application_id uuid,
  p_zero_energy_confirmed boolean,
  p_try_start_completed boolean,
  p_notes text,
  p_actor_user_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_application public.forge_loto_applications%rowtype;
  v_unchecked integer;
begin
  v_application := public.forge_loto_lock_application(p_organization_id, p_application_id);

  if v_application.status <> 'in_progress' then
    raise exception 'Only an issued lockout can be verified.' using errcode = '23514';
  end if;

  select count(*) into v_unchecked
  from jsonb_array_elements(v_application.procedure_snapshot->'steps') s
  where not (v_application.step_checks ? (s->>'id'));

  if v_unchecked > 0 then
    raise exception 'Check off every procedure step before verifying (% left).', v_unchecked using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.forge_loto_application_locks
    where application_id = p_application_id and removed_at is null
  ) then
    raise exception 'No locks are applied.' using errcode = '23514';
  end if;

  if not coalesce(p_zero_energy_confirmed, false) then
    raise exception 'Confirm zero-energy verification before continuing.' using errcode = '23514';
  end if;

  if v_application.try_start_required and not coalesce(p_try_start_completed, false) then
    raise exception 'This lockout requires a try-start before it is verified.' using errcode = '23514';
  end if;

  update public.forge_loto_applications
  set status = 'verified',
      zero_energy_confirmed = true,
      try_start_completed = coalesce(p_try_start_completed, false),
      energy_control_verified = true,
      verified_at = now(),
      verified_by = p_actor_user_id,
      verification_notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), verification_notes),
      updated_at = now()
  where id = p_application_id;
end;
$$;

create or replace function public.forge_loto_complete_lockout(
  p_organization_id uuid,
  p_application_id uuid,
  p_checks jsonb,
  p_notes text,
  p_actor_user_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_application public.forge_loto_applications%rowtype;
  v_missing integer;
begin
  v_application := public.forge_loto_lock_application(p_organization_id, p_application_id);

  if v_application.status <> 'verified' then
    raise exception 'Verify the lockout before returning the equipment to service.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.forge_loto_application_locks
    where application_id = p_application_id and removed_at is null
  ) then
    raise exception 'Every lock must be removed before the equipment returns to service.' using errcode = '23514';
  end if;

  if p_checks is null or jsonb_typeof(p_checks) <> 'array' then
    p_checks := '[]'::jsonb;
  end if;

  select count(*) into v_missing
  from jsonb_array_elements(v_application.procedure_snapshot->'restoration_checks') c
  where not (p_checks ? (c->>'key'));

  if v_missing > 0 then
    raise exception 'Complete every restoration check (% left).', v_missing using errcode = '23514';
  end if;

  update public.forge_loto_applications
  set status = 'completed',
      restoration_verified = true,
      restoration_checks_done = p_checks,
      completed_at = now(),
      completed_by = p_actor_user_id,
      notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes),
      updated_at = now()
  where id = p_application_id;
end;
$$;

create or replace function public.forge_loto_cancel_lockout(
  p_organization_id uuid,
  p_application_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_application public.forge_loto_applications%rowtype;
begin
  v_application := public.forge_loto_lock_application(p_organization_id, p_application_id);

  if v_application.status not in ('in_progress','verified') then
    raise exception 'Only an open lockout can be canceled.' using errcode = '23514';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Give a reason for canceling the lockout.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.forge_loto_application_locks
    where application_id = p_application_id and removed_at is null
  ) then
    raise exception 'Remove every lock before canceling the lockout.' using errcode = '23514';
  end if;

  update public.forge_loto_applications
  set status = 'canceled', canceled_at = now(), canceled_by = p_actor_user_id,
      cancel_reason = btrim(p_reason), updated_at = now()
  where id = p_application_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- QR: asset codes can open the asset's approved LOTO procedures without signing in (as in 1.0)
-- ---------------------------------------------------------------------------

alter table public.forge_qr_codes drop constraint if exists forge_qr_codes_default_action_check;
alter table public.forge_qr_codes
  add constraint forge_qr_codes_default_action_check
  check (default_action in ('asset_record','maintenance','meter_reading','loto_view'));

create or replace function public.resolve_and_record_forge_qr_scan(
  p_token text,
  p_auth_user_id uuid default null,
  p_user_agent text default null,
  p_referrer text default null
)
returns table (
  qr_code_id uuid,
  organization_id uuid,
  target_type text,
  target_id uuid,
  default_action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qr public.forge_qr_codes%rowtype;
  v_destination text;
begin
  select *
  into v_qr
  from public.forge_qr_codes
  where token = p_token
    and status = 'active'
    and archived_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return;
  end if;

  if v_qr.target_type = 'asset' then
    if v_qr.default_action = 'maintenance' then
      v_destination := '/assets/' || v_qr.target_id::text || '/maintenance/create';
    elsif v_qr.default_action = 'meter_reading' then
      v_destination := '/assets/' || v_qr.target_id::text || '/meter-readings/create';
    elsif v_qr.default_action = 'loto_view' then
      v_destination := '/q/' || v_qr.qr_number || '/loto';
    else
      v_destination := '/assets/' || v_qr.target_id::text;
    end if;
  else
    return;
  end if;

  insert into public.forge_qr_scans (organization_id, qr_code_id, auth_user_id, destination_path, user_agent, referrer)
  values (v_qr.organization_id, v_qr.id, p_auth_user_id, v_destination, left(p_user_agent, 1000), left(p_referrer, 1000));

  update public.forge_qr_codes
  set scan_count = scan_count + 1, last_scanned_at = now(), updated_at = now()
  where id = v_qr.id;

  qr_code_id := v_qr.id;
  organization_id := v_qr.organization_id;
  target_type := v_qr.target_type;
  target_id := v_qr.target_id;
  default_action := v_qr.default_action;
  return next;
end;
$$;

revoke all on function public.resolve_and_record_forge_qr_scan(text, uuid, text, text) from public;
grant execute on function public.resolve_and_record_forge_qr_scan(text, uuid, text, text) to service_role;

-- Read-only token lookup for the public LOTO page. Records nothing; the scan route already did.
create or replace function public.forge_resolve_qr_token(p_token text)
returns table (organization_id uuid, target_type text, target_id uuid, default_action text)
language sql
stable
set search_path = public
as $$
  select q.organization_id, q.target_type, q.target_id, q.default_action
  from public.forge_qr_codes q
  where q.token = p_token
    and q.status = 'active'
    and q.archived_at is null
    and (q.expires_at is null or q.expires_at > now())
  limit 1;
$$;

insert into public.forge_lookup_options (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, 'loto_view', 'View LOTO Procedures', 'Open the approved Lockout / Tagout procedures for the linked asset. Works without signing in.', 40, true, true
from public.forge_lookup_definitions d
where d.lookup_key = 'qr.action'
on conflict (lookup_id, option_key) do update
set label = excluded.label, description = excluded.description, is_active = true;

-- ---------------------------------------------------------------------------
-- Lookups
-- ---------------------------------------------------------------------------

insert into public.forge_lookup_options (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('loto.application_status','in_progress','Issued','Locks are applied; steps are being worked through.',10),
    ('loto.application_status','verified','Verified','Zero energy confirmed. Work may proceed.',15),
    ('loto.application_status','completed','Returned to Service','All locks removed and restoration checks complete.',20),
    ('loto.application_status','canceled','Canceled','Lockout was canceled before return to service.',30)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key = v.lookup_key
on conflict (lookup_id, option_key) do update
set label = excluded.label, description = excluded.description, sort_order = excluded.sort_order, is_active = true;

-- The first lookup migration seeded 'active' and 'under_review'; the runtime uses 'approved' and 'review'.
update public.forge_lookup_options o
set is_active = false
from public.forge_lookup_definitions d
where o.lookup_id = d.id
  and d.lookup_key = 'loto.status'
  and o.option_key in ('active','under_review');

-- ---------------------------------------------------------------------------
-- Access: service role only (member SELECT policies from the runtime migration are removed)
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'forge_loto_sequences','forge_loto_procedures','forge_loto_energy_sources','forge_loto_steps',
    'forge_loto_reviews','forge_loto_applications','forge_loto_procedure_versions',
    'forge_loto_photos','forge_loto_review_returns','forge_loto_settings','forge_loto_application_locks'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon, authenticated', v_table);
    execute format('grant all on public.%I to service_role', v_table);
  end loop;
end
$$;

drop policy if exists forge_loto_procedures_member_select on public.forge_loto_procedures;
drop policy if exists forge_loto_energy_sources_member_select on public.forge_loto_energy_sources;
drop policy if exists forge_loto_steps_member_select on public.forge_loto_steps;
drop policy if exists forge_loto_reviews_member_select on public.forge_loto_reviews;
drop policy if exists forge_loto_applications_member_select on public.forge_loto_applications;
drop policy if exists forge_loto_procedure_versions_member_select on public.forge_loto_procedure_versions;

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.forge_loto_photos_guard()',
    'public.forge_loto_return_for_correction(uuid, uuid, text, uuid)',
    'public.forge_loto_settings_guard()',
    'public.forge_loto_person_authorized(uuid, uuid, uuid)',
    'public.forge_loto_assert_lock_holder(uuid, uuid, text)',
    'public.next_forge_lockout_number(uuid)',
    'public.forge_loto_build_snapshot(uuid)',
    'public.forge_loto_issue_lockout(uuid, uuid, uuid, text, text, boolean, boolean, jsonb)',
    'public.forge_loto_lock_application(uuid, uuid)',
    'public.forge_loto_check_step(uuid, uuid, text, boolean, uuid)',
    'public.forge_loto_add_lock(uuid, uuid, uuid, text, text, uuid)',
    'public.forge_loto_remove_lock(uuid, uuid, text, uuid)',
    'public.forge_loto_verify_lockout(uuid, uuid, boolean, boolean, text, uuid)',
    'public.forge_loto_complete_lockout(uuid, uuid, jsonb, text, uuid)',
    'public.forge_loto_cancel_lockout(uuid, uuid, text, uuid)',
    'public.forge_resolve_qr_token(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Relationship and settings permission
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('loto.settings', 'loto', 'Manage LOTO Settings', 'Choose the authorized-employee course and whether lock holders must have current training.', 'Lockout / Tagout', 'configure', true, false, 'organization', true, false, true, 'sensitive', 197)
on conflict (permission_key) do update
set name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, default_scope = excluded.default_scope, is_sensitive = excluded.is_sensitive,
    danger_level = excluded.danger_level, sort_order = excluded.sort_order, updated_at = now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key = 'loto.settings'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed = true, scope = 'organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key = 'loto.settings'
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed = true, scope = 'organization';

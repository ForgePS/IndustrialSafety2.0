-- Port slice 3 from Forge Industrial Safety 1.0: training LMS.
--
-- 1.0 source: packages/database/src/schema/industrial.ts (industrial_training_*), industrial-training.service.ts,
-- industrial-training-lms.service.ts, industrial-training-assignments.service.ts,
-- industrial-public-training.service.ts and training-paper-quiz.ts.
--
-- Builds on 2.0's existing forge_training_courses / _assignments / _completions:
--   * Course versions with sections, materials and a question bank. A published version is frozen;
--     changes go into a new draft cloned from it, so every attempt traces to the exact content it used.
--   * Quiz attempts graded inside the database. A pass records an approved completion with expiry and a
--     certificate number and completes the assignment, all in one transaction.
--   * Training groups with required courses (drives the compliance matrix and bulk assignment).
--   * Kiosk portal links: employees sign in with their employee number (1.0 behaviour), rate limited
--     (8 failures / 15 minutes -> 15 minute block) with 1-hour sessions.
--   * Paper quiz results entered as a percentage by employee number (1.0 behaviour).
--   * Certificate settings per company.
--
-- Every table is service-role only; access goes through server actions that check training.* permissions.

-- ---------------------------------------------------------------------------
-- Versions, sections, questions, materials
-- ---------------------------------------------------------------------------

create table if not exists public.forge_training_course_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.forge_training_courses(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  label text,
  status text not null default 'draft' check (status in ('draft','published','retired')),
  passing_percent integer not null default 70 check (passing_percent between 1 and 100),
  -- Questions drawn per attempt; null = every active question.
  quiz_question_count integer check (quiz_question_count is null or quiz_question_count > 0),
  max_attempts integer check (max_attempts is null or max_attempts > 0),
  requires_acknowledgement boolean not null default false,
  acknowledgement_text text,
  effective_date date,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, version_number),
  constraint forge_training_versions_ack_text check (not requires_acknowledgement or length(btrim(coalesce(acknowledgement_text, ''))) > 0)
);

create unique index if not exists forge_training_versions_one_published_idx
  on public.forge_training_course_versions (course_id)
  where status = 'published';

create table if not exists public.forge_training_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.forge_training_courses(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text,
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null unique,
  content_type text not null check (content_type in (
    'application/pdf','image/png','image/jpeg','image/webp','video/mp4','text/plain'
  )),
  size_bytes integer not null check (size_bytes between 1 and 52428800),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists forge_training_materials_course_idx
  on public.forge_training_materials (organization_id, course_id)
  where archived_at is null;

create table if not exists public.forge_training_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_id uuid not null references public.forge_training_course_versions(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  body text,
  material_id uuid references public.forge_training_materials(id) on delete set null,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_training_sections_version_idx
  on public.forge_training_sections (version_id, sort_order);

create table if not exists public.forge_training_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_id uuid not null references public.forge_training_course_versions(id) on delete cascade,
  stem text not null check (length(btrim(stem)) > 0),
  choices text[] not null check (cardinality(choices) between 2 and 6),
  correct_index smallint not null,
  explanation text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_training_questions_correct_in_range check (correct_index >= 0 and correct_index < cardinality(choices)),
  constraint forge_training_questions_choices_filled check (array_position(choices, '') is null and array_position(choices, null) is null)
);

create index if not exists forge_training_questions_version_idx
  on public.forge_training_questions (version_id, sort_order);

-- ---------------------------------------------------------------------------
-- Learner progress and attempts
-- ---------------------------------------------------------------------------

create table if not exists public.forge_training_progress (
  assignment_id uuid primary key references public.forge_training_assignments(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version_id uuid not null references public.forge_training_course_versions(id) on delete cascade,
  sections_completed uuid[] not null default '{}',
  content_completed_at timestamptz,
  first_opened_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

create table if not exists public.forge_training_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid not null references public.forge_training_assignments(id) on delete cascade,
  course_id uuid not null references public.forge_training_courses(id) on delete cascade,
  version_id uuid references public.forge_training_course_versions(id) on delete set null,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  channel text not null check (channel in ('online','kiosk','paper')),
  status text not null default 'in_progress' check (status in ('in_progress','submitted','abandoned')),
  question_ids uuid[] not null default '{}',
  answers smallint[],
  score_correct integer,
  score_total integer,
  score_percent integer check (score_percent is null or score_percent between 0 and 100),
  passing_percent integer,
  passed boolean,
  acknowledged_at timestamptz,
  acknowledgement_text text,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  started_by uuid references auth.users(id) on delete set null,
  entered_by uuid references auth.users(id) on delete set null,
  completion_id uuid references public.forge_training_completions(id) on delete set null,
  unique (assignment_id, attempt_number)
);

-- One open attempt per assignment.
create unique index if not exists forge_training_attempts_one_open_idx
  on public.forge_training_attempts (assignment_id)
  where status = 'in_progress';

create index if not exists forge_training_attempts_person_idx
  on public.forge_training_attempts (organization_id, personnel_id, started_at desc);

-- Completions now record where they came from.
alter table public.forge_training_completions
  add column if not exists version_id uuid references public.forge_training_course_versions(id) on delete set null,
  add column if not exists attempt_id uuid references public.forge_training_attempts(id) on delete set null,
  add column if not exists source text not null default 'manual';

alter table public.forge_training_completions drop constraint if exists forge_training_completions_source_check;
alter table public.forge_training_completions
  add constraint forge_training_completions_source_check check (source in ('manual','online','kiosk','paper'));

-- ---------------------------------------------------------------------------
-- Certificate numbers and settings
-- ---------------------------------------------------------------------------

create table if not exists public.forge_training_certificate_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cert_year integer not null,
  next_value integer not null default 1,
  primary key (organization_id, cert_year)
);

create or replace function public.next_forge_training_certificate_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from current_date)::integer;
  v_number integer;
begin
  insert into public.forge_training_certificate_sequences (organization_id, cert_year, next_value)
  values (p_organization_id, v_year, 2)
  on conflict (organization_id, cert_year)
  do update set next_value = public.forge_training_certificate_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'CERT-' || v_year::text || '-' || lpad(v_number::text, 5, '0');
end;
$$;

create table if not exists public.forge_training_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  certificate_title text not null default 'Certificate of Completion',
  signer_name text,
  signer_title text,
  footer_text text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Groups and required training
-- ---------------------------------------------------------------------------

create table if not exists public.forge_training_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_training_groups_active_name_idx
  on public.forge_training_groups (organization_id, lower(btrim(name)))
  where is_active;

create table if not exists public.forge_training_group_members (
  group_id uuid not null references public.forge_training_groups(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, personnel_id)
);

create table if not exists public.forge_training_group_requirements (
  group_id uuid not null references public.forge_training_groups(id) on delete cascade,
  course_id uuid not null references public.forge_training_courses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, course_id)
);

-- ---------------------------------------------------------------------------
-- Kiosk portal
-- ---------------------------------------------------------------------------

create table if not exists public.forge_training_portal_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  token_hash text not null unique,
  -- Optional: only people assigned to this Location may sign in through the link.
  location_id uuid references public.locations(id) on delete set null,
  is_active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_training_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  link_id uuid not null references public.forge_training_portal_links(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists forge_training_portal_sessions_expires_idx
  on public.forge_training_portal_sessions (expires_at);

create table if not exists public.forge_training_portal_rate_limits (
  link_id uuid not null references public.forge_training_portal_links(id) on delete cascade,
  bucket_key text not null,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  primary key (link_id, bucket_key)
);

-- Records a failed sign-in and returns when the bucket is blocked until (null if not blocked).
-- 1.0 limits: 8 failures within 15 minutes block the bucket for 15 minutes.
create or replace function public.forge_training_portal_register_failure(p_link_id uuid, p_bucket_key text)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_row public.forge_training_portal_rate_limits;
begin
  insert into public.forge_training_portal_rate_limits (link_id, bucket_key, failed_count, window_started_at)
  values (p_link_id, p_bucket_key, 1, now())
  on conflict (link_id, bucket_key) do update
  set
    failed_count = case
      when public.forge_training_portal_rate_limits.window_started_at < now() - interval '15 minutes' then 1
      else public.forge_training_portal_rate_limits.failed_count + 1
    end,
    window_started_at = case
      when public.forge_training_portal_rate_limits.window_started_at < now() - interval '15 minutes' then now()
      else public.forge_training_portal_rate_limits.window_started_at
    end
  returning * into v_row;

  if v_row.failed_count >= 8 then
    update public.forge_training_portal_rate_limits
    set blocked_until = now() + interval '15 minutes'
    where link_id = p_link_id and bucket_key = p_bucket_key
    returning * into v_row;
  end if;

  return v_row.blocked_until;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

create or replace function public.forge_guard_training_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.forge_training_courses', new.course_id, new.organization_id, 'Course');

  if tg_op = 'UPDATE' then
    if new.course_id <> old.course_id or new.version_number <> old.version_number then
      raise exception 'A version cannot move between courses.' using errcode = '23514';
    end if;

    -- Published and retired versions are frozen; only the status may move forward.
    if old.status <> 'draft' then
      if new.status = 'draft' then
        raise exception 'A published version cannot return to draft. Clone it into a new draft.' using errcode = '23514';
      end if;
      if (new.passing_percent, new.quiz_question_count, new.max_attempts, new.requires_acknowledgement,
          coalesce(new.acknowledgement_text, ''), coalesce(new.label, ''), new.effective_date)
         is distinct from
         (old.passing_percent, old.quiz_question_count, old.max_attempts, old.requires_acknowledgement,
          coalesce(old.acknowledgement_text, ''), coalesce(old.label, ''), old.effective_date) then
        raise exception 'Published versions are frozen. Clone the version to make changes.' using errcode = '23514';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_training_versions_guard on public.forge_training_course_versions;
create trigger forge_training_versions_guard
before insert or update on public.forge_training_course_versions
for each row execute function public.forge_guard_training_version();

-- Sections and questions may only change while their version is a draft. Published versions also refuse
-- deletion, because attempts reference their questions.
create or replace function public.forge_guard_training_version_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Cascades from deleting the course (or organization) remove the parent first; let those through.
  if old.status <> 'draft' and exists (select 1 from public.forge_training_courses where id = old.course_id) then
    raise exception 'Only draft versions can be deleted.' using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists forge_training_versions_delete_guard on public.forge_training_course_versions;
create trigger forge_training_versions_delete_guard
before delete on public.forge_training_course_versions
for each row execute function public.forge_guard_training_version_delete();

create or replace function public.forge_guard_training_version_content()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_version public.forge_training_course_versions;
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  select * into v_version from public.forge_training_course_versions where id = (v_row ->> 'version_id')::uuid;

  -- Cascade from deleting a draft version: the parent is already gone.
  if tg_op = 'DELETE' and v_version.id is null then
    return old;
  end if;

  if v_version.id is null or v_version.organization_id <> (v_row ->> 'organization_id')::uuid then
    raise exception 'Version does not belong to this organization.' using errcode = '23503';
  end if;

  if v_version.status <> 'draft' then
    raise exception 'Published versions are frozen. Clone the version to make changes.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and (to_jsonb(old) ->> 'version_id') <> (v_row ->> 'version_id') then
    raise exception 'Content cannot move between versions.' using errcode = '23514';
  end if;

  if tg_table_name = 'forge_training_sections' and (v_row ->> 'material_id') is not null then
    perform 1 from public.forge_training_materials m
    where m.id = (v_row ->> 'material_id')::uuid and m.course_id = v_version.course_id and m.archived_at is null;
    if not found then
      raise exception 'Material must belong to the same course.' using errcode = '23503';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_training_sections_guard on public.forge_training_sections;
create trigger forge_training_sections_guard
before insert or update or delete on public.forge_training_sections
for each row execute function public.forge_guard_training_version_content();

drop trigger if exists forge_training_questions_guard on public.forge_training_questions;
create trigger forge_training_questions_guard
before insert or update or delete on public.forge_training_questions
for each row execute function public.forge_guard_training_version_content();

create or replace function public.forge_guard_training_org_child()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
begin
  if tg_table_name = 'forge_training_materials' then
    perform public.forge_assert_same_org('public.forge_training_courses', (v_row ->> 'course_id')::uuid, new.organization_id, 'Course');
  elsif tg_table_name = 'forge_training_group_members' then
    perform public.forge_assert_same_org('public.forge_training_groups', (v_row ->> 'group_id')::uuid, new.organization_id, 'Group');
    perform public.forge_assert_same_org('public.forge_personnel', (v_row ->> 'personnel_id')::uuid, new.organization_id, 'Personnel record');
  elsif tg_table_name = 'forge_training_group_requirements' then
    perform public.forge_assert_same_org('public.forge_training_groups', (v_row ->> 'group_id')::uuid, new.organization_id, 'Group');
    perform public.forge_assert_same_org('public.forge_training_courses', (v_row ->> 'course_id')::uuid, new.organization_id, 'Course');
  elsif tg_table_name = 'forge_training_portal_links' then
    perform public.forge_assert_same_org('public.locations', (v_row ->> 'location_id')::uuid, new.organization_id, 'Location');
  end if;

  return new;
end;
$$;

drop trigger if exists forge_training_materials_guard on public.forge_training_materials;
create trigger forge_training_materials_guard before insert or update on public.forge_training_materials
for each row execute function public.forge_guard_training_org_child();

drop trigger if exists forge_training_group_members_guard on public.forge_training_group_members;
create trigger forge_training_group_members_guard before insert or update on public.forge_training_group_members
for each row execute function public.forge_guard_training_org_child();

drop trigger if exists forge_training_group_requirements_guard on public.forge_training_group_requirements;
create trigger forge_training_group_requirements_guard before insert or update on public.forge_training_group_requirements
for each row execute function public.forge_guard_training_org_child();

drop trigger if exists forge_training_portal_links_guard on public.forge_training_portal_links;
create trigger forge_training_portal_links_guard before insert or update on public.forge_training_portal_links
for each row execute function public.forge_guard_training_org_child();

-- ---------------------------------------------------------------------------
-- Publishing and cloning versions
-- ---------------------------------------------------------------------------

create or replace function public.forge_publish_training_version(
  p_organization_id uuid,
  p_version_id uuid,
  p_actor_user_id uuid
)
returns public.forge_training_course_versions
language plpgsql
set search_path = public
as $$
declare
  v_version public.forge_training_course_versions;
  v_questions integer;
  v_sections integer;
begin
  select * into v_version from public.forge_training_course_versions
  where id = p_version_id and organization_id = p_organization_id
  for update;

  if v_version.id is null then
    raise exception 'Version not found.' using errcode = 'P0002';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'Only draft versions can be published.' using errcode = '23514';
  end if;

  select count(*) into v_sections from public.forge_training_sections where version_id = p_version_id;
  select count(*) into v_questions from public.forge_training_questions where version_id = p_version_id and is_active;

  if v_sections = 0 and v_questions = 0 then
    raise exception 'Add at least one section or quiz question before publishing.' using errcode = '23514';
  end if;
  if v_version.quiz_question_count is not null and v_version.quiz_question_count > v_questions then
    raise exception 'The quiz draws % questions but only % are active.', v_version.quiz_question_count, v_questions using errcode = '23514';
  end if;

  update public.forge_training_course_versions
  set status = 'retired', updated_by = p_actor_user_id
  where course_id = v_version.course_id and status = 'published';

  update public.forge_training_course_versions
  set status = 'published', published_at = now(), published_by = p_actor_user_id, updated_by = p_actor_user_id
  where id = p_version_id
  returning * into v_version;

  return v_version;
end;
$$;

create or replace function public.forge_clone_training_version(
  p_organization_id uuid,
  p_version_id uuid,
  p_actor_user_id uuid
)
returns public.forge_training_course_versions
language plpgsql
set search_path = public
as $$
declare
  v_source public.forge_training_course_versions;
  v_new public.forge_training_course_versions;
  v_next integer;
begin
  select * into v_source from public.forge_training_course_versions
  where id = p_version_id and organization_id = p_organization_id;

  if v_source.id is null then
    raise exception 'Version not found.' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.forge_training_course_versions where course_id = v_source.course_id and status = 'draft') then
    raise exception 'This course already has a draft version.' using errcode = '23505';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
  from public.forge_training_course_versions where course_id = v_source.course_id;

  insert into public.forge_training_course_versions (
    organization_id, course_id, version_number, label, status, passing_percent, quiz_question_count,
    max_attempts, requires_acknowledgement, acknowledgement_text, effective_date, created_by, updated_by
  )
  values (
    p_organization_id, v_source.course_id, v_next, null, 'draft', v_source.passing_percent, v_source.quiz_question_count,
    v_source.max_attempts, v_source.requires_acknowledgement, v_source.acknowledgement_text, null, p_actor_user_id, p_actor_user_id
  )
  returning * into v_new;

  insert into public.forge_training_sections (organization_id, version_id, title, body, material_id, sort_order, is_required, estimated_minutes)
  select p_organization_id, v_new.id, title, body, material_id, sort_order, is_required, estimated_minutes
  from public.forge_training_sections where version_id = p_version_id;

  insert into public.forge_training_questions (organization_id, version_id, stem, choices, correct_index, explanation, sort_order, is_active)
  select p_organization_id, v_new.id, stem, choices, correct_index, explanation, sort_order, is_active
  from public.forge_training_questions where version_id = p_version_id;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attempts: start, submit, paper results
-- ---------------------------------------------------------------------------

-- Records an approved completion for a passed attempt and completes the assignment.
create or replace function public.forge_record_training_pass(
  p_attempt public.forge_training_attempts,
  p_completed_at timestamptz,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_course public.forge_training_courses;
  v_completion_id uuid;
  v_source text := p_attempt.channel;
begin
  select * into v_course from public.forge_training_courses where id = p_attempt.course_id;

  insert into public.forge_training_completions (
    organization_id, assignment_id, course_id, personnel_id, completed_at, score, result,
    approval_status, approved_by, approved_at, certificate_number, expires_at, version_id, attempt_id, source,
    created_by, updated_by
  )
  values (
    p_attempt.organization_id, p_attempt.assignment_id, p_attempt.course_id, p_attempt.personnel_id, p_completed_at,
    p_attempt.score_percent, 'passed', 'approved', p_actor_user_id, now(),
    public.next_forge_training_certificate_number(p_attempt.organization_id),
    case when v_course.validity_months is not null
      then (p_completed_at::date + make_interval(months => v_course.validity_months))::date end,
    p_attempt.version_id, p_attempt.id, v_source, p_actor_user_id, p_actor_user_id
  )
  returning id into v_completion_id;

  update public.forge_training_assignments
  set status = 'completed', updated_at = now()
  where id = p_attempt.assignment_id;

  update public.forge_training_attempts set completion_id = v_completion_id where id = p_attempt.id;

  return v_completion_id;
end;
$$;

create or replace function public.forge_start_training_attempt(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_channel text,
  p_actor_user_id uuid
)
returns public.forge_training_attempts
language plpgsql
set search_path = public
as $$
declare
  v_assignment public.forge_training_assignments;
  v_version public.forge_training_course_versions;
  v_progress public.forge_training_progress;
  v_attempt public.forge_training_attempts;
  v_questions uuid[];
  v_used integer;
  v_required integer;
begin
  if p_channel not in ('online','kiosk') then
    raise exception 'Unsupported channel.' using errcode = '22023';
  end if;

  select * into v_assignment from public.forge_training_assignments
  where id = p_assignment_id and organization_id = p_organization_id
  for update;

  if v_assignment.id is null then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if v_assignment.status not in ('assigned','in_progress','overdue') then
    raise exception 'This training is not open.' using errcode = '23514';
  end if;

  select * into v_attempt from public.forge_training_attempts
  where assignment_id = p_assignment_id and status = 'in_progress';
  if v_attempt.id is not null then
    return v_attempt;
  end if;

  select * into v_version from public.forge_training_course_versions
  where course_id = v_assignment.course_id and status = 'published';
  if v_version.id is null then
    raise exception 'This course has no published content yet.' using errcode = '23514';
  end if;

  select count(*) into v_required from public.forge_training_sections where version_id = v_version.id and is_required;
  if v_required > 0 then
    select * into v_progress from public.forge_training_progress where assignment_id = p_assignment_id;
    if v_progress.content_completed_at is null or v_progress.version_id <> v_version.id then
      raise exception 'Finish the required sections before starting the quiz.' using errcode = '23514';
    end if;
  end if;

  select count(*) into v_used from public.forge_training_attempts
  where assignment_id = p_assignment_id and status = 'submitted' and channel <> 'paper';
  if v_version.max_attempts is not null and v_used >= v_version.max_attempts then
    raise exception 'No quiz attempts remain. Ask your supervisor to reassign this training.' using errcode = '23514';
  end if;

  select array_agg(id) into v_questions from (
    select id from public.forge_training_questions
    where version_id = v_version.id and is_active
    order by random()
    limit coalesce(v_version.quiz_question_count, 1000)
  ) q;

  if coalesce(cardinality(v_questions), 0) = 0 then
    raise exception 'This course has no quiz.' using errcode = '23514';
  end if;

  insert into public.forge_training_attempts (
    organization_id, assignment_id, course_id, version_id, personnel_id, attempt_number, channel,
    question_ids, passing_percent, started_by
  )
  values (
    p_organization_id, p_assignment_id, v_assignment.course_id, v_version.id, v_assignment.personnel_id,
    (select coalesce(max(attempt_number), 0) + 1 from public.forge_training_attempts where assignment_id = p_assignment_id),
    p_channel, v_questions, v_version.passing_percent, p_actor_user_id
  )
  returning * into v_attempt;

  update public.forge_training_assignments set status = 'in_progress', updated_at = now()
  where id = p_assignment_id and status in ('assigned','overdue');

  return v_attempt;
end;
$$;

create or replace function public.forge_submit_training_attempt(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_answers smallint[],
  p_acknowledged boolean,
  p_actor_user_id uuid
)
returns public.forge_training_attempts
language plpgsql
set search_path = public
as $$
declare
  v_attempt public.forge_training_attempts;
  v_version public.forge_training_course_versions;
  v_correct integer := 0;
  v_total integer;
  v_percent integer;
  v_question record;
  v_completion uuid;
begin
  select * into v_attempt from public.forge_training_attempts
  where id = p_attempt_id and organization_id = p_organization_id
  for update;

  if v_attempt.id is null then
    raise exception 'Attempt not found.' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'This attempt was already submitted.' using errcode = '23514';
  end if;

  v_total := cardinality(v_attempt.question_ids);
  if coalesce(cardinality(p_answers), 0) <> v_total then
    raise exception 'Answer every question before submitting.' using errcode = '22023';
  end if;
  if array_position(p_answers, null) is not null then
    raise exception 'Answer every question before submitting.' using errcode = '22023';
  end if;

  select * into v_version from public.forge_training_course_versions where id = v_attempt.version_id;
  if v_version.requires_acknowledgement and not coalesce(p_acknowledged, false) then
    raise exception 'Confirm the acknowledgement before submitting.' using errcode = '22023';
  end if;

  for v_question in
    select q.correct_index, cardinality(q.choices) as choice_count, a.ord
    from unnest(v_attempt.question_ids) with ordinality as a(question_id, ord)
    join public.forge_training_questions q on q.id = a.question_id
  loop
    if p_answers[v_question.ord] < 0 or p_answers[v_question.ord] >= v_question.choice_count then
      raise exception 'An answer is out of range.' using errcode = '22023';
    end if;
    if p_answers[v_question.ord] = v_question.correct_index then
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_percent := round(v_correct * 100.0 / v_total);

  update public.forge_training_attempts
  set
    status = 'submitted',
    answers = p_answers,
    score_correct = v_correct,
    score_total = v_total,
    score_percent = v_percent,
    passed = v_percent >= v_attempt.passing_percent,
    acknowledged_at = case when v_version.requires_acknowledgement then now() end,
    acknowledgement_text = case when v_version.requires_acknowledgement then v_version.acknowledgement_text end,
    submitted_at = now()
  where id = p_attempt_id
  returning * into v_attempt;

  if v_attempt.passed then
    v_completion := public.forge_record_training_pass(v_attempt, now(), p_actor_user_id);
    select * into v_attempt from public.forge_training_attempts where id = p_attempt_id;
  end if;

  return v_attempt;
end;
$$;

-- Paper quiz: a percentage entered by a trainer (1.0 applyPaperResults).
create or replace function public.forge_record_paper_training_result(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_percent integer,
  p_completed_on date,
  p_actor_user_id uuid
)
returns public.forge_training_attempts
language plpgsql
set search_path = public
as $$
declare
  v_assignment public.forge_training_assignments;
  v_version public.forge_training_course_versions;
  v_attempt public.forge_training_attempts;
  v_passing integer;
begin
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'Enter a percentage between 0 and 100.' using errcode = '22023';
  end if;
  if p_completed_on is null or p_completed_on > current_date then
    raise exception 'The quiz date cannot be in the future.' using errcode = '22023';
  end if;

  select * into v_assignment from public.forge_training_assignments
  where id = p_assignment_id and organization_id = p_organization_id
  for update;

  if v_assignment.id is null then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if v_assignment.status not in ('assigned','in_progress','overdue') then
    raise exception 'This training is not open.' using errcode = '23514';
  end if;

  select * into v_version from public.forge_training_course_versions
  where course_id = v_assignment.course_id and status = 'published';
  v_passing := coalesce(v_version.passing_percent, 70);

  -- A paper result closes any online attempt left open.
  update public.forge_training_attempts set status = 'abandoned'
  where assignment_id = p_assignment_id and status = 'in_progress';

  insert into public.forge_training_attempts (
    organization_id, assignment_id, course_id, version_id, personnel_id, attempt_number, channel, status,
    score_percent, passing_percent, passed, started_at, submitted_at, entered_by
  )
  values (
    p_organization_id, p_assignment_id, v_assignment.course_id, v_version.id, v_assignment.personnel_id,
    (select coalesce(max(attempt_number), 0) + 1 from public.forge_training_attempts where assignment_id = p_assignment_id),
    'paper', 'submitted', p_percent, v_passing, p_percent >= v_passing, p_completed_on::timestamptz, p_completed_on::timestamptz, p_actor_user_id
  )
  returning * into v_attempt;

  if v_attempt.passed then
    perform public.forge_record_training_pass(v_attempt, p_completed_on::timestamptz, p_actor_user_id);
    select * into v_attempt from public.forge_training_attempts where id = v_attempt.id;
  end if;

  return v_attempt;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket for course materials (private; served through signed URLs)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('forge-training', 'forge-training', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

-- ---------------------------------------------------------------------------
-- RLS: service role only; functions callable by the service role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'forge_training_course_versions','forge_training_materials','forge_training_sections','forge_training_questions',
    'forge_training_progress','forge_training_attempts','forge_training_certificate_sequences','forge_training_settings',
    'forge_training_groups','forge_training_group_members','forge_training_group_requirements',
    'forge_training_portal_links','forge_training_portal_sessions','forge_training_portal_rate_limits'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.next_forge_training_certificate_number(uuid)',
    'public.forge_training_portal_register_failure(uuid, text)',
    'public.forge_publish_training_version(uuid, uuid, uuid)',
    'public.forge_clone_training_version(uuid, uuid, uuid)',
    'public.forge_record_training_pass(public.forge_training_attempts, timestamptz, uuid)',
    'public.forge_start_training_attempt(uuid, uuid, text, uuid)',
    'public.forge_submit_training_attempt(uuid, uuid, smallint[], boolean, uuid)',
    'public.forge_record_paper_training_result(uuid, uuid, integer, date, uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('training.manage_content','training','Manage Course Content','Create versions, sections, materials and quiz questions, and publish courses.','Training','manage_content',true,false,'organization',false,false,true,'normal',35),
  ('training.manage_groups','training','Manage Training Groups','Create training groups, members and required courses.','Training','manage_groups',true,false,'organization',false,false,true,'normal',36),
  ('training.manage_portal','training','Manage Training Kiosk','Create and revoke kiosk portal links that sign employees in by employee number.','Training','manage_portal',true,false,'organization',true,true,true,'sensitive',37)
on conflict (permission_key) do update
set
  name=excluded.name,
  description=excluded.description,
  permission_group=excluded.permission_group,
  action=excluded.action,
  tenant_assignable=excluded.tenant_assignable,
  tenant_can_scope=excluded.tenant_can_scope,
  default_scope=excluded.default_scope,
  is_sensitive=excluded.is_sensitive,
  requires_confirmation=excluded.requires_confirmation,
  audit_use=excluded.audit_use,
  danger_level=excluded.danger_level,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('training.manage_content','training.manage_groups','training.manage_portal')
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('training.manage_content','training.manage_groups','training.manage_portal')
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

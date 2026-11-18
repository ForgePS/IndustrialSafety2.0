-- =============================================================================
-- Seed-only helpers for the demo-plant module seed files (20, 30, 35, 40).
-- The Supabase CLI sends a seed file in batches and checks every statement in a batch before
-- running any of them, so a statement cannot rely on a table or function created earlier in
-- the same file. Everything the module files need is created here, in an earlier file, and
-- dropped by 99_demo_seed_cleanup.sql.
-- =============================================================================

drop schema if exists demo_seed_20 cascade;
create schema demo_seed_20;
drop schema if exists demo_seed_30 cascade;
create schema demo_seed_30;
drop schema if exists demo_seed_35 cascade;
create schema demo_seed_35;
drop schema if exists demo_seed_40 cascade;
create schema demo_seed_40;

-- Scratch tables
create table demo_seed_20.f62_obs_tx (n integer, seq integer, tkey text, at timestamptz, actor text, comment text);
alter table demo_seed_20.f62_obs_tx add column from_s text, add column to_s text;

create table demo_seed_20.f62_risk_tx (n integer, seq integer, tkey text, at timestamptz, comment text);
alter table demo_seed_20.f62_risk_tx add column from_s text, add column to_s text;

create table demo_seed_20.f62_jsa_haz (
  j integer, s integer, step_title text, step_desc text, h integer, hazard text, cat text,
  lk text, sk text, rlk text, rsk text, controls text[]
);

create table demo_seed_20.f62_jsa_tx (j integer, seq integer, tkey text, from_s text, to_s text, at timestamptz, comment text);

create table demo_seed_20.f62_exec (
  e integer, j integer, created_at timestamptz, minutes integer, final_status text,
  lead integer, crew integer[], notes text, stop_reason text
);

create table demo_seed_30.cb_capa (
  ord integer,
  id uuid,
  task_id uuid,
  title text,
  description text,
  action_type text,
  severity text,
  initial_status text,
  source_type text,
  source_id uuid,
  source_link_type text,
  person uuid,
  created_at timestamptz,
  due_at timestamptz,
  immediate_containment text,
  root_cause text,
  action_plan text,
  preventive_action text,
  verification_due_at timestamptz,
  effectiveness_review_due_at timestamptz
);

create table demo_seed_30.cb_capa_step (
  capa_id uuid,
  step integer,
  to_status text,
  at timestamptz,
  note text,
  verification_result text
);

create table demo_seed_35.cb_training_rows (n integer, ckey text, course_id uuid, validity_months integer, personnel_id uuid, asg integer, due integer, comp text, result text, score integer, hours numeric, instructor text, approval text, cert text, notes text);

-- Helper functions
create or replace function demo_seed_20.f62_id(p text) returns uuid
language sql immutable as $$ select ('62000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;

create or replace function demo_seed_20.f62_p(nn integer) returns uuid
language sql immutable as $$
  select case when nn is null then null
              when nn = 0 then '20000000-0000-4000-8000-000000000600'::uuid
              else ('60000000-0000-4000-8000-0000000030' || lpad(nn::text, 2, '0'))::uuid end
$$;

create or replace function demo_seed_20.f62_u(code text) returns uuid
language sql immutable as $$
  select case when code is null then null
              when code = 'U' then '20000000-0000-4000-8000-000000000002'::uuid
              else '20000000-0000-4000-8000-000000000001'::uuid end
$$;

create or replace function demo_seed_20.f62_ts(d integer, t text) returns timestamptz
language sql stable as $$
  select ((date_trunc('day', now() at time zone 'America/Chicago') - make_interval(days => d))
          + t::interval) at time zone 'America/Chicago'
$$;

create or replace function demo_seed_20.f62_matrix() returns uuid
language sql stable as $$
  select id from public.forge_risk_matrices
  where organization_id = '20000000-0000-4000-8000-000000000100' and is_default and is_active
  order by version desc limit 1
$$;

create or replace function demo_seed_20.f62_matrix_version() returns integer
language sql stable as $$ select version from public.forge_risk_matrices where id = demo_seed_20.f62_matrix() $$;

create or replace function demo_seed_20.f62_score(lk text, sk text) returns integer
language sql stable as $$
  select c.score
  from public.forge_risk_matrix_cells c
  join public.forge_risk_likelihood_levels l on l.id = c.likelihood_level_id
  join public.forge_risk_severity_levels s on s.id = c.severity_level_id
  where c.risk_matrix_id = demo_seed_20.f62_matrix() and l.level_key = lk and s.level_key = sk
$$;

create or replace function demo_seed_20.f62_band(lk text, sk text) returns text
language sql stable as $$
  select b.band_key
  from public.forge_risk_matrix_cells c
  join public.forge_risk_likelihood_levels l on l.id = c.likelihood_level_id
  join public.forge_risk_severity_levels s on s.id = c.severity_level_id
  join public.forge_risk_bands b on b.id = c.risk_band_id
  where c.risk_matrix_id = demo_seed_20.f62_matrix() and l.level_key = lk and s.level_key = sk
$$;

create or replace function demo_seed_30.cb_at(p_days integer, p_time time)
returns timestamptz language sql stable as $$
  select ((((now() at time zone 'America/Chicago')::date - p_days) + p_time) at time zone 'America/Chicago')
$$;

create or replace function demo_seed_30.cb_day(p_days integer)
returns date language sql stable as $$
  select (now() at time zone 'America/Chicago')::date - p_days
$$;

create or replace function demo_seed_30.cb_p(p_n integer)
returns uuid language sql immutable as $$
  select ('60000000-0000-4000-8000-0000000030' || lpad(p_n::text, 2, '0'))::uuid
$$;

create or replace function demo_seed_40.cb_ts(p_days_ago integer, p_time text)
returns timestamptz language sql stable as $$
  select (((now() at time zone 'America/Chicago')::date - p_days_ago) + p_time::time) at time zone 'America/Chicago'
$$;

create or replace function demo_seed_40.cb_id(p_suffix integer)
returns uuid language sql immutable as $$
  select ('64000000-0000-4000-8000-' || lpad(p_suffix::text, 12, '0'))::uuid
$$;

create or replace function demo_seed_40.cb_wc_days(p_case_id uuid, out days_away integer, out restricted_days integer)
language sql stable as $$
  select
    coalesce(sum(d) filter (where work_status = 'off_work'), 0)::integer,
    coalesce(sum(d) filter (where work_status = 'restricted'), 0)::integer
  from (
    select p.work_status,
      greatest(0, least(coalesce(p.end_date, (now() at time zone 'America/Chicago')::date), (now() at time zone 'America/Chicago')::date) - greatest(p.start_date, c.injury_date + 1) + 1) as d
    from public.forge_wc_work_status_periods p
    join public.forge_wc_cases c on c.id = p.case_id
    where p.case_id = p_case_id and p.work_status in ('off_work', 'restricted')
  ) x
$$;

create or replace function demo_seed_40.cb_kiosk_attempt(
  p_attempt integer, p_completion integer, p_assignment integer, p_version integer, p_attempt_number integer,
  p_wrong integer, p_days_ago integer, p_time text
) returns void language plpgsql as $$
declare
  v_assignment public.forge_training_assignments;
  v_version public.forge_training_course_versions;
  v_course public.forge_training_courses;
  v_questions uuid[];
  v_answers smallint[];
  v_correct integer := 0;
  v_total integer;
  v_percent integer;
  v_started timestamptz := demo_seed_40.cb_ts(p_days_ago, p_time);
  v_submitted timestamptz := demo_seed_40.cb_ts(p_days_ago, p_time) + interval '11 minutes';
  v_completion uuid;
  q record;
  i integer := 0;
begin
  if exists (select 1 from public.forge_training_attempts where id = demo_seed_40.cb_id(p_attempt)) then return; end if;

  select * into v_assignment from public.forge_training_assignments where id = demo_seed_40.cb_id(p_assignment);
  select * into v_version from public.forge_training_course_versions where id = demo_seed_40.cb_id(p_version);
  select * into v_course from public.forge_training_courses where id = v_assignment.course_id;

  v_questions := '{}';
  v_answers := '{}';
  for q in
    select id, correct_index, cardinality(choices) as n from public.forge_training_questions
    where version_id = v_version.id and is_active order by md5(id::text || p_attempt::text)
  loop
    i := i + 1;
    v_questions := v_questions || q.id;
    if i <= p_wrong then
      v_answers := v_answers || ((q.correct_index + 1) % q.n)::smallint;
    else
      v_answers := v_answers || q.correct_index::smallint;
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_total := cardinality(v_questions);
  v_percent := round(v_correct * 100.0 / v_total);

  insert into public.forge_training_progress (assignment_id, organization_id, version_id, sections_completed, content_completed_at, first_opened_at, last_accessed_at)
  select v_assignment.id, v_assignment.organization_id, v_version.id, array_agg(s.id order by s.sort_order),
         v_started - interval '2 minutes', v_started - interval '28 minutes', v_submitted
  from public.forge_training_sections s where s.version_id = v_version.id
  on conflict (assignment_id) do update set last_accessed_at = excluded.last_accessed_at;

  insert into public.forge_training_attempts (
    id, organization_id, assignment_id, course_id, version_id, personnel_id, attempt_number, channel, status,
    question_ids, answers, score_correct, score_total, score_percent, passing_percent, passed,
    acknowledged_at, acknowledgement_text, started_at, submitted_at, started_by
  )
  values (
    demo_seed_40.cb_id(p_attempt), v_assignment.organization_id, v_assignment.id, v_assignment.course_id, v_version.id, v_assignment.personnel_id,
    p_attempt_number, 'kiosk', 'submitted', v_questions, v_answers, v_correct, v_total, v_percent, v_version.passing_percent,
    v_percent >= v_version.passing_percent,
    case when v_version.requires_acknowledgement then v_submitted end,
    case when v_version.requires_acknowledgement then v_version.acknowledgement_text end,
    v_started, v_submitted, null
  );

  if v_percent >= v_version.passing_percent then
    v_completion := demo_seed_40.cb_id(p_completion);
    insert into public.forge_training_completions (
      id, organization_id, assignment_id, course_id, personnel_id, completed_at, score, result,
      approval_status, approved_by, approved_at, certificate_number, expires_at, version_id, attempt_id, source,
      created_by, updated_by, created_at, updated_at
    )
    values (
      v_completion, v_assignment.organization_id, v_assignment.id, v_assignment.course_id, v_assignment.personnel_id, v_submitted, v_percent, 'passed',
      'approved', null, v_submitted, public.next_forge_training_certificate_number(v_assignment.organization_id),
      case when v_course.validity_months is not null then (v_submitted::date + make_interval(months => v_course.validity_months))::date end,
      v_version.id, demo_seed_40.cb_id(p_attempt), 'kiosk', null, null, v_submitted, v_submitted
    );
    update public.forge_training_attempts set completion_id = v_completion where id = demo_seed_40.cb_id(p_attempt);
    update public.forge_training_assignments set status = 'completed', updated_at = v_submitted where id = v_assignment.id;
  else
    update public.forge_training_assignments set status = 'in_progress', updated_at = v_submitted where id = v_assignment.id and status in ('assigned', 'overdue');
  end if;
end;
$$;

create or replace function demo_seed_40.cb_paper_result(
  p_attempt integer, p_completion integer, p_assignment integer, p_version integer, p_percent integer, p_days_ago integer
) returns void language plpgsql as $$
declare
  v_assignment public.forge_training_assignments;
  v_version public.forge_training_course_versions;
  v_course public.forge_training_courses;
  v_on timestamptz := ((now() at time zone 'America/Chicago')::date - p_days_ago)::timestamptz;
  v_admin uuid := '20000000-0000-4000-8000-000000000001';
begin
  if exists (select 1 from public.forge_training_attempts where id = demo_seed_40.cb_id(p_attempt)) then return; end if;

  select * into v_assignment from public.forge_training_assignments where id = demo_seed_40.cb_id(p_assignment);
  select * into v_version from public.forge_training_course_versions where id = demo_seed_40.cb_id(p_version);
  select * into v_course from public.forge_training_courses where id = v_assignment.course_id;

  insert into public.forge_training_attempts (
    id, organization_id, assignment_id, course_id, version_id, personnel_id, attempt_number, channel, status,
    score_percent, passing_percent, passed, started_at, submitted_at, entered_by
  )
  values (
    demo_seed_40.cb_id(p_attempt), v_assignment.organization_id, v_assignment.id, v_assignment.course_id, v_version.id, v_assignment.personnel_id,
    (select coalesce(max(attempt_number), 0) + 1 from public.forge_training_attempts where assignment_id = v_assignment.id),
    'paper', 'submitted', p_percent, v_version.passing_percent, p_percent >= v_version.passing_percent, v_on, v_on, v_admin
  );

  if p_percent >= v_version.passing_percent then
    insert into public.forge_training_completions (
      id, organization_id, assignment_id, course_id, personnel_id, completed_at, score, result,
      approval_status, approved_by, approved_at, certificate_number, expires_at, version_id, attempt_id, source,
      created_by, updated_by, created_at, updated_at
    )
    values (
      demo_seed_40.cb_id(p_completion), v_assignment.organization_id, v_assignment.id, v_assignment.course_id, v_assignment.personnel_id, v_on, p_percent, 'passed',
      'approved', v_admin, demo_seed_40.cb_ts(p_days_ago, '16:40'), public.next_forge_training_certificate_number(v_assignment.organization_id),
      case when v_course.validity_months is not null then (v_on::date + make_interval(months => v_course.validity_months))::date end,
      v_version.id, demo_seed_40.cb_id(p_attempt), 'paper', v_admin, v_admin, demo_seed_40.cb_ts(p_days_ago, '16:40'), demo_seed_40.cb_ts(p_days_ago, '16:40')
    );
    update public.forge_training_attempts set completion_id = demo_seed_40.cb_id(p_completion) where id = demo_seed_40.cb_id(p_attempt);
    update public.forge_training_assignments set status = 'completed', updated_at = demo_seed_40.cb_ts(p_days_ago, '16:40') where id = v_assignment.id;
  end if;
end;
$$;

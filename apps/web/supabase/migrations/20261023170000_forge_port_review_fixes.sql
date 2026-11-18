-- Review fixes for the Industrial 1.0 port (PR #12).
--
-- 1. Content-only training: a published version with sections but no quiz can now be completed. The learner
--    finishes the required sections, acknowledges if the version asks for it, then completes the course.
-- 2. Closing a workers' comp case ends its open work-status period and closes the case in one locked,
--    version-checked step, so a conflict never leaves the period changed on its own.

-- ---------------------------------------------------------------------------
-- 1. Completing a course that has no quiz
-- ---------------------------------------------------------------------------

alter table public.forge_training_progress
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledgement_text text;

create or replace function public.forge_complete_training_without_quiz(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_channel text,
  p_acknowledged boolean,
  p_actor_user_id uuid
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_assignment public.forge_training_assignments;
  v_version public.forge_training_course_versions;
  v_progress public.forge_training_progress;
  v_course public.forge_training_courses;
  v_completion_id uuid;
  v_required integer;
begin
  if p_channel not in ('online', 'kiosk') then
    raise exception 'Unsupported channel.' using errcode = '22023';
  end if;

  select * into v_assignment from public.forge_training_assignments
  where id = p_assignment_id and organization_id = p_organization_id
  for update;

  if v_assignment.id is null then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  if v_assignment.status not in ('assigned', 'in_progress', 'overdue') then
    raise exception 'This training is not open.' using errcode = '23514';
  end if;

  select * into v_version from public.forge_training_course_versions
  where course_id = v_assignment.course_id and status = 'published';

  if v_version.id is null then
    raise exception 'This course has no published content yet.' using errcode = '23514';
  end if;

  if exists (select 1 from public.forge_training_questions where version_id = v_version.id and is_active) then
    raise exception 'This course has a quiz. Pass the quiz to complete it.' using errcode = '23514';
  end if;

  select * into v_progress from public.forge_training_progress where assignment_id = p_assignment_id for update;
  select count(*) into v_required from public.forge_training_sections where version_id = v_version.id and is_required;

  if v_required > 0 and (v_progress.content_completed_at is null or v_progress.version_id <> v_version.id) then
    raise exception 'Finish the required sections first.' using errcode = '23514';
  end if;

  if v_version.requires_acknowledgement and not coalesce(p_acknowledged, false) then
    raise exception 'Check the acknowledgement to complete this course.' using errcode = '23514';
  end if;

  if v_version.requires_acknowledgement then
    insert into public.forge_training_progress (assignment_id, organization_id, version_id, sections_completed, content_completed_at, last_accessed_at, acknowledged_at, acknowledgement_text)
    values (p_assignment_id, p_organization_id, v_version.id, coalesce(v_progress.sections_completed, '{}'), coalesce(v_progress.content_completed_at, now()), now(), now(), v_version.acknowledgement_text)
    on conflict (assignment_id) do update
      set acknowledged_at = now(), acknowledgement_text = v_version.acknowledgement_text, last_accessed_at = now();
  end if;

  select * into v_course from public.forge_training_courses where id = v_assignment.course_id;

  insert into public.forge_training_completions (
    organization_id, assignment_id, course_id, personnel_id, completed_at, score, result,
    approval_status, approved_by, approved_at, certificate_number, expires_at, version_id, attempt_id, source,
    created_by, updated_by
  )
  values (
    p_organization_id, p_assignment_id, v_assignment.course_id, v_assignment.personnel_id, now(), null, 'completed',
    'approved', p_actor_user_id, now(),
    public.next_forge_training_certificate_number(p_organization_id),
    case when v_course.validity_months is not null then (now()::date + make_interval(months => v_course.validity_months))::date end,
    v_version.id, null, p_channel, p_actor_user_id, p_actor_user_id
  )
  returning id into v_completion_id;

  update public.forge_training_assignments set status = 'completed', updated_at = now() where id = p_assignment_id;

  return v_completion_id;
end;
$$;

revoke all on function public.forge_complete_training_without_quiz(uuid, uuid, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.forge_complete_training_without_quiz(uuid, uuid, text, boolean, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Closing a workers' comp case atomically
-- ---------------------------------------------------------------------------

create or replace function public.forge_close_wc_case(
  p_organization_id uuid,
  p_case_id uuid,
  p_expected_version integer,
  p_today date,
  p_actor_user_id uuid
)
returns public.forge_wc_cases
language plpgsql
set search_path = public
as $$
declare
  v_case public.forge_wc_cases;
begin
  select * into v_case from public.forge_wc_cases
  where id = p_case_id and organization_id = p_organization_id
  for update;

  if v_case.id is null then
    raise exception 'Case not found.' using errcode = 'P0002';
  end if;

  if v_case.row_version <> p_expected_version then
    raise exception 'This case changed since you opened it. Reload and try again.' using errcode = '40001';
  end if;

  if v_case.status <> 'active' then
    raise exception 'Only active cases can be closed.' using errcode = '23514';
  end if;

  -- End the open work-status period so day counts stop growing. A period that starts after today ends on its
  -- start date, which keeps the period valid.
  update public.forge_wc_work_status_periods
  set end_date = greatest(start_date, p_today), updated_by = p_actor_user_id
  where case_id = p_case_id and organization_id = p_organization_id and end_date is null;

  update public.forge_wc_cases
  set status = 'closed', stage = 'closed', closed_at = now(), closed_by = p_actor_user_id, updated_by = p_actor_user_id
  where id = p_case_id
  returning * into v_case;

  return v_case;
end;
$$;

revoke all on function public.forge_close_wc_case(uuid, uuid, integer, date, uuid) from public, anon, authenticated;
grant execute on function public.forge_close_wc_case(uuid, uuid, integer, date, uuid) to service_role;

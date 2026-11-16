-- Batch 1 training parity (Industrial 1.0 -> 2.0): manage assignments, training records and course lifecycle.
--
-- 1.0 let a trainer edit an assignment, "delete" it (an archive) or remove one assignee, edit a training record
-- (PATCH records/:id) and archive it (records/:id/archive). 2.0 keeps one assignment row per person, so canceling
-- that row covers both. Canceled assignments and archived records stay in the table for the audit trail and drop
-- out of everything that counts training (matrix, My Training, reminders, reports, LOTO authorization).

-- ---------------------------------------------------------------------------
-- Assignments: a 'canceled' status (spelled as the AI watch, LOTO and tasks already spell it)
-- ---------------------------------------------------------------------------

alter table public.forge_training_assignments
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text;

alter table public.forge_training_assignments drop constraint if exists forge_training_assignments_status_check;
alter table public.forge_training_assignments
  add constraint forge_training_assignments_status_check
  check (status in ('assigned', 'in_progress', 'completed', 'overdue', 'exempt', 'canceled'));

alter table public.forge_training_assignments drop constraint if exists forge_training_assignments_canceled_check;
alter table public.forge_training_assignments
  add constraint forge_training_assignments_canceled_check
  check ((status = 'canceled') = (canceled_at is not null));

alter table public.forge_training_assignments drop constraint if exists forge_training_assignments_notes_check;
alter table public.forge_training_assignments
  add constraint forge_training_assignments_notes_check
  check ((notes is null or char_length(notes) <= 2000) and (cancel_reason is null or char_length(cancel_reason) <= 500));

-- A completed assignment cannot be canceled, and a canceled one is final (no reopening, no completing).
-- The assignment's tenant, course and person never change.
create or replace function public.forge_training_assignments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id or new.course_id <> old.course_id or new.personnel_id <> old.personnel_id then
    raise exception 'An assignment cannot move to another organization, course or person.' using errcode = '23514';
  end if;

  if old.status = 'canceled' then
    if new.status <> 'canceled' or new.due_date is distinct from old.due_date or new.notes is distinct from old.notes
      or new.canceled_at is distinct from old.canceled_at or new.cancel_reason is distinct from old.cancel_reason then
      raise exception 'This assignment was canceled and cannot be changed.' using errcode = '23514';
    end if;
  end if;

  if new.status = 'canceled' and old.status = 'completed' then
    raise exception 'A completed assignment cannot be canceled.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_training_assignments_guard on public.forge_training_assignments;
create trigger forge_training_assignments_guard
before update on public.forge_training_assignments
for each row execute function public.forge_training_assignments_guard();

-- Cancels one open assignment: locks it, refuses a completed or already canceled one, and abandons any open
-- quiz attempt so it cannot be submitted afterwards. Returns the canceled row.
create or replace function public.forge_cancel_training_assignment(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns public.forge_training_assignments
language plpgsql
set search_path = public
as $$
declare
  v_assignment public.forge_training_assignments;
begin
  select * into v_assignment from public.forge_training_assignments
  where id = p_assignment_id and organization_id = p_organization_id
  for update;

  if v_assignment.id is null then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if v_assignment.status = 'completed' then
    raise exception 'A completed assignment cannot be canceled.' using errcode = '23514';
  end if;
  if v_assignment.status = 'canceled' then
    raise exception 'This assignment is already canceled.' using errcode = '23514';
  end if;

  update public.forge_training_attempts set status = 'abandoned'
  where assignment_id = p_assignment_id and status = 'in_progress';

  update public.forge_training_assignments
  set status = 'canceled',
      canceled_at = now(),
      canceled_by = p_actor_user_id,
      cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      updated_at = now()
  where id = p_assignment_id
  returning * into v_assignment;

  return v_assignment;
end;
$$;

insert into public.forge_lookup_options (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, 'canceled', 'Canceled', 'Assignment was canceled and no longer counts.', 60, true, true
from public.forge_lookup_definitions d
where d.lookup_key = 'training.status'
on conflict (lookup_id, option_key) do nothing;

-- ---------------------------------------------------------------------------
-- Training records: archive with a reason, and edit guards
-- ---------------------------------------------------------------------------

alter table public.forge_training_completions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

alter table public.forge_training_completions drop constraint if exists forge_training_completions_archive_check;
alter table public.forge_training_completions
  add constraint forge_training_completions_archive_check
  check (
    (archived_at is null and archive_reason is null)
    or (archived_at is not null and char_length(btrim(coalesce(archive_reason, ''))) between 1 and 500)
  );

alter table public.forge_training_completions drop constraint if exists forge_training_completions_score_check;
alter table public.forge_training_completions
  add constraint forge_training_completions_score_check
  check (score is null or (score >= 0 and score <= 100)) not valid;

alter table public.forge_training_completions drop constraint if exists forge_training_completions_expiry_check;
alter table public.forge_training_completions
  add constraint forge_training_completions_expiry_check
  check (expires_at is null or expires_at >= (completed_at at time zone 'UTC')::date) not valid;

create index if not exists forge_training_completions_live_idx
  on public.forge_training_completions(organization_id, course_id, personnel_id)
  where archived_at is null;

-- Records keep their tenant, person, course and certificate number. A graded record (online, kiosk, paper) keeps
-- the score and date its attempt produced. An archived record is final.
create or replace function public.forge_training_completions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id <> old.organization_id or new.course_id <> old.course_id or new.personnel_id <> old.personnel_id then
    raise exception 'A training record cannot move to another organization, course or person.' using errcode = '23514';
  end if;

  if old.certificate_number is not null and new.certificate_number is distinct from old.certificate_number then
    raise exception 'A certificate number cannot be changed.' using errcode = '23514';
  end if;

  -- Foreign keys that set null (a deleted assignment, attempt, version or user) are the only changes allowed.
  if old.archived_at is not null
    and (to_jsonb(new) - array['assignment_id', 'attempt_id', 'version_id', 'created_by', 'updated_by', 'approved_by', 'archived_by']) is distinct from (to_jsonb(old) - array['assignment_id', 'attempt_id', 'version_id', 'created_by', 'updated_by', 'approved_by', 'archived_by']) then
    raise exception 'This training record is archived and cannot be changed.' using errcode = '23514';
  end if;

  if old.source <> 'manual' and (new.score is distinct from old.score or new.completed_at is distinct from old.completed_at) then
    raise exception 'The score and date of a graded quiz cannot be edited.' using errcode = '23514';
  end if;

  -- attempt_id / version_id are left out: their foreign keys set null when a version or attempt is deleted.
  if new.source is distinct from old.source then
    raise exception 'How a training record was earned cannot be changed.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_training_completions_guard on public.forge_training_completions;
create trigger forge_training_completions_guard
before update on public.forge_training_completions
for each row execute function public.forge_training_completions_guard();

-- LOTO authorization ignores archived training records (redefined from 20261115170000_forge_loto_parity.sql;
-- create or replace keeps its grants).
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
      and c.archived_at is null
      and c.approval_status = 'approved'
      and c.result in ('passed','completed')
      and (c.expires_at is null or c.expires_at >= current_date)
  );
$$;

revoke all on function public.forge_training_assignments_guard() from public, anon, authenticated;
revoke all on function public.forge_training_completions_guard() from public, anon, authenticated;
revoke all on function public.forge_cancel_training_assignment(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.forge_cancel_training_assignment(uuid, uuid, uuid, text) to service_role;

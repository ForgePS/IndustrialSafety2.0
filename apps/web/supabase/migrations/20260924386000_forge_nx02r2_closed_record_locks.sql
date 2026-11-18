-- NX-02R2: lifecycle locks surfaced by Codex review of PR #8.
--
-- 1. Closed observations are terminal (locks_record = true, no reopen transition): their
--    operational content can no longer change.
-- 2. Closed risks are locked (locks_record = true) until the explicit `reopen` transition moves
--    them back to review: record fields, assessments, acceptance, review snapshots, controls and
--    treatments cannot change while closed.
-- 3. JSA execution crew can only be added while the execution is planned, briefing or stopped,
--    so nobody joins active work without passing the acknowledgement gate.
--
-- These triggers are the database backstop; server actions reject the same cases first with a
-- friendly message. Status-changing updates (close/reopen transitions), archive fields, and
-- FK `on delete set null` cascades remain allowed.

-- ----------------------------------------------------------------------------
-- Observations: closed content lock
-- ----------------------------------------------------------------------------

create or replace function public.forge_observations_enforce_closed_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'closed' and new.status = 'closed' then
    if (new.title, new.description, new.observation_type, new.category_key, new.work_area,
        new.occurred_at, new.immediate_action, new.risk_matrix_version,
        new.initial_likelihood_key, new.initial_severity_key, new.initial_risk_score,
        new.initial_risk_band_key, new.closure_summary, new.custom_data, new.reporting_mode)
       is distinct from
       (old.title, old.description, old.observation_type, old.category_key, old.work_area,
        old.occurred_at, old.immediate_action, old.risk_matrix_version,
        old.initial_likelihood_key, old.initial_severity_key, old.initial_risk_score,
        old.initial_risk_band_key, old.closure_summary, old.custom_data, old.reporting_mode)
       -- FK columns: only block re-pointing to a new non-null value (set-null cascades allowed).
       or (new.location_id is not null and new.location_id is distinct from old.location_id)
       or (new.division_id is not null and new.division_id is distinct from old.division_id)
       or (new.risk_matrix_id is not null and new.risk_matrix_id is distinct from old.risk_matrix_id)
       or (new.assigned_to_personnel_id is not null
           and new.assigned_to_personnel_id is distinct from old.assigned_to_personnel_id)
       or (new.assigned_to_user_id is not null
           and new.assigned_to_user_id is distinct from old.assigned_to_user_id)
    then
      raise exception 'Closed observations are read-only.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists forge_observations_enforce_closed_lock on public.forge_observations;
create trigger forge_observations_enforce_closed_lock
  before update on public.forge_observations
  for each row execute function public.forge_observations_enforce_closed_lock();

-- ----------------------------------------------------------------------------
-- Risks: closed content lock (until reopen)
-- ----------------------------------------------------------------------------

create or replace function public.forge_risks_enforce_closed_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'closed' and new.status = 'closed' then
    if (new.title, new.description, new.hazard_description, new.category_key, new.work_area,
        new.risk_matrix_version,
        new.inherent_likelihood_key, new.inherent_severity_key, new.inherent_score, new.inherent_band_key,
        new.residual_likelihood_key, new.residual_severity_key, new.residual_score, new.residual_band_key,
        new.review_due_at, new.next_review_at, new.last_reviewed_at,
        new.source_type, new.source_reference, new.closure_summary, new.custom_data,
        new.acceptance_required, new.accepted_at, new.acceptance_comment)
       is distinct from
       (old.title, old.description, old.hazard_description, old.category_key, old.work_area,
        old.risk_matrix_version,
        old.inherent_likelihood_key, old.inherent_severity_key, old.inherent_score, old.inherent_band_key,
        old.residual_likelihood_key, old.residual_severity_key, old.residual_score, old.residual_band_key,
        old.review_due_at, old.next_review_at, old.last_reviewed_at,
        old.source_type, old.source_reference, old.closure_summary, old.custom_data,
        old.acceptance_required, old.accepted_at, old.acceptance_comment)
       or (new.location_id is not null and new.location_id is distinct from old.location_id)
       or (new.division_id is not null and new.division_id is distinct from old.division_id)
       or (new.risk_matrix_id is not null and new.risk_matrix_id is distinct from old.risk_matrix_id)
       or (new.owner_personnel_id is not null
           and new.owner_personnel_id is distinct from old.owner_personnel_id)
       or (new.owner_user_id is not null and new.owner_user_id is distinct from old.owner_user_id)
       or (new.accepted_by is not null and new.accepted_by is distinct from old.accepted_by)
    then
      raise exception 'Closed risks are read-only. Reopen the risk before making changes.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists forge_risks_enforce_closed_lock on public.forge_risks;
create trigger forge_risks_enforce_closed_lock
  before update on public.forge_risks
  for each row execute function public.forge_risks_enforce_closed_lock();

create or replace function public.forge_risk_children_enforce_closed_lock()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select r.status into v_status
  from public.forge_risks r
  where r.id = new.risk_id
    and r.organization_id = new.organization_id;

  if v_status = 'closed' then
    raise exception 'Closed risks are read-only. Reopen the risk before making changes.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists forge_risk_controls_enforce_closed_lock on public.forge_risk_controls;
create trigger forge_risk_controls_enforce_closed_lock
  before insert on public.forge_risk_controls
  for each row execute function public.forge_risk_children_enforce_closed_lock();

drop trigger if exists forge_risk_treatments_enforce_closed_lock on public.forge_risk_treatments;
create trigger forge_risk_treatments_enforce_closed_lock
  before insert on public.forge_risk_treatments
  for each row execute function public.forge_risk_children_enforce_closed_lock();

drop trigger if exists forge_risk_reviews_enforce_closed_lock on public.forge_risk_reviews;
create trigger forge_risk_reviews_enforce_closed_lock
  before insert on public.forge_risk_reviews
  for each row execute function public.forge_risk_children_enforce_closed_lock();

-- ----------------------------------------------------------------------------
-- JSA execution crew: no additions to active/closed work
-- ----------------------------------------------------------------------------

create or replace function public.forge_jsa_execution_participants_enforce_crew_window()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select e.status into v_status
  from public.forge_jsa_executions e
  where e.id = new.execution_id
    and e.organization_id = new.organization_id;

  if v_status is null then
    raise exception 'Execution not found for this organization.' using errcode = 'P0001';
  end if;

  if v_status not in ('planned', 'briefing', 'stopped') then
    raise exception 'Crew can only be added while the execution is planned, briefing, or stopped. Current status: %.', v_status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists forge_jsa_execution_participants_enforce_crew_window
  on public.forge_jsa_execution_participants;
create trigger forge_jsa_execution_participants_enforce_crew_window
  before insert on public.forge_jsa_execution_participants
  for each row execute function public.forge_jsa_execution_participants_enforce_crew_window();

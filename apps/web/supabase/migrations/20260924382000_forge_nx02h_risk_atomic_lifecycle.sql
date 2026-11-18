-- NX-02H: Risk Register atomic lifecycle + acceptance/reviews + matrix immutability

-- ----------------------------------------------------------------------------
-- Schema: acceptance + reviews
-- ----------------------------------------------------------------------------

alter table public.forge_risks
  add column if not exists acceptance_required boolean not null default false;

alter table public.forge_risks
  add column if not exists accepted_by uuid references auth.users(id) on delete set null;

alter table public.forge_risks
  add column if not exists accepted_at timestamptz;

alter table public.forge_risks
  add column if not exists acceptance_comment text;

alter table public.forge_risks
  add column if not exists last_reviewed_at timestamptz;

-- Expand lifecycle statuses to NX-02H model while preserving historical rows.
alter table public.forge_risks
  drop constraint if exists forge_risks_status_check;

update public.forge_risks set status = 'assessment' where status in ('open', 'under_assessment');
update public.forge_risks set status = 'review' where status = 'in_treatment';
update public.forge_risks set status = 'active' where status = 'monitoring';

alter table public.forge_risks
  add constraint forge_risks_status_check
  check (status in ('draft', 'assessment', 'review', 'active', 'closed'));

create table if not exists public.forge_risk_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  risk_id uuid not null references public.forge_risks(id) on delete cascade,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  risk_matrix_id uuid,
  risk_matrix_version integer,
  inherent_likelihood_key text,
  inherent_severity_key text,
  inherent_score integer,
  inherent_band_key text,
  residual_likelihood_key text,
  residual_severity_key text,
  residual_score integer,
  residual_band_key text,
  review_notes text,
  next_review_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists forge_risk_reviews_risk_idx
  on public.forge_risk_reviews (organization_id, risk_id, reviewed_at desc);

alter table public.forge_risk_reviews enable row level security;

drop policy if exists forge_risk_reviews_member_select on public.forge_risk_reviews;
create policy forge_risk_reviews_member_select
on public.forge_risk_reviews for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_risk_reviews to authenticated;
grant all on public.forge_risk_reviews to service_role;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('risk_register.accept','risk_register','Accept Risks','Formally accept residual risk where tenant rules require acceptance.','Risk Register','accept',true,true,'organization',true,true,true,'sensitive',75)
on conflict (permission_key) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
cross join public.forge_permission_registry p
where rt.template_key in ('company-admin', 'safety-manager')
  and p.permission_key = 'risk_register.accept'
on conflict do nothing;

-- Lookup status options for new model
update public.forge_lookup_options
set is_active = false
where lookup_id in (
  select id from public.forge_lookup_definitions where lookup_key = 'risk_register.status'
)
and option_key in ('open', 'under_assessment', 'in_treatment', 'monitoring');

insert into public.forge_lookup_options (lookup_id, option_key, label, description, sort_order)
select d.id, v.option_key, v.label, v.description, v.sort_order
from public.forge_lookup_definitions d
cross join (values
  ('draft','Draft','Risk entry is being prepared.',10),
  ('assessment','Assessment','Inherent and residual risk are being assessed.',20),
  ('review','Review','Risk is under formal review prior to activation or after reopen.',30),
  ('active','Active','Residual risk is accepted and under periodic review.',40),
  ('closed','Closed','Risk is closed with history preserved.',50)
) as v(option_key, label, description, sort_order)
where d.lookup_key = 'risk_register.status'
on conflict (lookup_id, option_key) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

-- ----------------------------------------------------------------------------
-- Workflow: risk_register.lifecycle → draft/assessment/review/active/closed
-- ----------------------------------------------------------------------------

do $$
declare
  v_def_id uuid;
begin
  select id into v_def_id
  from public.forge_workflow_definitions
  where organization_id is null
    and workflow_key = 'risk_register.lifecycle'
    and version = 1;

  if v_def_id is null then
    insert into public.forge_workflow_definitions (
      organization_id, workflow_key, name, description, resource_type, version, is_core, is_active
    ) values (
      null,
      'risk_register.lifecycle',
      'Risk Register Lifecycle',
      'Forge core risk register workflow synchronized with forge_risks.status.',
      'risk_register',
      1,
      true,
      true
    )
    returning id into v_def_id;
  end if;

  -- Soft-retire legacy transitions; keep rows for historical event labels.
  update public.forge_workflow_transitions
  set is_active = false
  where workflow_definition_id = v_def_id
    and transition_key in (
      'open', 'begin_assessment', 'begin_treatment', 'begin_monitoring',
      'return_to_assessment', 'close_from_open'
    );

  insert into public.forge_workflow_states (
    workflow_definition_id, state_key, name, sort_order, is_initial, is_terminal, locks_record
  ) values
    (v_def_id, 'draft', 'Draft', 10, true, false, false),
    (v_def_id, 'assessment', 'Assessment', 20, false, false, false),
    (v_def_id, 'review', 'Review', 30, false, false, false),
    (v_def_id, 'active', 'Active', 40, false, false, false),
    (v_def_id, 'closed', 'Closed', 50, false, true, true)
  on conflict (workflow_definition_id, state_key) do update
  set
    name = excluded.name,
    sort_order = excluded.sort_order,
    is_initial = excluded.is_initial,
    is_terminal = excluded.is_terminal,
    locks_record = excluded.locks_record;

  -- Deactivate legacy states that are no longer part of the primary path.
  update public.forge_workflow_states
  set is_terminal = false
  where workflow_definition_id = v_def_id
    and state_key in ('open', 'under_assessment', 'in_treatment', 'monitoring');

  insert into public.forge_workflow_transitions (
    workflow_definition_id, transition_key, name, from_state_key, to_state_key,
    required_permission, requires_comment, requires_confirmation, requires_approval, sort_order, rule_config
  ) values
    (v_def_id, 'submit_assessment', 'Submit Assessment', 'draft', 'assessment', 'risk_register.assess', false, false, false, 10, '{}'::jsonb),
    (v_def_id, 'submit_for_review', 'Submit for Review', 'assessment', 'review', 'risk_register.review', false, false, false, 20, '{}'::jsonb),
    (v_def_id, 'activate', 'Activate', 'review', 'active', 'risk_register.approve', false, true, false, 30, '{}'::jsonb),
    (v_def_id, 'send_to_review', 'Send to Review', 'active', 'review', 'risk_register.review', true, false, false, 40, '{}'::jsonb),
    (v_def_id, 'close', 'Close', 'active', 'closed', 'risk_register.close', true, true, false, 50, '{}'::jsonb),
    (v_def_id, 'reopen', 'Reopen', 'closed', 'review', 'risk_register.review', true, false, false, 60, '{}'::jsonb)
  on conflict (workflow_definition_id, transition_key) do update
  set
    name = excluded.name,
    from_state_key = excluded.from_state_key,
    to_state_key = excluded.to_state_key,
    required_permission = excluded.required_permission,
    requires_comment = excluded.requires_comment,
    requires_confirmation = excluded.requires_confirmation,
    requires_approval = excluded.requires_approval,
    sort_order = excluded.sort_order,
    is_active = true,
    rule_config = excluded.rule_config;

  -- Migrate existing workflow instances from legacy states.
  update public.forge_workflow_instances i
  set current_state_key = case i.current_state_key
    when 'open' then 'assessment'
    when 'under_assessment' then 'assessment'
    when 'in_treatment' then 'review'
    when 'monitoring' then 'active'
    else i.current_state_key
  end,
  updated_at = now()
  where i.workflow_definition_id = v_def_id
    and i.current_state_key in ('open', 'under_assessment', 'in_treatment', 'monitoring');
end;
$$;

-- ----------------------------------------------------------------------------
-- Matrix immutability: used / active versions cannot mutate cells in place
-- ----------------------------------------------------------------------------

create or replace function public.forge_assert_risk_matrix_mutable(p_matrix_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matrix public.forge_risk_matrices%rowtype;
  v_in_use boolean := false;
begin
  select * into v_matrix
  from public.forge_risk_matrices
  where id = p_matrix_id;

  if not found then
    raise exception 'Risk matrix not found.';
  end if;

  if v_matrix.is_active then
    raise exception 'Active risk matrix versions are immutable.';
  end if;

  if v_matrix.organization_id is null and v_matrix.is_core then
    raise exception 'Core risk matrix template cells cannot be modified in place.';
  end if;

  select exists (
    select 1 from public.forge_risks r where r.risk_matrix_id = p_matrix_id
    union all
    select 1 from public.forge_observations o where o.risk_matrix_id = p_matrix_id
    union all
    select 1 from public.forge_jsas j where j.risk_matrix_id = p_matrix_id
  ) into v_in_use;

  if v_in_use then
    raise exception 'Historical risk matrix versions that are in use cannot be modified in place. Clone a new version instead.';
  end if;
end;
$$;

create or replace function public.forge_trg_risk_matrix_cells_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.forge_assert_risk_matrix_mutable(coalesce(NEW.risk_matrix_id, OLD.risk_matrix_id));
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists forge_risk_matrix_cells_immutable on public.forge_risk_matrix_cells;
create trigger forge_risk_matrix_cells_immutable
before update or delete on public.forge_risk_matrix_cells
for each row execute function public.forge_trg_risk_matrix_cells_immutable();

create or replace function public.forge_trg_risk_matrix_levels_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.forge_assert_risk_matrix_mutable(coalesce(NEW.risk_matrix_id, OLD.risk_matrix_id));
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists forge_risk_likelihood_immutable on public.forge_risk_likelihood_levels;
create trigger forge_risk_likelihood_immutable
before update or delete on public.forge_risk_likelihood_levels
for each row execute function public.forge_trg_risk_matrix_levels_immutable();

drop trigger if exists forge_risk_severity_immutable on public.forge_risk_severity_levels;
create trigger forge_risk_severity_immutable
before update or delete on public.forge_risk_severity_levels
for each row execute function public.forge_trg_risk_matrix_levels_immutable();

drop trigger if exists forge_risk_bands_immutable on public.forge_risk_bands;
create trigger forge_risk_bands_immutable
before update or delete on public.forge_risk_bands
for each row execute function public.forge_trg_risk_matrix_levels_immutable();

-- ----------------------------------------------------------------------------
-- Atomic risk lifecycle transition
-- ----------------------------------------------------------------------------

create or replace function public.forge_perform_risk_lifecycle_transition(
  p_organization_id uuid,
  p_risk_id uuid,
  p_expected_status text,
  p_expected_row_version bigint,
  p_transition_key text,
  p_to_status text,
  p_actor_user_id uuid,
  p_comment text,
  p_metadata jsonb,
  p_idempotency_key text,
  p_fail_after_domain_update boolean default false,
  p_closure_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_risk public.forge_risks%rowtype;
  v_def_id uuid;
  v_instance public.forge_workflow_instances%rowtype;
  v_event_id uuid;
  v_existing uuid;
  v_workflow_from text;
  v_workflow_to text;
  v_complete boolean;
  v_activity_id bigint;
  v_audit_id bigint;
  v_transition_exists boolean := false;
  v_comment text;
  v_control_count integer := 0;
  v_band_requires_approval boolean := false;
  v_band_key text;
  v_approval_ok boolean := false;
  v_new_version bigint;
begin
  select * into v_risk
  from public.forge_risks
  where organization_id = p_organization_id
    and id = p_risk_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Risk not found.');
  end if;

  if v_risk.archived_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Archived risks cannot transition.');
  end if;

  v_workflow_from := p_expected_status;
  v_workflow_to := p_to_status;
  v_comment := nullif(trim(coalesce(p_comment, '')), '');

  select d.id into v_def_id
  from public.forge_workflow_definitions d
  where d.workflow_key = 'risk_register.lifecycle'
    and d.version = 1
    and d.organization_id is null
    and d.is_active = true
  limit 1;

  if v_def_id is null then
    return jsonb_build_object('ok', false, 'error', 'Risk workflow definition missing.');
  end if;

  select * into v_instance
  from public.forge_workflow_instances
  where organization_id = p_organization_id
    and resource_type = 'risk_register'
    and resource_id = p_risk_id
    and workflow_definition_id = v_def_id
  for update;

  if not found then
    insert into public.forge_workflow_instances (
      organization_id, workflow_definition_id, workflow_version,
      resource_type, resource_id, current_state_key
    ) values (
      p_organization_id, v_def_id, 1,
      'risk_register', p_risk_id, v_risk.status
    )
    returning * into v_instance;

    insert into public.forge_workflow_events (
      organization_id, workflow_instance_id, resource_type, resource_id,
      transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
    ) values (
      p_organization_id, v_instance.id, 'risk_register', p_risk_id,
      'initialize', null, v_risk.status, p_actor_user_id,
      'Workflow instance created during risk transition.',
      jsonb_build_object('source', 'forge_perform_risk_lifecycle_transition')
    );
  end if;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select result_event_id into v_existing
    from public.forge_workflow_idempotency_keys
    where organization_id = p_organization_id
      and workflow_instance_id = v_instance.id
      and idempotency_key = p_idempotency_key;

    if v_existing is not null then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'event_id', v_existing,
        'risk_id', p_risk_id,
        'status', v_risk.status,
        'row_version', v_risk.row_version,
        'workflow_state', v_instance.current_state_key,
        'instance_id', v_instance.id
      );
    end if;
  end if;

  if v_risk.status is distinct from p_expected_status then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'Risk status changed. Reload and try again.',
      'current_status', v_risk.status,
      'row_version', v_risk.row_version
    );
  end if;

  if v_risk.row_version is distinct from p_expected_row_version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This risk changed after you opened it. Refresh before continuing.',
      'current_status', v_risk.status,
      'row_version', v_risk.row_version
    );
  end if;

  if v_instance.current_state_key is distinct from v_workflow_from then
    return jsonb_build_object(
      'ok', false,
      'error', 'Workflow state diverges from risk status. Reconciliation required.',
      'status', v_risk.status,
      'workflow_state', v_instance.current_state_key
    );
  end if;

  select exists (
    select 1
    from public.forge_workflow_transitions t
    where t.workflow_definition_id = v_def_id
      and t.transition_key = p_transition_key
      and t.from_state_key = v_workflow_from
      and t.to_state_key = v_workflow_to
      and coalesce(t.is_active, true) = true
  ) into v_transition_exists;

  if not v_transition_exists then
    return jsonb_build_object(
      'ok', false,
      'error', 'Transition ' || p_transition_key || ' is not valid for ' || v_workflow_from || ' → ' || v_workflow_to || '.'
    );
  end if;

  -- Activation business rules (server-enforced)
  if p_transition_key = 'activate' then
    if v_risk.owner_personnel_id is null then
      return jsonb_build_object('ok', false, 'error', 'Activation requires a risk owner.');
    end if;
    if v_risk.risk_matrix_id is null or v_risk.risk_matrix_version is null then
      return jsonb_build_object('ok', false, 'error', 'Activation requires a risk matrix version.');
    end if;
    if v_risk.inherent_likelihood_key is null
       or v_risk.inherent_severity_key is null
       or v_risk.inherent_score is null
       or v_risk.inherent_band_key is null then
      return jsonb_build_object('ok', false, 'error', 'Activation requires a complete inherent risk assessment.');
    end if;

    select count(*) into v_control_count
    from public.forge_risk_controls c
    where c.organization_id = p_organization_id
      and c.risk_id = p_risk_id
      and c.is_active = true;

    if v_control_count = 0
       and (v_risk.accepted_at is null or length(trim(coalesce(v_risk.acceptance_comment, ''))) < 10) then
      return jsonb_build_object(
        'ok', false,
        'error', 'Activation requires active controls or a documented no-control acceptance.'
      );
    end if;

    if v_control_count > 0
       and (v_risk.residual_likelihood_key is null
            or v_risk.residual_severity_key is null
            or v_risk.residual_score is null
            or v_risk.residual_band_key is null) then
      return jsonb_build_object('ok', false, 'error', 'Activation requires residual assessment when controls exist.');
    end if;

    if v_risk.next_review_at is null and v_risk.review_due_at is null then
      return jsonb_build_object('ok', false, 'error', 'Activation requires a next review date.');
    end if;

    v_band_key := coalesce(v_risk.residual_band_key, v_risk.inherent_band_key);

    select coalesce(b.requires_approval, false) into v_band_requires_approval
    from public.forge_risk_bands b
    where b.risk_matrix_id = v_risk.risk_matrix_id
      and b.band_key = v_band_key
    limit 1;

    if coalesce(v_band_requires_approval, false) then
      select exists (
        select 1
        from public.forge_approval_requests ar
        where ar.organization_id = p_organization_id
          and ar.resource_type = 'risk_register'
          and ar.resource_id = p_risk_id
          and ar.status = 'approved'
      ) into v_approval_ok;

      if not v_approval_ok then
        return jsonb_build_object(
          'ok', false,
          'error', 'Activation blocked: residual/inherent band requires a completed shared approval.'
        );
      end if;
    end if;

    if v_band_key in ('critical', 'high')
       and (v_risk.accepted_at is null or v_risk.accepted_by is null) then
      -- High/critical require formal acceptance when acceptance_required or band is critical.
      if v_risk.acceptance_required or v_band_key = 'critical' then
        return jsonb_build_object(
          'ok', false,
          'error', 'Activation blocked: formal risk acceptance is required for this band.'
        );
      end if;
    end if;
  end if;

  if p_transition_key = 'close' then
    if length(trim(coalesce(p_closure_summary, v_comment, v_risk.closure_summary, ''))) < 5 then
      return jsonb_build_object('ok', false, 'error', 'A closure summary is required to close this risk.');
    end if;
  end if;

  if p_transition_key in ('send_to_review', 'reopen') and v_comment is null then
    return jsonb_build_object('ok', false, 'error', 'A comment is required for this transition.');
  end if;

  v_complete := p_to_status = 'closed';

  update public.forge_risks r
  set
    status = p_to_status,
    row_version = r.row_version + 1,
    updated_by = p_actor_user_id,
    updated_at = now(),
    closed_at = case
      when p_transition_key = 'close' then now()
      when p_transition_key = 'reopen' then null
      else r.closed_at
    end,
    closed_by = case
      when p_transition_key = 'close' then p_actor_user_id
      when p_transition_key = 'reopen' then null
      else r.closed_by
    end,
    closure_summary = case
      when p_transition_key = 'close' then nullif(trim(coalesce(p_closure_summary, v_comment, r.closure_summary, '')), '')
      when p_transition_key = 'reopen' then null
      else r.closure_summary
    end
  where r.id = p_risk_id
    and r.organization_id = p_organization_id
    and r.row_version = p_expected_row_version
    and r.status = p_expected_status
  returning row_version into v_new_version;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This risk changed after you opened it. Refresh before continuing.',
      'risk_id', p_risk_id
    );
  end if;

  if coalesce(p_fail_after_domain_update, false) then
    raise exception 'NX02H_FORCED_FAILURE';
  end if;

  update public.forge_workflow_instances
  set
    current_state_key = v_workflow_to,
    updated_at = now(),
    completed_at = case when v_complete then now() else null end
  where id = v_instance.id
    and organization_id = p_organization_id;

  insert into public.forge_workflow_events (
    organization_id, workflow_instance_id, resource_type, resource_id,
    transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
  ) values (
    p_organization_id, v_instance.id, 'risk_register', p_risk_id,
    p_transition_key, v_workflow_from, v_workflow_to, p_actor_user_id,
    v_comment,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('adapter', 'risk_atomic')
  )
  returning id into v_event_id;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    insert into public.forge_workflow_idempotency_keys (
      organization_id, workflow_instance_id, idempotency_key, transition_key, result_event_id
    ) values (
      p_organization_id, v_instance.id, p_idempotency_key, p_transition_key, v_event_id
    )
    on conflict (organization_id, workflow_instance_id, idempotency_key) do nothing;
  end if;

  insert into public.forge_risk_activity (
    organization_id, risk_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    p_risk_id,
    'workflow_' || p_transition_key,
    'Risk transitioned from ' || p_expected_status || ' to ' || p_to_status || '.',
    p_actor_user_id,
    jsonb_build_object('event_id', v_event_id, 'transition_key', p_transition_key)
  )
  returning id into v_activity_id;

  insert into public.forge_record_activity (
    organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    'risk_register',
    p_risk_id,
    'workflow_transition',
    'Workflow transitioned to ' || v_workflow_to || '.',
    p_actor_user_id,
    jsonb_build_object('event_id', v_event_id, 'transition_key', p_transition_key)
  );

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_actor_user_id,
    p_organization_id,
    'risk.lifecycle_transitioned',
    'risk_register',
    p_risk_id,
    jsonb_build_object('status', p_expected_status, 'workflow_state', v_workflow_from, 'row_version', p_expected_row_version),
    jsonb_build_object(
      'status', p_to_status,
      'workflow_state', v_workflow_to,
      'transition_key', p_transition_key,
      'event_id', v_event_id,
      'row_version', v_new_version
    )
  )
  returning id into v_audit_id;

  insert into public.forge_domain_event_outbox (
    organization_id, event_type, resource_type, resource_id, payload
  ) values (
    p_organization_id,
    'risk.lifecycle_transitioned',
    'risk_register',
    p_risk_id,
    jsonb_build_object(
      'from_status', p_expected_status,
      'to_status', p_to_status,
      'transition_key', p_transition_key,
      'event_id', v_event_id,
      'audit_id', v_audit_id,
      'activity_id', v_activity_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'risk_id', p_risk_id,
    'status', p_to_status,
    'row_version', v_new_version,
    'event_id', v_event_id,
    'workflow_state', v_workflow_to,
    'instance_id', v_instance.id,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.forge_perform_risk_lifecycle_transition(
  uuid, uuid, text, bigint, text, text, uuid, text, jsonb, text, boolean, text
) from public;
grant execute on function public.forge_perform_risk_lifecycle_transition(
  uuid, uuid, text, bigint, text, text, uuid, text, jsonb, text, boolean, text
) to service_role;

-- ----------------------------------------------------------------------------
-- Atomic risk review snapshot
-- ----------------------------------------------------------------------------

create or replace function public.forge_create_risk_review(
  p_organization_id uuid,
  p_risk_id uuid,
  p_expected_row_version bigint,
  p_actor_user_id uuid,
  p_review_notes text,
  p_next_review_at timestamptz,
  p_fail_after_review_insert boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_risk public.forge_risks%rowtype;
  v_review_id uuid;
  v_new_version bigint;
  v_activity_id bigint;
  v_audit_id bigint;
begin
  select * into v_risk
  from public.forge_risks
  where organization_id = p_organization_id
    and id = p_risk_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Risk not found.');
  end if;

  if v_risk.row_version is distinct from p_expected_row_version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This risk changed after you opened it. Refresh before continuing.',
      'row_version', v_risk.row_version
    );
  end if;

  insert into public.forge_risk_reviews (
    organization_id, risk_id, reviewed_by, reviewed_at,
    risk_matrix_id, risk_matrix_version,
    inherent_likelihood_key, inherent_severity_key, inherent_score, inherent_band_key,
    residual_likelihood_key, residual_severity_key, residual_score, residual_band_key,
    review_notes, next_review_at
  ) values (
    p_organization_id, p_risk_id, p_actor_user_id, now(),
    v_risk.risk_matrix_id, v_risk.risk_matrix_version,
    v_risk.inherent_likelihood_key, v_risk.inherent_severity_key, v_risk.inherent_score, v_risk.inherent_band_key,
    v_risk.residual_likelihood_key, v_risk.residual_severity_key, v_risk.residual_score, v_risk.residual_band_key,
    nullif(trim(coalesce(p_review_notes, '')), ''),
    coalesce(p_next_review_at, v_risk.next_review_at, v_risk.review_due_at)
  )
  returning id into v_review_id;

  if coalesce(p_fail_after_review_insert, false) then
    raise exception 'NX02H_FORCED_FAILURE';
  end if;

  update public.forge_risks
  set
    last_reviewed_at = now(),
    next_review_at = coalesce(p_next_review_at, next_review_at, review_due_at),
    review_due_at = coalesce(p_next_review_at, review_due_at, next_review_at),
    row_version = row_version + 1,
    updated_by = p_actor_user_id,
    updated_at = now()
  where id = p_risk_id
    and organization_id = p_organization_id
    and row_version = p_expected_row_version
  returning row_version into v_new_version;

  if not found then
    raise exception 'Risk review update conflict after insert.';
  end if;

  insert into public.forge_risk_activity (
    organization_id, risk_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    p_risk_id,
    'risk_reviewed',
    'Risk review snapshot recorded.',
    p_actor_user_id,
    jsonb_build_object('review_id', v_review_id)
  )
  returning id into v_activity_id;

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value
  ) values (
    p_actor_user_id,
    p_organization_id,
    'risk.reviewed',
    'risk_register',
    p_risk_id,
    jsonb_build_object('row_version', p_expected_row_version),
    jsonb_build_object('review_id', v_review_id, 'row_version', v_new_version, 'next_review_at', p_next_review_at)
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'review_id', v_review_id,
    'risk_id', p_risk_id,
    'row_version', v_new_version,
    'activity_id', v_activity_id,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.forge_create_risk_review(
  uuid, uuid, bigint, uuid, text, timestamptz, boolean
) from public;
grant execute on function public.forge_create_risk_review(
  uuid, uuid, bigint, uuid, text, timestamptz, boolean
) to service_role;

-- Explicit risk acceptance (separate from workflow approval)
create or replace function public.forge_accept_risk(
  p_organization_id uuid,
  p_risk_id uuid,
  p_expected_row_version bigint,
  p_actor_user_id uuid,
  p_acceptance_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_risk public.forge_risks%rowtype;
  v_new_version bigint;
  v_comment text;
begin
  v_comment := nullif(trim(coalesce(p_acceptance_comment, '')), '');
  if v_comment is null or length(v_comment) < 10 then
    return jsonb_build_object('ok', false, 'error', 'Acceptance comment is required (10+ characters).');
  end if;

  select * into v_risk
  from public.forge_risks
  where organization_id = p_organization_id
    and id = p_risk_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Risk not found.');
  end if;

  if v_risk.row_version is distinct from p_expected_row_version then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'error', 'This risk changed after you opened it. Refresh before continuing.'
    );
  end if;

  update public.forge_risks
  set
    accepted_by = p_actor_user_id,
    accepted_at = now(),
    acceptance_comment = v_comment,
    acceptance_required = true,
    row_version = row_version + 1,
    updated_by = p_actor_user_id,
    updated_at = now()
  where id = p_risk_id
    and organization_id = p_organization_id
    and row_version = p_expected_row_version
  returning row_version into v_new_version;

  if not found then
    return jsonb_build_object('ok', false, 'conflict', true, 'error', 'Concurrency conflict on risk acceptance.');
  end if;

  insert into public.forge_risk_activity (
    organization_id, risk_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id, p_risk_id, 'risk_accepted',
    'Formal risk acceptance recorded.',
    p_actor_user_id,
    jsonb_build_object('acceptance_comment', v_comment)
  );

  insert into public.forge_creator_audit_log (
    actor_user_id, organization_id, action, entity_type, entity_id, after_value
  ) values (
    p_actor_user_id, p_organization_id, 'risk.accepted', 'risk_register', p_risk_id,
    jsonb_build_object('accepted_at', now(), 'row_version', v_new_version)
  );

  return jsonb_build_object(
    'ok', true,
    'risk_id', p_risk_id,
    'row_version', v_new_version,
    'accepted_at', now(),
    'accepted_by', p_actor_user_id
  );
end;
$$;

revoke all on function public.forge_accept_risk(uuid, uuid, bigint, uuid, text) from public;
grant execute on function public.forge_accept_risk(uuid, uuid, bigint, uuid, text) to service_role;

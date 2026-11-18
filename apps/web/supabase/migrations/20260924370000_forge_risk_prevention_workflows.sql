-- NX-02 — Core workflow definitions for Observations, Risk Register, and JSA/JHA.
-- Mirrors CAPA seed style from 20260924330000_forge_universal_workflow_core.sql
-- (organization_id NULL, is_core true, find-or-insert definition + states + transitions).

-- ----------------------------------------------------------------------------
-- observations.lifecycle
-- ----------------------------------------------------------------------------

do $$
declare
  v_def_id uuid;
begin
  select id into v_def_id
  from public.forge_workflow_definitions
  where organization_id is null
    and workflow_key = 'observations.lifecycle'
    and version = 1;

  if v_def_id is null then
    insert into public.forge_workflow_definitions (
      organization_id, workflow_key, name, description, resource_type, version, is_core, is_active
    ) values (
      null,
      'observations.lifecycle',
      'Observation Lifecycle',
      'Forge core observation workflow synchronized with forge_observations.status.',
      'observation',
      1,
      true,
      true
    )
    returning id into v_def_id;
  end if;

  insert into public.forge_workflow_states (
    workflow_definition_id, state_key, name, sort_order, is_initial, is_terminal, locks_record
  ) values
    (v_def_id, 'draft', 'Draft', 10, true, false, false),
    (v_def_id, 'submitted', 'Submitted', 20, false, false, false),
    (v_def_id, 'review', 'In Review', 30, false, false, false),
    (v_def_id, 'action_required', 'Action Required', 40, false, false, false),
    (v_def_id, 'no_action', 'No Action', 50, false, false, false),
    (v_def_id, 'closed', 'Closed', 60, false, true, true)
  on conflict (workflow_definition_id, state_key) do nothing;

  insert into public.forge_workflow_transitions (
    workflow_definition_id, transition_key, name, from_state_key, to_state_key,
    required_permission, requires_comment, requires_confirmation, requires_approval, sort_order, rule_config
  ) values
    (v_def_id, 'submit', 'Submit', 'draft', 'submitted', 'observations.submit', false, false, false, 10, '{}'::jsonb),
    (v_def_id, 'begin_review', 'Begin Review', 'submitted', 'review', 'observations.review', false, false, false, 20, '{}'::jsonb),
    (v_def_id, 'return_for_info', 'Return for Information', 'review', 'submitted', 'observations.review', true, false, false, 30, '{}'::jsonb),
    (v_def_id, 'require_action', 'Require Action', 'review', 'action_required', 'observations.review', false, false, false, 40, '{}'::jsonb),
    (v_def_id, 'no_action', 'No Action Needed', 'review', 'no_action', 'observations.review', false, false, false, 50, '{}'::jsonb),
    (v_def_id, 'close_from_action', 'Close', 'action_required', 'closed', 'observations.close', true, true, false, 60, '{}'::jsonb),
    (v_def_id, 'close_no_action', 'Close', 'no_action', 'closed', 'observations.close', true, true, false, 70, '{}'::jsonb)
  on conflict (workflow_definition_id, transition_key) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- risk_register.lifecycle
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

  insert into public.forge_workflow_states (
    workflow_definition_id, state_key, name, sort_order, is_initial, is_terminal, locks_record
  ) values
    (v_def_id, 'draft', 'Draft', 10, true, false, false),
    (v_def_id, 'open', 'Open', 20, false, false, false),
    (v_def_id, 'under_assessment', 'Under Assessment', 30, false, false, false),
    (v_def_id, 'in_treatment', 'In Treatment', 40, false, false, false),
    (v_def_id, 'monitoring', 'Monitoring', 50, false, false, false),
    (v_def_id, 'closed', 'Closed', 60, false, true, true)
  on conflict (workflow_definition_id, state_key) do nothing;

  insert into public.forge_workflow_transitions (
    workflow_definition_id, transition_key, name, from_state_key, to_state_key,
    required_permission, requires_comment, requires_confirmation, requires_approval, sort_order, rule_config
  ) values
    (v_def_id, 'open', 'Open Risk', 'draft', 'open', 'risk_register.edit', false, false, false, 10, '{}'::jsonb),
    (v_def_id, 'begin_assessment', 'Begin Assessment', 'open', 'under_assessment', 'risk_register.assess', false, false, false, 20, '{}'::jsonb),
    (v_def_id, 'begin_treatment', 'Begin Treatment', 'under_assessment', 'in_treatment', 'risk_register.treat', false, false, false, 30, '{}'::jsonb),
    (v_def_id, 'begin_monitoring', 'Begin Monitoring', 'in_treatment', 'monitoring', 'risk_register.review', false, false, false, 40, '{}'::jsonb),
    (v_def_id, 'return_to_assessment', 'Return to Assessment', 'in_treatment', 'under_assessment', 'risk_register.assess', true, false, false, 50, '{}'::jsonb),
    (v_def_id, 'close', 'Close', 'monitoring', 'closed', 'risk_register.close', true, true, false, 60, '{}'::jsonb),
    (v_def_id, 'close_from_open', 'Close', 'open', 'closed', 'risk_register.close', true, true, false, 70, '{}'::jsonb)
  on conflict (workflow_definition_id, transition_key) do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- jsa.lifecycle
-- ----------------------------------------------------------------------------

do $$
declare
  v_def_id uuid;
begin
  select id into v_def_id
  from public.forge_workflow_definitions
  where organization_id is null
    and workflow_key = 'jsa.lifecycle'
    and version = 1;

  if v_def_id is null then
    insert into public.forge_workflow_definitions (
      organization_id, workflow_key, name, description, resource_type, version, is_core, is_active
    ) values (
      null,
      'jsa.lifecycle',
      'JSA / JHA Lifecycle',
      'Forge core JSA/JHA workflow synchronized with forge_jsas.status.',
      'jsa',
      1,
      true,
      true
    )
    returning id into v_def_id;
  end if;

  insert into public.forge_workflow_states (
    workflow_definition_id, state_key, name, sort_order, is_initial, is_terminal, locks_record
  ) values
    (v_def_id, 'draft', 'Draft', 10, true, false, false),
    (v_def_id, 'in_review', 'In Review', 20, false, false, false),
    (v_def_id, 'approved', 'Approved', 30, false, false, false),
    (v_def_id, 'active', 'Active', 40, false, false, false),
    (v_def_id, 'superseded', 'Superseded', 50, false, false, false),
    (v_def_id, 'retired', 'Retired', 60, false, true, true)
  on conflict (workflow_definition_id, state_key) do nothing;

  insert into public.forge_workflow_transitions (
    workflow_definition_id, transition_key, name, from_state_key, to_state_key,
    required_permission, requires_comment, requires_confirmation, requires_approval, sort_order, rule_config
  ) values
    (v_def_id, 'submit', 'Submit for Review', 'draft', 'in_review', 'jsa_jha.submit', false, false, false, 10, '{}'::jsonb),
    (v_def_id, 'approve', 'Approve', 'in_review', 'approved', 'jsa_jha.approve', false, true, false, 20, '{}'::jsonb),
    (v_def_id, 'activate', 'Activate', 'approved', 'active', 'jsa_jha.edit', false, false, false, 30, '{}'::jsonb),
    (v_def_id, 'supersede', 'Supersede', 'active', 'superseded', 'jsa_jha.edit', true, false, false, 40, '{}'::jsonb),
    (v_def_id, 'retire_from_active', 'Retire', 'active', 'retired', 'jsa_jha.close', true, true, false, 50, '{}'::jsonb),
    (v_def_id, 'retire_from_superseded', 'Retire', 'superseded', 'retired', 'jsa_jha.close', true, true, false, 60, '{}'::jsonb),
    (v_def_id, 'retire_from_approved', 'Retire', 'approved', 'retired', 'jsa_jha.close', true, true, false, 70, '{}'::jsonb)
  on conflict (workflow_definition_id, transition_key) do nothing;
end;
$$;

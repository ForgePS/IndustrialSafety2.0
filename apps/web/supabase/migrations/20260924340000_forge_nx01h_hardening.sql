-- NX-01H: CAPA atomic lifecycle + incident↔asset universal link sync + reconciliation

-- ----------------------------------------------------------------------------
-- Domain event outbox (durable fan-out alongside in-transaction audit)
-- ----------------------------------------------------------------------------

create table if not exists public.forge_domain_event_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  resource_type text not null,
  resource_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text
);

create index if not exists forge_domain_event_outbox_pending_idx
  on public.forge_domain_event_outbox (occurred_at)
  where processed_at is null;

alter table public.forge_domain_event_outbox enable row level security;
revoke all on public.forge_domain_event_outbox from anon, authenticated;
grant all on public.forge_domain_event_outbox to service_role;

-- ----------------------------------------------------------------------------
-- Atomic CAPA + workflow transition
-- Server authorizes first. RPC defensively validates org/resource/state.
-- p_fail_after_capa_update raises to force full rollback (tests only).
-- ----------------------------------------------------------------------------

create or replace function public.forge_perform_capa_lifecycle_transition(
  p_organization_id uuid,
  p_capa_id uuid,
  p_expected_capa_status text,
  p_to_capa_status text,
  p_transition_key text,
  p_actor_user_id uuid,
  p_comment text,
  p_capa_patch jsonb,
  p_metadata jsonb,
  p_idempotency_key text,
  p_fail_after_capa_update boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capa public.forge_corrective_actions%rowtype;
  v_def_id uuid;
  v_instance public.forge_workflow_instances%rowtype;
  v_event_id uuid;
  v_existing uuid;
  v_workflow_from text;
  v_workflow_to text;
  v_complete boolean;
  v_cancel boolean;
  v_activity_id bigint;
  v_audit_id bigint;
begin
  select * into v_capa
  from public.forge_corrective_actions
  where organization_id = p_organization_id
    and id = p_capa_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Corrective Action not found.');
  end if;

  -- Explicit SoR → workflow mapping (1:1 by design; do not rely on coincidence in app code)
  v_workflow_from := p_expected_capa_status;
  v_workflow_to := p_to_capa_status;

  select d.id into v_def_id
  from public.forge_workflow_definitions d
  where d.workflow_key = 'corrective_actions.lifecycle'
    and d.version = 1
    and d.organization_id is null
    and d.is_active = true
  limit 1;

  if v_def_id is null then
    return jsonb_build_object('ok', false, 'error', 'CAPA workflow definition missing.');
  end if;

  select * into v_instance
  from public.forge_workflow_instances
  where organization_id = p_organization_id
    and resource_type = 'corrective_action'
    and resource_id = p_capa_id
    and workflow_definition_id = v_def_id
  for update;

  if not found then
    insert into public.forge_workflow_instances (
      organization_id, workflow_definition_id, workflow_version,
      resource_type, resource_id, current_state_key
    ) values (
      p_organization_id, v_def_id, 1,
      'corrective_action', p_capa_id, v_capa.status
    )
    returning * into v_instance;

    insert into public.forge_workflow_events (
      organization_id, workflow_instance_id, resource_type, resource_id,
      transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
    ) values (
      p_organization_id, v_instance.id, 'corrective_action', p_capa_id,
      'initialize', null, v_capa.status, p_actor_user_id,
      'Workflow instance created during CAPA transition.',
      jsonb_build_object('source', 'forge_perform_capa_lifecycle_transition')
    );
  end if;

  -- Idempotency before state guards so retries after success return the original result
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
        'capa_status', v_capa.status,
        'workflow_state', v_instance.current_state_key,
        'instance_id', v_instance.id
      );
    end if;
  end if;

  if v_capa.status is distinct from p_expected_capa_status then
    return jsonb_build_object(
      'ok', false,
      'error', 'CAPA status changed. Reload and try again.',
      'current_status', v_capa.status
    );
  end if;

  if v_instance.current_state_key is distinct from v_workflow_from then
    return jsonb_build_object(
      'ok', false,
      'error', 'Workflow state diverges from CAPA status. Reconciliation required.',
      'capa_status', v_capa.status,
      'workflow_state', v_instance.current_state_key
    );
  end if;

  v_complete := p_to_capa_status in ('closed', 'canceled');
  v_cancel := p_to_capa_status = 'canceled';

  update public.forge_corrective_actions ca
  set
    status = p_to_capa_status,
    updated_by = p_actor_user_id,
    updated_at = now(),
    completed_at = case
      when p_capa_patch ? 'completed_at' then nullif(p_capa_patch->>'completed_at', '')::timestamptz
      else ca.completed_at
    end,
    completed_by = case
      when p_capa_patch ? 'completed_by' then nullif(p_capa_patch->>'completed_by', '')::uuid
      else ca.completed_by
    end,
    verification_result = case
      when p_capa_patch ? 'verification_result' then nullif(p_capa_patch->>'verification_result', '')
      else ca.verification_result
    end,
    verification_notes = case
      when p_capa_patch ? 'verification_notes' then nullif(p_capa_patch->>'verification_notes', '')
      else ca.verification_notes
    end,
    verified_at = case
      when p_capa_patch ? 'verified_at' then nullif(p_capa_patch->>'verified_at', '')::timestamptz
      else ca.verified_at
    end,
    verified_by = case
      when p_capa_patch ? 'verified_by' then nullif(p_capa_patch->>'verified_by', '')::uuid
      else ca.verified_by
    end,
    closure_notes = case
      when p_capa_patch ? 'closure_notes' then nullif(p_capa_patch->>'closure_notes', '')
      else ca.closure_notes
    end,
    closed_at = case
      when p_capa_patch ? 'closed_at' then nullif(p_capa_patch->>'closed_at', '')::timestamptz
      else ca.closed_at
    end,
    closed_by = case
      when p_capa_patch ? 'closed_by' then nullif(p_capa_patch->>'closed_by', '')::uuid
      else ca.closed_by
    end
  where ca.id = p_capa_id
    and ca.organization_id = p_organization_id;

  if coalesce(p_fail_after_capa_update, false) then
    raise exception 'NX01H_FORCED_FAILURE';
  end if;

  update public.forge_workflow_instances
  set
    current_state_key = v_workflow_to,
    updated_at = now(),
    completed_at = case when v_complete then now() else completed_at end,
    canceled_at = case when v_cancel then now() else canceled_at end
  where id = v_instance.id
    and organization_id = p_organization_id;

  insert into public.forge_workflow_events (
    organization_id, workflow_instance_id, resource_type, resource_id,
    transition_key, from_state_key, to_state_key, actor_user_id, comment, metadata
  ) values (
    p_organization_id, v_instance.id, 'corrective_action', p_capa_id,
    p_transition_key, v_workflow_from, v_workflow_to, p_actor_user_id,
    nullif(trim(coalesce(p_comment, '')), ''),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('adapter', 'capa_atomic')
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

  insert into public.forge_corrective_action_activity (
    organization_id, corrective_action_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    p_capa_id,
    'workflow_' || p_transition_key,
    'CAPA transitioned from ' || p_expected_capa_status || ' to ' || p_to_capa_status || '.',
    p_actor_user_id,
    jsonb_build_object('event_id', v_event_id, 'transition_key', p_transition_key)
  )
  returning id into v_activity_id;

  insert into public.forge_record_activity (
    organization_id, resource_type, resource_id, activity_type, message, actor_user_id, metadata
  ) values (
    p_organization_id,
    'corrective_action',
    p_capa_id,
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
    'corrective_action.lifecycle_transitioned',
    'corrective_action',
    p_capa_id,
    jsonb_build_object('status', p_expected_capa_status, 'workflow_state', v_workflow_from),
    jsonb_build_object(
      'status', p_to_capa_status,
      'workflow_state', v_workflow_to,
      'transition_key', p_transition_key,
      'event_id', v_event_id
    )
  )
  returning id into v_audit_id;

  insert into public.forge_domain_event_outbox (
    organization_id, event_type, resource_type, resource_id, payload
  ) values (
    p_organization_id,
    'capa.lifecycle_transitioned',
    'corrective_action',
    p_capa_id,
    jsonb_build_object(
      'from_status', p_expected_capa_status,
      'to_status', p_to_capa_status,
      'transition_key', p_transition_key,
      'event_id', v_event_id,
      'audit_id', v_audit_id,
      'activity_id', v_activity_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_id', v_event_id,
    'capa_status', p_to_capa_status,
    'workflow_state', v_workflow_to,
    'instance_id', v_instance.id,
    'audit_id', v_audit_id
  );
end;
$$;

revoke all on function public.forge_perform_capa_lifecycle_transition(
  uuid, uuid, text, text, text, uuid, text, jsonb, jsonb, text, boolean
) from public;
grant execute on function public.forge_perform_capa_lifecycle_transition(
  uuid, uuid, text, text, text, uuid, text, jsonb, jsonb, text, boolean
) to service_role;

-- ----------------------------------------------------------------------------
-- CAPA ↔ workflow reconciliation (read-only diagnostic)
-- ----------------------------------------------------------------------------

create or replace function public.forge_reconcile_capa_workflow_states(
  p_organization_id uuid default null
)
returns table (
  organization_id uuid,
  capa_id uuid,
  capa_status text,
  workflow_state text,
  instance_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ca.organization_id,
    ca.id as capa_id,
    ca.status as capa_status,
    i.current_state_key as workflow_state,
    i.id as instance_id
  from public.forge_corrective_actions ca
  join public.forge_workflow_definitions d
    on d.workflow_key = 'corrective_actions.lifecycle'
   and d.version = 1
   and d.organization_id is null
  left join public.forge_workflow_instances i
    on i.organization_id = ca.organization_id
   and i.resource_type = 'corrective_action'
   and i.resource_id = ca.id
   and i.workflow_definition_id = d.id
  where (p_organization_id is null or ca.organization_id = p_organization_id)
    and (
      i.id is null
      or i.current_state_key is distinct from ca.status
    );
$$;

revoke all on function public.forge_reconcile_capa_workflow_states(uuid) from public;
grant execute on function public.forge_reconcile_capa_workflow_states(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Incident ↔ Asset → forge_record_links sync (Option A: DB trigger)
-- ----------------------------------------------------------------------------

create or replace function public.sync_incident_asset_record_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.forge_record_links
    set archived_at = null,
        archived_by = null,
        created_by = coalesce(new.linked_by, created_by)
    where organization_id = new.organization_id
      and source_resource_type = 'incident'
      and source_resource_id = new.incident_id
      and target_resource_type = 'asset'
      and target_resource_id = new.asset_id
      and relationship_type = 'involves_asset'
      and archived_at is not null;

    if not found then
      insert into public.forge_record_links (
        organization_id,
        source_resource_type,
        source_resource_id,
        target_resource_type,
        target_resource_id,
        relationship_type,
        created_by,
        created_at
      )
      select
        new.organization_id,
        'incident',
        new.incident_id,
        'asset',
        new.asset_id,
        'involves_asset',
        new.linked_by,
        new.linked_at
      where not exists (
        select 1
        from public.forge_record_links rl
        where rl.organization_id = new.organization_id
          and rl.source_resource_type = 'incident'
          and rl.source_resource_id = new.incident_id
          and rl.target_resource_type = 'asset'
          and rl.target_resource_id = new.asset_id
          and rl.relationship_type = 'involves_asset'
          and rl.archived_at is null
      );
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.forge_record_links
    set archived_at = now(),
        archived_by = old.linked_by
    where organization_id = old.organization_id
      and source_resource_type = 'incident'
      and source_resource_id = old.incident_id
      and target_resource_type = 'asset'
      and target_resource_id = old.asset_id
      and relationship_type = 'involves_asset'
      and archived_at is null;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists forge_incident_assets_sync_record_links on public.forge_incident_assets;
create trigger forge_incident_assets_sync_record_links
after insert or delete on public.forge_incident_assets
for each row execute function public.sync_incident_asset_record_link();

revoke all on function public.sync_incident_asset_record_link() from public;

-- Deterministic, rerunnable backfill of active incident ↔ asset links
insert into public.forge_record_links (
  organization_id,
  source_resource_type,
  source_resource_id,
  target_resource_type,
  target_resource_id,
  relationship_type,
  created_by,
  created_at
)
select
  ia.organization_id,
  'incident',
  ia.incident_id,
  'asset',
  ia.asset_id,
  'involves_asset',
  ia.linked_by,
  ia.linked_at
from public.forge_incident_assets ia
where not exists (
  select 1
  from public.forge_record_links rl
  where rl.organization_id = ia.organization_id
    and rl.source_resource_type = 'incident'
    and rl.source_resource_id = ia.incident_id
    and rl.target_resource_type = 'asset'
    and rl.target_resource_id = ia.asset_id
    and rl.relationship_type = 'involves_asset'
    and rl.archived_at is null
);

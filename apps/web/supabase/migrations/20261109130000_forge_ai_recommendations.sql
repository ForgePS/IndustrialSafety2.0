-- Forge AI Command Center, stage 4: recommendations and approvals.
-- Additive only.
--  * Recommendations are generated from evidence that already exists (open Watch alerts and
--    risk indicator factors). Each one keeps its evidence, its source alert or assessment, and
--    an optional proposed action.
--  * A proposed action runs only through the existing approval engine
--    (forge_ai_action_approvals). The approval's status drives the recommendation's lifecycle.
--  * Every lifecycle change is written to an append-only event log.
--  * New approved action: corrective_action.create.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('forge_ai.view_recommendations','forge_ai','View AI Recommendations','View Forge AI recommendations, their evidence and history within the user''s location or division scope.','Forge AI','view_recommendations',true,true,'location',false,false,true,'normal',86),
  ('forge_ai.review_recommendations','forge_ai','Review AI Recommendations','Accept, submit for approval, dismiss, complete and verify Forge AI recommendations. Executing a proposed action still needs the underlying module permission.','Forge AI','review_recommendations',true,true,'location',false,false,true,'normal',87)
on conflict (permission_key) do update
set
  name=excluded.name,
  description=excluded.description,
  tenant_assignable=true,
  tenant_can_scope=excluded.tenant_can_scope,
  default_scope=excluded.default_scope,
  audit_use=true,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true,
  case when rt.template_key='supervisor' then 'location' else 'organization' end
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('forge_ai.view_recommendations','forge_ai.review_recommendations')
where rt.template_key in ('supervisor','safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true,
  case when r.role_key in ('supervisor','location-administrator') then 'location' else 'organization' end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('forge_ai.view_recommendations','forge_ai.review_recommendations')
where r.role_key in ('supervisor','location-administrator','company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope=excluded.scope;

-- ---------------------------------------------------------------------------
-- Recommendations
--   proposed    generated, waiting for a reviewer
--   in_review   its proposed action is waiting in the approval queue
--   approved    accepted (advisory work done by people), or the action was approved
--   executing   the approved action is running
--   executed    the action ran, or people marked the work done; waiting for verification
--   verified    the evidence shows the condition was addressed
--   failed      the action failed, or a reviewer found the work ineffective
--   rejected    the approver rejected the proposed action
--   dismissed   a reviewer decided not to act
--   superseded  the condition cleared before anyone acted
-- ---------------------------------------------------------------------------
create table if not exists public.forge_ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recommendation_key text not null,
  kind text not null check (kind in ('corrective_action','review','training','maintenance','escalation')),
  title text not null,
  rationale text not null,
  priority text not null check (priority in ('low','medium','high','critical')),
  status text not null default 'proposed'
    check (status in ('proposed','in_review','approved','executing','executed','verified','failed','rejected','dismissed','superseded')),
  source_type text not null check (source_type in ('watch_alert','risk_assessment')),
  watch_alert_id uuid references public.forge_ai_watch_alerts(id) on delete set null,
  risk_assessment_id uuid references public.forge_ai_risk_assessments(id) on delete set null,
  rule_key text,
  factor_key text,
  scope_type text check (scope_type is null or scope_type in ('location','division')),
  scope_id uuid,
  location_id uuid,
  division_id uuid,
  evidence jsonb not null default '[]'::jsonb,
  proposed_action jsonb,
  verification_criteria jsonb not null default '[]'::jsonb,
  action_approval_id uuid references public.forge_ai_action_approvals(id) on delete set null,
  result_entity_type text,
  result_entity_id text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  executed_at timestamptz,
  verification_due_at timestamptz,
  verification_result jsonb,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source_type = 'watch_alert' and rule_key is not null) or (source_type = 'risk_assessment' and factor_key is not null and scope_id is not null))
);

-- One live recommendation per condition. Closed ones stay as history.
create unique index if not exists forge_ai_recommendations_live_key_idx
  on public.forge_ai_recommendations (organization_id, recommendation_key)
  where status in ('proposed','in_review','approved','executing','executed');

create index if not exists forge_ai_recommendations_org_status_idx
  on public.forge_ai_recommendations (organization_id, status, priority, generated_at desc);

create unique index if not exists forge_ai_recommendations_approval_idx
  on public.forge_ai_recommendations (action_approval_id) where action_approval_id is not null;

create table if not exists public.forge_ai_recommendation_events (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recommendation_id uuid not null references public.forge_ai_recommendations(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_type text not null default 'user' check (actor_type in ('user','system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_ai_recommendation_events_rec_idx
  on public.forge_ai_recommendation_events (recommendation_id, id);

-- The event log is append-only. Rows go only when their tenant or recommendation is deleted.
create or replace function public.forge_ai_recommendation_events_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'forge_ai_recommendation_events is append-only';
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() < 2 then
    raise exception 'forge_ai_recommendation_events is append-only';
  end if;
  return old;
end $$;

revoke all on function public.forge_ai_recommendation_events_append_only() from public, anon, authenticated;

drop trigger if exists forge_ai_recommendation_events_append_only on public.forge_ai_recommendation_events;
create trigger forge_ai_recommendation_events_append_only
before update or delete on public.forge_ai_recommendation_events
for each row execute function public.forge_ai_recommendation_events_append_only();

-- The approval engine owns execution. When a linked approval changes status, the
-- recommendation follows it in the same transaction and the change is logged.
create or replace function public.forge_ai_recommendation_follow_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rec record;
  next_status text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into rec from public.forge_ai_recommendations where action_approval_id = new.id for update;
  if not found then
    return new;
  end if;

  next_status := case new.status
    when 'pending' then 'in_review'
    when 'approved' then 'approved'
    when 'executing' then 'executing'
    when 'executed' then 'executed'
    when 'failed' then 'failed'
    when 'rejected' then 'rejected'
    when 'expired' then 'proposed'
    when 'canceled' then 'proposed'
    else rec.status
  end;

  if next_status = rec.status then
    return new;
  end if;

  update public.forge_ai_recommendations
  set status = next_status,
      action_approval_id = case when new.status in ('expired','canceled') then null else action_approval_id end,
      executed_at = case when next_status = 'executed' then coalesce(new.executed_at, now()) else executed_at end,
      verification_due_at = case when next_status = 'executed' then coalesce(new.executed_at, now()) + interval '14 days' else verification_due_at end,
      result_entity_type = case when next_status = 'executed' then new.execution_result->>'entity_type' else result_entity_type end,
      result_entity_id = case when next_status = 'executed' then new.execution_result->>'entity_id' else result_entity_id end,
      reviewed_by = case when new.status = 'rejected' then new.rejected_by else reviewed_by end,
      reviewed_at = case when new.status = 'rejected' then new.rejected_at else reviewed_at end,
      review_note = case when new.status = 'rejected' then new.rejection_reason else review_note end,
      updated_at = now()
  where id = rec.id;

  insert into public.forge_ai_recommendation_events
    (organization_id, recommendation_id, event_type, from_status, to_status, actor_type, actor_user_id, detail)
  values (
    rec.organization_id, rec.id, 'approval.' || new.status, rec.status, next_status,
    case when coalesce(new.approved_by, new.rejected_by) is null then 'system' else 'user' end,
    case new.status when 'rejected' then new.rejected_by when 'pending' then new.requested_by else new.approved_by end,
    jsonb_build_object(
      'approval_id', new.id,
      'action_key', new.action_key,
      'reason', new.rejection_reason,
      'result', case when new.status in ('executed','failed') then new.execution_result else null end
    )
  );

  return new;
end $$;

revoke all on function public.forge_ai_recommendation_follow_approval() from public, anon, authenticated;

drop trigger if exists forge_ai_recommendation_follow_approval on public.forge_ai_action_approvals;
create trigger forge_ai_recommendation_follow_approval
after update of status on public.forge_ai_action_approvals
for each row execute function public.forge_ai_recommendation_follow_approval();

alter table public.forge_ai_recommendations enable row level security;
alter table public.forge_ai_recommendation_events enable row level security;

revoke all on public.forge_ai_recommendations, public.forge_ai_recommendation_events from anon, authenticated;
grant all on public.forge_ai_recommendations, public.forge_ai_recommendation_events to service_role;
grant usage, select on sequence public.forge_ai_recommendation_events_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Approved action: create a corrective action (and its linked task) after human approval.
-- ---------------------------------------------------------------------------
insert into public.forge_ai_action_registry
(action_key, name, description, category, target_type, required_permission_key, risk_level, platform_enabled, requires_approval, allow_self_approval, payload_schema, sort_order)
values
  (
    'corrective_action.create',
    'Create Corrective Action',
    'Create an open corrective action with its linked task after human approval. Never assigns, completes or verifies it.',
    'Corrective Actions',
    'organization',
    'corrective_actions.create',
    'normal',
    true,
    true,
    true,
    '{
      "required":["title","description","action_type","severity"],
      "fields":["title","description","action_type","severity","source_type","source_reference","location_id","division_id","immediate_containment","root_cause_required","preventive_action"]
    }'::jsonb,
    40
  )
on conflict (action_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  target_type=excluded.target_type,
  required_permission_key=excluded.required_permission_key,
  risk_level=excluded.risk_level,
  platform_enabled=excluded.platform_enabled,
  requires_approval=excluded.requires_approval,
  allow_self_approval=excluded.allow_self_approval,
  payload_schema=excluded.payload_schema,
  sort_order=excluded.sort_order,
  updated_at=now();

-- Tenants that already allow approved AI actions get this one too.
insert into public.forge_ai_tenant_actions (organization_id, action_id, enabled, tenant_can_configure, settings)
select distinct ta.organization_id, a.id, true, true, '{}'::jsonb
from public.forge_ai_tenant_actions ta
cross join public.forge_ai_action_registry a
where ta.enabled and a.action_key = 'corrective_action.create'
on conflict (organization_id, action_id) do nothing;

-- ---------------------------------------------------------------------------
-- Recommendations tool for the agents
-- ---------------------------------------------------------------------------
insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values
  ('get_recommendations','Get Recommendations','Forge AI recommendations with their evidence, proposed action and status, within the user''s scope.','Risk Intelligence','forge_ai.view_recommendations','read',true,false,false,97)
on conflict (capability_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  required_permission_key=excluded.required_permission_key,
  platform_enabled=true;

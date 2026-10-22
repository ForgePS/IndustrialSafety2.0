-- Forge Industrial Safety 2.0 AI Assistant foundation.
-- Tenant-aware, permission-aware, auditable, provider-agnostic assistant control plane and runtime history.

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('forge_ai', 'Forge AI Assistant', 'Permission-aware AI assistant for Forge Safety data, workflows, analysis, drafting and approved actions.', 'AI', 'module', 'enabled', true, false, true, true, true, 250)
on conflict (feature_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  platform_state=excluded.platform_state,
  tenant_configurable=excluded.tenant_configurable,
  user_configurable=excluded.user_configurable,
  requires_entitlement=excluded.requires_entitlement,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('forge_ai.use','forge_ai','Use Forge AI','Use Forge AI within the user''s existing Forge permissions and data scope.','Forge AI','use',true,true,'own',false,false,true,'normal',10),
  ('forge_ai.view_sensitive','forge_ai','AI Access to Sensitive Data','Allow Forge AI to use sensitive data that the user is otherwise authorized to view.','Forge AI','view_sensitive',true,true,'organization',true,true,true,'critical',20),
  ('forge_ai.run_actions','forge_ai','Request AI Actions','Allow Forge AI to prepare write actions for approval. This does not bypass the underlying action permission.','Forge AI','run_actions',true,true,'organization',true,true,true,'critical',30),
  ('forge_ai.approve_actions','forge_ai','Approve AI Actions','Approve eligible AI-prepared write actions within the user''s normal permission scope.','Forge AI','approve_actions',true,true,'organization',true,true,true,'critical',40),
  ('forge_ai.manage_knowledge','forge_ai','Manage AI Knowledge','Manage tenant AI knowledge sources such as policies, SOPs and manuals.','Forge AI','manage_knowledge',true,false,'organization',true,true,true,'sensitive',50),
  ('forge_ai.manage','forge_ai','Manage Forge AI','Manage tenant Forge AI configuration that Forge Creator exposes.','Forge AI','manage',true,false,'organization',true,true,true,'critical',60),
  ('forge_ai.view_usage','forge_ai','View AI Usage','View tenant Forge AI usage, tool activity and feedback.','Forge AI','view_usage',true,false,'organization',true,false,true,'sensitive',70)
on conflict (permission_key) do update
set
  feature_key=excluded.feature_key,
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
select rt.id, p.id, true,
  case when rt.template_key='standard-user' then 'own'
       when rt.template_key='supervisor' then 'location'
       else 'organization' end
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='forge_ai.use'
where rt.template_key in ('standard-user','supervisor','safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('forge_ai.manage_knowledge','forge_ai.view_usage')
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('forge_ai.manage','forge_ai.run_actions','forge_ai.approve_actions')
where rt.template_key='company-admin'
on conflict (template_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true,
  case when r.role_key='employee' then 'own'
       when r.role_key in ('supervisor','location-administrator') then 'location'
       else 'organization' end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='forge_ai.use'
where r.role_key in ('employee','supervisor','location-administrator','company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope=excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('forge_ai.manage_knowledge','forge_ai.view_usage')
where r.role_key in ('company-administrator','company-owner')
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('forge_ai.manage','forge_ai.run_actions','forge_ai.approve_actions')
where r.role_key='company-owner'
on conflict (role_id, permission_id) do update set allowed=true, scope='organization';

create table if not exists public.forge_ai_capabilities (
  id uuid primary key default gen_random_uuid(),
  capability_key text not null unique,
  name text not null,
  description text,
  category text not null,
  required_permission_key text,
  capability_type text not null default 'read'
    check (capability_type in ('read','draft','action','system')),
  platform_enabled boolean not null default true,
  sensitive boolean not null default false,
  requires_approval boolean not null default false,
  input_schema jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values
  ('company_snapshot','Company Safety Snapshot','Summarize Forge operational data the current user is authorized to view.','Overview','forge_ai.use','read',true,false,false,10),
  ('search_personnel','Search Personnel','Search personnel records within the current user''s Personnel permission scope.','People','personnel.view','read',true,false,false,20),
  ('search_training','Search Training','Search courses, assignments and completion records within the user''s Training scope.','People','training.view','read',true,false,false,30),
  ('search_incidents','Search Incidents','Search incident records within the current user''s Incident scope.','Safety','incidents.view','read',true,false,false,40),
  ('search_inspections','Search Inspections','Search inspection records and status within the current user''s Inspection scope.','Safety','inspections.view','read',true,false,false,50),
  ('search_assets','Search Assets & Equipment','Search assets, equipment, status and maintenance context within scope.','Operations','assets_equipment.view','read',true,false,false,60),
  ('search_qr','Search QR Management','Search managed QR records without exposing scan tokens.','Operations','qr_management.view','read',true,false,false,70),
  ('explain_access','Explain My Access','Explain which Forge permissions and scopes currently apply to the user.','System','forge_ai.use','system',true,false,false,80),
  ('knowledge_search','Search Tenant Knowledge','Search approved tenant policies, SOPs, manuals and guidance.','Knowledge','forge_ai.use','read',false,true,false,90),
  ('prepare_action','Prepare Approved Action','Prepare an eligible Forge write action for explicit human approval.','Actions','forge_ai.run_actions','action',false,true,true,100)
on conflict (capability_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  required_permission_key=excluded.required_permission_key,
  capability_type=excluded.capability_type,
  sensitive=excluded.sensitive,
  requires_approval=excluded.requires_approval,
  sort_order=excluded.sort_order,
  updated_at=now();

create table if not exists public.forge_ai_tenant_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  assistant_name text not null default 'Forge AI',
  provider text not null default 'openai',
  model text not null default 'gpt-6-sol',
  reasoning_effort text not null default 'medium'
    check (reasoning_effort in ('none','low','medium','high')),
  response_style text not null default 'professional'
    check (response_style in ('concise','professional','detailed')),
  system_instructions text,
  allow_sensitive_data boolean not null default false,
  action_mode text not null default 'approval_required'
    check (action_mode in ('read_only','approval_required','enabled')),
  tenant_can_configure boolean not null default false,
  monthly_token_budget bigint,
  max_input_chars integer not null default 12000 check (max_input_chars between 500 and 100000),
  max_output_tokens integer not null default 3000 check (max_output_tokens between 256 and 16000),
  max_tool_calls integer not null default 8 check (max_tool_calls between 0 and 30),
  requests_per_minute integer not null default 12 check (requests_per_minute between 1 and 120),
  data_retention_days integer not null default 365 check (data_retention_days between 1 and 3650),
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_ai_tenant_capabilities (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability_id uuid not null references public.forge_ai_capabilities(id) on delete cascade,
  enabled boolean not null default true,
  tenant_can_configure boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, capability_id)
);

create table if not exists public.forge_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  status text not null default 'active'
    check (status in ('active','archived','deleted')),
  pinned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_ai_conversations_user_idx
  on public.forge_ai_conversations(organization_id, user_id, status, last_message_at desc);

create table if not exists public.forge_ai_messages (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.forge_ai_conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  source_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_ai_messages_conversation_idx
  on public.forge_ai_messages(organization_id, conversation_id, id);

create table if not exists public.forge_ai_tool_runs (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.forge_ai_conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  capability_id uuid references public.forge_ai_capabilities(id) on delete set null,
  capability_key text not null,
  required_permission_key text,
  status text not null default 'running'
    check (status in ('running','completed','denied','failed','pending_approval','canceled')),
  input jsonb not null default '{}'::jsonb,
  result_summary text,
  result_metadata jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists forge_ai_tool_runs_conversation_idx
  on public.forge_ai_tool_runs(organization_id, conversation_id, started_at desc);

create table if not exists public.forge_ai_action_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.forge_ai_conversations(id) on delete set null,
  tool_run_id bigint references public.forge_ai_tool_runs(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  action_key text not null,
  target_type text,
  target_id text,
  request_payload jsonb not null default '{}'::jsonb,
  risk_summary text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','executing','executed','failed','expired','canceled')),
  approval_expires_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  execution_result jsonb,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_ai_action_approvals_org_status_idx
  on public.forge_ai_action_approvals(organization_id, status, created_at desc);

create table if not exists public.forge_ai_usage_events (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.forge_ai_conversations(id) on delete set null,
  provider text not null,
  model text not null,
  provider_response_id text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  reasoning_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  tool_calls integer not null default 0,
  duration_ms integer,
  estimated_cost_cents numeric(12,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_ai_usage_events_org_month_idx
  on public.forge_ai_usage_events(organization_id, created_at desc);

create table if not exists public.forge_ai_feedback (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.forge_ai_conversations(id) on delete cascade,
  message_id bigint references public.forge_ai_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint check (rating in (-1,1)),
  category text,
  comments text,
  created_at timestamptz not null default now()
);

create table if not exists public.forge_ai_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null
    check (source_type in ('policy','sop','manual','training_material','document','url','other')),
  title text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft','processing','active','failed','archived')),
  sensitivity text not null default 'internal'
    check (sensitivity in ('public','internal','restricted')),
  source_reference text,
  storage_reference text,
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_ai_knowledge_sources_org_idx
  on public.forge_ai_knowledge_sources(organization_id, status, source_type);

alter table public.forge_ai_capabilities enable row level security;
alter table public.forge_ai_tenant_settings enable row level security;
alter table public.forge_ai_tenant_capabilities enable row level security;
alter table public.forge_ai_conversations enable row level security;
alter table public.forge_ai_messages enable row level security;
alter table public.forge_ai_tool_runs enable row level security;
alter table public.forge_ai_action_approvals enable row level security;
alter table public.forge_ai_usage_events enable row level security;
alter table public.forge_ai_feedback enable row level security;
alter table public.forge_ai_knowledge_sources enable row level security;

grant all on public.forge_ai_capabilities to service_role;
grant all on public.forge_ai_tenant_settings to service_role;
grant all on public.forge_ai_tenant_capabilities to service_role;
grant all on public.forge_ai_conversations to service_role;
grant all on public.forge_ai_messages to service_role;
grant all on public.forge_ai_tool_runs to service_role;
grant all on public.forge_ai_action_approvals to service_role;
grant all on public.forge_ai_usage_events to service_role;
grant all on public.forge_ai_feedback to service_role;
grant all on public.forge_ai_knowledge_sources to service_role;
grant usage, select on sequence public.forge_ai_messages_id_seq to service_role;
grant usage, select on sequence public.forge_ai_tool_runs_id_seq to service_role;
grant usage, select on sequence public.forge_ai_usage_events_id_seq to service_role;
grant usage, select on sequence public.forge_ai_feedback_id_seq to service_role;

insert into public.forge_experience_elements
(element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select
  'nav.forge_ai',
  f.id,
  'menu',
  'Forge AI Assistant',
  'Forge AI',
  'Permission-aware AI assistant for Forge Safety.',
  '/ai',
  'forge-ai',
  'Navigation',
  255,
  true,
  'configurable',
  'presentation',
  'none',
  'preference',
  true,
  true,
  true,
  false,
  false,
  '{"route_live":true,"required_permission":"forge_ai.use"}'::jsonb
from public.forge_feature_registry f
where f.feature_key='forge_ai'
on conflict (element_key) do update
set
  feature_id=excluded.feature_id,
  default_label=excluded.default_label,
  default_description=excluded.default_description,
  route=excluded.route,
  component_key=excluded.component_key,
  sort_order=excluded.sort_order,
  settings=excluded.settings,
  updated_at=now();

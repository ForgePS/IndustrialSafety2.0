-- Forge AI approved write-action registry and first domain actions.

create table if not exists public.forge_ai_action_registry (
  id uuid primary key default gen_random_uuid(),
  action_key text not null unique,
  name text not null,
  description text,
  category text not null,
  target_type text not null,
  required_permission_key text not null,
  risk_level text not null default 'normal'
    check (risk_level in ('normal','sensitive','critical')),
  platform_enabled boolean not null default true,
  requires_approval boolean not null default true,
  allow_self_approval boolean not null default true,
  payload_schema jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_ai_tenant_actions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_id uuid not null references public.forge_ai_action_registry(id) on delete cascade,
  enabled boolean not null default false,
  tenant_can_configure boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, action_id)
);

alter table public.forge_ai_action_registry enable row level security;
alter table public.forge_ai_tenant_actions enable row level security;

grant all on public.forge_ai_action_registry to service_role;
grant all on public.forge_ai_tenant_actions to service_role;

insert into public.forge_ai_action_registry
(action_key, name, description, category, target_type, required_permission_key, risk_level, platform_enabled, requires_approval, allow_self_approval, payload_schema, sort_order)
values
  (
    'inspection.create_finding',
    'Create Inspection Finding',
    'Create a new finding on the inspection currently open in Forge after human approval.',
    'Inspections',
    'inspection',
    'inspections.edit',
    'normal',
    true,
    true,
    true,
    '{
      "required":["title","severity"],
      "fields":["title","description","severity","due_date"]
    }'::jsonb,
    10
  ),
  (
    'asset.add_maintenance',
    'Add Asset Maintenance Record',
    'Add a maintenance or service record to the asset currently open in Forge after human approval.',
    'Assets & Equipment',
    'asset',
    'assets_equipment.maintenance',
    'normal',
    true,
    true,
    true,
    '{
      "required":["maintenance_type","description"],
      "fields":["maintenance_type","status","scheduled_for","performed_on","description","vendor","technician","findings","corrective_action","next_due_date"]
    }'::jsonb,
    20
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

update public.forge_ai_capabilities
set
  platform_enabled = true,
  sensitive = false,
  requires_approval = true,
  description = 'Prepare an eligible Forge write action for explicit human approval. The underlying normal Forge permission and record scope are revalidated before preparation and execution.',
  updated_at = now()
where capability_key = 'prepare_action';

insert into public.forge_ai_tenant_actions
(organization_id, action_id, enabled, tenant_can_configure, settings)
select
  '20000000-0000-4000-8000-000000000100',
  a.id,
  true,
  false,
  '{"local_demo":true}'::jsonb
from public.forge_ai_action_registry a
where a.action_key in ('inspection.create_finding','asset.add_maintenance')
on conflict (organization_id, action_id) do update
set enabled=true,
    settings=excluded.settings,
    updated_at=now();

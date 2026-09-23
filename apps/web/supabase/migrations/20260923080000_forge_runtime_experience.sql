-- Forge Creator 2.0 runtime experience activation.
-- route_live is an internal deployment signal. Creator controls presentation and
-- availability, but a navigation item is not shown to end users until its route is implemented.

update public.forge_experience_elements
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
  'route_live',
  case when element_key = 'dashboard.home' then true else false end
)
where element_type in ('menu','dashboard');

insert into public.forge_experience_elements (
  element_key,
  element_type,
  name,
  default_label,
  default_description,
  route,
  component_key,
  category,
  sort_order,
  platform_enabled,
  protection_level,
  tenant_edit_mode,
  location_edit_mode,
  user_edit_mode,
  can_hide,
  can_rename,
  can_reorder,
  settings
)
values (
  'nav.company_settings',
  'menu',
  'Company Settings',
  'Company Settings',
  'Tenant administration and company customization.',
  '/company/settings',
  'company-settings',
  'Administration',
  900,
  true,
  'configurable',
  'presentation',
  'none',
  'none',
  false,
  true,
  true,
  '{"route_live":true}'::jsonb
)
on conflict (element_key) do update
set
  default_label = excluded.default_label,
  default_description = excluded.default_description,
  route = excluded.route,
  component_key = excluded.component_key,
  category = excluded.category,
  platform_enabled = excluded.platform_enabled,
  tenant_edit_mode = excluded.tenant_edit_mode,
  settings = excluded.settings,
  updated_at = now();

-- Give the local Employee role a usable baseline by copying the Standard User template.
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope, constraints)
select
  r.id,
  tp.permission_id,
  tp.allowed,
  tp.scope,
  tp.constraints
from public.forge_tenant_roles r
join public.forge_role_templates rt on rt.template_key = 'standard-user'
join public.forge_role_template_permissions tp on tp.template_id = rt.id
where r.role_key = 'employee'
on conflict (role_id, permission_id) do update
set
  allowed = excluded.allowed,
  scope = excluded.scope,
  constraints = excluded.constraints;

-- Company Administrator roles inherit the reusable Company Administrator template.
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope, constraints)
select
  r.id,
  tp.permission_id,
  tp.allowed,
  tp.scope,
  tp.constraints
from public.forge_tenant_roles r
join public.forge_role_templates rt on rt.template_key = 'company-admin'
join public.forge_role_template_permissions tp on tp.template_id = rt.id
where r.role_key = 'company-administrator'
on conflict (role_id, permission_id) do update
set
  allowed = excluded.allowed,
  scope = excluded.scope,
  constraints = excluded.constraints;

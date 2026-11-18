-- Tenant-admin Dropdown Manager navigation.
insert into public.forge_experience_elements (
  element_key, element_type, name, default_label, default_description, route, component_key,
  category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode,
  user_edit_mode, can_hide, can_rename, can_reorder, settings
)
values (
  'nav.company_lookups',
  'menu',
  'Dropdown Manager',
  'Dropdown Manager',
  'Customize approved dropdowns and option labels for this company.',
  '/company/settings/lookups',
  'company-dropdown-manager',
  'Administration',
  920,
  true,
  'configurable',
  'presentation',
  'none',
  'none',
  false,
  true,
  true,
  '{"route_live":true,"required_permission":"tenant.lookups.manage"}'::jsonb
)
on conflict (element_key) do update
set
  default_label = excluded.default_label,
  default_description = excluded.default_description,
  route = excluded.route,
  settings = excluded.settings,
  updated_at = now();

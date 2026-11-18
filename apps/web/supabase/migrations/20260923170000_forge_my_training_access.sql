-- My Training permission and configurable approval labels.

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
('my_training.view','my_training','View My Training','View the signed-in person''s own assignments and transcript.','My Training','view',true,false,'own',false,false,false,'normal',10)
on conflict (permission_key) do update
set
  feature_key=excluded.feature_key,
  name=excluded.name,
  description=excluded.description,
  permission_group=excluded.permission_group,
  action=excluded.action,
  tenant_assignable=true,
  default_scope='own',
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'own'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='my_training.view'
where rt.template_key in ('standard-user','supervisor','safety-manager','company-admin','read-only')
on conflict (template_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'own'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key='my_training.view'
where r.role_key in ('employee','supervisor','location-administrator','company-administrator','company-owner','read-only')
on conflict (role_id, permission_id) do update set allowed=true, scope='own';

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  'training.approval_status',
  f.id,
  'Approval Status',
  'Approval workflow labels used for training completions.',
  'Training',
  118,
  true,
  true,
  false,
  false,
  false
from public.forge_feature_registry f
where f.feature_key='training'
on conflict (lookup_key) do update
set name=excluded.name, description=excluded.description, feature_id=excluded.feature_id, updated_at=now();

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('pending','Pending','Waiting for approval.',10),
    ('approved','Approved','Training completion has been approved.',20),
    ('rejected','Rejected','Training completion was not approved.',30)
) as v(option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key='training.approval_status'
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

update public.forge_experience_elements
set settings=coalesce(settings,'{}'::jsonb) || '{"route_live":true,"required_permission":"my_training.view"}'::jsonb,
    updated_at=now()
where element_key='nav.my_training';

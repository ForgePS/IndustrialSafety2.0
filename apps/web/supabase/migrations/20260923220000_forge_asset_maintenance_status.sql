-- Assets & Equipment lookup completion.

insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  'assets.maintenance_status',
  f.id,
  'Maintenance Status',
  'Workflow status for asset maintenance records.',
  'Assets & Equipment',
  177,
  true,
  true,
  false,
  false,
  false
from public.forge_feature_registry f
where f.feature_key='assets_equipment'
on conflict (lookup_key) do update
set name=excluded.name, description=excluded.description, feature_id=excluded.feature_id, updated_at=now();

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('scheduled','Scheduled','Maintenance is scheduled but not started.',10),
    ('in_progress','In Progress','Maintenance work is currently underway.',20),
    ('completed','Completed','Maintenance work is complete.',30),
    ('canceled','Canceled','Maintenance work was canceled.',40)
) as v(option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key='assets.maintenance_status'
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

update public.forge_form_fields ff
set lookup_id=ld.id,
    can_change_lookup=true,
    updated_at=now()
from public.forge_form_definitions fd
join public.forge_lookup_definitions ld on ld.lookup_key='assets.maintenance_status'
where ff.form_id=fd.id
  and fd.form_key='assets.maintenance'
  and ff.field_key='status';

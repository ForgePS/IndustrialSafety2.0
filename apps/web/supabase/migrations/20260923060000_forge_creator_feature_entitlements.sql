-- Forge Creator 2.0 feature and entitlement expansion.

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, sort_order)
values
  ('my_training','My Training','Employee-facing assigned training, transcript and completion portal.','People','module','enabled',true,false,true,true,115),
  ('safety_supplies','Safety Supplies','Safety supply inventory, requests and fulfillment.','Operations','module','enabled',true,true,false,true,185),
  ('tasks','Tasks','Assigned tasks, corrective actions and follow-up work.','Operations','module','enabled',true,true,true,true,205),
  ('calendar','Calendar','Shared Forge calendar for training, inspections, tasks, meetings and deadlines.','Collaboration','module','enabled',true,true,true,true,215),
  ('reminders','Reminders','Personal and assigned reminders.','Collaboration','module','enabled',true,false,true,true,225),
  ('messaging','Messaging','In-platform direct and group messaging.','Collaboration','module','enabled',true,true,true,true,235),
  ('emergency_alerts','Emergency Alerts','Emergency notification workflows and alert distribution.','Safety','module','enabled',true,true,false,true,245),
  ('food_safety','Food Safety','Food safety programs, inspections, records and corrective actions.','Specialty','module','enabled',true,true,false,true,300),
  ('grain_sanitation','Grain Sanitation','Grain sanitation programs, inspections and records.','Specialty','module','enabled',true,true,false,true,310),
  ('print_manager','Print Manager','Managed printing, templates and mobile/Bluetooth print workflows.','Platform','feature','enabled',true,false,true,true,400),
  ('photo_markup','Photo Markup','Draw, text, icons and annotations on Forge photos.','Platform','feature','enabled',true,false,true,true,410)
on conflict (feature_key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  feature_type = excluded.feature_type,
  tenant_configurable = excluded.tenant_configurable,
  location_configurable = excluded.location_configurable,
  user_configurable = excluded.user_configurable,
  requires_entitlement = excluded.requires_entitlement,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Local Enterprise and Internal Demo plans start with every current entitlement enabled.
insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo','enterprise')
  and f.requires_entitlement = true
on conflict (plan_id, feature_id) do update
set enabled = excluded.enabled;

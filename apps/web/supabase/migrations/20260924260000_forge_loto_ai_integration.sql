-- LOTO integration into Forge AI search and proactive Watch.

insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values
  ('search_loto','Search Lockout / Tagout','Search equipment-specific LOTO procedures within the current user permission scope.','Safety','loto.view','read',true,false,false,75)
on conflict (capability_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  required_permission_key=excluded.required_permission_key,
  capability_type=excluded.capability_type,
  platform_enabled=true,
  sensitive=false,
  requires_approval=false,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_ai_watch_rule_templates
(rule_key, name, description, category, target_type, required_permission_key, severity, default_config, sort_order)
values
  (
    'loto.review_due',
    'LOTO Periodic Review Due',
    'Identify approved LOTO procedures with a periodic review due within the configured number of days or already overdue.',
    'Lockout / Tagout',
    'loto_procedure',
    'loto.view',
    'high',
    '{"days_ahead":30}'::jsonb,
    80
  )
on conflict (rule_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  target_type=excluded.target_type,
  required_permission_key=excluded.required_permission_key,
  severity=excluded.severity,
  default_config=excluded.default_config,
  sort_order=excluded.sort_order,
  updated_at=now();

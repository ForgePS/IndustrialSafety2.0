-- Tasks integration into Forge AI search and Watch.

insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values
  ('search_tasks','Search Tasks','Search operational Tasks and corrective actions within the current user permission scope.','Operations','tasks.view','read',true,false,false,76)
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
    'tasks.overdue',
    'Overdue Task',
    'Identify active Tasks and corrective actions that remain incomplete after their due date.',
    'Tasks',
    'task',
    'tasks.view',
    'warning',
    '{"days_overdue":1}'::jsonb,
    90
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

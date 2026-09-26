-- NX-02H: Forge AI capabilities for Observations, Risk Register, and JSA/JHA

insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values
  ('search_observations','Search Observations','Search safety observations within the current user Observations scope. Anonymous reporter identity is never returned by this tool.','Safety','observations.view','read',true,false,false,41),
  ('analyze_observations','Analyze Observations','Analyze observation volume, type, status, severity and Location patterns within the current user scope.','Safety','observations.view','read',true,false,false,42),
  ('search_risks','Search Risks','Search Risk Register entries within the current user Risk Register scope.','Safety','risk_register.view','read',true,false,false,43),
  ('explain_risk','Explain Risk','Explain a single risk assessment using server-authoritative matrix scoring, controls and residual risk within scope.','Safety','risk_register.view','read',true,false,false,44),
  ('search_jsas','Search JSAs','Search job safety analyses within the current user JSA/JHA scope.','Safety','jsa_jha.view','read',true,false,false,45),
  ('draft_jsa','Draft JSA','Prepare a DRAFT-only JSA creation request for explicit human approval. Never approves, activates, accepts risk, or acknowledges workers.','Safety','jsa_jha.create','draft',true,true,true,46)
on conflict (capability_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  required_permission_key=excluded.required_permission_key,
  capability_type=excluded.capability_type,
  platform_enabled=excluded.platform_enabled,
  sensitive=excluded.sensitive,
  requires_approval=excluded.requires_approval,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_ai_action_registry
(action_key, name, description, category, target_type, required_permission_key, risk_level, platform_enabled, requires_approval, allow_self_approval, payload_schema, sort_order)
values
  (
    'jsa.create_draft',
    'Create Draft JSA',
    'Create a new DRAFT job safety analysis after human approval. Never approves or activates the JSA.',
    'JSA / JHA',
    'organization',
    'jsa_jha.create',
    'normal',
    true,
    true,
    true,
    '{
      "required":["title"],
      "fields":["title","description","job_title","task_name","work_area","location_id","division_id"]
    }'::jsonb,
    30
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

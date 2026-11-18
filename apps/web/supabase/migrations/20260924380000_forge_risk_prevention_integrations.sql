-- NX-02 — Risk prevention cross-module integration lookups (minimal).
-- CAPA source_type already includes observation / jsa / risk in 20260924310000.
-- Relationship types (generated_capa, identified_risk) are enforced in
-- forgeRelationshipRegistry.ts — no DB enum required.

-- Ensure CAPA source_type options remain present (idempotent upsert).
insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('observation', 'Observation', 'Originated from a safety observation.', 40),
    ('jsa', 'JSA / JHA', 'Originated from a job safety analysis.', 50),
    ('risk', 'Risk Register', 'Originated from the Risk Register.', 60)
) as v(option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key = 'corrective_actions.source_type'
on conflict (lookup_id, option_key) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

-- Structured risk_register.source_type lookup for linking UIs.
insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  'risk_register.source_type',
  f.id,
  'Risk Source Type',
  'Workflow that originated a risk register entry.',
  'Risk Register',
  145,
  true,
  true,
  true,
  false,
  false
from public.forge_feature_registry f
where f.feature_key = 'risk_register'
on conflict (lookup_key) do update
set
  name = excluded.name,
  description = excluded.description,
  feature_id = excluded.feature_id,
  category = excluded.category,
  sort_order = excluded.sort_order,
  tenant_can_add_options = excluded.tenant_can_add_options,
  updated_at = now();

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('manual', 'Manual', 'Created directly by a user.', 10),
    ('observation', 'Observation', 'Identified from a safety observation.', 20),
    ('jsa', 'JSA / JHA', 'Identified from a job safety analysis.', 30),
    ('incident', 'Incident', 'Identified from an incident.', 40),
    ('inspection', 'Inspection', 'Identified from an inspection finding.', 50),
    ('other', 'Other', 'Other Forge workflow.', 60)
) as v(option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key = 'risk_register.source_type'
on conflict (lookup_id, option_key) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

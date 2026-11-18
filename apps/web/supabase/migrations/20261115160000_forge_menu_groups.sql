-- Group the left menu the way 1.0's Industrial menu is grouped.
--
-- A menu entry's category is the sidebar group it sits in (components/layout/vertical/Sidebar.tsx),
-- and Creator can still move an entry by editing its category. Group names and membership follow
-- 1.0's INDUSTRIAL_MODULE_REGISTRY (forge-platform packages/contracts/src/industrial.ts); Forge AI
-- has no 1.0 counterpart, so it gets a group of its own.

update public.forge_experience_elements as e
set category = g.category, updated_at = now()
from (
  values
    ('nav.personnel', 'People & Training'),
    ('nav.training', 'People & Training'),
    ('nav.my_training', 'People & Training'),
    ('nav.jsa_jha', 'People & Training'),
    ('nav.incidents', 'Incident & Claims'),
    ('nav.osha', 'Incident & Claims'),
    ('nav.workers_comp', 'Incident & Claims'),
    ('nav.inspections', 'Risk & Prevention'),
    ('nav.observations', 'Risk & Prevention'),
    ('nav.risk_register', 'Risk & Prevention'),
    ('nav.corrective_actions', 'Risk & Prevention'),
    ('nav.dot', 'Compliance Programs'),
    ('nav.assets_equipment', 'Equipment & Operations'),
    ('nav.fleet', 'Equipment & Operations'),
    ('nav.loto', 'High-Risk Work'),
    ('nav.forge_ai', 'Forge AI'),
    ('nav.forge_ai_watch', 'Forge AI'),
    ('nav.forge_ai_analytics', 'Forge AI'),
    ('nav.tasks', 'System Tools'),
    ('nav.calendar', 'System Tools'),
    ('nav.reminders', 'System Tools'),
    ('nav.messaging', 'System Tools'),
    ('nav.qr_management', 'System Tools'),
    ('nav.reporting', 'System Tools'),
    ('nav.company_settings', 'System Tools'),
    ('nav.customer_support', 'System Tools'),
    ('nav.company_forms', 'System Tools'),
    ('nav.company_lookups', 'System Tools')
) as g(element_key, category)
where e.element_key = g.element_key
  and e.element_type = 'menu';

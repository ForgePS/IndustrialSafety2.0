-- Inspection runtime hardening: result is computed from checklist responses and findings.

update public.forge_form_fields ff
set
  is_required = false,
  is_visible = false,
  is_read_only = true,
  can_hide = false,
  can_change_required = false,
  can_change_input_type = false,
  updated_at = now()
from public.forge_form_definitions fd
where ff.form_id = fd.id
  and fd.form_key = 'inspections.general'
  and ff.field_key = 'result';

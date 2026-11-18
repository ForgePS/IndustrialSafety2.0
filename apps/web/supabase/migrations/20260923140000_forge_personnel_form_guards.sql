-- Protect Personnel data integrity while keeping presentation configurable.

update public.forge_form_fields ff
set
  can_hide = false,
  can_change_required = false,
  can_change_input_type = false,
  is_required = true,
  updated_at = now()
from public.forge_form_definitions fd
where ff.form_id = fd.id
  and fd.form_key = 'personnel.profile'
  and ff.field_key in ('first_name','last_name');

update public.forge_form_fields ff
set
  can_change_input_type = false,
  updated_at = now()
from public.forge_form_definitions fd
where ff.form_id = fd.id
  and fd.form_key = 'personnel.profile'
  and ff.field_key in ('employee_number','employment_status','email','phone','hire_date','location_id','division_id','job_title');

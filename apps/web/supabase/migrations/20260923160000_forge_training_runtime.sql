-- Forge Industrial Safety 2.0 Training runtime.
-- Reuses Creator permissions, tenant lookups, forms, scopes and runtime experience.

create table if not exists public.forge_training_courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_code text,
  title text not null,
  description text,
  category_key text,
  delivery_method text,
  duration_minutes integer,
  validity_months integer,
  is_active boolean not null default true,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_training_courses_code_unique_idx
  on public.forge_training_courses(organization_id, course_code)
  where course_code is not null;

create index if not exists forge_training_courses_org_title_idx
  on public.forge_training_courses(organization_id, title);

create table if not exists public.forge_training_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.forge_training_courses(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  status text not null default 'assigned',
  assigned_at timestamptz not null default now(),
  due_date date,
  assigned_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, course_id, personnel_id, assigned_at)
);

create index if not exists forge_training_assignments_personnel_idx
  on public.forge_training_assignments(organization_id, personnel_id, status, due_date);

create table if not exists public.forge_training_completions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid references public.forge_training_assignments(id) on delete set null,
  course_id uuid not null references public.forge_training_courses(id) on delete cascade,
  personnel_id uuid not null references public.forge_personnel(id) on delete cascade,
  completed_at timestamptz not null,
  hours numeric(8,2),
  score numeric(7,2),
  instructor text,
  result text not null default 'completed',
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  certificate_number text,
  expires_at date,
  notes text,
  custom_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_training_completions_personnel_idx
  on public.forge_training_completions(organization_id, personnel_id, completed_at desc);

alter table public.forge_training_courses enable row level security;
alter table public.forge_training_assignments enable row level security;
alter table public.forge_training_completions enable row level security;

drop policy if exists forge_training_courses_member_select on public.forge_training_courses;
create policy forge_training_courses_member_select
on public.forge_training_courses for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_training_assignments_member_select on public.forge_training_assignments;
create policy forge_training_assignments_member_select
on public.forge_training_assignments for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists forge_training_completions_member_select on public.forge_training_completions;
create policy forge_training_completions_member_select
on public.forge_training_completions for select to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_training_courses to authenticated;
grant select on public.forge_training_assignments to authenticated;
grant select on public.forge_training_completions to authenticated;
grant all on public.forge_training_courses to service_role;
grant all on public.forge_training_assignments to service_role;
grant all on public.forge_training_completions to service_role;

-- Training-specific lookup definitions.
insert into public.forge_lookup_definitions
  (lookup_key, feature_id, name, description, category, sort_order, tenant_can_rename, tenant_can_reorder, tenant_can_add_options, tenant_can_hide_core_options, tenant_can_delete_core_options)
select
  v.lookup_key,
  f.id,
  v.name,
  v.description,
  'Training',
  v.sort_order,
  true,
  true,
  true,
  false,
  false
from (
  values
    ('training.category','Training Category','Categories used to organize training courses.',112),
    ('training.delivery_method','Delivery Method','How training is delivered.',114),
    ('training.result','Completion Result','Result values recorded on completed training.',116)
) as v(lookup_key, name, description, sort_order)
join public.forge_feature_registry f on f.feature_key='training'
on conflict (lookup_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  sort_order=excluded.sort_order,
  feature_id=excluded.feature_id,
  updated_at=now();

insert into public.forge_lookup_options
  (lookup_id, option_key, label, description, sort_order, is_active, is_core)
select d.id, v.option_key, v.label, v.description, v.sort_order, true, true
from (
  values
    ('training.category','general','General','General training.',10),
    ('training.category','safety','Safety','Safety-focused training.',20),
    ('training.category','compliance','Compliance','Regulatory or compliance training.',30),
    ('training.category','equipment','Equipment','Equipment-related training.',40),
    ('training.category','leadership','Leadership','Leadership and supervisory training.',50),

    ('training.delivery_method','classroom','Classroom','Instructor-led classroom training.',10),
    ('training.delivery_method','online','Online','Online or self-paced training.',20),
    ('training.delivery_method','hands_on','Hands-On','Practical hands-on training.',30),
    ('training.delivery_method','blended','Blended','Combination of delivery methods.',40),

    ('training.result','completed','Completed','Training completed successfully.',10),
    ('training.result','passed','Passed','Training or evaluation passed.',20),
    ('training.result','failed','Failed','Training or evaluation not passed.',30),
    ('training.result','incomplete','Incomplete','Training was not fully completed.',40)
) as v(lookup_key, option_key, label, description, sort_order)
join public.forge_lookup_definitions d on d.lookup_key=v.lookup_key
on conflict (lookup_id, option_key) do update
set label=excluded.label, description=excluded.description, sort_order=excluded.sort_order, is_active=true;

-- Creator-driven Training forms.
insert into public.forge_form_definitions
(form_key, feature_id, name, description, category, form_type, submit_label, cancel_label, tenant_edit_mode, tenant_can_add_fields, tenant_can_hide_fields, tenant_can_reorder_fields, tenant_can_change_required, tenant_can_change_input_type, tenant_can_change_lookup, sort_order)
select
  v.form_key,
  f.id,
  v.name,
  v.description,
  'Training',
  v.form_type,
  v.submit_label,
  'Cancel',
  'fields',
  false,
  true,
  true,
  true,
  false,
  true,
  v.sort_order
from (
  values
    ('training.course','Training Course','Create and configure a training course.','record','Save Course',400),
    ('training.assignment','Training Assignment','Assign a course to personnel.','record','Assign Training',410),
    ('training.completion','Training Completion','Record completed training for personnel.','record','Save Completion',420)
) as v(form_key, name, description, form_type, submit_label, sort_order)
join public.forge_feature_registry f on f.feature_key='training'
on conflict (form_key) do update
set name=excluded.name, description=excluded.description, feature_id=excluded.feature_id, updated_at=now();

insert into public.forge_form_fields
(form_id, field_key, label, help_text, placeholder, field_type, lookup_id, section_key, section_label, sort_order, width, is_required, can_hide, can_reorder, can_change_required, can_change_input_type, can_change_lookup)
select
  fd.id, v.field_key, v.label, v.help_text, v.placeholder, v.field_type, ld.id,
  v.section_key, v.section_label, v.sort_order, v.width, v.required,
  v.can_hide, true, v.can_required, false, v.can_lookup
from (
  values
    ('training.course','course_code','Course Code','Optional internal course identifier.','Enter course code','text',null,'course','Course Details',10,'half',false,true,true,false),
    ('training.course','title','Course Title','Name shown throughout Forge.','Enter course title','text',null,'course','Course Details',20,'half',true,false,false,false),
    ('training.course','description','Description','Describe the training content and purpose.','Enter course description','textarea',null,'course','Course Details',30,'full',false,true,true,false),
    ('training.course','category_key','Category','Training category.',null,'select','training.category','classification','Classification',40,'half',false,true,true,true),
    ('training.course','delivery_method','Delivery Method','How this course is delivered.',null,'select','training.delivery_method','classification','Classification',50,'half',false,true,true,true),
    ('training.course','duration_minutes','Duration (Minutes)','Expected course duration.','Enter minutes','number',null,'requirements','Requirements',60,'half',false,true,true,false),
    ('training.course','validity_months','Validity (Months)','How long completion remains current. Leave blank if it does not expire.','Enter months','number',null,'requirements','Requirements',70,'half',false,true,true,false),

    ('training.assignment','course_id','Course','Course to assign.',null,'select',null,'assignment','Assignment',10,'half',true,false,false,false),
    ('training.assignment','personnel_id','Personnel','Person receiving the assignment.',null,'person',null,'assignment','Assignment',20,'half',true,false,false,false),
    ('training.assignment','due_date','Due Date','Optional completion due date.',null,'date',null,'assignment','Assignment',30,'half',false,true,true,false),
    ('training.assignment','notes','Assignment Notes','Optional instructions for the assignee.','Enter notes','textarea',null,'assignment','Assignment',40,'full',false,true,true,false),

    ('training.completion','course_id','Course','Completed course.',null,'select',null,'completion','Completion',10,'half',true,false,false,false),
    ('training.completion','personnel_id','Personnel','Person who completed the training.',null,'person',null,'completion','Completion',20,'half',true,false,false,false),
    ('training.completion','completed_at','Completed Date & Time','When the training was completed.',null,'datetime',null,'completion','Completion',30,'half',true,false,false,false),
    ('training.completion','result','Result','Completion result.',null,'select','training.result','completion','Completion',40,'half',true,true,true,true),
    ('training.completion','hours','Training Hours','Credited training hours.','Enter hours','number',null,'credit','Credit & Verification',50,'half',false,true,true,false),
    ('training.completion','score','Score','Optional numeric score.','Enter score','number',null,'credit','Credit & Verification',60,'half',false,true,true,false),
    ('training.completion','instructor','Instructor','Instructor or training provider.','Enter instructor','text',null,'credit','Credit & Verification',70,'half',false,true,true,false),
    ('training.completion','certificate_number','Certificate Number','Optional certificate or credential number.','Enter certificate number','text',null,'credit','Credit & Verification',80,'half',false,true,true,false),
    ('training.completion','notes','Notes','Additional completion notes.','Enter notes','textarea',null,'credit','Credit & Verification',90,'full',false,true,true,false)
) as v(form_key, field_key, label, help_text, placeholder, field_type, lookup_key, section_key, section_label, sort_order, width, required, can_hide, can_required, can_lookup)
join public.forge_form_definitions fd on fd.form_key=v.form_key
left join public.forge_lookup_definitions ld on ld.lookup_key=v.lookup_key
on conflict (form_id, field_key) do update
set
  label=excluded.label,
  help_text=excluded.help_text,
  placeholder=excluded.placeholder,
  field_type=excluded.field_type,
  lookup_id=excluded.lookup_id,
  section_key=excluded.section_key,
  section_label=excluded.section_label,
  sort_order=excluded.sort_order,
  width=excluded.width,
  is_required=excluded.is_required,
  can_hide=excluded.can_hide,
  can_change_required=excluded.can_change_required,
  can_change_lookup=excluded.can_change_lookup,
  updated_at=now();

-- Training is now a live runtime module.
update public.forge_experience_elements
set settings=coalesce(settings,'{}'::jsonb) || '{"route_live":true,"required_permission":"training.view"}'::jsonb,
    updated_at=now()
where element_key='nav.training';

update public.forge_experience_elements
set settings=coalesce(settings,'{}'::jsonb) || '{"route_live":true,"required_permission":"training.view"}'::jsonb,
    updated_at=now()
where element_key='nav.my_training';

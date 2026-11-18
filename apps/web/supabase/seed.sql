-- Forge Industrial Safety 2.0 LOCAL DEVELOPMENT SEED
-- This file is for local development only. Do not use these credentials in production.
--
-- Local admin:
--   Email: admin@forge2.local
--   Password: ForgeDev2!

-- Core JetShip-compatible roles.
insert into public.roles (role, hierarchy)
values
  ('admin', 1),
  ('user', 3),
  ('editor', 2)
on conflict (role) do update
set hierarchy = excluded.hierarchy;

-- Core permissions required by the inherited administration screens.
insert into public.permissions (permission)
values
  ('create_reviews'),
  ('create_users'),
  ('create_permission'),
  ('create_roles'),
  ('create_faqs'),
  ('view_reviews'),
  ('view_settings'),
  ('view_users'),
  ('view_permission'),
  ('view_roles'),
  ('view_faqs'),
  ('update_reviews'),
  ('update_settings'),
  ('update_users'),
  ('update_permission'),
  ('update_roles'),
  ('update_faqs'),
  ('delete_reviews'),
  ('delete_users'),
  ('delete_permission'),
  ('delete_roles'),
  ('delete_faqs'),
  ('impersonate_users'),
  ('manage_blog_section')
on conflict (permission) do nothing;

-- Admin receives every inherited permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role = 'admin'
on conflict do nothing;

-- Editor keeps limited inherited content-management permissions.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.permission in ('create_reviews', 'view_reviews', 'update_reviews', 'delete_reviews')
where r.role = 'editor'
on conflict do nothing;

-- Keep auth profile synchronization local and deterministic.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update on auth.users
for each row
when (
  old.raw_user_meta_data->>'email' is distinct from new.raw_user_meta_data->>'email'
  or old.raw_user_meta_data->>'name' is distinct from new.raw_user_meta_data->>'name'
)
execute function public.handle_update_user();

-- Local-only owner account.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_sso_user,
  deleted_at,
  is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'admin@forge2.local',
  '$2a$10$8l.Yibl7sKa1KFSBlZgP/OrPNaF/7IYB8Xb0ZUfvV9pwkGZD6yDEW',
  now(),
  null,
  '',
  now(),
  '',
  null,
  '',
  '',
  null,
  null,
  '{"provider":"email","providers":["email"]}',
  '{"sub":"20000000-0000-4000-8000-000000000001","name":"Forge 2.0 Local Admin","email":"admin@forge2.local","email_verified":true,"phone_verified":false}',
  null,
  now(),
  now(),
  null,
  null,
  '',
  '',
  null,
  '',
  0,
  null,
  '',
  null,
  false,
  null,
  false
)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  id
)
values (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '{"sub":"20000000-0000-4000-8000-000000000001","name":"Forge 2.0 Local Admin","email":"admin@forge2.local","email_verified":true,"phone_verified":false}',
  'email',
  now(),
  now(),
  now(),
  '20000000-0000-4000-8000-000000000011'
)
on conflict (id) do nothing;

-- Force the local account to the inherited admin role.
delete from public.user_roles
where user_id = (
  select id from public.users
  where user_id = '20000000-0000-4000-8000-000000000001'
);

insert into public.user_roles (user_id, role_id)
select u.id, r.id
from public.users u
cross join public.roles r
where u.user_id = '20000000-0000-4000-8000-000000000001'
  and r.role = 'admin'
on conflict do nothing;

-- Minimal Forge 2.0 settings; no JetShip/ChatFlow demo reviews, FAQs, or social links.
insert into public.settings_configuration (key, value)
values (
  'general_settings',
  '{"tracking":{"google_tag_manager":"","providers":[]},"social_links":[],"pages_components":{"blog_enabled":false},"share_this_enabled":false}'
)
on conflict (key) do update
set value = excluded.value;

-- Forge Creator 2.0 local platform-owner access.
insert into public.forge_platform_users (user_id, platform_role, is_active)
values ('20000000-0000-4000-8000-000000000001', 'forge_owner', true)
on conflict (user_id) do update
set
  platform_role = excluded.platform_role,
  is_active = excluded.is_active,
  updated_at = now();

-- Local plans used to exercise Creator subscription behavior.
insert into public.forge_plans (
  id, plan_key, name, description, status, billing_interval, base_price_cents,
  currency, included_storage_gb, included_emails_monthly, included_sms_segments_monthly
)
values
  (
    '20000000-0000-4000-8000-000000000401',
    'internal-demo',
    'Internal Demo',
    'Local-development plan with all current Forge modules enabled.',
    'active',
    'annual',
    0,
    'USD',
    100,
    10000,
    5000
  ),
  (
    '20000000-0000-4000-8000-000000000402',
    'enterprise',
    'Enterprise',
    'Enterprise subscription template for full Forge Industrial Safety deployments.',
    'active',
    'annual',
    3000000,
    'USD',
    100,
    10000,
    5000
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  billing_interval = excluded.billing_interval,
  base_price_cents = excluded.base_price_cents,
  included_storage_gb = excluded.included_storage_gb,
  included_emails_monthly = excluded.included_emails_monthly,
  included_sms_segments_monthly = excluded.included_sms_segments_monthly,
  updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select '20000000-0000-4000-8000-000000000401', id, true
from public.forge_feature_registry
where requires_entitlement = true
on conflict (plan_id, feature_id) do update
set enabled = excluded.enabled;

-- Local-only tenant seed for the 2.0 codebase.
insert into public.organizations (
  id,
  name,
  slug,
  status,
  created_by
)
values (
  '20000000-0000-4000-8000-000000000100',
  'Forge Industrial Safety 2.0 Demo',
  'forge-industrial-safety-2-0-demo',
  'active',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  status = excluded.status,
  updated_at = now();

insert into public.divisions (
  id,
  organization_id,
  name,
  code
)
values (
  '20000000-0000-4000-8000-000000000200',
  '20000000-0000-4000-8000-000000000100',
  'Operations',
  'OPS'
)
on conflict (id) do update
set
  name = excluded.name,
  code = excluded.code,
  updated_at = now();

insert into public.locations (
  id,
  organization_id,
  division_id,
  name,
  code,
  city,
  state_region,
  country_code
)
values (
  '20000000-0000-4000-8000-000000000300',
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000200',
  'Demo Location',
  'DEMO',
  'DeWitt',
  'AR',
  'US'
)
on conflict (id) do update
set
  name = excluded.name,
  code = excluded.code,
  city = excluded.city,
  state_region = excluded.state_region,
  updated_at = now();

insert into public.forge_subscriptions (
  id, organization_id, plan_id, status, starts_at, usage_limits, overage_rules
)
values (
  '20000000-0000-4000-8000-000000000500',
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000401',
  'active',
  now(),
  '{"storage_gb":100,"emails_monthly":10000,"sms_segments_monthly":5000}'::jsonb,
  '{"storage_per_gb_usd":0.25,"email_markup_percent":15,"sms_markup_percent":15}'::jsonb
)
on conflict (id) do update
set
  plan_id = excluded.plan_id,
  status = excluded.status,
  usage_limits = excluded.usage_limits,
  overage_rules = excluded.overage_rules,
  updated_at = now();


-- Local tenant user for permission and effective-access testing.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_sso_user,
  deleted_at,
  is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  '20000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'user@forge2.local',
  '$2a$10$8l.Yibl7sKa1KFSBlZgP/OrPNaF/7IYB8Xb0ZUfvV9pwkGZD6yDEW',
  now(),
  null,
  '',
  now(),
  '',
  null,
  '',
  '',
  null,
  null,
  '{"provider":"email","providers":["email"]}',
  '{"sub":"20000000-0000-4000-8000-000000000002","name":"Forge 2.0 Demo User","email":"user@forge2.local","email_verified":true,"phone_verified":false}',
  null,
  now(),
  now(),
  null,
  null,
  '',
  '',
  null,
  '',
  0,
  null,
  '',
  null,
  false,
  null,
  false
)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  id
)
values (
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  '{"sub":"20000000-0000-4000-8000-000000000002","name":"Forge 2.0 Demo User","email":"user@forge2.local","email_verified":true,"phone_verified":false}',
  'email',
  now(),
  now(),
  now(),
  '20000000-0000-4000-8000-000000000012'
)
on conflict (id) do nothing;

insert into public.organization_memberships (
  organization_id,
  user_id,
  role,
  is_active
)
values (
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000002',
  'member',
  true
)
on conflict (organization_id, user_id) do update
set is_active = true, role = excluded.role, updated_at = now();

insert into public.forge_tenant_roles (
  organization_id,
  role_key,
  name,
  description,
  is_system_role,
  is_active,
  sort_order
)
values
  ('20000000-0000-4000-8000-000000000100','company-owner','Company Owner','Full tenant ownership and company administration.',true,true,10),
  ('20000000-0000-4000-8000-000000000100','company-administrator','Company Administrator','Company-wide administration within Forge Creator policy.',true,true,20),
  ('20000000-0000-4000-8000-000000000100','location-administrator','Location Administrator','Administration limited to assigned Locations.',true,true,30),
  ('20000000-0000-4000-8000-000000000100','supervisor','Supervisor','Operational supervisor with assigned personnel scope.',true,true,40),
  ('20000000-0000-4000-8000-000000000100','employee','Employee','Standard employee access.',true,true,50),
  ('20000000-0000-4000-8000-000000000100','read-only','Read Only','Read-only access to explicitly permitted modules.',true,true,60)
on conflict (organization_id, role_key) do update
set name = excluded.name, description = excluded.description, is_active = true, updated_at = now();

-- Apply reusable permission templates after seeded tenant roles exist.
with role_template_map(role_key, template_key) as (
  values
    ('company-owner','company-admin'),
    ('company-administrator','company-admin'),
    ('location-administrator','supervisor'),
    ('supervisor','supervisor'),
    ('employee','standard-user'),
    ('read-only','read-only')
)
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope, constraints)
select
  r.id,
  tp.permission_id,
  tp.allowed,
  coalesce(tp.scope, 'organization'),
  coalesce(tp.constraints, '{}'::jsonb)
from public.forge_tenant_roles r
join role_template_map m on m.role_key = r.role_key
join public.forge_role_templates rt on rt.template_key = m.template_key
join public.forge_role_template_permissions tp on tp.template_id = rt.id
where r.organization_id = '20000000-0000-4000-8000-000000000100'
  and tp.allowed = true
on conflict (role_id, permission_id) do update
set
  allowed = excluded.allowed,
  scope = excluded.scope,
  constraints = excluded.constraints;

insert into public.forge_tenant_user_roles (organization_id, user_id, role_id)
select
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000002',
  r.id
from public.forge_tenant_roles r
where r.organization_id = '20000000-0000-4000-8000-000000000100'
  and r.role_key = 'employee'
on conflict do nothing;


-- Local Forge Admin is also the Company Owner of the demo tenant so Creator and tenant runtime can be tested from one account.
insert into public.organization_memberships (
  organization_id,
  user_id,
  role,
  is_active
)
values (
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000001',
  'owner',
  true
)
on conflict (organization_id, user_id) do update
set is_active=true, role='owner', updated_at=now();

insert into public.forge_tenant_user_roles (organization_id, user_id, role_id)
select
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000001',
  r.id
from public.forge_tenant_roles r
where r.organization_id='20000000-0000-4000-8000-000000000100'
  and r.role_key='company-owner'
on conflict do nothing;

insert into public.forge_tenant_user_location_access (organization_id, user_id, location_id)
values (
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000300'
)
on conflict do nothing;

insert into public.forge_tenant_user_location_access (organization_id, user_id, location_id)
values (
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000300'
)
on conflict do nothing;


-- Local Personnel record used to prove Creator -> Form -> Lookup -> Permission -> Runtime behavior.
insert into public.forge_personnel (
  id,
  organization_id,
  auth_user_id,
  first_name,
  last_name,
  employee_number,
  employment_status,
  job_title,
  email,
  phone,
  hire_date,
  location_id,
  division_id,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000000600',
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000002',
  'Forge',
  'Demo User',
  'EMP-0001',
  'active',
  'Demo Employee',
  'user@forge2.local',
  null,
  current_date,
  '20000000-0000-4000-8000-000000000300',
  '20000000-0000-4000-8000-000000000200',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002'
)
on conflict (id) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  employee_number = excluded.employee_number,
  employment_status = excluded.employment_status,
  job_title = excluded.job_title,
  email = excluded.email,
  location_id = excluded.location_id,
  division_id = excluded.division_id,
  updated_at = now();


-- Local Training data for end-to-end Training and My Training testing.
insert into public.forge_training_courses (
  id,
  organization_id,
  course_code,
  title,
  description,
  category_key,
  delivery_method,
  duration_minutes,
  validity_months,
  is_active,
  created_by,
  updated_by
)
values
  (
    '20000000-0000-4000-8000-000000000701',
    '20000000-0000-4000-8000-000000000100',
    'SAFE-101',
    'Safety Orientation',
    'Local demo course used to validate assignment and My Training workflows.',
    'safety',
    'classroom',
    60,
    12,
    true,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000702',
    '20000000-0000-4000-8000-000000000100',
    'COMP-201',
    'Annual Compliance Refresher',
    'Local demo completion used to validate transcript and approval display.',
    'compliance',
    'online',
    45,
    12,
    true,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  )
on conflict (id) do update
set
  course_code=excluded.course_code,
  title=excluded.title,
  description=excluded.description,
  category_key=excluded.category_key,
  delivery_method=excluded.delivery_method,
  duration_minutes=excluded.duration_minutes,
  validity_months=excluded.validity_months,
  is_active=true,
  updated_at=now();

insert into public.forge_training_assignments (
  id,
  organization_id,
  course_id,
  personnel_id,
  status,
  assigned_at,
  due_date,
  assigned_by,
  notes
)
values (
  '20000000-0000-4000-8000-000000000711',
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000701',
  '20000000-0000-4000-8000-000000000600',
  'assigned',
  now(),
  current_date + 30,
  '20000000-0000-4000-8000-000000000001',
  'Demo assignment for My Training.'
)
on conflict (id) do update
set
  status='assigned',
  due_date=current_date + 30,
  notes=excluded.notes,
  updated_at=now();

insert into public.forge_training_completions (
  id,
  organization_id,
  course_id,
  personnel_id,
  completed_at,
  hours,
  score,
  instructor,
  result,
  approval_status,
  approved_by,
  approved_at,
  certificate_number,
  expires_at,
  notes,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000000721',
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000702',
  '20000000-0000-4000-8000-000000000600',
  now() - interval '14 days',
  0.75,
  100,
  'Forge Demo Instructor',
  'passed',
  'approved',
  '20000000-0000-4000-8000-000000000001',
  now() - interval '14 days',
  'DEMO-CERT-0001',
  current_date + 351,
  'Demo approved completion.',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  hours=excluded.hours,
  score=excluded.score,
  instructor=excluded.instructor,
  result=excluded.result,
  approval_status=excluded.approval_status,
  certificate_number=excluded.certificate_number,
  expires_at=excluded.expires_at,
  updated_at=now();


-- Local Incident data for end-to-end Incident workflow testing.
insert into public.forge_incidents (
  id,
  organization_id,
  incident_number,
  status,
  incident_type,
  severity,
  occurred_at,
  reported_at,
  location_id,
  division_id,
  reported_by_user_id,
  reported_by_personnel_id,
  summary,
  description,
  immediate_actions,
  involves_injury,
  involves_vehicle,
  property_damage,
  submitted_at,
  submitted_by,
  approved_at,
  approved_by,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000000801',
  '20000000-0000-4000-8000-000000000100',
  'DEMO-INC-000001',
  'approved',
  'near_miss',
  'moderate',
  now() - interval '7 days',
  now() - interval '7 days',
  '20000000-0000-4000-8000-000000000300',
  '20000000-0000-4000-8000-000000000200',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000600',
  'Forklift near miss at the Demo Location',
  'A forklift and pedestrian entered the same travel path. No contact or injury occurred.',
  'Work was paused and the travel path was reviewed before operations resumed.',
  false,
  true,
  false,
  now() - interval '6 days',
  '20000000-0000-4000-8000-000000000002',
  now() - interval '5 days',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  status=excluded.status,
  incident_type=excluded.incident_type,
  severity=excluded.severity,
  summary=excluded.summary,
  description=excluded.description,
  immediate_actions=excluded.immediate_actions,
  updated_at=now();

insert into public.forge_incident_people (
  organization_id,
  incident_id,
  personnel_id,
  role,
  notes,
  created_by
)
select
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000801',
  '20000000-0000-4000-8000-000000000600',
  'reporter',
  'Demo reporter relationship.',
  '20000000-0000-4000-8000-000000000001'
where not exists (
  select 1
  from public.forge_incident_people
  where incident_id='20000000-0000-4000-8000-000000000801'
    and personnel_id='20000000-0000-4000-8000-000000000600'
    and role='reporter'
);

insert into public.forge_incident_activity (
  organization_id,
  incident_id,
  activity_type,
  message,
  actor_user_id,
  created_at
)
select *
from (
  values
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000000801'::uuid,
      'created'::text,
      'Demo incident created.'::text,
      '20000000-0000-4000-8000-000000000002'::uuid,
      now() - interval '7 days'
    ),
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000000801'::uuid,
      'submitted'::text,
      'Demo incident submitted for review.'::text,
      '20000000-0000-4000-8000-000000000002'::uuid,
      now() - interval '6 days'
    ),
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000000801'::uuid,
      'approved'::text,
      'Demo incident approved.'::text,
      '20000000-0000-4000-8000-000000000001'::uuid,
      now() - interval '5 days'
    )
) as v(organization_id, incident_id, activity_type, message, actor_user_id, created_at)
where not exists (
  select 1
  from public.forge_incident_activity a
  where a.incident_id='20000000-0000-4000-8000-000000000801'
);


-- Local Inspection template and record for end-to-end Inspections testing.
insert into public.forge_inspection_templates (
  id,
  organization_id,
  template_key,
  name,
  description,
  inspection_type,
  version,
  is_active,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000000901',
  '20000000-0000-4000-8000-000000000100',
  'general_safety_demo',
  'General Safety Inspection',
  'Demo checklist used to validate inspection templates, findings, corrective actions and workflow.',
  'general',
  1,
  true,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  name=excluded.name,
  description=excluded.description,
  inspection_type=excluded.inspection_type,
  is_active=true,
  updated_at=now();

insert into public.forge_inspection_template_items (
  id,
  organization_id,
  template_id,
  item_key,
  section_key,
  section_label,
  prompt,
  guidance,
  response_type,
  sort_order,
  is_required,
  finding_on
)
values
  (
    '20000000-0000-4000-8000-000000000911',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000000901',
    'exits_clear',
    'life_safety',
    'Life Safety',
    'Emergency exits and exit access are clear and unobstructed.',
    'Verify travel paths, exit doors, and marked exit access are not blocked.',
    'pass_fail_na',
    10,
    true,
    array['fail']::text[]
  ),
  (
    '20000000-0000-4000-8000-000000000912',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000000901',
    'extinguishers_accessible',
    'life_safety',
    'Life Safety',
    'Portable fire extinguishers are accessible and appear ready for use.',
    'Check access, obvious damage, and inspection status.',
    'pass_fail_na',
    20,
    true,
    array['fail']::text[]
  ),
  (
    '20000000-0000-4000-8000-000000000913',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000000901',
    'walkways_clear',
    'housekeeping',
    'Housekeeping',
    'Walking and working surfaces are clear of obvious trip hazards.',
    'Check aisles, cords, stored materials, spills, and temporary obstructions.',
    'pass_fail_na',
    30,
    true,
    array['fail']::text[]
  ),
  (
    '20000000-0000-4000-8000-000000000914',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000000901',
    'ppe_available',
    'operations',
    'Operations',
    'Required PPE is available for the work being performed.',
    'Verify required PPE is present, accessible, and serviceable.',
    'yes_no_na',
    40,
    true,
    array['no']::text[]
  )
on conflict (id) do update
set
  prompt=excluded.prompt,
  guidance=excluded.guidance,
  response_type=excluded.response_type,
  sort_order=excluded.sort_order,
  is_required=excluded.is_required,
  finding_on=excluded.finding_on,
  updated_at=now();

insert into public.forge_inspections (
  id,
  organization_id,
  inspection_number,
  template_id,
  template_name_snapshot,
  template_version_snapshot,
  status,
  inspection_date,
  location_id,
  division_id,
  inspector_user_id,
  inspector_personnel_id,
  result,
  notes,
  started_at,
  completed_at,
  submitted_at,
  submitted_by,
  approved_at,
  approved_by,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000000950',
  '20000000-0000-4000-8000-000000000100',
  'DEMO-INSP-000001',
  '20000000-0000-4000-8000-000000000901',
  'General Safety Inspection',
  1,
  'approved',
  current_date - 3,
  '20000000-0000-4000-8000-000000000300',
  '20000000-0000-4000-8000-000000000200',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000600',
  'needs_attention',
  'Demo inspection with one open corrective-action finding.',
  now() - interval '3 days',
  now() - interval '3 days',
  now() - interval '2 days',
  '20000000-0000-4000-8000-000000000002',
  now() - interval '1 day',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  status=excluded.status,
  result=excluded.result,
  notes=excluded.notes,
  updated_at=now();

insert into public.forge_inspection_items (
  id,
  organization_id,
  inspection_id,
  template_item_id,
  item_key,
  section_key,
  section_label,
  prompt,
  guidance,
  response_type,
  sort_order,
  is_required,
  finding_on,
  response_value,
  notes,
  responded_by,
  responded_at
)
values
  (
    '20000000-0000-4000-8000-000000000951',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000000950',
    '20000000-0000-4000-8000-000000000911',
    'exits_clear',
    'life_safety',
    'Life Safety',
    'Emergency exits and exit access are clear and unobstructed.',
    'Verify travel paths, exit doors, and marked exit access are not blocked.',
    'pass_fail_na',
    10,
    true,
    array['fail']::text[],
    'pass',
    null,
    '20000000-0000-4000-8000-000000000002',
    now() - interval '3 days'
  ),
  (
    '20000000-0000-4000-8000-000000000952',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000000950',
    '20000000-0000-4000-8000-000000000912',
    'extinguishers_accessible',
    'life_safety',
    'Life Safety',
    'Portable fire extinguishers are accessible and appear ready for use.',
    'Check access, obvious damage, and inspection status.',
    'pass_fail_na',
    20,
    true,
    array['fail']::text[],
    'pass',
    null,
    '20000000-0000-4000-8000-000000000002',
    now() - interval '3 days'
  ),
  (
    '20000000-0000-4000-8000-000000000953',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000000950',
    '20000000-0000-4000-8000-000000000913',
    'walkways_clear',
    'housekeeping',
    'Housekeeping',
    'Walking and working surfaces are clear of obvious trip hazards.',
    'Check aisles, cords, stored materials, spills, and temporary obstructions.',
    'pass_fail_na',
    30,
    true,
    array['fail']::text[],
    'fail',
    'Stored material narrowed an aisle near the demo work area.',
    '20000000-0000-4000-8000-000000000002',
    now() - interval '3 days'
  ),
  (
    '20000000-0000-4000-8000-000000000954',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000000950',
    '20000000-0000-4000-8000-000000000914',
    'ppe_available',
    'operations',
    'Operations',
    'Required PPE is available for the work being performed.',
    'Verify required PPE is present, accessible, and serviceable.',
    'yes_no_na',
    40,
    true,
    array['no']::text[],
    'yes',
    null,
    '20000000-0000-4000-8000-000000000002',
    now() - interval '3 days'
  )
on conflict (id) do update
set
  response_value=excluded.response_value,
  notes=excluded.notes,
  responded_at=excluded.responded_at;

insert into public.forge_inspection_findings (
  id,
  organization_id,
  inspection_id,
  inspection_item_id,
  title,
  description,
  severity,
  status,
  due_date,
  corrective_action,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000000960',
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000000950',
  '20000000-0000-4000-8000-000000000953',
  'Clear stored material from aisle',
  'Stored material narrowed a walking path and should be relocated.',
  'moderate',
  'in_progress',
  current_date + 7,
  'Relocate the material and restore the full aisle width.',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002'
)
on conflict (id) do update
set
  severity=excluded.severity,
  status=excluded.status,
  due_date=excluded.due_date,
  corrective_action=excluded.corrective_action,
  updated_at=now();

insert into public.forge_inspection_activity (
  organization_id,
  inspection_id,
  activity_type,
  message,
  actor_user_id,
  created_at
)
select *
from (
  values
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000000950'::uuid,
      'created'::text,
      'Demo inspection created from General Safety Inspection.'::text,
      '20000000-0000-4000-8000-000000000002'::uuid,
      now() - interval '3 days'
    ),
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000000950'::uuid,
      'finding_created'::text,
      'Finding created: Clear stored material from aisle.'::text,
      '20000000-0000-4000-8000-000000000002'::uuid,
      now() - interval '3 days'
    ),
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000000950'::uuid,
      'approved'::text,
      'Demo inspection approved with corrective action still open.'::text,
      '20000000-0000-4000-8000-000000000001'::uuid,
      now() - interval '1 day'
    )
) as v(organization_id, inspection_id, activity_type, message, actor_user_id, created_at)
where not exists (
  select 1
  from public.forge_inspection_activity a
  where a.inspection_id='20000000-0000-4000-8000-000000000950'
);


-- Local Assets & Equipment data for runtime, maintenance, meter and future QR/LOTO testing.
insert into public.forge_assets (
  id,
  organization_id,
  asset_number,
  asset_type,
  name,
  description,
  status,
  condition,
  criticality,
  manufacturer,
  model,
  serial_number,
  barcode,
  location_id,
  division_id,
  custodian_personnel_id,
  custodian_user_id,
  purchase_date,
  in_service_date,
  warranty_expires_on,
  purchase_cost,
  replacement_cost,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000001001',
  '20000000-0000-4000-8000-000000000100',
  'DEMO-AST-000001',
  'equipment',
  'Demo Forklift',
  'Demo powered industrial equipment record used to validate Forge asset history and future QR/LOTO integration.',
  'active',
  'good',
  'critical',
  'Forge Demo Manufacturing',
  'FD-5000',
  'DEMO-SN-5000',
  'DEMO-ASSET-0001',
  '20000000-0000-4000-8000-000000000300',
  '20000000-0000-4000-8000-000000000200',
  '20000000-0000-4000-8000-000000000600',
  '20000000-0000-4000-8000-000000000002',
  current_date - 720,
  current_date - 700,
  current_date + 10,
  28500.00,
  34000.00,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  name=excluded.name,
  description=excluded.description,
  status=excluded.status,
  condition=excluded.condition,
  criticality=excluded.criticality,
  location_id=excluded.location_id,
  division_id=excluded.division_id,
  custodian_personnel_id=excluded.custodian_personnel_id,
  custodian_user_id=excluded.custodian_user_id,
  updated_at=now();

insert into public.forge_asset_assignments (
  id,
  organization_id,
  asset_id,
  personnel_id,
  user_id,
  location_id,
  division_id,
  assignment_type,
  assigned_at,
  notes,
  assigned_by
)
values (
  '20000000-0000-4000-8000-000000001011',
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000001001',
  '20000000-0000-4000-8000-000000000600',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000300',
  '20000000-0000-4000-8000-000000000200',
  'custody',
  now() - interval '180 days',
  'Demo current custody assignment.',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  personnel_id=excluded.personnel_id,
  user_id=excluded.user_id,
  location_id=excluded.location_id,
  division_id=excluded.division_id,
  returned_at=null,
  returned_by=null;

insert into public.forge_asset_maintenance (
  id,
  organization_id,
  asset_id,
  maintenance_type,
  status,
  performed_on,
  vendor,
  technician,
  work_order_number,
  description,
  findings,
  corrective_action,
  labor_cost,
  parts_cost,
  total_cost,
  next_due_date,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000001021',
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000001001',
  'preventive',
  'completed',
  current_date - 30,
  'Demo Equipment Service',
  'Demo Technician',
  'WO-DEMO-1001',
  'Preventive service and operational inspection.',
  'Normal wear noted. No safety-critical defects identified.',
  'Routine service completed and unit returned to operation.',
  185.00,
  96.25,
  281.25,
  current_date + 60,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  status=excluded.status,
  performed_on=excluded.performed_on,
  description=excluded.description,
  total_cost=excluded.total_cost,
  next_due_date=excluded.next_due_date,
  updated_at=now();

insert into public.forge_asset_meter_readings (
  id,
  organization_id,
  asset_id,
  meter_type,
  reading,
  unit,
  recorded_at,
  notes,
  recorded_by
)
values
  (
    '20000000-0000-4000-8000-000000001031',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001001',
    'hours',
    1238.4,
    'hours',
    now() - interval '30 days',
    'Reading captured during preventive service.',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001032',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001001',
    'hours',
    1291.7,
    'hours',
    now() - interval '2 days',
    'Current demo reading.',
    '20000000-0000-4000-8000-000000000002'
  )
on conflict (id) do update
set
  reading=excluded.reading,
  recorded_at=excluded.recorded_at,
  notes=excluded.notes;

insert into public.forge_asset_activity (
  organization_id,
  asset_id,
  activity_type,
  message,
  actor_user_id,
  created_at
)
select *
from (
  values
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000001001'::uuid,
      'created'::text,
      'Demo asset created.'::text,
      '20000000-0000-4000-8000-000000000001'::uuid,
      now() - interval '700 days'
    ),
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000001001'::uuid,
      'maintenance_recorded'::text,
      'Preventive service and operational inspection recorded.'::text,
      '20000000-0000-4000-8000-000000000001'::uuid,
      now() - interval '30 days'
    ),
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000001001'::uuid,
      'meter_reading'::text,
      'Operating-hours reading updated.'::text,
      '20000000-0000-4000-8000-000000000002'::uuid,
      now() - interval '2 days'
    )
) as v(organization_id, asset_id, activity_type, message, actor_user_id, created_at)
where not exists (
  select 1
  from public.forge_asset_activity a
  where a.asset_id='20000000-0000-4000-8000-000000001001'
);


-- Local managed QR code linked to the Demo Forklift.
insert into public.forge_qr_codes (
  id,
  organization_id,
  qr_number,
  token,
  name,
  description,
  status,
  target_type,
  target_id,
  default_action,
  scan_count,
  last_scanned_at,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000001101',
  '20000000-0000-4000-8000-000000000100',
  'DEMO-QR-000001',
  '111111111111111111111111111111111111111111111111',
  'Demo Forklift QR',
  'Managed QR used to validate asset access, scan history, maintenance routing, and future LOTO workflows.',
  'active',
  'asset',
  '20000000-0000-4000-8000-000000001001',
  'asset_record',
  2,
  now() - interval '1 day',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  name=excluded.name,
  description=excluded.description,
  status='active',
  target_type=excluded.target_type,
  target_id=excluded.target_id,
  default_action=excluded.default_action,
  scan_count=excluded.scan_count,
  last_scanned_at=excluded.last_scanned_at,
  updated_at=now();

insert into public.forge_qr_scans (
  organization_id,
  qr_code_id,
  auth_user_id,
  destination_path,
  user_agent,
  referrer,
  scanned_at
)
select *
from (
  values
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000001101'::uuid,
      '20000000-0000-4000-8000-000000000002'::uuid,
      '/assets/20000000-0000-4000-8000-000000001001'::text,
      'Forge Demo Scanner / Authenticated'::text,
      null::text,
      now() - interval '2 days'
    ),
    (
      '20000000-0000-4000-8000-000000000100'::uuid,
      '20000000-0000-4000-8000-000000001101'::uuid,
      null::uuid,
      '/assets/20000000-0000-4000-8000-000000001001'::text,
      'Forge Demo Scanner / Not Signed In'::text,
      null::text,
      now() - interval '1 day'
    )
) as v(organization_id, qr_code_id, auth_user_id, destination_path, user_agent, referrer, scanned_at)
where not exists (
  select 1
  from public.forge_qr_scans s
  where s.qr_code_id='20000000-0000-4000-8000-000000001101'
);


-- Local Forge AI Assistant enablement for the demo tenant.
insert into public.forge_tenant_entitlement_overrides (
  organization_id,
  feature_id,
  enabled,
  tenant_can_configure,
  config,
  reason
)
select
  '20000000-0000-4000-8000-000000000100',
  f.id,
  true,
  true,
  '{"local_demo":true}'::jsonb,
  'Local Forge AI development and validation'
from public.forge_feature_registry f
where f.feature_key='forge_ai'
on conflict (organization_id, feature_id) do update
set enabled=true,
    tenant_can_configure=true,
    config=excluded.config,
    reason=excluded.reason;

insert into public.forge_ai_tenant_settings (
  organization_id,
  enabled,
  assistant_name,
  provider,
  model,
  reasoning_effort,
  response_style,
  allow_sensitive_data,
  action_mode,
  tenant_can_configure,
  monthly_token_budget,
  max_input_chars,
  max_output_tokens,
  max_tool_calls,
  requests_per_minute,
  data_retention_days
)
values (
  '20000000-0000-4000-8000-000000000100',
  true,
  'Forge AI',
  'openai',
  'gpt-6-sol',
  'medium',
  'professional',
  false,
  'approval_required',
  true,
  2000000,
  12000,
  3000,
  8,
  12,
  365
)
on conflict (organization_id) do update
set enabled=true,
    assistant_name=excluded.assistant_name,
    model=excluded.model,
    reasoning_effort=excluded.reasoning_effort,
    response_style=excluded.response_style,
    tenant_can_configure=true,
    updated_at=now();


-- Local Forge AI approved-action enablement for the demo tenant.
insert into public.forge_ai_tenant_actions
(organization_id, action_id, enabled, tenant_can_configure, settings)
select
  '20000000-0000-4000-8000-000000000100',
  a.id,
  true,
  false,
  '{"local_demo":true}'::jsonb
from public.forge_ai_action_registry a
where a.action_key in ('inspection.create_finding','asset.add_maintenance')
on conflict (organization_id, action_id) do update
set enabled=true,
    tenant_can_configure=false,
    settings=excluded.settings,
    updated_at=now();

-- Local Forge AI Watch rules for the demo tenant.
insert into public.forge_ai_watch_rules
(organization_id, template_id, enabled, config, notification_mode)
select
  '20000000-0000-4000-8000-000000000100',
  t.id,
  true,
  t.default_config,
  'in_app'
from public.forge_ai_watch_rule_templates t
where t.platform_enabled=true
on conflict (organization_id, template_id) do update
set enabled=true,
    config=excluded.config,
    notification_mode=excluded.notification_mode,
    updated_at=now();


-- Local approved Lockout / Tagout procedure for the Demo Forklift.
insert into public.forge_loto_procedures (
  id,
  organization_id,
  procedure_number,
  asset_id,
  title,
  description,
  purpose,
  scope_text,
  status,
  revision_number,
  effective_date,
  next_review_date,
  required_ppe,
  special_precautions,
  authorized_employee_notes,
  affected_employee_notes,
  shutdown_notes,
  restoration_notes,
  approved_at,
  approved_by,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000001201',
  '20000000-0000-4000-8000-000000000100',
  'DEMO-LOTO-000001',
  '20000000-0000-4000-8000-000000001001',
  'Demo Forklift Hazardous Energy Control',
  'Demo equipment-specific Lockout / Tagout procedure used to validate Forge LOTO workflow, asset linkage, periodic review, field-use logging, and AI context.',
  'Control hazardous electrical, hydraulic, gravity, and stored energy before authorized servicing or maintenance.',
  'Applies to the Demo Forklift when servicing exposes an employee to unexpected energization, startup, movement, pressure, or stored energy.',
  'approved',
  1,
  current_date - 60,
  current_date + 305,
  'Safety glasses, work gloves, safety footwear, and task-specific PPE identified by the employer.',
  'Use only the employer-approved energy-isolating devices and personally assigned locks/tags. Follow site-specific requirements before work begins.',
  'Authorized employees must identify every applicable energy source, perform shutdown and isolation in the specified sequence, control stored energy, and verify isolation before work.',
  'Notify affected employees before shutdown and after the equipment is restored to service.',
  'Park on a stable surface, lower attachments, place controls in neutral, set parking brake, and perform the normal shutdown sequence before isolation.',
  'Inspect the work area, reinstall guards, account for personnel/tools, remove devices only as authorized, restore energy in a controlled sequence, and notify affected employees.',
  now() - interval '60 days',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  title=excluded.title,
  description=excluded.description,
  purpose=excluded.purpose,
  scope_text=excluded.scope_text,
  status='approved',
  revision_number=1,
  effective_date=excluded.effective_date,
  next_review_date=excluded.next_review_date,
  required_ppe=excluded.required_ppe,
  special_precautions=excluded.special_precautions,
  updated_at=now();

insert into public.forge_loto_energy_sources (
  id,
  organization_id,
  procedure_id,
  energy_type,
  source_name,
  magnitude,
  isolation_location,
  isolation_device,
  lockout_device,
  stored_energy_method,
  verification_method,
  notes,
  sort_order,
  created_by,
  updated_by
)
values
  (
    '20000000-0000-4000-8000-000000001211',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'electrical',
    'Battery Electrical Supply',
    'Demo battery system',
    'Battery compartment / approved battery disconnect point',
    'Battery disconnect / connector',
    'Employer-approved electrical lockout device',
    'Discharge or otherwise control retained electrical energy according to manufacturer and employer procedure.',
    'Attempt normal start only after isolation and confirm no electrical response using the employer-approved verification method.',
    'Demo source for software validation; employer-specific procedure must define actual equipment details.',
    10,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001212',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'hydraulic',
    'Hydraulic System',
    'Pressurized hydraulic system',
    'Hydraulic controls and energy-isolation points identified by the employer',
    'Approved hydraulic isolation / blocking method',
    'Employer-approved lockout / blocking devices',
    'Lower attachments, relieve residual pressure, block or restrain components where required, and verify no hazardous stored pressure remains.',
    'Cycle controls only as allowed by the employer procedure and verify pressure / movement is controlled before servicing.',
    'Demo source for workflow validation.',
    20,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001213',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'gravity',
    'Elevated / Movable Components',
    null,
    'Forks, mast, attachments, and other movable components',
    'Mechanical blocking / restraint as required',
    'Approved blocking or restraint device',
    'Lower components to a safe position and block or restrain any component that cannot be fully lowered.',
    'Visually and physically verify components cannot move into the work area before servicing.',
    'Demo source for workflow validation.',
    30,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  )
on conflict (id) do update
set
  source_name=excluded.source_name,
  magnitude=excluded.magnitude,
  isolation_location=excluded.isolation_location,
  isolation_device=excluded.isolation_device,
  stored_energy_method=excluded.stored_energy_method,
  verification_method=excluded.verification_method,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_loto_steps (
  id,
  organization_id,
  procedure_id,
  step_type,
  title,
  instructions,
  warning_text,
  verification_required,
  verification_instructions,
  sort_order,
  created_by,
  updated_by
)
values
  (
    '20000000-0000-4000-8000-000000001221',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'notify',
    'Notify affected employees',
    'Notify affected employees that the forklift will be removed from service and Lockout / Tagout will be applied.',
    null,
    false,
    null,
    10,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001222',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'shutdown',
    'Perform normal shutdown',
    'Park in the approved service location, lower forks/attachments, place controls in neutral, set the parking brake, and complete the normal equipment shutdown.',
    'Do not begin servicing while the equipment remains capable of unexpected movement or startup.',
    false,
    null,
    20,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001223',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'isolate',
    'Isolate hazardous energy',
    'Operate every applicable energy-isolating device identified in the Energy Sources section.',
    null,
    false,
    null,
    30,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001224',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'lock_tag',
    'Apply lockout / tagout devices',
    'Each authorized employee applies the required employer-approved personal lock and tag to the applicable energy-isolating device or approved group-lockout system.',
    'Locks and tags may only be removed according to the employer-approved removal process.',
    false,
    null,
    40,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001225',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'release_stored',
    'Control stored energy',
    'Relieve hydraulic pressure and lower, block, restrain, discharge, or otherwise control each stored-energy source identified in this procedure.',
    null,
    true,
    'Confirm stored pressure, gravity, and other residual energy cannot create hazardous movement or release.',
    50,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001226',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'verify',
    'Verify effective isolation',
    'Verify the equipment cannot start or move and that hazardous energy has been effectively isolated using the verification method specified for each energy source.',
    'Return controls to the safe/off position after any permitted start attempt.',
    true,
    'Confirm every energy source has been isolated and the zero-energy / safe-energy state has been verified before servicing begins.',
    60,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001227',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'service',
    'Perform authorized work',
    'Perform only the servicing or maintenance work covered by the approved work scope while Lockout / Tagout remains in effect.',
    null,
    false,
    null,
    70,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001228',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'restore',
    'Restore equipment to service',
    'Inspect the work area, reinstall guards, clear employees/tools, remove locks/tags only as authorized, remove blocking/restraints as appropriate, and restore energy in the approved sequence.',
    'Confirm all employees are safely positioned before re-energization.',
    true,
    'Verify guarding is restored, personnel are clear, energy-control devices are removed according to policy, and equipment is ready for controlled startup.',
    80,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000001229',
    '20000000-0000-4000-8000-000000000100',
    '20000000-0000-4000-8000-000000001201',
    'notify_restore',
    'Notify affected employees after restoration',
    'Notify affected employees that Lockout / Tagout has been removed and the equipment has been returned to service.',
    null,
    false,
    null,
    90,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  )
on conflict (id) do update
set
  step_type=excluded.step_type,
  title=excluded.title,
  instructions=excluded.instructions,
  warning_text=excluded.warning_text,
  verification_required=excluded.verification_required,
  verification_instructions=excluded.verification_instructions,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_loto_reviews (
  id,
  organization_id,
  procedure_id,
  reviewed_at,
  reviewed_by,
  review_result,
  employee_observed,
  deviations_found,
  corrective_actions,
  notes,
  next_review_date
)
values (
  '20000000-0000-4000-8000-000000001231',
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000001201',
  now() - interval '60 days',
  '20000000-0000-4000-8000-000000000001',
  'satisfactory',
  'Demo Authorized Employee',
  null,
  null,
  'Demo periodic-review record for local workflow validation.',
  current_date + 305
)
on conflict (id) do update
set
  review_result=excluded.review_result,
  notes=excluded.notes,
  next_review_date=excluded.next_review_date;


-- Local demo Task / corrective action.
insert into public.forge_tasks (
  id,
  organization_id,
  task_number,
  title,
  description,
  status,
  priority,
  assigned_personnel_id,
  assigned_user_id,
  location_id,
  division_id,
  start_at,
  due_at,
  source_type,
  source_id,
  source_reference,
  corrective_action,
  verification_required,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000001301',
  '20000000-0000-4000-8000-000000000100',
  'DEMO-TASK-000001',
  'Verify Demo Forklift corrective action',
  'Review the demo equipment record and document closure of the example corrective action.',
  'in_progress',
  'high',
  '20000000-0000-4000-8000-000000000600',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000300',
  '20000000-0000-4000-8000-000000000200',
  now() - interval '7 days',
  now() - interval '2 days',
  'asset',
  '20000000-0000-4000-8000-000000001001',
  'DEMO-AST-000001',
  true,
  true,
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
)
on conflict (id) do update
set
  title=excluded.title,
  description=excluded.description,
  status=excluded.status,
  priority=excluded.priority,
  assigned_personnel_id=excluded.assigned_personnel_id,
  assigned_user_id=excluded.assigned_user_id,
  location_id=excluded.location_id,
  division_id=excluded.division_id,
  due_at=excluded.due_at,
  corrective_action=true,
  verification_required=true,
  updated_at=now();

insert into public.forge_task_activity (
  organization_id,
  task_id,
  activity_type,
  message,
  actor_user_id,
  created_at
)
select
  '20000000-0000-4000-8000-000000000100',
  '20000000-0000-4000-8000-000000001301',
  'created',
  'Demo corrective-action Task created.',
  '20000000-0000-4000-8000-000000000001',
  now() - interval '7 days'
where not exists (
  select 1 from public.forge_task_activity
  where task_id='20000000-0000-4000-8000-000000001301'
);


-- ======================================================================
-- FIS-HD-01 Help Desk local demo data (fictional companies, people and issues).
--   Forge support agent:  support@forge2.local / ForgeDev2!   (Forge staff, no tenant membership)
--   Northstar admin:      northstar.admin@forge2.local / ForgeDev2!
--   Northstar employee:   northstar.user@forge2.local / ForgeDev2!
-- Tickets are created through the production RPCs so numbering, SLA, history,
-- notifications and audit are generated by real code paths.
-- =============================================================================
do $$
declare
  u record;
begin
  for u in select * from (values
    ('20000000-0000-4000-8000-000000000004'::uuid, 'support@forge2.local', 'Riley Morgan', '20000000-0000-4000-8000-000000000013'::uuid),
    ('40000000-0000-4000-8000-000000000001'::uuid, 'northstar.admin@forge2.local', 'Dana Whitfield', '40000000-0000-4000-8000-000000000011'::uuid),
    ('40000000-0000-4000-8000-000000000002'::uuid, 'northstar.user@forge2.local', 'Marcus Reyes', '40000000-0000-4000-8000-000000000012'::uuid)
  ) as v(id, email, name, identity_id)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token,
      confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at,
      last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone,
      phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current,
      email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      '$2a$10$8l.Yibl7sKa1KFSBlZgP/OrPNaF/7IYB8Xb0ZUfvV9pwkGZD6yDEW', now(), null, '', now(), '', null, '', '', null, null,
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('sub', u.id::text, 'name', u.name, 'email', u.email, 'email_verified', true, 'phone_verified', false),
      null, now(), now(), null, null, '', '', null, '', 0, null, '', null, false, null, false
    ) on conflict (id) do nothing;
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id)
    values (u.id::text, u.id,
      jsonb_build_object('sub', u.id::text, 'name', u.name, 'email', u.email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now(), u.identity_id)
    on conflict (id) do nothing;
  end loop;
end $$;

insert into public.forge_platform_users (user_id, platform_role, is_active)
values ('20000000-0000-4000-8000-000000000004', 'forge_support', true)
on conflict (user_id) do update set platform_role = excluded.platform_role, is_active = true, updated_at = now();

insert into public.forge_support_team_members (team_id, user_id, is_lead)
select t.id, m.user_id, m.is_lead
from (values
  ('customer_support', '20000000-0000-4000-8000-000000000001'::uuid, true),
  ('engineering_liaison', '20000000-0000-4000-8000-000000000001'::uuid, true),
  ('customer_support', '20000000-0000-4000-8000-000000000004'::uuid, false),
  ('technical_support', '20000000-0000-4000-8000-000000000004'::uuid, false)
) as m(team_key, user_id, is_lead)
join public.forge_support_teams t on t.team_key = m.team_key
on conflict do nothing;

insert into public.organizations (id, name, slug, status, created_by)
values ('40000000-0000-4000-8000-000000000100', 'Northstar Manufacturing', 'northstar-manufacturing', 'active', '20000000-0000-4000-8000-000000000001')
on conflict (id) do update set name = excluded.name, slug = excluded.slug, status = excluded.status, updated_at = now();

insert into public.divisions (id, organization_id, name, code)
values ('40000000-0000-4000-8000-000000000200', '40000000-0000-4000-8000-000000000100', 'Fabrication', 'FAB')
on conflict (id) do update set name = excluded.name, code = excluded.code, updated_at = now();

insert into public.locations (id, organization_id, division_id, name, code, city, state_region, country_code)
values ('40000000-0000-4000-8000-000000000300', '40000000-0000-4000-8000-000000000100', '40000000-0000-4000-8000-000000000200',
        'Northstar Plant 2', 'NS-P2', 'Toledo', 'OH', 'US')
on conflict (id) do update set name = excluded.name, code = excluded.code, city = excluded.city, state_region = excluded.state_region, updated_at = now();

insert into public.forge_subscriptions (id, organization_id, plan_id, status, starts_at, usage_limits, overage_rules)
values ('40000000-0000-4000-8000-000000000500', '40000000-0000-4000-8000-000000000100', '20000000-0000-4000-8000-000000000401', 'active', now(),
  '{"storage_gb":100,"emails_monthly":10000,"sms_segments_monthly":5000}'::jsonb,
  '{"storage_per_gb_usd":0.25,"email_markup_percent":15,"sms_markup_percent":15}'::jsonb)
on conflict (id) do update set plan_id = excluded.plan_id, status = excluded.status, updated_at = now();

insert into public.organization_memberships (organization_id, user_id, role, is_active)
values
  ('40000000-0000-4000-8000-000000000100', '40000000-0000-4000-8000-000000000001', 'admin', true),
  ('40000000-0000-4000-8000-000000000100', '40000000-0000-4000-8000-000000000002', 'member', true)
on conflict (organization_id, user_id) do update set is_active = true, role = excluded.role, updated_at = now();

insert into public.forge_tenant_roles (organization_id, role_key, name, description, is_system_role, is_active, sort_order)
values
  ('40000000-0000-4000-8000-000000000100','company-owner','Company Owner','Full tenant ownership and company administration.',true,true,10),
  ('40000000-0000-4000-8000-000000000100','company-administrator','Company Administrator','Company-wide administration within Forge Creator policy.',true,true,20),
  ('40000000-0000-4000-8000-000000000100','location-administrator','Location Administrator','Administration limited to assigned Locations.',true,true,30),
  ('40000000-0000-4000-8000-000000000100','supervisor','Supervisor','Operational supervisor with assigned personnel scope.',true,true,40),
  ('40000000-0000-4000-8000-000000000100','employee','Employee','Standard employee access.',true,true,50),
  ('40000000-0000-4000-8000-000000000100','read-only','Read Only','Read-only access to explicitly permitted modules.',true,true,60)
on conflict (organization_id, role_key) do update set name = excluded.name, description = excluded.description, is_active = true, updated_at = now();

with role_template_map(role_key, template_key) as (
  values ('company-owner','company-admin'), ('company-administrator','company-admin'), ('location-administrator','supervisor'),
         ('supervisor','supervisor'), ('employee','standard-user'), ('read-only','read-only')
)
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope, constraints)
select r.id, tp.permission_id, tp.allowed, coalesce(tp.scope, 'organization'), coalesce(tp.constraints, '{}'::jsonb)
from public.forge_tenant_roles r
join role_template_map m on m.role_key = r.role_key
join public.forge_role_templates rt on rt.template_key = m.template_key
join public.forge_role_template_permissions tp on tp.template_id = rt.id
where r.organization_id = '40000000-0000-4000-8000-000000000100' and tp.allowed = true
on conflict (role_id, permission_id) do update set allowed = excluded.allowed, scope = excluded.scope, constraints = excluded.constraints;

insert into public.forge_tenant_user_roles (organization_id, user_id, role_id)
select '40000000-0000-4000-8000-000000000100', m.user_id, r.id
from (values ('40000000-0000-4000-8000-000000000001'::uuid, 'company-administrator'), ('40000000-0000-4000-8000-000000000002'::uuid, 'employee')) m(user_id, role_key)
join public.forge_tenant_roles r on r.organization_id = '40000000-0000-4000-8000-000000000100' and r.role_key = m.role_key
on conflict do nothing;

insert into public.forge_tenant_user_location_access (organization_id, user_id, location_id)
values
  ('40000000-0000-4000-8000-000000000100', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000300'),
  ('40000000-0000-4000-8000-000000000100', '40000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000300')
on conflict do nothing;

-- Seed-only helpers (dropped at the end of this section).
create or replace function public.forge_seed_hd_ok(p_result jsonb, p_label text)
returns jsonb language plpgsql as $$
begin
  if p_result is null or not coalesce((p_result->>'ok')::boolean, false) then
    raise exception 'Help desk seed step "%" failed: %', p_label, coalesce(p_result->>'error', 'no result');
  end if;
  return p_result;
end $$;

create or replace function public.forge_seed_hd_ticket(
  p_org uuid, p_requester uuid, p_subject text, p_description text, p_category text, p_area text,
  p_severity text, p_source text, p_location uuid, p_context jsonb default '{}'::jsonb, p_assist uuid default null
) returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := public.forge_seed_hd_ok(public.forge_support_create_ticket(p_org, p_requester, jsonb_build_object(
    'subject', p_subject, 'description', p_description,
    'product_id', (select id from public.forge_support_products where product_key = 'forge_industrial_safety'),
    'category_id', (select id from public.forge_support_categories where category_key = p_category and product_id is null),
    'module_id', (select a.id from public.forge_support_product_areas a join public.forge_support_products p on p.id = a.product_id
                  where p.product_key = 'forge_industrial_safety' and a.area_key = p_area),
    'customer_reported_severity', p_severity, 'source', p_source, 'location_id', p_location,
    'assist_session_id', p_assist, 'technical_context', p_context
  ), null, jsonb_build_object('request_id', 'seed-' || md5(p_subject))), 'create ' || p_subject);
  return (v->>'ticket_id')::uuid;
end $$;

create or replace function public.forge_seed_hd_article(
  p_slug text, p_title text, p_summary text, p_body text, p_category text, p_area text, p_visibility text,
  p_org uuid, p_keywords text, p_publish boolean
) returns uuid language plpgsql as $$
declare v jsonb; v_id uuid;
begin
  v := public.forge_seed_hd_ok(public.forge_support_save_article(null, '20000000-0000-4000-8000-000000000001', jsonb_build_object(
    'slug', p_slug, 'title', p_title, 'summary', p_summary, 'body', p_body,
    'category_id', (select id from public.forge_support_knowledge_categories where category_key = p_category),
    'product_id', (select id from public.forge_support_products where product_key = 'forge_industrial_safety'),
    'module_id', (select a.id from public.forge_support_product_areas a join public.forge_support_products p on p.id = a.product_id
                  where p.product_key = 'forge_industrial_safety' and a.area_key = p_area),
    'visibility', p_visibility, 'organization_id', p_org, 'search_keywords', p_keywords
  ), null, 'Seeded article', '{}'::jsonb), 'article ' || p_slug);
  v_id := (v->>'article_id')::uuid;
  if p_publish then
    perform public.forge_seed_hd_ok(public.forge_support_transition_article(v_id, '20000000-0000-4000-8000-000000000001', 'published', null, 'Seed publish', '{}'::jsonb), 'publish ' || p_slug);
  else
    perform public.forge_seed_hd_ok(public.forge_support_transition_article(v_id, '20000000-0000-4000-8000-000000000004', 'review', null, 'Ready for review', '{}'::jsonb), 'review ' || p_slug);
  end if;
  return v_id;
end $$;

create or replace function public.forge_seed_hd_shift(p_ticket uuid, p_offset interval)
returns void language plpgsql as $$
begin
  update public.forge_support_tickets set
    created_at = created_at - p_offset, updated_at = updated_at - p_offset, first_responded_at = first_responded_at - p_offset,
    resolved_at = resolved_at - p_offset, closed_at = closed_at - p_offset, reopened_at = reopened_at - p_offset,
    escalated_at = escalated_at - p_offset
  where id = p_ticket;
  update public.forge_support_sla_instances set
    started_at = started_at - p_offset, next_response_started_at = next_response_started_at - p_offset,
    next_response_due_at = next_response_due_at - p_offset, first_responded_at = first_responded_at - p_offset,
    resolved_at = resolved_at - p_offset, paused_at = paused_at - p_offset, at_risk_at = at_risk_at - p_offset,
    breached_at = breached_at - p_offset, first_response_breached_at = first_response_breached_at - p_offset,
    next_response_breached_at = next_response_breached_at - p_offset, resolution_breached_at = resolution_breached_at - p_offset,
    last_evaluated_at = last_evaluated_at - p_offset, created_at = created_at - p_offset
  where ticket_id = p_ticket;
  update public.forge_support_sla_instances set
    first_response_due_at = public.forge_support_sla_due(started_at, first_response_minutes, hours_mode, calendar_id) + make_interval(secs => total_paused_seconds),
    resolution_due_at = public.forge_support_sla_due(started_at, resolution_minutes, hours_mode, calendar_id) + make_interval(secs => total_paused_seconds),
    next_response_due_at = case when next_response_started_at is not null
      then public.forge_support_sla_due(next_response_started_at, next_response_minutes, hours_mode, calendar_id) end
  where ticket_id = p_ticket;
  update public.forge_support_tickets t set
    first_response_due_at = i.first_response_due_at, resolution_due_at = i.resolution_due_at,
    next_response_due_at = i.next_response_due_at, sla_breached_at = i.breached_at
  from public.forge_support_sla_instances i where i.ticket_id = t.id and t.id = p_ticket;
  update public.forge_support_sla_events set occurred_at = occurred_at - p_offset where ticket_id = p_ticket;
  update public.forge_support_events set created_at = created_at - p_offset where ticket_id = p_ticket;
  update public.forge_support_messages set created_at = created_at - p_offset, updated_at = updated_at - p_offset where ticket_id = p_ticket;
  update public.forge_support_ticket_status_history set created_at = created_at - p_offset where ticket_id = p_ticket;
  update public.forge_support_ticket_priority_history set created_at = created_at - p_offset where ticket_id = p_ticket;
  update public.forge_support_ticket_assignments set created_at = created_at - p_offset where ticket_id = p_ticket;
  update public.forge_support_ticket_watchers set created_at = created_at - p_offset where ticket_id = p_ticket;
  update public.forge_support_ticket_tags set created_at = created_at - p_offset where ticket_id = p_ticket;
  update public.forge_notification_deliveries d set created_at = d.created_at - p_offset, sent_at = d.sent_at - p_offset, updated_at = d.updated_at - p_offset
  from public.forge_notification_events e where e.id = d.event_id and e.resource_type = 'support_ticket' and e.resource_id = p_ticket;
  update public.forge_notification_events set created_at = created_at - p_offset where resource_type = 'support_ticket' and resource_id = p_ticket;
end $$;

do $$
declare
  c_admin constant uuid := '20000000-0000-4000-8000-000000000001';
  c_agent constant uuid := '20000000-0000-4000-8000-000000000004';
  c_demo_org constant uuid := '20000000-0000-4000-8000-000000000100';
  c_demo_user constant uuid := '20000000-0000-4000-8000-000000000002';
  c_demo_loc constant uuid := '20000000-0000-4000-8000-000000000300';
  c_ns_org constant uuid := '40000000-0000-4000-8000-000000000100';
  c_ns_admin constant uuid := '40000000-0000-4000-8000-000000000001';
  c_ns_user constant uuid := '40000000-0000-4000-8000-000000000002';
  c_ns_loc constant uuid := '40000000-0000-4000-8000-000000000300';
  v_product uuid := (select id from public.forge_support_products where product_key = 'forge_industrial_safety');
  v_ios jsonb := jsonb_build_object('route', '/inspections/new', 'page_url', 'http://localhost:3000/inspections/new', 'browser_name', 'Safari',
    'browser_version', '18.1', 'os_name', 'iOS 18.1', 'device_type', 'mobile', 'viewport_width', 390, 'viewport_height', 844,
    'is_mobile', true, 'app_version', '2.4.0', 'client_timezone', 'America/New_York', 'client_error_id', 'ERR-UPL-413', 'user_role', 'Employee');
  v_desktop jsonb := jsonb_build_object('browser_name', 'Chrome', 'browser_version', '129', 'os_name', 'Windows 11', 'device_type', 'desktop',
    'viewport_width', 1536, 'viewport_height', 864, 'is_mobile', false, 'app_version', '2.4.0', 'client_timezone', 'America/Chicago');
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; t6 uuid; t7 uuid; t8 uuid;
  t9 uuid; t10 uuid; t11 uuid; t12 uuid; t13 uuid; t14 uuid; t15 uuid; t16 uuid;
  v_assist uuid;
  v_inc1 uuid; v_inc2 uuid;
  v_dev1 uuid; v_dev2 uuid; v_dev3 uuid;
  v_r jsonb;
  v_tag_ids uuid[];
  v_known_reply uuid;
  v_info_reply uuid;
  v_resolved_reply uuid;
begin
  if exists (select 1 from public.forge_support_tickets) then
    return;
  end if;

  -- Saved replies -------------------------------------------------------------
  insert into public.forge_support_saved_replies(name, category, body, product_id, created_by, updated_by) values
  ('Request more information', 'triage',
   'Hi {{requester_name}},' || chr(10) || chr(10) || 'Thanks for contacting Forge Support about {{ticket_number}}. To help us investigate, could you share:' || chr(10) ||
   '- The steps you took right before the problem' || chr(10) || '- A screenshot or screen recording' || chr(10) || '- The device and browser you were using' || chr(10) || chr(10) ||
   'We''ll pick this back up as soon as we hear from you.' || chr(10) || chr(10) || '{{support_agent_name}}' || chr(10) || 'Forge Support', v_product, c_admin, c_admin),
  ('Known issue acknowledgement', 'known_issue',
   'Hi {{requester_name}},' || chr(10) || chr(10) || 'This matches a known issue our engineering team is actively working on for {{product_name}}. ' ||
   'We''ve linked {{ticket_number}} to it so you''ll be notified as soon as a fix is available. In the meantime, the workaround in our Help Center article should keep your team moving.' ||
   chr(10) || chr(10) || '{{support_agent_name}}', v_product, c_admin, c_admin),
  ('Resolution confirmation', 'resolution',
   'Hi {{requester_name}},' || chr(10) || chr(10) || 'We''ve resolved {{ticket_number}}. If anything still isn''t working for {{tenant_name}}, reply within 30 days and the ticket will reopen automatically.' ||
   chr(10) || chr(10) || 'Thanks for helping us make Forge better.' || chr(10) || '{{support_agent_name}}', v_product, c_admin, c_admin),
  ('Permissions check', 'permissions',
   'Hi {{requester_name}},' || chr(10) || chr(10) || 'Access in Forge comes from the user''s role and their assigned Locations. A company administrator can review this under Administration > Users. ' ||
   'If the role already includes the permission, confirm the user is assigned to the Location that owns the record.' || chr(10) || chr(10) || '{{support_agent_name}}', v_product, c_admin, c_admin),
  ('Feature request logged', 'feature_request',
   'Hi {{requester_name}},' || chr(10) || chr(10) || 'Thanks for the idea! We''ve logged {{ticket_number}} as a feature request for the {{product_name}} product team. ' ||
   'We review requests every release cycle and will update this ticket if it is scheduled.' || chr(10) || chr(10) || '{{support_agent_name}}', v_product, c_admin, c_admin),
  ('Training session scheduling', 'training',
   'Hi {{requester_name}},' || chr(10) || chr(10) || 'We''d be glad to set up training for {{tenant_name}}. Please reply with a few dates and times that work and the number of attendees.' ||
   chr(10) || chr(10) || '{{support_agent_name}}', v_product, c_admin, c_admin);
  select id into v_info_reply from public.forge_support_saved_replies where name = 'Request more information';
  select id into v_known_reply from public.forge_support_saved_replies where name = 'Known issue acknowledgement';
  select id into v_resolved_reply from public.forge_support_saved_replies where name = 'Resolution confirmation';

  -- Knowledge base ------------------------------------------------------------
  perform public.forge_seed_hd_article('submit-inspections-from-mobile', 'Submitting inspections from the mobile app',
    'How to submit inspections from a phone or tablet and what to check when Submit does not finish.',
    '## Before you submit' || chr(10) || '1. Make sure every required question is answered. Required items show a red marker.' || chr(10) ||
    '2. Confirm you have a signal or Wi-Fi connection. Inspections save locally but need a connection to submit.' || chr(10) || chr(10) ||
    '## If Submit does not finish' || chr(10) || '- Photos larger than 8 MB can slow uploads. Retake photos at standard resolution or remove and re-add them.' || chr(10) ||
    '- Close and reopen the app, then open the inspection from Drafts.' || chr(10) || '- Update to the latest app version.' || chr(10) || chr(10) ||
    'If the problem continues, use **Need Help?** to open a ticket. Forge automatically includes your device details.',
    'inspections', 'inspections', 'public_customer', null, 'mobile submit stuck spinner offline photo upload ios android', true);
  perform public.forge_seed_hd_article('assign-annual-safety-training', 'Assigning annual safety training to employees',
    'Assign recurring training to individuals, roles or Locations and track completion.',
    '## Assign a course' || chr(10) || '1. Open **Training > Courses** and select the course.' || chr(10) || '2. Choose **Assign** and pick employees, a role, or a Location.' || chr(10) ||
    '3. Set the due date and recurrence (for example every 12 months).' || chr(10) || chr(10) ||
    '## Track completion' || chr(10) || 'Use **Training > Assignments** to filter by status. Overdue assignments are highlighted and supervisors receive reminders.',
    'training', 'training', 'authenticated_users', null, 'annual refresher recurring assign course due date', true);
  perform public.forge_seed_hd_article('qr-code-opens-wrong-equipment', 'Fixing a QR code that opens the wrong equipment record',
    'Re-link or reprint a QR label when scanning opens the wrong asset.',
    '## Why this happens' || chr(10) || 'A label can point to the wrong record if it was printed before an asset was merged or re-numbered.' || chr(10) || chr(10) ||
    '## Fix it' || chr(10) || '1. Open the correct asset in **Equipment / Assets**.' || chr(10) || '2. Choose **QR Code > Reassign label** and scan the existing label.' || chr(10) ||
    '3. If the label is damaged, choose **Print new label** and retire the old one.' || chr(10) || chr(10) ||
    '**Safety note:** if the wrong record exposes the wrong LOTO procedure, stop work and contact your supervisor before continuing.',
    'qr_codes', 'qr_codes', 'public_customer', null, 'qr scan label asset equipment wrong record loto', true);
  perform public.forge_seed_hd_article('user-cannot-see-location-records', 'Why can''t a user see records for their Location?',
    'Check role permissions and Location assignments when a user cannot see expected records.',
    'Forge access is the combination of the user''s **role** and their **assigned Locations**.' || chr(10) || chr(10) ||
    '1. In **Administration > Users**, open the user and confirm their role includes the module permission (for example Corrective Actions: View).' || chr(10) ||
    '2. Confirm the user is assigned to the Location that owns the record.' || chr(10) || '3. Ask the user to sign out and back in after changes.',
    'administrator_setup', 'administration', 'authenticated_users', null, 'permissions access role location scope missing records', true);
  perform public.forge_seed_hd_article('reset-your-password', 'Resetting your Forge password',
    'Request a password reset link and what to do if the email does not arrive.',
    '1. On the sign-in page choose **Forgot password**.' || chr(10) || '2. Enter your work email address.' || chr(10) ||
    '3. Open the email from Forge within 60 minutes and choose a new password.' || chr(10) || chr(10) ||
    'Not seeing the email? Check spam or quarantine folders and ask IT to allow messages from Forge.',
    'getting_started', 'administration', 'public_customer', null, 'password reset login forgot email sign in', true);
  perform public.forge_seed_hd_article('upload-photos-weak-connection', 'Uploading photos on weak connections',
    'Tips for attaching photos from the field when signal is limited.',
    '- Photos queue on the device and upload when the connection improves.' || chr(10) || '- Keep the app open until the upload indicator clears.' || chr(10) ||
    '- Use standard photo resolution to reduce upload size.',
    'mobile_field_app', 'mobile_field', 'public_customer', null, 'photo upload offline signal field mobile observation', true);
  perform public.forge_seed_hd_article('known-issue-ios-large-photo-submit', 'Known issue: large photos can block inspection submit on iOS 18',
    'Some iOS 18 devices stop at Submitting when an inspection has photos over 8 MB. A fix is in progress.',
    'We are aware that some iOS 18 users see **Submitting...** indefinitely when an inspection contains photos larger than 8 MB.' || chr(10) || chr(10) ||
    '## Workaround' || chr(10) || 'Remove the large photo, retake it with the in-app camera (which compresses automatically), and submit again.' || chr(10) || chr(10) ||
    'Follow the Service Status page for updates.',
    'troubleshooting', 'mobile_field', 'authenticated_users', null, 'known issue ios 18 inspection submit photo large', true);
  perform public.forge_seed_hd_article('osha-300-privacy-cases', 'How privacy cases appear on the OSHA 300 log',
    'Draft: explains how privacy-concern cases are counted on the OSHA 300 log.',
    'Privacy-concern cases replace the employee name with "Privacy Case" but are still counted in log totals.',
    'osha_reporting', 'osha_reporting', 'authenticated_users', null, 'osha 300 privacy case totals', false);
  perform public.forge_seed_hd_article('runbook-mobile-submission-failures', 'Support runbook: triaging mobile submission failures',
    'Internal steps for diagnosing mobile inspection submission failures.',
    '1. Check the ticket technical context for OS, app version and client error ID.' || chr(10) || '2. ERR-UPL-413 means the photo payload exceeded the upload limit.' || chr(10) ||
    '3. Link to the active platform incident if one exists; otherwise escalate to Technical Support with the correlation ID.',
    'troubleshooting', 'mobile_field', 'forge_internal', null, 'runbook internal triage mobile err-upl-413', true);
  perform public.forge_seed_hd_article('northstar-inspection-conventions', 'Northstar Plant 2: inspection checklist conventions',
    'Company-specific guidance for Northstar inspection templates.',
    'Northstar uses the **Daily Forklift Pre-Use** template for all powered industrial trucks at Plant 2. Deficiencies rated High automatically create corrective actions.',
    'inspections', 'inspections', 'tenant_only', c_ns_org, 'northstar forklift pre-use template', true);

  -- Tickets (creation order defines SUP numbers) -------------------------------
  t1 := public.forge_seed_hd_ticket(c_ns_org, c_ns_user, 'Inspection will not submit from mobile device',
    'When I tap Submit on the Daily Forklift Pre-Use inspection on my iPhone, it shows "Submitting..." forever. I tried three times this morning. The inspection has four photos.',
    'mobile_app_issue', 'inspections', 'p2_high', 'mobile', c_ns_loc, v_ios);
  t2 := public.forge_seed_hd_ticket(c_ns_org, c_ns_user, 'Need help assigning annual safety training',
    'We need to assign the annual forklift refresher to everyone at Plant 2. How do I make it recur every year automatically?',
    'how_do_i', 'training', null, 'web', c_ns_loc, v_desktop);
  t3 := public.forge_seed_hd_ticket(c_ns_org, c_ns_admin, 'QR code opens wrong equipment record',
    'Scanning the QR label on Press #4 opens the record for Press #2, including the wrong LOTO procedure. We have stopped using the labels on that line until this is fixed.',
    'technical_issue', 'qr_codes', 'p1_critical', 'mobile', c_ns_loc,
    jsonb_build_object('route', '/qr/scan', 'browser_name', 'Chrome', 'browser_version', '129', 'os_name', 'Android 15', 'device_type', 'mobile', 'is_mobile', true, 'app_version', '2.4.0'));
  t4 := public.forge_seed_hd_ticket(c_demo_org, c_demo_user, 'Cannot see corrective actions for my location',
    'Since yesterday I cannot see any corrective actions for Demo Location. My coworker can see them.',
    'permissions', 'corrective_actions', null, 'web', c_demo_loc, v_desktop);
  t5 := public.forge_seed_hd_ticket(c_ns_org, c_ns_user, 'Inspection submit spinner never finishes on iPad',
    'Same problem on the shop iPad: the inspection spinner never finishes after I add photos.',
    'mobile_app_issue', 'inspections', 'p2_high', 'mobile', c_ns_loc, v_ios || jsonb_build_object('device_type', 'tablet', 'viewport_width', 820, 'viewport_height', 1180));
  t6 := public.forge_seed_hd_ticket(c_demo_org, c_admin, 'Request: export JSA library to PDF',
    'It would help our auditors if we could export all approved JSAs to a single PDF binder.',
    'feature_request', 'jsa_jha', null, 'web', c_demo_loc, v_desktop);
  t7 := public.forge_seed_hd_ticket(c_ns_org, c_ns_admin, 'Supervisor cannot approve LOTO procedure',
    'Our maintenance supervisor gets "Not authorized" when approving the new LOTO procedure for the paint line. Several procedures are waiting.',
    'data_issue', 'loto', 'p2_high', 'web', c_ns_loc, v_desktop);
  t8 := public.forge_seed_hd_ticket(c_demo_org, c_demo_user, 'Password reset email never arrives',
    'I requested a password reset twice and never received the email.',
    'account_login', 'administration', null, 'web', null, v_desktop);
  t9 := public.forge_seed_hd_ticket(c_ns_org, c_ns_user, 'Duplicate personnel records after import',
    'After importing our contractor list, about 40 people appear twice in Personnel. Training assignments are split between the duplicates.',
    'data_issue', 'personnel', 'p2_high', 'web', c_ns_loc, v_desktop);
  t10 := public.forge_seed_hd_ticket(c_demo_org, c_demo_user, 'How do I add a new location?',
    'We are opening a new warehouse next month. How do I add it as a Location?',
    'how_do_i', 'administration', null, 'web', null, v_desktop);
  t11 := public.forge_seed_hd_ticket(c_ns_org, c_ns_admin, 'OSHA 300 log totals look wrong',
    'The OSHA 300 summary shows 3 recordable cases but the log lists 4. One of them is a privacy case.',
    'data_issue', 'osha_reporting', 'p3_normal', 'web', c_ns_loc, v_desktop);
  t12 := public.forge_seed_hd_ticket(c_ns_org, c_ns_user, 'Observation photos fail to upload on weak signal',
    'Photos on observations in the back lot fail to upload. The observation saves but photos are missing.',
    'mobile_app_issue', 'observations', null, 'mobile', c_ns_loc, v_ios || jsonb_build_object('route', '/observations/new'));
  t13 := public.forge_seed_hd_ticket(c_demo_org, c_demo_user, 'Training certificate shows wrong expiration date',
    'My forklift certificate says it expires in 2025 but I completed the course last month.',
    'data_issue', 'training', 'p3_normal', 'web', c_demo_loc, v_desktop);
  t14 := public.forge_seed_hd_ticket(c_ns_org, c_ns_user, 'Request onsite training for new supervisors',
    'We have five new supervisors who need training on inspections and corrective actions.',
    'training_request', 'training', null, 'web', c_ns_loc, v_desktop);
  t15 := public.forge_seed_hd_ticket(c_demo_org, c_demo_user, 'Payroll integration stopped syncing',
    'New hires from payroll have not appeared in Personnel since Monday.',
    'integration_issue', 'integrations', null, 'web', null, v_desktop);

  insert into public.forge_support_assist_sessions(organization_id, user_id, product_id, module_id, question, answer, answer_provider, answer_model,
    article_ids, troubleshooting_steps, outcome)
  values (c_ns_org, c_ns_admin, v_product,
    (select id from public.forge_support_product_areas where area_key = 'risk_register' and product_id = v_product),
    'The risk matrix colors disappear when I print the risk register.',
    'Printing uses your browser''s print settings. Enable "Background graphics" in the print dialog so matrix colors are included.',
    'knowledge_extractive', 'forge-kb-v1', '{}'::uuid[], 'Enable background graphics in the print dialog, then print again.', 'pending')
  returning id into v_assist;
  t16 := public.forge_seed_hd_ticket(c_ns_org, c_ns_admin, 'Risk register matrix colors not printing',
    'I enabled background graphics as Ask Forge suggested, but the matrix still prints in black and white from Edge.',
    'technical_issue', 'risk_register', null, 'ask_forge', c_ns_loc, v_desktop, v_assist);

  insert into public.forge_support_assist_sessions(organization_id, user_id, product_id, question, answer, answer_provider, answer_model, article_ids, outcome, feedback_comment)
  values (c_demo_org, c_demo_user, v_product, 'How do I reset my password?',
    'Choose Forgot password on the sign-in page, enter your work email, and open the reset link within 60 minutes.',
    'knowledge_extractive', 'forge-kb-v1', array(select id from public.forge_support_knowledge_articles where slug = 'reset-your-password'),
    'resolved', 'That worked, thanks.');

  -- Staff work ----------------------------------------------------------------
  -- SUP-1: known issue, assigned, linked to incident and development.
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t1, c_admin, 'staff', jsonb_build_object('assigned_user_id', c_agent), null, null, 'Mobile queue'), 't1 assign');
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t1, c_agent, 'staff', 'internal_note',
    'Technical context shows ERR-UPL-413 on iOS 18.1. Matches the large-photo upload issue. @Forge 2.0 Local Admin can you confirm engineering is tracking this?',
    null, array[c_admin]), 't1 note');
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t1, c_agent, 'staff', 'support_reply',
    'Hi Marcus, this matches a known issue our engineering team is actively working on. As a workaround, remove the large photos and retake them with the in-app camera, which compresses them automatically. We''ve linked your ticket so you''ll be notified when the fix ships.',
    null, '{}'::uuid[], v_known_reply, null, 'in_progress'), 't1 reply');
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t1, c_agent, 'staff', jsonb_build_object('disposition', 'known_issue'), null, null, 'Matches DEV issue'), 't1 disposition');
  select array_agg(id) into v_tag_ids from public.forge_support_tags where organization_id is null and slug in ('mobile','inspection','bug');
  perform public.forge_seed_hd_ok(public.forge_support_set_ticket_tags(t1, c_agent, v_tag_ids, '{}'::uuid[]), 't1 tags');
  perform public.forge_seed_hd_ok(public.forge_support_set_watcher(t1, c_admin, c_ns_admin, true), 't1 watcher');

  -- SUP-5 duplicate merged into SUP-1.
  perform public.forge_seed_hd_ok(public.forge_support_merge_tickets(t5, t1, c_agent, 'Same iOS large-photo submit issue'), 't5 merge');

  -- SUP-2: waiting on customer (SLA paused).
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t2, c_agent, 'staff', 'support_reply',
    'Hi Marcus, you can set a 12-month recurrence when you assign the course. Should the assignment go to everyone at Plant 2, or only forklift operators? Let us know and we can walk you through it.',
    null, '{}'::uuid[], null, null, 'waiting_on_customer'), 't2 reply');

  -- SUP-4: resolved configuration issue.
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t4, c_agent, 'staff', jsonb_build_object('assigned_user_id', c_agent), null, null, null), 't4 assign');
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t4, c_agent, 'staff', 'support_reply',
    'Your Location assignment was removed during a role update. Your administrator re-added Demo Location and corrective actions are visible again.',
    null, '{}'::uuid[], v_resolved_reply, null, 'resolved'), 't4 resolve');
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t4, c_agent, 'staff', jsonb_build_object('disposition', 'configuration_issue'), null, null, null), 't4 disposition');

  -- SUP-6: feature request waiting on Forge.
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t6, c_admin, 'staff', jsonb_build_object('assigned_user_id', c_admin, 'disposition', 'feature_request'), null, null, null), 't6 assign');
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t6, c_admin, 'staff', 'support_reply',
    'Thanks for the idea! We''ve logged this as a feature request for the product team and will update this ticket if it is scheduled.',
    null, '{}'::uuid[], null, null, 'waiting_on_forge'), 't6 reply');

  -- SUP-8: resolved then closed.
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t8, c_agent, 'staff', 'support_reply',
    'Your company email filter was quarantining messages from Forge. IT has allow-listed the sender and a fresh reset link has been delivered.',
    null, '{}'::uuid[], null, null, 'resolved'), 't8 resolve');
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t8, c_agent, 'staff', jsonb_build_object('status', 'closed', 'disposition', 'third_party_issue'), null, null, 'Customer confirmed'), 't8 close');

  -- SUP-9: escalated data issue with internal mention.
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t9, c_admin, 'staff', jsonb_build_object('assigned_user_id', c_agent), null, null, null), 't9 assign');
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t9, c_agent, 'staff', 'support_reply',
    'Thanks Marcus. We can see the duplicate records and are working on a safe merge that keeps all training history.',
    null, '{}'::uuid[], null, null, 'in_progress'), 't9 reply');
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t9, c_agent, 'staff', jsonb_build_object('escalate', true), null, null, 'Needs Tier 2 data merge'), 't9 escalate');
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t9, c_agent, 'staff', 'internal_note',
    'Import matched on name instead of employee number. Escalating for a scripted merge.', null, array[c_admin]), 't9 note');

  -- SUP-11: confirmed bug waiting on Forge.
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t11, c_admin, 'staff', jsonb_build_object('assigned_user_id', c_admin, 'disposition', 'bug_confirmed'), null, null, null), 't11 assign');
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t11, c_admin, 'staff', 'support_reply',
    'We reproduced this: privacy cases are excluded from the summary total. Engineering has a fix in progress.',
    null, '{}'::uuid[], null, null, 'waiting_on_forge'), 't11 reply');

  -- SUP-12: triaged, not yet answered.
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t12, c_agent, 'staff', jsonb_build_object('status', 'triage'), null, null, null), 't12 triage');

  -- SUP-13: resolved, then reopened by the requester.
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t13, c_agent, 'staff', 'support_reply',
    'The certificate was generated from your previous completion. We regenerated it from last month''s course.',
    null, '{}'::uuid[], null, null, 'resolved'), 't13 resolve');
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t13, c_demo_user, 'customer', jsonb_build_object('status', 'reopened'), null, c_demo_org, 'Certificate still shows 2025'), 't13 reopen');
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t13, c_demo_user, 'customer', 'customer_message',
    'The downloaded PDF still shows the 2025 expiration date.', c_demo_org), 't13 customer reply');

  -- SUP-14: resolved training request.
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t14, c_admin, 'staff', 'support_reply',
    'We scheduled a two-hour remote session for your new supervisors next Tuesday. Calendar invites are on the way.',
    null, '{}'::uuid[], null, null, 'resolved'), 't14 resolve');
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t14, c_admin, 'staff', jsonb_build_object('disposition', 'training_issue'), null, null, null), 't14 disposition');

  -- SUP-15: third-party issue waiting on customer.
  perform public.forge_seed_hd_ok(public.forge_support_add_message(t15, c_agent, 'staff', 'support_reply',
    'The payroll provider rotated its API credentials on Monday. Please ask your payroll administrator for the new key so we can update the connection.',
    null, '{}'::uuid[], v_info_reply, null, 'waiting_on_customer'), 't15 reply');
  perform public.forge_seed_hd_ok(public.forge_support_apply_ticket_change(t15, c_agent, 'staff', jsonb_build_object('disposition', 'third_party_issue'), null, null, null), 't15 disposition');

  -- Related tickets.
  perform public.forge_seed_hd_ok(public.forge_support_link_tickets(t14, t2, 'related', c_agent), 'link t14 t2');

  -- Platform incidents ----------------------------------------------------------
  v_r := public.forge_seed_hd_ok(public.forge_support_create_incident(c_admin, jsonb_build_object(
    'title', 'Mobile inspection submissions failing for some iOS users',
    'public_message', 'We are investigating reports that some iOS 18 users cannot submit inspections that include large photos.',
    'impact', 'major', 'product_id', v_product,
    'components', jsonb_build_array(
      jsonb_build_object('component_id', (select id from public.forge_support_platform_components where component_key = 'mobile'), 'status', 'partial_outage'),
      jsonb_build_object('component_id', (select id from public.forge_support_platform_components where component_key = 'file_uploads'), 'status', 'degraded_performance')),
    'tenant_ids', jsonb_build_array(c_ns_org))), 'incident 1');
  v_inc1 := (v_r->>'incident_id')::uuid;
  perform public.forge_seed_hd_ok(public.forge_support_link_incident_ticket(v_inc1, t1, c_admin, true), 'inc1 link t1');
  perform public.forge_seed_hd_ok(public.forge_support_link_incident_ticket(v_inc1, t12, c_admin, true), 'inc1 link t12');
  perform public.forge_seed_hd_ok(public.forge_support_post_incident_update(v_inc1, c_admin, 'identified',
    'We identified an upload size limit affecting photos over 8 MB on iOS 18. A fix is being tested. Workaround: retake photos with the in-app camera.',
    true, true, 'none', null), 'inc1 identified');

  v_r := public.forge_seed_hd_ok(public.forge_support_create_incident(c_admin, jsonb_build_object(
    'title', 'Delayed email notifications',
    'public_message', 'Some email notifications are arriving up to 30 minutes late.',
    'impact', 'minor', 'product_id', v_product,
    'components', jsonb_build_array(jsonb_build_object('component_id', (select id from public.forge_support_platform_components where component_key = 'notifications'), 'status', 'degraded_performance')),
    'all_tenants_affected', true)), 'incident 2');
  v_inc2 := (v_r->>'incident_id')::uuid;
  perform public.forge_seed_hd_ok(public.forge_support_post_incident_update(v_inc2, c_admin, 'resolved',
    'Email delivery has caught up and notifications are arriving normally.', true, false, 'none', null,
    jsonb_build_object('resolution', 'Scaled the email delivery workers and cleared the backlog.',
                       'root_cause', 'A provider-side rate limit slowed outbound delivery.',
                       'preventive_action', 'Added queue-depth alerting for outbound notifications.')), 'incident 2 resolve');
  update public.forge_support_platform_incidents set started_at = started_at - interval '6 days 4 hours', created_at = created_at - interval '6 days 4 hours',
    resolved_at = resolved_at - interval '6 days 2 hours', updated_at = updated_at - interval '6 days 2 hours' where id = v_inc2;
  update public.forge_support_incident_updates set created_at = created_at - case when status = 'resolved' then interval '6 days 2 hours' else interval '6 days 4 hours' end where incident_id = v_inc2;
  update public.forge_support_platform_incidents set started_at = started_at - interval '1 day 2 hours', created_at = created_at - interval '1 day 2 hours',
    identified_at = identified_at - interval '20 hours' where id = v_inc1;
  update public.forge_support_incident_updates set created_at = created_at - case when status = 'identified' then interval '20 hours' else interval '1 day 2 hours' end where incident_id = v_inc1;

  -- Development issues ------------------------------------------------------------
  v_r := public.forge_seed_hd_ok(public.forge_support_create_development_issue(c_admin, jsonb_build_object(
    'title', 'iOS 18: inspection submit hangs when photos exceed 8 MB', 'issue_type', 'known_issue', 'priority', 'p2_high',
    'description', 'Inspection submission never completes on iOS 18 Safari/WebView when any attached photo exceeds 8 MB.',
    'customer_impact', 'Field users cannot submit inspections with large photos; workaround available.',
    'reproduction_steps', '1. iOS 18 device. 2. Add a 12 MP photo to an inspection. 3. Submit.',
    'error_identifiers', 'ERR-UPL-413', 'known_issue_reference', 'known-issue-ios-large-photo-submit'), t1), 'dev 1');
  v_dev1 := (v_r->>'development_issue_id')::uuid;
  perform public.forge_seed_hd_ok(public.forge_support_link_development_issue(v_dev1, t5, c_admin, true), 'dev1 link t5');
  perform public.forge_seed_hd_ok(public.forge_support_update_development_issue(v_dev1, c_admin, jsonb_build_object('state', 'in_progress'), null, 'Client-side compression in review'), 'dev1 progress');

  v_r := public.forge_seed_hd_ok(public.forge_support_create_development_issue(c_admin, jsonb_build_object(
    'title', 'OSHA 300 summary excludes privacy cases from totals', 'issue_type', 'bug', 'priority', 'p3_normal',
    'description', 'Summary totals filter out rows flagged as privacy cases.', 'customer_impact', 'Incorrect OSHA 300A totals.'), t11), 'dev 2');
  v_dev2 := (v_r->>'development_issue_id')::uuid;
  perform public.forge_seed_hd_ok(public.forge_support_update_development_issue(v_dev2, c_admin, jsonb_build_object('state', 'fixed', 'fix_version', '2.4.1'), null,
    'Fix merged; ships in 2.4.1', 'A fix for the OSHA 300 privacy-case totals is complete and will ship in Forge 2.4.1.'), 'dev2 fixed');

  v_r := public.forge_seed_hd_ok(public.forge_support_create_development_issue(c_admin, jsonb_build_object(
    'title', 'Export approved JSA library to a PDF binder', 'issue_type', 'feature_request', 'priority', 'p4_low',
    'description', 'Customers want a single PDF export of all approved JSAs for audits.'), t6), 'dev 3');
  v_dev3 := (v_r->>'development_issue_id')::uuid;
  perform public.forge_seed_hd_ok(public.forge_support_update_development_issue(v_dev3, c_admin, jsonb_build_object('state', 'triaged'), null, 'Added to roadmap review'), 'dev3 triaged');

  -- Age the tickets so dashboards, SLA and analytics look like a live desk ---------
  perform public.forge_seed_hd_shift(t1, interval '1 day 4 hours');
  perform public.forge_seed_hd_shift(t2, interval '2 days 3 hours');
  perform public.forge_seed_hd_shift(t3, interval '2 days');
  perform public.forge_seed_hd_shift(t4, interval '6 days');
  perform public.forge_seed_hd_shift(t5, interval '1 day 1 hour');
  perform public.forge_seed_hd_shift(t6, interval '5 days');
  perform public.forge_seed_hd_shift(t7, interval '3 hours 12 minutes');
  perform public.forge_seed_hd_shift(t8, interval '12 days');
  perform public.forge_seed_hd_shift(t9, interval '1 day 2 hours');
  perform public.forge_seed_hd_shift(t10, interval '20 minutes');
  perform public.forge_seed_hd_shift(t11, interval '1 day 6 hours');
  perform public.forge_seed_hd_shift(t12, interval '1 hour');
  perform public.forge_seed_hd_shift(t13, interval '2 days');
  perform public.forge_seed_hd_shift(t14, interval '8 days');
  perform public.forge_seed_hd_shift(t15, interval '3 days');
  perform public.forge_seed_hd_shift(t16, interval '40 minutes');
  update public.forge_support_assist_sessions set created_at = created_at - interval '45 minutes', updated_at = updated_at - interval '40 minutes' where id = v_assist;

  perform public.forge_support_evaluate_sla(now(), null);

  -- CSAT (immutable once submitted) ----------------------------------------------------
  perform public.forge_seed_hd_ok(public.forge_support_submit_csat(t4, c_demo_user, c_demo_org, 5, 'Fast and clear answer.'), 'csat t4');
  perform public.forge_seed_hd_ok(public.forge_support_submit_csat(t8, c_demo_user, c_demo_org, 4, null), 'csat t8');
  perform public.forge_seed_hd_ok(public.forge_support_submit_csat(t14, c_ns_user, c_ns_org, 3, 'Helpful, but scheduling took a few days.'), 'csat t14');

  -- Announcements -------------------------------------------------------------------
  perform public.forge_seed_hd_ok(public.forge_support_save_announcement(null, c_admin, jsonb_build_object(
    'title', 'Planned maintenance: Saturday 2:00-3:00 AM Central',
    'body', 'Forge Industrial Safety will be briefly unavailable while we upgrade database infrastructure. Mobile inspections started before the window will sync afterward.',
    'announcement_type', 'planned_maintenance', 'product_id', v_product,
    'starts_at', to_char((date_trunc('week', now() + interval '2 days') + interval '5 days 7 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'ends_at', to_char((date_trunc('week', now() + interval '2 days') + interval '5 days 8 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'publish', true)), 'announcement maintenance');
  perform public.forge_seed_hd_ok(public.forge_support_save_announcement(null, c_admin, jsonb_build_object(
    'title', 'Known issue: large photos on iOS 18',
    'body', 'Some iOS 18 users cannot submit inspections with photos over 8 MB. Retake photos with the in-app camera as a workaround. See Service Status for updates.',
    'announcement_type', 'known_issue', 'product_id', v_product, 'incident_id', v_inc1, 'publish', true)), 'announcement known issue');
  perform public.forge_seed_hd_ok(public.forge_support_save_announcement(null, c_admin, jsonb_build_object(
    'title', 'New: Help Desk inside Forge',
    'body', 'You can now search help articles, ask Forge, open tickets and follow service status from Help Desk in the main menu.',
    'announcement_type', 'feature_release', 'product_id', v_product, 'publish', true)), 'announcement release');
end $$;

drop function if exists public.forge_seed_hd_shift(uuid, interval);
drop function if exists public.forge_seed_hd_article(text, text, text, text, text, text, text, uuid, text, boolean);
drop function if exists public.forge_seed_hd_ticket(uuid, uuid, text, text, text, text, text, text, uuid, jsonb, uuid);
drop function if exists public.forge_seed_hd_ok(jsonb, text);
-- Port slice 0: synthetic departments and positions for the demo tenant (no customer data).
insert into public.forge_departments (id, organization_id, location_id, division_id, name, code, description, created_by, updated_by)
values
  ('20000000-0000-4000-8000-000000002001','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','Milling','MILL','Demo production department.','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000002002','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','Maintenance','MAINT','Demo maintenance department.','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000002003','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000000300','20000000-0000-4000-8000-000000000200','Shipping & Receiving','SHIP','Demo warehouse and loadout department.','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001')
on conflict (id) do update
set name = excluded.name, code = excluded.code, description = excluded.description, is_active = true, updated_at = now();

insert into public.forge_positions (id, organization_id, department_id, name, code, created_by, updated_by)
values
  ('20000000-0000-4000-8000-000000002101','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000002001','Mill Operator','MILL-OP','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000002102','20000000-0000-4000-8000-000000000100','20000000-0000-4000-8000-000000002002','Maintenance Technician','MAINT-TECH','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000002103','20000000-0000-4000-8000-000000000100',null,'Forklift Operator','PIT-OP','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001')
on conflict (id) do update
set name = excluded.name, code = excluded.code, department_id = excluded.department_id, is_active = true, updated_at = now();

update public.forge_personnel
set
  department_id = '20000000-0000-4000-8000-000000002001',
  position_id = '20000000-0000-4000-8000-000000002101',
  employment_type = 'full_time',
  updated_at = now()
where id = '20000000-0000-4000-8000-000000000600';

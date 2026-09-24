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

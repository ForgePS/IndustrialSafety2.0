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

-- =============================================================================
-- Sales-demo login: Denise Carter, Plant Manager and Company Owner of Cypress Bend Rice Mill.
--   Email: denise.carter@cypressbend.example   Password: ForgeDev2!   (local only)
-- Unlike admin@forge2.local she is not Forge staff or a Creator owner, so her bell shows plant
-- notifications instead of the Forge support queue.
-- =============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at,
  confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new,
  email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token,
  phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until,
  reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  '61000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'denise.carter@cypressbend.example',
  -- Same local-only hash as user@forge2.local (ForgeDev2!).
  '$2a$10$8l.Yibl7sKa1KFSBlZgP/OrPNaF/7IYB8Xb0ZUfvV9pwkGZD6yDEW',
  now(), null, '', now(), '', null, '', '', null, null,
  '{"provider":"email","providers":["email"]}',
  '{"sub":"61000000-0000-4000-8000-000000000001","name":"Denise Carter","email":"denise.carter@cypressbend.example","email_verified":true,"phone_verified":false}',
  null, now() - interval '400 days', now(), null, null, '', '', null, '', 0, null, '', null, false, null, false
)
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id)
values (
  '61000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '{"sub":"61000000-0000-4000-8000-000000000001","name":"Denise Carter","email":"denise.carter@cypressbend.example","email_verified":true,"phone_verified":false}',
  'email', now(), now(), now(),
  '61000000-0000-4000-8000-000000000011'
)
on conflict (id) do nothing;

insert into public.organization_memberships (organization_id, user_id, role, is_active)
values ('20000000-0000-4000-8000-000000000100', '61000000-0000-4000-8000-000000000001', 'owner', true)
on conflict (organization_id, user_id) do update set is_active = true, role = 'owner', updated_at = now();

insert into public.forge_tenant_user_roles (organization_id, user_id, role_id)
select '20000000-0000-4000-8000-000000000100', '61000000-0000-4000-8000-000000000001', r.id
from public.forge_tenant_roles r
where r.organization_id = '20000000-0000-4000-8000-000000000100' and r.role_key = 'company-owner'
on conflict do nothing;

insert into public.forge_tenant_user_location_access (organization_id, user_id, location_id)
values ('20000000-0000-4000-8000-000000000100', '61000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000300')
on conflict do nothing;

-- Link her login to her personnel record.
update public.forge_personnel
set auth_user_id = '61000000-0000-4000-8000-000000000001', updated_at = now()
where id = '60000000-0000-4000-8000-000000003001';

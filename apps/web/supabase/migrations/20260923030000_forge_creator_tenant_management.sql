-- Forge Creator 2.0 tenant-management foundation.

alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists customer_number text,
  add column if not exists primary_contact_name text,
  add column if not exists primary_contact_email text,
  add column if not exists billing_contact_email text,
  add column if not exists phone text,
  add column if not exists website text,
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists locale text not null default 'en-US',
  add column if not exists logo_url text,
  add column if not exists accent_color text,
  add column if not exists internal_notes text,
  add column if not exists suspended_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.organizations
  drop constraint if exists organizations_status_check;

alter table public.organizations
  add constraint organizations_status_check
  check (status in ('active', 'inactive', 'suspended', 'archived'));

create unique index if not exists organizations_customer_number_unique_idx
  on public.organizations(customer_number)
  where customer_number is not null;

create index if not exists organizations_status_idx
  on public.organizations(status);

create table if not exists public.forge_tenant_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null unique,
  domain_type text not null default 'subdomain' check (domain_type in ('subdomain','custom')),
  is_primary boolean not null default false,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','failed')),
  ssl_status text not null default 'pending' check (ssl_status in ('pending','active','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists forge_tenant_domains_org_idx
  on public.forge_tenant_domains(organization_id);

alter table public.forge_tenant_domains enable row level security;
grant all on public.forge_tenant_domains to service_role;

create or replace function public.handle_new_organization_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.forge_platform_users fpu
    where fpu.user_id = new.created_by
      and fpu.is_active = true
  ) then
    return new;
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    is_active
  )
  values (
    new.id,
    new.created_by,
    'owner',
    true
  )
  on conflict (organization_id, user_id)
  do update set
    role = 'owner',
    is_active = true,
    updated_at = now();

  return new;
end;
$$;
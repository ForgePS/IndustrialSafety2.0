-- Forge Creator 2.0 individual access and scope assignments.

create table if not exists public.forge_tenant_user_location_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, location_id)
);

create table if not exists public.forge_tenant_user_division_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, division_id)
);

create index if not exists forge_tenant_user_location_access_user_idx
  on public.forge_tenant_user_location_access(organization_id, user_id);

create index if not exists forge_tenant_user_division_access_user_idx
  on public.forge_tenant_user_division_access(organization_id, user_id);

alter table public.forge_tenant_user_location_access enable row level security;
alter table public.forge_tenant_user_division_access enable row level security;

grant all on public.forge_tenant_user_location_access to service_role;
grant all on public.forge_tenant_user_division_access to service_role;

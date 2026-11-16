-- Port slice 7: the home dashboard (Industrial 1.0 industrial-dashboard).
-- 1.0 kept each user's dashboard layout in the browser (localStorage), so it was lost on a new device.
-- 2.0 keeps it per user and company. The layout is cleaned on read (normalizeDashboardLayout), so the
-- database only checks that it is a small JSON object.

create table if not exists public.forge_dashboard_layouts (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  layout jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint forge_dashboard_layouts_object check (jsonb_typeof(layout) = 'object'),
  constraint forge_dashboard_layouts_size check (octet_length(layout::text) <= 16384)
);

-- Read and written only by server code with the service role, for the signed-in user.
alter table public.forge_dashboard_layouts enable row level security;
revoke all on public.forge_dashboard_layouts from anon, authenticated;
grant all on public.forge_dashboard_layouts to service_role;

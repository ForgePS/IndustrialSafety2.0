-- Port slice 8 (piece C): incident root-cause analysis (5 Whys), ported from Forge Industrial 1.0's
-- incident.rootCauseAnalysis. One analysis per incident. Each RCA action carries a stable key, and the CAPA opened
-- for it is stored on the action (forge_corrective_actions.source_type = 'incident_rca_action', source_id = key).
-- Writes go through server actions with the service role; members read their own company's rows, as with
-- forge_incidents.

create table if not exists public.forge_incident_rca (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incident_id uuid not null references public.forge_incidents(id) on delete cascade,
  problem_statement text,
  immediate_actions text,
  event_date date,
  conducted_by text,
  conducted_at date,
  participants jsonb not null default '[]'::jsonb check (jsonb_typeof(participants) = 'array'),
  contributing_factors jsonb not null default '[]'::jsonb check (jsonb_typeof(contributing_factors) = 'array'),
  -- [{ question, answer }], five entries
  five_whys jsonb not null default '[]'::jsonb check (jsonb_typeof(five_whys) = 'array'),
  root_cause text,
  -- [{ key, action, ownerPersonnelId, ownerName, dueDate, status, capaId, capaNumber }]
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incident_id)
);

create index if not exists forge_incident_rca_org_idx
  on public.forge_incident_rca(organization_id, incident_id);

alter table public.forge_incident_rca enable row level security;

drop policy if exists forge_incident_rca_member_select on public.forge_incident_rca;
create policy forge_incident_rca_member_select
on public.forge_incident_rca
for select
to authenticated
using (public.is_org_member(organization_id));

grant select on public.forge_incident_rca to authenticated;
grant all on public.forge_incident_rca to service_role;

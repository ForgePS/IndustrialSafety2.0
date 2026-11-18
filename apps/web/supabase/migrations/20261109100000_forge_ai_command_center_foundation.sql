-- Forge AI Command Center, stage 1: execution foundation.
-- Additive only. Extends the existing forge_ai_* tables (conversations, messages, tool runs,
-- usage, approvals). Every model request is now recorded as an agent run with its prompt version,
-- provider, attempts and outcome. AI decisions land in one append-only audit trail. Model pricing
-- and limits move to a platform registry. Tenant retention is enforced by
-- forge_ai_apply_retention().

-- Rollout flag. Off for tenants whose plan does not include it; Creator can toggle it per tenant.
insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('forge_ai_command_center', 'Forge AI Command Center', 'Specialised Forge AI agents, risk intelligence, recommendations with approvals and the proactive alert center.', 'AI', 'feature', 'beta', true, false, false, true, true, 252)
on conflict (feature_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  feature_type=excluded.feature_type,
  tenant_configurable=excluded.tenant_configurable,
  requires_entitlement=excluded.requires_entitlement,
  is_sensitive=excluded.is_sensitive,
  sort_order=excluded.sort_order,
  updated_at=now();

-- Platform model registry. Prices are left null until Forge confirms them; cost is then not estimated.
create table if not exists public.forge_ai_model_registry (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('openai','test')),
  model_key text not null,
  display_name text not null,
  model_type text not null default 'chat' check (model_type in ('chat','embedding')),
  supports_tools boolean not null default true,
  supports_structured_output boolean not null default true,
  context_window_tokens integer check (context_window_tokens is null or context_window_tokens > 0),
  max_output_tokens integer check (max_output_tokens is null or max_output_tokens > 0),
  input_cost_per_million_cents numeric(12,4) check (input_cost_per_million_cents is null or input_cost_per_million_cents >= 0),
  output_cost_per_million_cents numeric(12,4) check (output_cost_per_million_cents is null or output_cost_per_million_cents >= 0),
  request_timeout_ms integer not null default 60000 check (request_timeout_ms between 1000 and 300000),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, model_key)
);

insert into public.forge_ai_model_registry
  (provider, model_key, display_name, model_type, supports_tools, supports_structured_output, request_timeout_ms, max_attempts, enabled, notes)
values
  ('openai', 'gpt-6-sol', 'GPT-6 Sol', 'chat', true, true, 90000, 3, true, 'Current Forge AI default chat model.'),
  ('openai', 'text-embedding-3-small', 'Text Embedding 3 Small', 'embedding', false, false, 30000, 3, true, 'Forge Knowledge embeddings (1536 dimensions).'),
  ('test', 'forge-test-stub', 'Forge test provider', 'chat', true, true, 5000, 3, false, 'Deterministic provider for automated tests. Refused by the server unless FORGE_AI_TEST_PROVIDER=1 outside production.')
on conflict (provider, model_key) do update
set
  display_name=excluded.display_name,
  model_type=excluded.model_type,
  supports_tools=excluded.supports_tools,
  supports_structured_output=excluded.supports_structured_output,
  notes=excluded.notes,
  updated_at=now();

-- One row per orchestrated model request (chat turn, structured generation, watch summary).
create table if not exists public.forge_ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.forge_ai_conversations(id) on delete set null,
  request_kind text not null default 'chat' check (request_kind in ('chat','structured','watch','system')),
  intent text,
  agent_key text not null default 'general',
  prompt_key text not null,
  prompt_version integer not null check (prompt_version > 0),
  prompt_hash text not null,
  provider text not null,
  model text not null,
  status text not null default 'running' check (status in ('running','completed','failed','denied','timeout','invalid_output')),
  attempts integer not null default 0 check (attempts >= 0),
  rounds integer not null default 0 check (rounds >= 0),
  tool_calls integer not null default 0 check (tool_calls >= 0),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  duration_ms integer,
  error_kind text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists forge_ai_agent_runs_org_started_idx
  on public.forge_ai_agent_runs(organization_id, started_at desc);
create index if not exists forge_ai_agent_runs_org_agent_idx
  on public.forge_ai_agent_runs(organization_id, agent_key, started_at desc);
create index if not exists forge_ai_agent_runs_conversation_idx
  on public.forge_ai_agent_runs(conversation_id) where conversation_id is not null;

alter table public.forge_ai_usage_events
  add column if not exists agent_run_id uuid references public.forge_ai_agent_runs(id) on delete set null;
alter table public.forge_ai_tool_runs
  add column if not exists agent_run_id uuid references public.forge_ai_agent_runs(id) on delete set null;

create index if not exists forge_ai_usage_events_agent_run_idx
  on public.forge_ai_usage_events(agent_run_id) where agent_run_id is not null;
create index if not exists forge_ai_tool_runs_agent_run_idx
  on public.forge_ai_tool_runs(agent_run_id) where agent_run_id is not null;

-- Unified, append-only AI audit trail: requests, denials, approvals, executions, alert handling.
create table if not exists public.forge_ai_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user','system','ai')),
  event_type text not null,
  resource_type text,
  resource_id text,
  agent_run_id uuid references public.forge_ai_agent_runs(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_ai_audit_events_org_created_idx
  on public.forge_ai_audit_events(organization_id, created_at desc);
create index if not exists forge_ai_audit_events_resource_idx
  on public.forge_ai_audit_events(organization_id, resource_type, resource_id);

create or replace function public.forge_ai_audit_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'forge_ai_audit_events is append-only.';
  end if;
  -- Only foreign-key SET NULL maintenance (user, tenant or run deletion) may touch existing rows.
  if (to_jsonb(new) - 'actor_user_id' - 'organization_id' - 'agent_run_id')
       is distinct from (to_jsonb(old) - 'actor_user_id' - 'organization_id' - 'agent_run_id')
     or (new.actor_user_id is not null and new.actor_user_id is distinct from old.actor_user_id)
     or (new.organization_id is not null and new.organization_id is distinct from old.organization_id)
     or (new.agent_run_id is not null and new.agent_run_id is distinct from old.agent_run_id) then
    raise exception 'forge_ai_audit_events is append-only.';
  end if;
  return new;
end;
$$;

drop trigger if exists forge_ai_audit_events_append_only on public.forge_ai_audit_events;
create trigger forge_ai_audit_events_append_only
before update or delete on public.forge_ai_audit_events
for each row execute function public.forge_ai_audit_append_only();

-- Retention: removes conversations (with their messages, tool runs and feedback) and agent runs
-- older than the tenant's data_retention_days. Usage totals and the audit trail are kept.
create or replace function public.forge_ai_apply_retention(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
  v_cutoff timestamptz;
  v_conversations integer := 0;
  v_runs integer := 0;
begin
  select coalesce(s.data_retention_days, 365) into v_days
  from public.organizations o
  left join public.forge_ai_tenant_settings s on s.organization_id = o.id
  where o.id = p_organization_id;

  if v_days is null then
    raise exception 'Unknown organization.';
  end if;

  v_cutoff := now() - make_interval(days => v_days);

  delete from public.forge_ai_conversations
  where organization_id = p_organization_id
    and coalesce(last_message_at, created_at) < v_cutoff
    and not pinned;
  get diagnostics v_conversations = row_count;

  delete from public.forge_ai_agent_runs
  where organization_id = p_organization_id
    and started_at < v_cutoff;
  get diagnostics v_runs = row_count;

  insert into public.forge_ai_audit_events (organization_id, actor_type, event_type, detail)
  values (p_organization_id, 'system', 'retention.applied',
          jsonb_build_object('retention_days', v_days, 'cutoff', v_cutoff,
                             'conversations_deleted', v_conversations, 'agent_runs_deleted', v_runs));

  return jsonb_build_object('conversations_deleted', v_conversations, 'agent_runs_deleted', v_runs, 'cutoff', v_cutoff);
end;
$$;

revoke all on function public.forge_ai_apply_retention(uuid) from public, anon, authenticated;
grant execute on function public.forge_ai_apply_retention(uuid) to service_role;

alter table public.forge_ai_model_registry enable row level security;
alter table public.forge_ai_agent_runs enable row level security;
alter table public.forge_ai_audit_events enable row level security;

grant all on public.forge_ai_model_registry to service_role;
grant all on public.forge_ai_agent_runs to service_role;
grant select, insert, update on public.forge_ai_audit_events to service_role;

-- Forge AI Knowledge semantic retrieval and contextual assistant foundation.

create extension if not exists vector with schema extensions;

alter table public.forge_ai_knowledge_sources
  add column if not exists content_text text,
  add column if not exists chunk_count integer not null default 0,
  add column if not exists indexed_at timestamptz,
  add column if not exists index_error text,
  add column if not exists embedding_model text;

create table if not exists public.forge_ai_knowledge_chunks (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.forge_ai_knowledge_sources(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  section_title text,
  page_number integer,
  content text not null,
  content_hash text not null,
  token_count integer,
  embedding extensions.vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create index if not exists forge_ai_knowledge_chunks_org_source_idx
  on public.forge_ai_knowledge_chunks(organization_id, source_id, chunk_index);

create index if not exists forge_ai_knowledge_chunks_embedding_hnsw_idx
  on public.forge_ai_knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.forge_ai_knowledge_chunks enable row level security;

grant all on public.forge_ai_knowledge_chunks to service_role;
grant usage, select on sequence public.forge_ai_knowledge_chunks_id_seq to service_role;

create or replace function public.match_forge_ai_knowledge(
  p_organization_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 8,
  p_include_restricted boolean default false
)
returns table (
  chunk_id bigint,
  source_id uuid,
  source_title text,
  source_type text,
  sensitivity text,
  source_reference text,
  section_title text,
  page_number integer,
  content text,
  similarity double precision
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  select
    c.id as chunk_id,
    s.id as source_id,
    s.title as source_title,
    s.source_type,
    s.sensitivity,
    s.source_reference,
    c.section_title,
    c.page_number,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.forge_ai_knowledge_chunks c
  join public.forge_ai_knowledge_sources s on s.id = c.source_id
  where c.organization_id = p_organization_id
    and s.organization_id = p_organization_id
    and s.status = 'active'
    and (p_include_restricted or s.sensitivity <> 'restricted')
  order by c.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 20);
$$;

revoke all on function public.match_forge_ai_knowledge(uuid, extensions.vector, integer, boolean) from public;
grant execute on function public.match_forge_ai_knowledge(uuid, extensions.vector, integer, boolean) to service_role;

update public.forge_ai_capabilities
set
  platform_enabled = true,
  sensitive = false,
  description = 'Search approved tenant policies, SOPs, manuals, training materials and other indexed knowledge. Restricted sources require separate sensitive-data authority.',
  updated_at = now()
where capability_key = 'knowledge_search';

insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values
  ('record_context','Current Record Context','Read the Forge record currently open in the user interface after normal record permission and scope checks.','Context','forge_ai.use','read',true,false,false,15)
on conflict (capability_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  required_permission_key=excluded.required_permission_key,
  capability_type=excluded.capability_type,
  platform_enabled=true,
  sensitive=false,
  requires_approval=false,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true,
  case when rt.template_key='standard-user' then 'own'
       when rt.template_key='supervisor' then 'location'
       else 'organization' end
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key='forge_ai.manage_knowledge'
where rt.template_key in ('safety-manager','company-admin')
on conflict (template_id, permission_id) do nothing;

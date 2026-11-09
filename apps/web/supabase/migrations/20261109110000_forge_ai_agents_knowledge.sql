-- Forge AI Command Center, stage 2: agents and knowledge engine.
-- Additive only.
--  * Knowledge source versions: every content change (typed or uploaded file) is a numbered
--    version with its checksum and extraction details. Chunks record the version they came from.
--  * Hybrid retrieval: chunks get a generated full-text vector, so knowledge search works on
--    Postgres full-text alone and combines with embeddings when an embedding provider is set.
--    Embeddings become optional per chunk.
--  * search_watch_alerts capability for the Proactive Monitoring agent.

create table if not exists public.forge_ai_knowledge_source_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.forge_ai_knowledge_sources(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content_text text not null,
  content_hash text not null,
  origin text not null default 'manual' check (origin in ('manual','upload')),
  file_name text,
  file_mime text,
  file_size_bytes integer check (file_size_bytes is null or file_size_bytes >= 0),
  file_sha256 text,
  extractor text check (extractor is null or extractor in ('text','markdown','pdf','docx')),
  page_count integer check (page_count is null or page_count >= 0),
  change_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_id, version_number)
);

create index if not exists forge_ai_knowledge_source_versions_org_idx
  on public.forge_ai_knowledge_source_versions(organization_id, source_id, version_number desc);

alter table public.forge_ai_knowledge_sources
  add column if not exists current_version integer not null default 0,
  add column if not exists indexed_version integer,
  add column if not exists retrieval_mode text check (retrieval_mode is null or retrieval_mode in ('hybrid','lexical'));

-- Existing sources become version 1 so history starts from what is there today.
insert into public.forge_ai_knowledge_source_versions
  (organization_id, source_id, version_number, content_text, content_hash, origin, extractor, created_by, created_at)
select s.organization_id, s.id, 1, s.content_text, coalesce(s.content_hash, md5(s.content_text)), 'manual', 'text', s.created_by, s.created_at
from public.forge_ai_knowledge_sources s
where s.content_text is not null and length(trim(s.content_text)) > 0
on conflict (source_id, version_number) do nothing;

update public.forge_ai_knowledge_sources s
set current_version = 1,
    indexed_version = case when s.chunk_count > 0 then 1 else null end,
    retrieval_mode = case when s.chunk_count > 0 then 'hybrid' else null end
where s.current_version = 0
  and exists (select 1 from public.forge_ai_knowledge_source_versions v where v.source_id = s.id);

alter table public.forge_ai_knowledge_chunks
  alter column embedding drop not null,
  add column if not exists version_number integer,
  add column if not exists content_tsv tsvector
    generated always as (to_tsvector('english', coalesce(section_title, '') || ' ' || content)) stored;

create index if not exists forge_ai_knowledge_chunks_tsv_idx
  on public.forge_ai_knowledge_chunks using gin (content_tsv);

-- Vector search skips chunks indexed without embeddings.
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
    and c.embedding is not null
    and (p_include_restricted or s.sensitivity <> 'restricted')
  order by c.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 20);
$$;

revoke all on function public.match_forge_ai_knowledge(uuid, extensions.vector, integer, boolean) from public, anon, authenticated;
grant execute on function public.match_forge_ai_knowledge(uuid, extensions.vector, integer, boolean) to service_role;

-- Full-text retrieval: same tenant, status and sensitivity rules as vector search.
create or replace function public.search_forge_ai_knowledge_text(
  p_organization_id uuid,
  p_query text,
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
  rank real
)
language sql
security definer
set search_path = public
stable
as $$
  with q as (select websearch_to_tsquery('english', coalesce(p_query, '')) as query)
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
    ts_rank_cd(c.content_tsv, q.query) as rank
  from public.forge_ai_knowledge_chunks c
  join public.forge_ai_knowledge_sources s on s.id = c.source_id
  cross join q
  where c.organization_id = p_organization_id
    and s.organization_id = p_organization_id
    and s.status = 'active'
    and (p_include_restricted or s.sensitivity <> 'restricted')
    and c.content_tsv @@ q.query
  order by rank desc, c.id
  limit least(greatest(p_match_count, 1), 20);
$$;

revoke all on function public.search_forge_ai_knowledge_text(uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.search_forge_ai_knowledge_text(uuid, text, integer, boolean) to service_role;

alter table public.forge_ai_knowledge_source_versions enable row level security;
grant all on public.forge_ai_knowledge_source_versions to service_role;

insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values
  ('search_watch_alerts','Search Watch Alerts','List open and acknowledged Forge AI Watch alerts within the user''s alert and module scope.','Monitoring','forge_ai.view_alerts','read',true,false,false,95)
on conflict (capability_key) do update
set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  required_permission_key=excluded.required_permission_key,
  capability_type=excluded.capability_type,
  platform_enabled=excluded.platform_enabled,
  sensitive=excluded.sensitive,
  requires_approval=excluded.requires_approval,
  sort_order=excluded.sort_order,
  updated_at=now();

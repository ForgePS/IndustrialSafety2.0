-- Forge AI Command Center stage 5 follow-up: tenant usage totals for a reporting window,
-- aggregated in the database so the totals cover every event, however many there are.
-- Requests and tool calls exclude knowledge-embedding usage; tokens include it.

create or replace function public.forge_ai_usage_summary(p_organization_id uuid, p_since timestamptz)
returns table (requests bigint, tokens bigint, tool_calls bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where coalesce(e.metadata ->> 'usage_type', '') <> 'knowledge_embedding'),
    coalesce(sum(e.total_tokens), 0)::bigint,
    coalesce(sum(e.tool_calls) filter (where coalesce(e.metadata ->> 'usage_type', '') <> 'knowledge_embedding'), 0)::bigint
  from public.forge_ai_usage_events e
  where e.organization_id = p_organization_id
    and e.created_at >= p_since;
$$;

revoke all on function public.forge_ai_usage_summary(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.forge_ai_usage_summary(uuid, timestamptz) to service_role;

-- Forge AI Command Center stage 2 follow-up: allocate a knowledge source's next version and make
-- it current in one transaction. The source row is locked first, so two saves of the same source
-- cannot both take the same number or leave the source text out of step with current_version.

create or replace function public.forge_ai_save_knowledge_version(
  p_organization_id uuid,
  p_source_id uuid,
  p_actor_user_id uuid,
  p_content_text text,
  p_content_hash text,
  p_origin text,
  p_file jsonb default null,
  p_change_note text default null
)
returns table (version_number integer, created boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  latest record;
  next_version integer;
begin
  perform 1
  from public.forge_ai_knowledge_sources s
  where s.id = p_source_id and s.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Knowledge source not found.' using errcode = 'P0002';
  end if;

  select v.version_number, v.content_hash
  into latest
  from public.forge_ai_knowledge_source_versions v
  where v.source_id = p_source_id
  order by v.version_number desc
  limit 1;

  if latest.version_number is not null and latest.content_hash = p_content_hash and p_file is null then
    return query select latest.version_number::integer, false;
    return;
  end if;

  next_version := coalesce(latest.version_number, 0) + 1;

  insert into public.forge_ai_knowledge_source_versions (
    organization_id, source_id, version_number, content_text, content_hash, origin,
    file_name, file_mime, file_size_bytes, file_sha256, extractor, page_count, change_note, created_by
  )
  values (
    p_organization_id, p_source_id, next_version, p_content_text, p_content_hash, p_origin,
    p_file ->> 'name',
    p_file ->> 'mime',
    (p_file ->> 'sizeBytes')::bigint,
    p_file ->> 'sha256',
    coalesce(p_file ->> 'extractor', case when p_origin = 'manual' then 'text' end),
    (p_file ->> 'pageCount')::integer,
    nullif(p_change_note, ''),
    p_actor_user_id
  );

  update public.forge_ai_knowledge_sources
  set content_text = p_content_text,
      current_version = next_version,
      status = 'draft',
      index_error = null,
      updated_by = p_actor_user_id,
      updated_at = now()
  where id = p_source_id;

  return query select next_version, true;
end;
$$;

revoke all on function public.forge_ai_save_knowledge_version(uuid, uuid, uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.forge_ai_save_knowledge_version(uuid, uuid, uuid, text, text, text, jsonb, text) to service_role;

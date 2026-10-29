-- Help Desk review fix: AI suggestion decisions are a reply-drafting action.
-- `forge_read_only` holds helpdesk.support.view, so the decision RPC now requires
-- helpdesk.support.respond (the server actions that generate and decide suggestions match).

create or replace function public.forge_support_decide_ai_suggestion(
  p_suggestion_id uuid,
  p_actor_user_id uuid,
  p_decision text,
  p_final_output text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s public.forge_support_ai_suggestions%rowtype;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.respond') then
    return jsonb_build_object('ok', false, 'error', 'Access denied.');
  end if;
  if p_decision not in ('accepted','rejected') then
    return jsonb_build_object('ok', false, 'error', 'Invalid decision.');
  end if;
  select * into s from public.forge_support_ai_suggestions where id = p_suggestion_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Suggestion not found.'); end if;
  if s.status <> 'generated' then return jsonb_build_object('ok', false, 'error', 'This suggestion was already ' || s.status || '.'); end if;
  update public.forge_support_ai_suggestions
  set status = p_decision, decided_by = p_actor_user_id, decided_at = now(),
      final_output = case when p_decision = 'accepted' then left(coalesce(nullif(btrim(p_final_output), ''), s.output_text), 20000) end
  where id = s.id;
  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, detail, visibility, metadata)
  values (s.organization_id, s.ticket_id, p_actor_user_id, 'ai_suggestion_' || p_decision, replace(s.suggestion_type, '_', ' '), 'internal',
          jsonb_build_object('suggestion_id', s.id, 'provider', s.provider));
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', s.organization_id, 'helpdesk.ai_suggestion.' || p_decision,
    'support_ai_suggestion', s.id::text, jsonb_build_object('status', s.status),
    jsonb_build_object('status', p_decision, 'suggestion_type', s.suggestion_type, 'provider', s.provider, 'edited',
                       p_decision = 'accepted' and nullif(btrim(p_final_output), '') is distinct from s.output_text),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.forge_support_decide_ai_suggestion(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.forge_support_decide_ai_suggestion(uuid,uuid,text,text,jsonb) to service_role;

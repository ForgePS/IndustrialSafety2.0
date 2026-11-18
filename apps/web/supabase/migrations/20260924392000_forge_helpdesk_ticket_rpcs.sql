-- FIS-HD-01 / HD-01..HD-03: atomic ticket operations.
-- Server code authorizes first (tenant permission + scope, or Forge platform permission).
-- Every function below re-validates tenant, membership, platform permission and business
-- rules, then writes the domain change, history, timeline event, SLA effect, audit record
-- and notification fan-out in one transaction.

create or replace function public.forge_support_transition_allowed(p_from text, p_to text, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.forge_support_status_transitions
    where from_status = p_from and to_status = p_to and actor_scope = p_scope
  );
$$;
revoke all on function public.forge_support_transition_allowed(text, text, text) from public;
grant execute on function public.forge_support_transition_allowed(text, text, text) to service_role;

create or replace function public.forge_support_status_label(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'new' then 'New' when 'triage' then 'Triage' when 'assigned' then 'Assigned'
    when 'in_progress' then 'In progress' when 'waiting_on_customer' then 'Waiting on you'
    when 'waiting_on_forge' then 'Waiting on Forge' when 'resolved' then 'Resolved'
    when 'closed' then 'Closed' when 'reopened' then 'Reopened' else p_status end
$$;

-- Internal: applies a validated status change. Caller holds the ticket lock and bumps row_version.
create or replace function public.forge_support_set_status_internal(
  p_ticket_id uuid,
  p_to_status text,
  p_actor_user_id uuid,
  p_actor_type text,
  p_reason text,
  p_resolution_summary text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  v_now timestamptz := now();
  v_event text;
  v_title text;
  v_body text;
begin
  select * into t from public.forge_support_tickets where id = p_ticket_id for update;
  if t.status = p_to_status then return; end if;

  update public.forge_support_tickets
  set status = p_to_status,
      resolution_summary = case when p_to_status in ('resolved','closed')
        then coalesce(nullif(btrim(p_resolution_summary), ''), resolution_summary) else resolution_summary end,
      resolved_at = case
        when p_to_status = 'resolved' then v_now
        when p_to_status = 'closed' then coalesce(resolved_at, v_now)
        when p_to_status = 'reopened' then null
        else resolved_at end,
      resolved_by = case
        when p_to_status = 'resolved' then p_actor_user_id
        when p_to_status = 'closed' then coalesce(resolved_by, p_actor_user_id)
        when p_to_status = 'reopened' then null
        else resolved_by end,
      closed_at = case when p_to_status = 'closed' then v_now when p_to_status = 'reopened' then null else closed_at end,
      closed_by = case when p_to_status = 'closed' then p_actor_user_id when p_to_status = 'reopened' then null else closed_by end,
      reopened_at = case when p_to_status = 'reopened' then v_now else reopened_at end,
      reopen_count = case when p_to_status = 'reopened' then reopen_count + 1 else reopen_count end,
      updated_at = v_now
  where id = p_ticket_id;

  insert into public.forge_support_ticket_status_history(organization_id, ticket_id, from_status, to_status, changed_by, actor_type, reason)
  values (t.organization_id, t.id, t.status, p_to_status, p_actor_user_id, p_actor_type, p_reason);

  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, from_value, to_value, detail, visibility)
  values (t.organization_id, t.id, p_actor_user_id,
          case p_to_status when 'reopened' then 'reopened' when 'resolved' then 'resolved' when 'closed' then 'closed' else 'status_changed' end,
          t.status, p_to_status, null, 'public');

  perform public.forge_support_sla_sync(t.id, 'status', v_now, p_to_status);

  v_event := case p_to_status
    when 'waiting_on_customer' then 'waiting_on_customer'
    when 'resolved' then 'ticket_resolved'
    when 'reopened' then 'ticket_reopened'
    else 'status_changed' end;
  v_title := case p_to_status
    when 'waiting_on_customer' then 'Forge needs information on ' || t.ticket_number
    when 'resolved' then t.ticket_number || ' was resolved'
    when 'reopened' then t.ticket_number || ' was reopened'
    else t.ticket_number || ' is now ' || public.forge_support_status_label(p_to_status) end;
  v_body := case when p_to_status = 'resolved'
    then left(coalesce(nullif(btrim(p_resolution_summary), ''), t.resolution_summary, t.subject), 600)
    else t.subject end;

  perform public.forge_support_notify(t.id, v_event, 'customer', p_actor_user_id, v_title, v_body,
    '{}'::uuid[], p_to_status = 'reopened', true, false, false);
end $$;
revoke all on function public.forge_support_set_status_internal(uuid, text, uuid, text, text, text) from public;

-- ---------------------------------------------------------------------------
-- Create ticket
-- ---------------------------------------------------------------------------
create or replace function public.forge_support_create_ticket(
  p_organization_id uuid,
  p_requester_user_id uuid,
  p_payload jsonb,
  p_idempotency_key text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := btrim(coalesce(p_payload->>'subject', ''));
  v_description text := btrim(coalesce(p_payload->>'description', ''));
  v_category_id uuid := nullif(p_payload->>'category_id', '')::uuid;
  v_product_id uuid := nullif(p_payload->>'product_id', '')::uuid;
  v_module_id uuid := nullif(p_payload->>'module_id', '')::uuid;
  v_severity text := nullif(p_payload->>'customer_reported_severity', '');
  v_location_id uuid := nullif(p_payload->>'location_id', '')::uuid;
  v_division_id uuid := nullif(p_payload->>'division_id', '')::uuid;
  v_source text := coalesce(nullif(p_payload->>'source', ''), 'web');
  v_assist_id uuid := nullif(p_payload->>'assist_session_id', '')::uuid;
  v_related_type text := nullif(p_payload->>'related_entity_type', '');
  v_related_id uuid := nullif(p_payload->>'related_entity_id', '')::uuid;
  v_ctx jsonb := coalesce(p_payload->'technical_context', '{}'::jsonb);
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_category public.forge_support_categories%rowtype;
  v_product public.forge_support_products%rowtype;
  v_loc_division uuid;
  v_priority text;
  v_number text;
  v_name text;
  v_email text;
  v_capture boolean;
  v_existing record;
  v_ticket public.forge_support_tickets%rowtype;
begin
  if not exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id and m.user_id = p_requester_user_id
      and m.is_active and o.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'error', 'You are not an active member of this company.');
  end if;

  if v_key is not null then
    select id, ticket_number into v_existing from public.forge_support_tickets
    where organization_id = p_organization_id and requester_user_id = p_requester_user_id and idempotency_key = v_key;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'ticket_id', v_existing.id, 'ticket_number', v_existing.ticket_number);
    end if;
  end if;

  if char_length(v_subject) not between 4 and 160 then
    return jsonb_build_object('ok', false, 'error', 'Subject must be 4 to 160 characters.');
  end if;
  if char_length(v_description) not between 10 and 10000 then
    return jsonb_build_object('ok', false, 'error', 'Description must be 10 to 10,000 characters.');
  end if;

  select id, ticket_number into v_existing from public.forge_support_tickets
  where organization_id = p_organization_id and requester_user_id = p_requester_user_id
    and subject = v_subject and description = v_description and created_at > now() - interval '2 minutes'
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'ticket_id', v_existing.id, 'ticket_number', v_existing.ticket_number);
  end if;

  select * into v_product from public.forge_support_products where id = v_product_id and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Choose an available product.');
  end if;
  select * into v_category from public.forge_support_categories
  where id = v_category_id and is_active and (product_id is null or product_id = v_product.id);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid request type.');
  end if;
  if v_module_id is not null and not exists (
    select 1 from public.forge_support_product_areas where id = v_module_id and product_id = v_product.id and is_active
  ) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid product area.');
  end if;
  if v_severity is not null and v_severity not in ('p1_critical','p2_high','p3_normal','p4_low') then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid severity.');
  end if;
  if v_source not in ('web','mobile','ask_forge') then
    return jsonb_build_object('ok', false, 'error', 'Invalid ticket source.');
  end if;
  if v_location_id is not null then
    select division_id into v_loc_division from public.locations
    where id = v_location_id and organization_id = p_organization_id and is_active;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Location is not part of this company.');
    end if;
  end if;
  if v_division_id is not null then
    if not exists (select 1 from public.divisions where id = v_division_id and organization_id = p_organization_id and is_active) then
      return jsonb_build_object('ok', false, 'error', 'Division is not part of this company.');
    end if;
    if v_location_id is not null and v_loc_division is not null and v_loc_division <> v_division_id then
      return jsonb_build_object('ok', false, 'error', 'Location does not belong to the selected division.');
    end if;
  elsif v_loc_division is not null then
    v_division_id := v_loc_division;
  end if;
  if (v_related_type is null) <> (v_related_id is null) then
    return jsonb_build_object('ok', false, 'error', 'Related record is incomplete.');
  end if;
  if v_assist_id is not null and not exists (
    select 1 from public.forge_support_assist_sessions
    where id = v_assist_id and organization_id = p_organization_id and user_id = p_requester_user_id and ticket_id is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'Ask Forge session is not available for this ticket.');
  end if;

  v_priority := coalesce(v_severity, v_category.default_priority, 'p3_normal');
  select coalesce(nullif(u.name, ''), u.email), u.email into v_name, v_email from public.users u where u.user_id = p_requester_user_id;
  if v_name is null then
    select coalesce(raw_user_meta_data->>'name', email), email into v_name, v_email from auth.users where id = p_requester_user_id;
  end if;

  v_number := public.forge_support_next_number('ticket');

  begin
    insert into public.forge_support_tickets(
      organization_id, ticket_number, subject, description, priority, customer_reported_severity, status,
      requester_user_id, requester_name, requester_email, product_id, module_id, category_id, source,
      location_id, division_id, related_entity_type, related_entity_id, assist_session_id, idempotency_key
    ) values (
      p_organization_id, v_number, v_subject, v_description, v_priority, v_severity, 'new',
      p_requester_user_id, v_name, v_email, v_product.id, v_module_id, v_category.id, v_source,
      v_location_id, v_division_id, v_related_type, v_related_id, v_assist_id, v_key
    ) returning * into v_ticket;
  exception when unique_violation then
    select id, ticket_number into v_existing from public.forge_support_tickets
    where organization_id = p_organization_id and requester_user_id = p_requester_user_id and idempotency_key = v_key;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'ticket_id', v_existing.id, 'ticket_number', v_existing.ticket_number);
    end if;
    raise;
  end;

  select capture_technical_context into v_capture from public.forge_support_settings where id;
  if coalesce(v_capture, true) and v_ctx <> '{}'::jsonb and coalesce((v_ctx->>'captured')::boolean, true) then
    insert into public.forge_support_ticket_technical_context(
      ticket_id, organization_id, captured, user_role, product_key, module_key, route, page_url, browser_name, browser_version,
      os_name, device_type, viewport_width, viewport_height, is_mobile, app_version, build_version, client_timezone,
      client_timestamp, correlation_id, client_error_id, user_agent
    ) values (
      v_ticket.id, p_organization_id, true,
      left(v_ctx->>'user_role', 200), v_product.product_key,
      (select area_key from public.forge_support_product_areas where id = v_module_id),
      left(v_ctx->>'route', 500), left(v_ctx->>'page_url', 1000), left(v_ctx->>'browser_name', 80), left(v_ctx->>'browser_version', 40),
      left(v_ctx->>'os_name', 80),
      case when v_ctx->>'device_type' in ('desktop','tablet','mobile') then v_ctx->>'device_type' else 'unknown' end,
      case when (v_ctx->>'viewport_width') ~ '^[0-9]{1,5}$' then (v_ctx->>'viewport_width')::integer end,
      case when (v_ctx->>'viewport_height') ~ '^[0-9]{1,5}$' then (v_ctx->>'viewport_height')::integer end,
      case when v_ctx->>'is_mobile' in ('true','false') then (v_ctx->>'is_mobile')::boolean end,
      left(v_ctx->>'app_version', 40), left(v_ctx->>'build_version', 80), left(v_ctx->>'client_timezone', 80),
      case when (v_ctx->>'client_timestamp') ~ '^\d{4}-\d{2}-\d{2}T' then (v_ctx->>'client_timestamp')::timestamptz end,
      left(coalesce(v_ctx->>'correlation_id', p_meta->>'request_id'), 120), left(v_ctx->>'client_error_id', 120),
      left(coalesce(p_meta->>'user_agent', v_ctx->>'user_agent'), 400)
    );
  end if;

  insert into public.forge_support_ticket_status_history(organization_id, ticket_id, from_status, to_status, changed_by, actor_type)
  values (p_organization_id, v_ticket.id, null, 'new', p_requester_user_id, 'customer');
  insert into public.forge_support_ticket_priority_history(organization_id, ticket_id, from_priority, to_priority, changed_by, reason)
  values (p_organization_id, v_ticket.id, null, v_priority, p_requester_user_id, 'Initial priority');
  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, visibility)
  values (p_organization_id, v_ticket.id, p_requester_user_id, 'created', 'new', 'public');

  if v_assist_id is not null then
    update public.forge_support_assist_sessions
    set ticket_id = v_ticket.id, outcome = 'not_resolved', updated_at = now()
    where id = v_assist_id;
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, detail, visibility)
    values (p_organization_id, v_ticket.id, p_requester_user_id, 'ask_forge_context', 'Created after Ask Forge did not resolve the question', 'public');
  end if;

  perform public.forge_support_sla_sync(v_ticket.id, 'created', now(), null);

  perform public.forge_support_audit(p_requester_user_id, 'tenant_user', p_organization_id, 'helpdesk.ticket.created',
    'support_ticket', v_ticket.id::text, null,
    jsonb_build_object('ticket_number', v_number, 'priority', v_priority, 'category_id', v_category.id, 'product_id', v_product.id,
                       'module_id', v_module_id, 'source', v_source, 'assist_session_id', v_assist_id),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');

  perform public.forge_support_notify(v_ticket.id, 'ticket_created', 'customer', p_requester_user_id,
    'New ticket ' || v_number || ': ' || v_subject, left(v_description, 300), '{}'::uuid[], true, true, true, false);

  return jsonb_build_object('ok', true, 'duplicate', false, 'ticket_id', v_ticket.id, 'ticket_number', v_number);
end $$;

-- ---------------------------------------------------------------------------
-- Messages: customer reply, support reply, internal note
-- ---------------------------------------------------------------------------
create or replace function public.forge_support_add_message(
  p_ticket_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_message_type text,
  p_body text,
  p_organization_id uuid default null,
  p_mentions uuid[] default '{}'::uuid[],
  p_saved_reply_id uuid default null,
  p_ai_suggestion_id uuid default null,
  p_set_status text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_message_id uuid;
  v_mention uuid;
  v_mentions uuid[] := coalesce(p_mentions, '{}'::uuid[]);
  v_visibility text;
  v_merged_number text;
begin
  if p_actor_type not in ('customer','staff') then
    return jsonb_build_object('ok', false, 'error', 'Invalid actor.');
  end if;
  select * into t from public.forge_support_tickets where id = p_ticket_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ticket not found.');
  end if;
  if char_length(v_body) not between 1 and 10000 then
    return jsonb_build_object('ok', false, 'error', 'Enter a message up to 10,000 characters.');
  end if;

  if p_actor_type = 'customer' then
    if p_organization_id is distinct from t.organization_id then
      return jsonb_build_object('ok', false, 'error', 'Ticket not found.');
    end if;
    if p_message_type <> 'customer_message' then
      return jsonb_build_object('ok', false, 'error', 'Customers can only send customer messages.');
    end if;
    if not exists (select 1 from public.organization_memberships where organization_id = t.organization_id and user_id = p_actor_user_id and is_active) then
      return jsonb_build_object('ok', false, 'error', 'Ticket not found.');
    end if;
    if t.merged_into_ticket_id is not null then
      select ticket_number into v_merged_number from public.forge_support_tickets where id = t.merged_into_ticket_id;
      return jsonb_build_object('ok', false, 'error', 'This ticket was merged into ' || coalesce(v_merged_number, 'another ticket') || '. Reply there instead.');
    end if;
    if t.status in ('resolved','closed') then
      return jsonb_build_object('ok', false, 'error', 'Reopen this ticket before replying.');
    end if;
    v_visibility := 'public';
  else
    if p_message_type = 'support_reply' then
      if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.respond') then
        return jsonb_build_object('ok', false, 'error', 'You do not have permission to reply to customers.');
      end if;
      if t.status = 'closed' then
        return jsonb_build_object('ok', false, 'error', 'Reopen this ticket before replying to the customer.');
      end if;
      v_visibility := 'public';
    elsif p_message_type = 'internal_note' then
      if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.internal_note') then
        return jsonb_build_object('ok', false, 'error', 'You do not have permission to add internal notes.');
      end if;
      v_visibility := 'internal';
    else
      return jsonb_build_object('ok', false, 'error', 'Invalid message type.');
    end if;
  end if;

  if array_length(v_mentions, 1) > 0 then
    if p_message_type <> 'internal_note' then
      return jsonb_build_object('ok', false, 'error', '@mentions are only allowed in internal notes.');
    end if;
    foreach v_mention in array v_mentions loop
      if not public.forge_support_staff_has_permission(v_mention, 'helpdesk.support.view') then
        return jsonb_build_object('ok', false, 'error', 'Only Forge support staff can be mentioned.');
      end if;
    end loop;
  end if;
  if p_saved_reply_id is not null and not exists (select 1 from public.forge_support_saved_replies where id = p_saved_reply_id and is_active) then
    return jsonb_build_object('ok', false, 'error', 'Saved reply is not available.');
  end if;
  if p_ai_suggestion_id is not null and not exists (
    select 1 from public.forge_support_ai_suggestions where id = p_ai_suggestion_id and ticket_id = t.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'AI suggestion does not belong to this ticket.');
  end if;
  if p_set_status is not null then
    if p_actor_type <> 'staff' or p_message_type <> 'support_reply' then
      return jsonb_build_object('ok', false, 'error', 'Only Forge replies can change status.');
    end if;
    if p_set_status not in ('in_progress','waiting_on_customer','waiting_on_forge','resolved') then
      return jsonb_build_object('ok', false, 'error', 'Invalid status for a reply.');
    end if;
    if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.change_status') then
      return jsonb_build_object('ok', false, 'error', 'You do not have permission to change status.');
    end if;
    if p_set_status <> t.status and not public.forge_support_transition_allowed(t.status, p_set_status, 'staff') then
      return jsonb_build_object('ok', false, 'error', 'Cannot move from ' || public.forge_support_status_label(t.status) || ' to ' || public.forge_support_status_label(p_set_status) || '.');
    end if;
  end if;

  insert into public.forge_support_messages(organization_id, ticket_id, author_user_id, author_kind, visibility, message_type, body, saved_reply_id, ai_suggestion_id)
  values (t.organization_id, t.id, p_actor_user_id, case when p_actor_type = 'customer' then 'customer' else 'forge' end,
          v_visibility, p_message_type, v_body, p_saved_reply_id, p_ai_suggestion_id)
  returning id into v_message_id;

  if array_length(v_mentions, 1) > 0 then
    insert into public.forge_support_message_mentions(message_id, organization_id, ticket_id, mentioned_user_id)
    select v_message_id, t.organization_id, t.id, m from (select distinct unnest(v_mentions) as m) x
    on conflict do nothing;
  end if;

  if p_ai_suggestion_id is not null then
    update public.forge_support_ai_suggestions set used_in_message_id = v_message_id where id = p_ai_suggestion_id;
  end if;

  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, visibility, metadata)
  values (t.organization_id, t.id, p_actor_user_id,
          case p_message_type when 'customer_message' then 'customer_reply' when 'support_reply' then 'forge_reply' else 'internal_note' end,
          v_visibility, jsonb_build_object('message_id', v_message_id));

  if p_message_type = 'customer_message' then
    perform public.forge_support_sla_sync(t.id, 'customer_reply', now(), null);
    if t.status = 'waiting_on_customer' then
      perform public.forge_support_set_status_internal(t.id, 'waiting_on_forge', p_actor_user_id, 'system', 'Customer replied', null);
    end if;
    perform public.forge_support_notify(t.id, 'customer_reply', 'customer', p_actor_user_id,
      'New reply on ' || t.ticket_number, left(v_body, 300), '{}'::uuid[], t.assigned_user_id is null, true, false, false);
  elsif p_message_type = 'support_reply' then
    if t.first_responded_at is null then
      update public.forge_support_tickets set first_responded_at = now() where id = t.id;
    end if;
    perform public.forge_support_sla_sync(t.id, 'support_public_reply', now(), null);
    perform public.forge_support_notify(t.id, 'forge_reply', 'customer', p_actor_user_id,
      'Forge Support replied on ' || t.ticket_number, left(v_body, 300), '{}'::uuid[], false, true, false, false);
    if p_set_status is not null and p_set_status <> t.status then
      perform public.forge_support_set_status_internal(t.id, p_set_status, p_actor_user_id, 'staff', 'Set with reply',
        case when p_set_status = 'resolved' then coalesce(t.resolution_summary, left(v_body, 4000)) end);
    end if;
  elsif array_length(v_mentions, 1) > 0 then
    perform public.forge_support_notify(t.id, 'mention', 'internal', p_actor_user_id,
      'You were mentioned on ' || t.ticket_number, left(v_body, 300), v_mentions, false, false, false, true);
  end if;

  update public.forge_support_tickets set updated_at = now(), row_version = row_version + 1 where id = t.id;

  perform public.forge_support_audit(p_actor_user_id, case when p_actor_type = 'customer' then 'tenant_user' else 'forge_staff' end,
    t.organization_id, 'helpdesk.message.' || p_message_type, 'support_ticket', t.id::text, null,
    jsonb_build_object('message_id', v_message_id, 'message_type', p_message_type, 'visibility', v_visibility,
                       'mentions', coalesce(array_length(v_mentions, 1), 0), 'saved_reply_id', p_saved_reply_id,
                       'ai_suggestion_id', p_ai_suggestion_id, 'set_status', p_set_status),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');

  return jsonb_build_object('ok', true, 'message_id', v_message_id,
    'row_version', (select row_version from public.forge_support_tickets where id = t.id),
    'status', (select status from public.forge_support_tickets where id = t.id));
end $$;

-- ---------------------------------------------------------------------------
-- Ticket changes: status, priority, assignment, team, disposition, triage fields, escalation
-- ---------------------------------------------------------------------------
create or replace function public.forge_support_apply_ticket_change(
  p_ticket_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_changes jsonb,
  p_expected_row_version bigint default null,
  p_organization_id uuid default null,
  p_reason text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  a public.forge_support_tickets%rowtype;
  v_changes jsonb := coalesce(p_changes, '{}'::jsonb);
  v_key text;
  v_status text;
  v_priority text;
  v_assignee uuid;
  v_team uuid;
  v_disposition text;
  v_module uuid;
  v_category uuid;
  v_summary text;
  v_settings public.forge_support_settings%rowtype;
  v_changed boolean := false;
  v_merged_number text;
  v_reference timestamptz;
begin
  if p_actor_type not in ('customer','staff') then
    return jsonb_build_object('ok', false, 'error', 'Invalid actor.');
  end if;
  for v_key in select jsonb_object_keys(v_changes) loop
    if v_key not in ('status','priority','assigned_user_id','assigned_team_id','disposition','module_id','category_id','resolution_summary','fix_version','escalate') then
      return jsonb_build_object('ok', false, 'error', 'Unsupported change: ' || v_key);
    end if;
  end loop;

  select * into t from public.forge_support_tickets where id = p_ticket_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Ticket not found.');
  end if;
  if p_expected_row_version is not null and p_expected_row_version <> t.row_version then
    return jsonb_build_object('ok', false, 'conflict', true, 'error', 'This ticket changed after you opened it. Refresh and try again.', 'row_version', t.row_version);
  end if;
  select * into v_settings from public.forge_support_settings where id;

  v_status := coalesce(nullif(v_changes->>'status', ''), t.status);
  v_summary := coalesce(nullif(btrim(v_changes->>'resolution_summary'), ''), t.resolution_summary);

  if p_actor_type = 'customer' then
    if p_organization_id is distinct from t.organization_id
       or not exists (select 1 from public.organization_memberships where organization_id = t.organization_id and user_id = p_actor_user_id and is_active) then
      return jsonb_build_object('ok', false, 'error', 'Ticket not found.');
    end if;
    if exists (select 1 from jsonb_object_keys(v_changes) k where k not in ('status','resolution_summary')) then
      return jsonb_build_object('ok', false, 'error', 'Customers can only reopen or close tickets.');
    end if;
    if v_status not in ('reopened','closed') or v_status = t.status then
      return jsonb_build_object('ok', false, 'error', 'Customers can only reopen or close tickets.');
    end if;
    if not public.forge_support_transition_allowed(t.status, v_status, 'customer') then
      return jsonb_build_object('ok', false, 'error', 'This ticket cannot be ' || case when v_status = 'closed' then 'closed' else 'reopened' end || ' right now.');
    end if;
    if t.merged_into_ticket_id is not null then
      select ticket_number into v_merged_number from public.forge_support_tickets where id = t.merged_into_ticket_id;
      return jsonb_build_object('ok', false, 'error', 'This ticket was merged into ' || coalesce(v_merged_number, 'another ticket') || '.');
    end if;
    if v_status = 'reopened' then
      v_reference := coalesce(t.closed_at, t.resolved_at);
      if v_reference is not null and v_reference < now() - make_interval(days => v_settings.reopen_window_days) then
        return jsonb_build_object('ok', false, 'error', 'This ticket was closed more than ' || v_settings.reopen_window_days || ' days ago. Submit a new ticket and reference ' || t.ticket_number || '.');
      end if;
    end if;
    if v_status = 'closed' and not v_settings.allow_customer_close then
      return jsonb_build_object('ok', false, 'error', 'Customer closure is disabled. Ask Forge Support to close this ticket.');
    end if;
    perform public.forge_support_set_status_internal(t.id, v_status, p_actor_user_id, 'customer', p_reason,
      case when v_status = 'closed' then coalesce(t.resolution_summary, 'Closed by requester.') end);
    update public.forge_support_tickets set row_version = row_version + 1, updated_at = now() where id = t.id returning * into a;
    perform public.forge_support_audit(p_actor_user_id, 'tenant_user', t.organization_id,
      case when v_status = 'closed' then 'helpdesk.ticket.closed' else 'helpdesk.ticket.reopened' end,
      'support_ticket', t.id::text, jsonb_build_object('status', t.status), jsonb_build_object('status', v_status),
      p_reason, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
    return jsonb_build_object('ok', true, 'ticket_id', t.id, 'status', a.status, 'row_version', a.row_version);
  end if;

  -- Forge staff: every key requires its platform permission.
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.view') then
    return jsonb_build_object('ok', false, 'error', 'Access denied.');
  end if;
  if (v_changes ? 'status' or v_changes ? 'disposition' or v_changes ? 'module_id' or v_changes ? 'category_id' or v_changes ? 'resolution_summary')
     and not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.change_status') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to change status or triage fields.');
  end if;
  if v_changes ? 'priority' and not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.change_priority') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to change priority.');
  end if;
  if (v_changes ? 'assigned_user_id' or v_changes ? 'assigned_team_id')
     and not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.assign') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to assign tickets.');
  end if;
  if v_changes ? 'fix_version' and not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.link_development') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to set release versions.');
  end if;
  if coalesce((v_changes->>'escalate')::boolean, false) and not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.escalate') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to escalate tickets.');
  end if;
  if t.merged_into_ticket_id is not null and (v_changes ? 'status') then
    return jsonb_build_object('ok', false, 'error', 'Merged tickets stay closed. Work on the primary ticket instead.');
  end if;

  if v_status <> t.status then
    if not public.forge_support_transition_allowed(t.status, v_status, 'staff') then
      return jsonb_build_object('ok', false, 'error', 'Cannot move from ' || public.forge_support_status_label(t.status) || ' to ' || public.forge_support_status_label(v_status) || '.');
    end if;
    if v_status in ('resolved','closed') and v_summary is null then
      return jsonb_build_object('ok', false, 'error', 'A resolution summary is required to resolve or close a ticket.');
    end if;
  end if;

  v_priority := coalesce(nullif(v_changes->>'priority', ''), t.priority);
  if v_priority not in ('p1_critical','p2_high','p3_normal','p4_low') then
    return jsonb_build_object('ok', false, 'error', 'Invalid priority.');
  end if;

  v_assignee := case when v_changes ? 'assigned_user_id' then nullif(v_changes->>'assigned_user_id', '')::uuid else t.assigned_user_id end;
  if v_assignee is not null and v_assignee is distinct from t.assigned_user_id
     and not public.forge_support_staff_has_permission(v_assignee, 'helpdesk.support.respond') then
    return jsonb_build_object('ok', false, 'error', 'Assignee must be an active Forge support team member.');
  end if;
  v_team := case when v_changes ? 'assigned_team_id' then nullif(v_changes->>'assigned_team_id', '')::uuid else t.assigned_team_id end;
  if v_team is not null and v_team is distinct from t.assigned_team_id
     and not exists (select 1 from public.forge_support_teams where id = v_team and is_active) then
    return jsonb_build_object('ok', false, 'error', 'Choose an active support team.');
  end if;
  if v_team is not null and v_assignee is not null
     and (v_team is distinct from t.assigned_team_id or v_assignee is distinct from t.assigned_user_id)
     and not exists (select 1 from public.forge_support_team_members where team_id = v_team and user_id = v_assignee) then
    return jsonb_build_object('ok', false, 'error', 'The assignee is not a member of the selected team.');
  end if;

  v_disposition := case when v_changes ? 'disposition' then nullif(v_changes->>'disposition', '') else t.disposition end;
  if v_disposition is not null and v_disposition not in ('duplicate','known_issue','feature_request','cannot_reproduce','configuration_issue','training_issue','third_party_issue','bug_confirmed','working_as_designed') then
    return jsonb_build_object('ok', false, 'error', 'Invalid disposition.');
  end if;
  if v_disposition = 'duplicate' and t.merged_into_ticket_id is null and v_disposition is distinct from t.disposition then
    return jsonb_build_object('ok', false, 'error', 'Use Merge to mark a ticket as a duplicate.');
  end if;

  v_module := case when v_changes ? 'module_id' then nullif(v_changes->>'module_id', '')::uuid else t.module_id end;
  if v_module is not null and v_module is distinct from t.module_id
     and not exists (select 1 from public.forge_support_product_areas where id = v_module and product_id = t.product_id and is_active) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid product area.');
  end if;
  v_category := case when v_changes ? 'category_id' then nullif(v_changes->>'category_id', '')::uuid else t.category_id end;
  if v_category is null or (v_category is distinct from t.category_id
     and not exists (select 1 from public.forge_support_categories where id = v_category and is_active and (product_id is null or product_id = t.product_id))) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid request type.');
  end if;

  update public.forge_support_tickets
  set priority = v_priority,
      assigned_user_id = v_assignee,
      assigned_team_id = v_team,
      disposition = v_disposition,
      module_id = v_module,
      category_id = v_category,
      resolution_summary = v_summary,
      fix_version = case when v_changes ? 'fix_version' then nullif(left(btrim(v_changes->>'fix_version'), 80), '') else fix_version end,
      escalation_level = case when coalesce((v_changes->>'escalate')::boolean, false) then escalation_level + 1 else escalation_level end,
      escalated_at = case when coalesce((v_changes->>'escalate')::boolean, false) then now() else escalated_at end,
      updated_at = now()
  where id = t.id
  returning * into a;

  if a.priority is distinct from t.priority then
    v_changed := true;
    insert into public.forge_support_ticket_priority_history(organization_id, ticket_id, from_priority, to_priority, changed_by, reason)
    values (t.organization_id, t.id, t.priority, a.priority, p_actor_user_id, p_reason);
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, from_value, to_value, visibility)
    values (t.organization_id, t.id, p_actor_user_id, 'priority_changed', t.priority, a.priority, 'internal');
    perform public.forge_support_sla_sync(t.id, 'priority', now(), null);
    perform public.forge_support_notify(t.id, 'priority_changed', 'internal', p_actor_user_id,
      t.ticket_number || ' priority is now ' || upper(left(a.priority, 2)), t.subject, '{}'::uuid[], false, false, false, false);
  end if;

  if a.assigned_user_id is distinct from t.assigned_user_id or a.assigned_team_id is distinct from t.assigned_team_id then
    v_changed := true;
    insert into public.forge_support_ticket_assignments(organization_id, ticket_id, from_user_id, to_user_id, from_team_id, to_team_id, assigned_by, reason)
    values (t.organization_id, t.id, t.assigned_user_id, a.assigned_user_id, t.assigned_team_id, a.assigned_team_id, p_actor_user_id, p_reason);
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, from_value, to_value, visibility, metadata)
    values (t.organization_id, t.id, p_actor_user_id,
            case when a.assigned_user_id is null and t.assigned_user_id is not null then 'unassigned' else 'assignment_changed' end,
            t.assigned_user_id::text, a.assigned_user_id::text, 'internal',
            jsonb_build_object('from_team_id', t.assigned_team_id, 'to_team_id', a.assigned_team_id));
    if a.assigned_user_id is not null and a.assigned_user_id is distinct from t.assigned_user_id then
      perform public.forge_support_notify(t.id, case when t.assigned_user_id is null then 'ticket_assigned' else 'ticket_reassigned' end,
        'internal', p_actor_user_id, t.ticket_number || ' was assigned to you', t.subject,
        array[a.assigned_user_id], false, false, false, true);
    end if;
    if t.assigned_user_id is not null and a.assigned_user_id is distinct from t.assigned_user_id then
      perform public.forge_support_notify(t.id, 'ticket_reassigned', 'internal', p_actor_user_id,
        t.ticket_number || ' was reassigned', t.subject, array[t.assigned_user_id], false, false, false, true);
    end if;
    if a.assigned_user_id is not null and not (v_changes ? 'status') and t.status in ('new','triage','reopened') then
      v_status := 'assigned';
    end if;
  end if;

  if a.disposition is distinct from t.disposition then
    v_changed := true;
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, from_value, to_value, visibility)
    values (t.organization_id, t.id, p_actor_user_id, 'disposition_changed', t.disposition, a.disposition, 'internal');
  end if;
  if a.module_id is distinct from t.module_id or a.category_id is distinct from t.category_id then
    v_changed := true;
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, detail, visibility)
    values (t.organization_id, t.id, p_actor_user_id, 'triage_updated', 'Request type or product area updated', 'internal');
  end if;
  if a.fix_version is distinct from t.fix_version then
    v_changed := true;
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, from_value, to_value, visibility)
    values (t.organization_id, t.id, p_actor_user_id, 'fix_version_changed', t.fix_version, a.fix_version, 'internal');
  end if;
  if a.escalation_level > t.escalation_level then
    v_changed := true;
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, detail, visibility)
    values (t.organization_id, t.id, p_actor_user_id, 'escalated', a.escalation_level::text, p_reason, 'internal');
    perform public.forge_support_notify(t.id, 'ticket_escalated', 'internal', p_actor_user_id,
      t.ticket_number || ' was escalated (level ' || a.escalation_level || ')', coalesce(p_reason, t.subject), '{}'::uuid[], true, false, false, false);
  end if;
  if a.resolution_summary is distinct from t.resolution_summary then
    v_changed := true;
  end if;

  if v_status <> t.status then
    if not public.forge_support_transition_allowed(t.status, v_status, 'staff') then
      raise exception 'Invalid status transition % -> %', t.status, v_status;
    end if;
    v_changed := true;
    perform public.forge_support_set_status_internal(t.id, v_status, p_actor_user_id, 'staff', p_reason, v_summary);
  end if;

  if not v_changed then
    return jsonb_build_object('ok', true, 'unchanged', true, 'ticket_id', t.id, 'row_version', t.row_version, 'status', t.status);
  end if;

  update public.forge_support_tickets set row_version = row_version + 1, updated_at = now() where id = t.id returning * into a;

  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', t.organization_id, 'helpdesk.ticket.updated',
    'support_ticket', t.id::text,
    jsonb_build_object('status', t.status, 'priority', t.priority, 'assigned_user_id', t.assigned_user_id, 'assigned_team_id', t.assigned_team_id,
                       'disposition', t.disposition, 'module_id', t.module_id, 'category_id', t.category_id, 'fix_version', t.fix_version,
                       'escalation_level', t.escalation_level, 'row_version', t.row_version),
    jsonb_build_object('status', a.status, 'priority', a.priority, 'assigned_user_id', a.assigned_user_id, 'assigned_team_id', a.assigned_team_id,
                       'disposition', a.disposition, 'module_id', a.module_id, 'category_id', a.category_id, 'fix_version', a.fix_version,
                       'escalation_level', a.escalation_level, 'row_version', a.row_version),
    p_reason, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');

  return jsonb_build_object('ok', true, 'ticket_id', t.id, 'status', a.status, 'priority', a.priority, 'row_version', a.row_version);
end $$;

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
create or replace function public.forge_support_set_ticket_tags(
  p_ticket_id uuid,
  p_actor_user_id uuid,
  p_add uuid[] default '{}'::uuid[],
  p_remove uuid[] default '{}'::uuid[],
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  v_added text[];
  v_removed text[];
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.change_status') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to tag tickets.');
  end if;
  select * into t from public.forge_support_tickets where id = p_ticket_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Ticket not found.'); end if;
  if exists (
    select 1 from public.forge_support_tags g where g.id = any(coalesce(p_add, '{}'::uuid[]))
      and (not g.is_active or (g.organization_id is not null and g.organization_id <> t.organization_id))
  ) or (select count(*) from public.forge_support_tags g where g.id = any(coalesce(p_add, '{}'::uuid[]))) <> coalesce(array_length(array(select distinct unnest(coalesce(p_add, '{}'::uuid[]))), 1), 0) then
    return jsonb_build_object('ok', false, 'error', 'One or more tags are not available for this ticket.');
  end if;

  with ins as (
    insert into public.forge_support_ticket_tags(organization_id, ticket_id, tag_id, added_by)
    select t.organization_id, t.id, x.g, p_actor_user_id from (select distinct unnest(coalesce(p_add, '{}'::uuid[])) g) x
    on conflict (ticket_id, tag_id) do nothing
    returning tag_id
  )
  select array_agg(g.label order by g.label) into v_added from ins join public.forge_support_tags g on g.id = ins.tag_id;

  with del as (
    delete from public.forge_support_ticket_tags where ticket_id = t.id and tag_id = any(coalesce(p_remove, '{}'::uuid[]))
    returning tag_id
  )
  select array_agg(g.label order by g.label) into v_removed from del join public.forge_support_tags g on g.id = del.tag_id;

  if v_added is not null then
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, detail, visibility)
    values (t.organization_id, t.id, p_actor_user_id, 'tag_added', array_to_string(v_added, ', '), 'internal');
  end if;
  if v_removed is not null then
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, detail, visibility)
    values (t.organization_id, t.id, p_actor_user_id, 'tag_removed', array_to_string(v_removed, ', '), 'internal');
  end if;
  if v_added is null and v_removed is null then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;
  update public.forge_support_tickets set updated_at = now(), row_version = row_version + 1 where id = t.id;
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', t.organization_id, 'helpdesk.ticket.tags_changed',
    'support_ticket', t.id::text, null, jsonb_build_object('added', v_added, 'removed', v_removed),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'added', coalesce(to_jsonb(v_added), '[]'::jsonb), 'removed', coalesce(to_jsonb(v_removed), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Watchers
-- ---------------------------------------------------------------------------
create or replace function public.forge_support_set_watcher(
  p_ticket_id uuid,
  p_actor_user_id uuid,
  p_user_id uuid,
  p_watch boolean,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  v_type text;
  v_rows integer;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.manage_watchers') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to manage watchers.');
  end if;
  select * into t from public.forge_support_tickets where id = p_ticket_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Ticket not found.'); end if;

  if p_watch then
    if public.forge_support_staff_has_permission(p_user_id, 'helpdesk.support.view') then
      v_type := 'internal';
    elsif exists (select 1 from public.organization_memberships where organization_id = t.organization_id and user_id = p_user_id and is_active) then
      v_type := 'customer';
    else
      return jsonb_build_object('ok', false, 'error', 'Watchers must be Forge support staff or active users in this company.');
    end if;
    insert into public.forge_support_ticket_watchers(organization_id, ticket_id, user_id, watcher_type, added_by)
    values (t.organization_id, t.id, p_user_id, v_type, p_actor_user_id)
    on conflict (ticket_id, user_id) do nothing;
  else
    delete from public.forge_support_ticket_watchers where ticket_id = t.id and user_id = p_user_id;
  end if;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return jsonb_build_object('ok', true, 'unchanged', true); end if;

  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, visibility)
  values (t.organization_id, t.id, p_actor_user_id, case when p_watch then 'watcher_added' else 'watcher_removed' end, p_user_id::text, 'internal');
  update public.forge_support_tickets set updated_at = now(), row_version = row_version + 1 where id = t.id;
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', t.organization_id,
    case when p_watch then 'helpdesk.ticket.watcher_added' else 'helpdesk.ticket.watcher_removed' end,
    'support_ticket', t.id::text, null, jsonb_build_object('user_id', p_user_id, 'watcher_type', v_type),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'watcher_type', v_type);
end $$;

-- ---------------------------------------------------------------------------
-- Relations (same tenant only) and merge
-- ---------------------------------------------------------------------------
create or replace function public.forge_support_link_tickets(
  p_source_ticket_id uuid,
  p_target_ticket_id uuid,
  p_relation_type text,
  p_actor_user_id uuid,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.forge_support_tickets%rowtype;
  g public.forge_support_tickets%rowtype;
  v_id uuid;
begin
  if p_relation_type not in ('related','parent_of') then
    return jsonb_build_object('ok', false, 'error', 'Use Merge to record duplicates.');
  end if;
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.change_status') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to link tickets.');
  end if;
  if p_source_ticket_id = p_target_ticket_id then
    return jsonb_build_object('ok', false, 'error', 'A ticket cannot be linked to itself.');
  end if;
  select * into s from public.forge_support_tickets where id = p_source_ticket_id;
  select * into g from public.forge_support_tickets where id = p_target_ticket_id;
  if s.id is null or g.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ticket not found.');
  end if;
  if s.organization_id <> g.organization_id then
    return jsonb_build_object('ok', false, 'error', 'Tickets can only be linked within the same customer tenant. Use a platform incident for cross-tenant issues.');
  end if;
  if p_relation_type = 'parent_of' then
    if exists (select 1 from public.forge_support_ticket_relations where target_ticket_id = g.id and relation_type = 'parent_of' and archived_at is null) then
      return jsonb_build_object('ok', false, 'error', g.ticket_number || ' already has a parent ticket.');
    end if;
    if exists (
      with recursive ancestors(id) as (
        select source_ticket_id from public.forge_support_ticket_relations
        where target_ticket_id = s.id and relation_type = 'parent_of' and archived_at is null
        union
        select r.source_ticket_id from public.forge_support_ticket_relations r
        join ancestors a on r.target_ticket_id = a.id
        where r.relation_type = 'parent_of' and r.archived_at is null
      ) select 1 from ancestors where id = g.id
    ) then
      return jsonb_build_object('ok', false, 'error', 'That link would create a parent/child cycle.');
    end if;
  end if;
  if exists (
    select 1 from public.forge_support_ticket_relations
    where archived_at is null and relation_type = p_relation_type
      and ((source_ticket_id = s.id and target_ticket_id = g.id) or (p_relation_type = 'related' and source_ticket_id = g.id and target_ticket_id = s.id))
  ) then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  insert into public.forge_support_ticket_relations(organization_id, source_ticket_id, target_ticket_id, relation_type, created_by)
  values (s.organization_id, s.id, g.id, p_relation_type, p_actor_user_id)
  returning id into v_id;

  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, detail, visibility)
  values (s.organization_id, s.id, p_actor_user_id, 'ticket_linked', g.ticket_number,
          case p_relation_type when 'parent_of' then 'Parent of ' else 'Related to ' end || g.ticket_number, 'internal'),
         (s.organization_id, g.id, p_actor_user_id, 'ticket_linked', s.ticket_number,
          case p_relation_type when 'parent_of' then 'Child of ' else 'Related to ' end || s.ticket_number, 'internal');
  update public.forge_support_tickets set updated_at = now(), row_version = row_version + 1 where id in (s.id, g.id);
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', s.organization_id, 'helpdesk.ticket.linked',
    'support_ticket', s.id::text, null, jsonb_build_object('relation_id', v_id, 'relation_type', p_relation_type, 'target_ticket_id', g.id),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'relation_id', v_id);
end $$;

create or replace function public.forge_support_unlink_tickets(
  p_relation_id uuid,
  p_actor_user_id uuid,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.forge_support_ticket_relations%rowtype;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.change_status') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to unlink tickets.');
  end if;
  select * into r from public.forge_support_ticket_relations where id = p_relation_id and archived_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Link not found.'); end if;
  if r.relation_type = 'duplicate_of' then
    return jsonb_build_object('ok', false, 'error', 'Merge links are permanent and preserve the audit trail.');
  end if;
  update public.forge_support_ticket_relations set archived_at = now(), archived_by = p_actor_user_id where id = r.id;
  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, detail, visibility)
  values (r.organization_id, r.source_ticket_id, p_actor_user_id, 'ticket_unlinked', r.relation_type, 'internal'),
         (r.organization_id, r.target_ticket_id, p_actor_user_id, 'ticket_unlinked', r.relation_type, 'internal');
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', r.organization_id, 'helpdesk.ticket.unlinked',
    'support_ticket', r.source_ticket_id::text, jsonb_build_object('relation_id', r.id, 'relation_type', r.relation_type, 'target_ticket_id', r.target_ticket_id), null,
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.forge_support_merge_tickets(
  p_duplicate_ticket_id uuid,
  p_canonical_ticket_id uuid,
  p_actor_user_id uuid,
  p_reason text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.forge_support_tickets%rowtype;
  c public.forge_support_tickets%rowtype;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.merge') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to merge tickets.');
  end if;
  if p_duplicate_ticket_id = p_canonical_ticket_id then
    return jsonb_build_object('ok', false, 'error', 'A ticket cannot be merged into itself.');
  end if;
  -- Lock both rows in a stable order.
  perform 1 from public.forge_support_tickets where id in (p_duplicate_ticket_id, p_canonical_ticket_id) order by id for update;
  select * into d from public.forge_support_tickets where id = p_duplicate_ticket_id;
  select * into c from public.forge_support_tickets where id = p_canonical_ticket_id;
  if d.id is null or c.id is null then
    return jsonb_build_object('ok', false, 'error', 'Ticket not found.');
  end if;
  if d.organization_id <> c.organization_id then
    return jsonb_build_object('ok', false, 'error', 'Only tickets from the same customer tenant can be merged.');
  end if;
  if d.merged_into_ticket_id is not null then
    return jsonb_build_object('ok', false, 'error', d.ticket_number || ' is already merged.');
  end if;
  if c.merged_into_ticket_id is not null then
    return jsonb_build_object('ok', false, 'error', c.ticket_number || ' is itself merged. Merge into its primary ticket instead.');
  end if;
  if c.status = 'closed' then
    return jsonb_build_object('ok', false, 'error', 'Reopen ' || c.ticket_number || ' before merging into it.');
  end if;

  insert into public.forge_support_ticket_relations(organization_id, source_ticket_id, target_ticket_id, relation_type, created_by)
  values (d.organization_id, d.id, c.id, 'duplicate_of', p_actor_user_id)
  on conflict do nothing;

  update public.forge_support_tickets
  set merged_into_ticket_id = c.id,
      disposition = 'duplicate',
      resolution_summary = coalesce(resolution_summary, 'Merged into ' || c.ticket_number || '.'),
      updated_at = now()
  where id = d.id;
  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, from_value, to_value, visibility)
  values (d.organization_id, d.id, p_actor_user_id, 'disposition_changed', d.disposition, 'duplicate', 'internal');

  if d.status <> 'closed' then
    perform public.forge_support_set_status_internal(d.id, 'closed', p_actor_user_id, 'system', 'Merged into ' || c.ticket_number,
      'Merged into ' || c.ticket_number || '.');
  end if;

  insert into public.forge_support_messages(organization_id, ticket_id, author_user_id, author_kind, visibility, message_type, body, source_ticket_id)
  values (d.organization_id, d.id, p_actor_user_id, 'system', 'public', 'system_event',
          'This request was merged into ' || c.ticket_number || '. Follow ' || c.ticket_number || ' for updates.', c.id);
  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, visibility, metadata)
  values (d.organization_id, d.id, p_actor_user_id, 'merged_into', c.ticket_number, 'public', jsonb_build_object('canonical_ticket_id', c.id)),
         (c.organization_id, c.id, p_actor_user_id, 'merged_from', d.ticket_number, 'internal', jsonb_build_object('duplicate_ticket_id', d.id));

  insert into public.forge_support_ticket_watchers(organization_id, ticket_id, user_id, watcher_type, added_by)
  select c.organization_id, c.id, w.user_id, w.watcher_type, p_actor_user_id
  from public.forge_support_ticket_watchers w where w.ticket_id = d.id and w.user_id <> c.requester_user_id
  on conflict do nothing;
  if d.requester_user_id <> c.requester_user_id then
    insert into public.forge_support_ticket_watchers(organization_id, ticket_id, user_id, watcher_type, added_by)
    values (c.organization_id, c.id, d.requester_user_id, 'customer', p_actor_user_id)
    on conflict do nothing;
  end if;

  update public.forge_support_tickets set row_version = row_version + 1, updated_at = now() where id in (d.id, c.id);

  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', d.organization_id, 'helpdesk.ticket.merged',
    'support_ticket', d.id::text, jsonb_build_object('status', d.status, 'disposition', d.disposition),
    jsonb_build_object('merged_into_ticket_id', c.id, 'canonical_ticket_number', c.ticket_number), p_reason,
    p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', c.organization_id, 'helpdesk.ticket.merge_received',
    'support_ticket', c.id::text, null, jsonb_build_object('duplicate_ticket_id', d.id, 'duplicate_ticket_number', d.ticket_number), p_reason,
    p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');

  perform public.forge_support_notify(d.id, 'ticket_merged', 'customer', p_actor_user_id,
    d.ticket_number || ' was merged into ' || c.ticket_number, 'Follow ' || c.ticket_number || ' for updates.', '{}'::uuid[], false, true, false, false);

  return jsonb_build_object('ok', true, 'duplicate_ticket_id', d.id, 'canonical_ticket_id', c.id);
end $$;

-- ---------------------------------------------------------------------------
-- Attachments (storage object uploaded by the server route first)
-- ---------------------------------------------------------------------------
create or replace function public.forge_support_record_attachment(
  p_ticket_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_organization_id uuid,
  p_attachment jsonb,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  v_visibility text := coalesce(p_attachment->>'visibility', 'public');
  v_path text := p_attachment->>'storage_path';
  v_id uuid := (p_attachment->>'id')::uuid;
  v_scan text := coalesce(p_attachment->>'scan_status', 'not_scanned');
begin
  select * into t from public.forge_support_tickets where id = p_ticket_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Ticket not found.'); end if;
  if v_visibility not in ('public','internal') then
    return jsonb_build_object('ok', false, 'error', 'Invalid attachment visibility.');
  end if;
  if v_path is null or v_path not like (t.organization_id::text || '/' || t.id::text || '/%') then
    return jsonb_build_object('ok', false, 'error', 'Attachment storage path is not scoped to this ticket.');
  end if;
  if v_scan = 'blocked' then
    return jsonb_build_object('ok', false, 'error', 'Attachment was blocked by the file scanner.');
  end if;

  if p_actor_type = 'customer' then
    if p_organization_id is distinct from t.organization_id
       or not exists (select 1 from public.organization_memberships where organization_id = t.organization_id and user_id = p_actor_user_id and is_active) then
      return jsonb_build_object('ok', false, 'error', 'Ticket not found.');
    end if;
    if v_visibility <> 'public' then
      return jsonb_build_object('ok', false, 'error', 'Access denied.');
    end if;
    if t.status in ('resolved','closed') then
      return jsonb_build_object('ok', false, 'error', 'Reopen this ticket before attaching files.');
    end if;
  elsif p_actor_type = 'staff' then
    if not public.forge_support_staff_has_permission(p_actor_user_id,
         case when v_visibility = 'internal' then 'helpdesk.support.internal_note' else 'helpdesk.support.respond' end) then
      return jsonb_build_object('ok', false, 'error', 'Access denied.');
    end if;
    if t.status = 'closed' then
      return jsonb_build_object('ok', false, 'error', 'Reopen this ticket before attaching files.');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'Invalid actor.');
  end if;

  insert into public.forge_support_attachments(id, organization_id, ticket_id, uploaded_by, visibility, storage_path, file_name, original_file_name,
    mime_type, byte_size, sha256, scan_status, scan_provider, scan_detail, scanned_at, message_id)
  values (v_id, t.organization_id, t.id, p_actor_user_id, v_visibility, v_path,
    left(p_attachment->>'file_name', 255), left(coalesce(p_attachment->>'original_file_name', p_attachment->>'file_name'), 255),
    p_attachment->>'mime_type', (p_attachment->>'byte_size')::integer, p_attachment->>'sha256', v_scan,
    p_attachment->>'scan_provider', left(p_attachment->>'scan_detail', 500),
    case when v_scan in ('clean','blocked') then now() end,
    nullif(p_attachment->>'message_id', '')::uuid);

  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, detail, visibility, metadata)
  values (t.organization_id, t.id, p_actor_user_id, case when v_visibility = 'internal' then 'internal_attachment' else 'attachment_added' end,
          left(p_attachment->>'file_name', 255), v_visibility, jsonb_build_object('attachment_id', v_id));
  update public.forge_support_tickets set updated_at = now(), row_version = row_version + 1 where id = t.id;
  perform public.forge_support_audit(p_actor_user_id, case when p_actor_type = 'customer' then 'tenant_user' else 'forge_staff' end,
    t.organization_id, 'helpdesk.attachment.added', 'support_attachment', v_id::text, null,
    jsonb_build_object('ticket_id', t.id, 'visibility', v_visibility, 'mime_type', p_attachment->>'mime_type',
                       'byte_size', (p_attachment->>'byte_size')::integer, 'scan_status', v_scan, 'sha256', p_attachment->>'sha256'),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'attachment_id', v_id);
end $$;

create or replace function public.forge_support_remove_attachment(
  p_attachment_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_organization_id uuid,
  p_reason text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.forge_support_attachments%rowtype;
  t public.forge_support_tickets%rowtype;
begin
  select * into f from public.forge_support_attachments where id = p_attachment_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Attachment not found.'); end if;
  select * into t from public.forge_support_tickets where id = f.ticket_id for update;
  if p_actor_type = 'customer' then
    if p_organization_id is distinct from f.organization_id or f.uploaded_by <> p_actor_user_id or f.visibility <> 'public' then
      return jsonb_build_object('ok', false, 'error', 'You can only remove files you uploaded.');
    end if;
    if t.status in ('resolved','closed') then
      return jsonb_build_object('ok', false, 'error', 'Reopen this ticket before removing files.');
    end if;
  elsif not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.respond') then
    return jsonb_build_object('ok', false, 'error', 'Access denied.');
  end if;

  update public.forge_support_attachments set deleted_at = now(), deleted_by = p_actor_user_id where id = f.id;
  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, detail, visibility, metadata)
  values (f.organization_id, f.ticket_id, p_actor_user_id, 'attachment_removed', f.file_name, f.visibility, jsonb_build_object('attachment_id', f.id));
  update public.forge_support_tickets set updated_at = now(), row_version = row_version + 1 where id = f.ticket_id;
  perform public.forge_support_audit(p_actor_user_id, case when p_actor_type = 'customer' then 'tenant_user' else 'forge_staff' end,
    f.organization_id, 'helpdesk.attachment.removed', 'support_attachment', f.id::text,
    jsonb_build_object('file_name', f.file_name, 'visibility', f.visibility), jsonb_build_object('deleted', true), p_reason,
    p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Customer satisfaction (immutable once submitted)
-- ---------------------------------------------------------------------------
create table public.forge_support_customer_satisfaction (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  ticket_id uuid not null unique,
  requester_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 2000),
  submitted_at timestamptz not null default now(),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);
create index forge_support_csat_submitted_idx on public.forge_support_customer_satisfaction(submitted_at);

create or replace function public.forge_support_csat_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Customer satisfaction responses cannot be modified.';
end $$;
create trigger forge_support_csat_immutable before update or delete on public.forge_support_customer_satisfaction
for each row execute function public.forge_support_csat_immutable();

create or replace function public.forge_support_submit_csat(
  p_ticket_id uuid,
  p_requester_user_id uuid,
  p_organization_id uuid,
  p_rating integer,
  p_comment text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  v_enabled boolean;
  v_id uuid;
begin
  select * into t from public.forge_support_tickets where id = p_ticket_id;
  if not found or t.organization_id is distinct from p_organization_id then
    return jsonb_build_object('ok', false, 'error', 'Ticket not found.');
  end if;
  if t.requester_user_id <> p_requester_user_id then
    return jsonb_build_object('ok', false, 'error', 'Only the requester can rate this ticket.');
  end if;
  if t.status not in ('resolved','closed') or t.merged_into_ticket_id is not null then
    return jsonb_build_object('ok', false, 'error', 'Ratings open after the ticket is resolved.');
  end if;
  select csat_enabled into v_enabled from public.forge_support_settings where id;
  if not coalesce(v_enabled, false) then
    return jsonb_build_object('ok', false, 'error', 'Satisfaction surveys are disabled.');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    return jsonb_build_object('ok', false, 'error', 'Choose a rating from 1 to 5.');
  end if;
  if exists (select 1 from public.forge_support_customer_satisfaction where ticket_id = t.id) then
    return jsonb_build_object('ok', false, 'error', 'You already rated this ticket.');
  end if;

  insert into public.forge_support_customer_satisfaction(organization_id, ticket_id, requester_id, rating, comment)
  values (t.organization_id, t.id, p_requester_user_id, p_rating, nullif(left(btrim(coalesce(p_comment, '')), 2000), ''))
  returning id into v_id;
  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, visibility)
  values (t.organization_id, t.id, p_requester_user_id, 'csat_submitted', p_rating::text, 'public');
  perform public.forge_support_audit(p_requester_user_id, 'tenant_user', t.organization_id, 'helpdesk.csat.submitted',
    'support_ticket', t.id::text, null, jsonb_build_object('csat_id', v_id, 'rating', p_rating),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'csat_id', v_id);
end $$;

alter table public.forge_support_customer_satisfaction enable row level security;
revoke all on public.forge_support_customer_satisfaction from anon, authenticated;
grant all on public.forge_support_customer_satisfaction to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'forge_support_create_ticket(uuid,uuid,jsonb,text,jsonb)',
    'forge_support_add_message(uuid,uuid,text,text,text,uuid,uuid[],uuid,uuid,text,jsonb)',
    'forge_support_apply_ticket_change(uuid,uuid,text,jsonb,bigint,uuid,text,jsonb)',
    'forge_support_set_ticket_tags(uuid,uuid,uuid[],uuid[],jsonb)',
    'forge_support_set_watcher(uuid,uuid,uuid,boolean,jsonb)',
    'forge_support_link_tickets(uuid,uuid,text,uuid,jsonb)',
    'forge_support_unlink_tickets(uuid,uuid,jsonb)',
    'forge_support_merge_tickets(uuid,uuid,uuid,text,jsonb)',
    'forge_support_record_attachment(uuid,uuid,text,uuid,jsonb,jsonb)',
    'forge_support_remove_attachment(uuid,uuid,text,uuid,text,jsonb)',
    'forge_support_submit_csat(uuid,uuid,uuid,integer,text,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

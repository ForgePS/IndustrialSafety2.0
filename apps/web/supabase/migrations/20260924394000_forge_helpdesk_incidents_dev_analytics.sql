-- FIS-HD-01 / HD-07, HD-08: platform incidents, service status, announcements, development issues, analytics.
-- "Platform incident" is the Forge service-health entity and is intentionally separate from customer EHS incidents.

-- ---------------------------------------------------------------------------
-- Service status components
-- ---------------------------------------------------------------------------
create table public.forge_support_platform_components (
  id uuid primary key default gen_random_uuid(),
  component_key text not null unique check (component_key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  product_id uuid references public.forge_support_products(id) on delete restrict,
  current_status text not null default 'operational'
    check (current_status in ('operational','degraded_performance','partial_outage','major_outage','maintenance')),
  status_updated_at timestamptz not null default now(),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.forge_support_platform_components(component_key, name, description, product_id, sort_order)
select v.k, v.n, v.d, p.id, v.s
from (values
  ('web_application','Web application','Forge Industrial Safety web experience',10),
  ('safety_modules','Safety modules','Inspections, training, incidents, observations and other modules',20),
  ('api','API','Forge APIs and server actions',30),
  ('authentication','Authentication','Sign-in, SSO and session management',40),
  ('notifications','Notifications','In-app and email notifications',50),
  ('file_uploads','File uploads','Attachments, photos and documents',60),
  ('integrations','Integrations','Third-party and customer integrations',70),
  ('mobile','Mobile field app','Mobile and offline field experience',80),
  ('reporting','Reporting','Reports, exports and analytics',90)
) v(k, n, d, s)
cross join lateral (select id from public.forge_support_products where product_key = 'forge_industrial_safety') p
on conflict (component_key) do nothing;

create table public.forge_support_component_status_history (
  id bigint generated always as identity primary key,
  component_id uuid not null references public.forge_support_platform_components(id) on delete cascade,
  from_status text,
  to_status text not null,
  incident_id uuid,
  changed_by uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index forge_support_component_history_idx on public.forge_support_component_status_history(component_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Platform incidents
-- ---------------------------------------------------------------------------
create table public.forge_support_platform_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_number text not null unique check (incident_number ~ '^INC-[0-9]{4}-[0-9]{4,}$'),
  title text not null check (char_length(title) between 4 and 200),
  public_message text not null check (char_length(public_message) between 4 and 2000),
  status text not null default 'investigating' check (status in ('investigating','identified','monitoring','resolved')),
  impact text not null check (impact in ('minor','major','critical')),
  product_id uuid references public.forge_support_products(id) on delete restrict,
  all_tenants_affected boolean not null default false,
  other_component_note text check (other_component_note is null or char_length(other_component_note) <= 300),
  is_public boolean not null default true,
  started_at timestamptz not null default now(),
  identified_at timestamptz,
  monitoring_at timestamptz,
  resolved_at timestamptz,
  root_cause text check (root_cause is null or char_length(root_cause) <= 4000),
  resolution text check (resolution is null or char_length(resolution) <= 4000),
  preventive_action text check (preventive_action is null or char_length(preventive_action) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  check ((status = 'resolved') = (resolved_at is not null)),
  check (status <> 'resolved' or resolution is not null)
);
create index forge_support_incidents_status_idx on public.forge_support_platform_incidents(status, started_at desc);

alter table public.forge_support_component_status_history
  add constraint forge_support_component_history_incident_fk foreign key (incident_id) references public.forge_support_platform_incidents(id) on delete set null;

create table public.forge_support_incident_components (
  incident_id uuid not null references public.forge_support_platform_incidents(id) on delete cascade,
  component_id uuid not null references public.forge_support_platform_components(id) on delete restrict,
  component_status text not null check (component_status in ('degraded_performance','partial_outage','major_outage','maintenance')),
  created_at timestamptz not null default now(),
  primary key (incident_id, component_id)
);

create table public.forge_support_incident_tenants (
  incident_id uuid not null references public.forge_support_platform_incidents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (incident_id, organization_id)
);
create index forge_support_incident_tenants_org_idx on public.forge_support_incident_tenants(organization_id);

create table public.forge_support_incident_tickets (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.forge_support_platform_incidents(id) on delete cascade,
  organization_id uuid not null,
  ticket_id uuid not null,
  linked_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  unlinked_by uuid references auth.users(id) on delete set null,
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade,
  unique (incident_id, ticket_id)
);
create index forge_support_incident_tickets_ticket_idx on public.forge_support_incident_tickets(ticket_id) where unlinked_at is null;

create table public.forge_support_incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.forge_support_platform_incidents(id) on delete cascade,
  status text not null check (status in ('investigating','identified','monitoring','resolved')),
  message text not null check (char_length(message) between 2 and 4000),
  is_public boolean not null,
  posted_by uuid references auth.users(id) on delete set null,
  tickets_updated integer not null default 0,
  customers_notified integer not null default 0,
  created_at timestamptz not null default now()
);
create index forge_support_incident_updates_idx on public.forge_support_incident_updates(incident_id, created_at desc);

-- Recompute a component's public status from active incidents (worst impact wins).
create or replace function public.forge_support_refresh_component_status(p_component_id uuid, p_actor_user_id uuid, p_incident_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.forge_support_platform_components%rowtype;
  v_status text;
begin
  select * into c from public.forge_support_platform_components where id = p_component_id for update;
  if not found then return; end if;
  select ic.component_status into v_status
  from public.forge_support_incident_components ic
  join public.forge_support_platform_incidents i on i.id = ic.incident_id
  where ic.component_id = p_component_id and i.status <> 'resolved'
  order by case ic.component_status when 'major_outage' then 1 when 'partial_outage' then 2 when 'degraded_performance' then 3 else 4 end
  limit 1;
  v_status := coalesce(v_status, 'operational');
  if v_status <> c.current_status then
    update public.forge_support_platform_components set current_status = v_status, status_updated_at = now(), updated_at = now() where id = c.id;
    insert into public.forge_support_component_status_history(component_id, from_status, to_status, incident_id, changed_by, note)
    values (c.id, c.current_status, v_status, p_incident_id, p_actor_user_id, 'Derived from platform incidents');
  end if;
end $$;
revoke all on function public.forge_support_refresh_component_status(uuid, uuid, uuid) from public;

create or replace function public.forge_support_staff_notify(
  p_event_type text, p_resource_type text, p_resource_id uuid, p_actor_user_id uuid, p_title text, p_body text, p_link text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_event uuid;
begin
  insert into public.forge_notification_events(organization_id, source_module, event_type, visibility, resource_type, resource_id, actor_user_id, title, body)
  values (null, 'helpdesk', p_event_type, 'internal', p_resource_type, p_resource_id, p_actor_user_id, left(p_title, 200), left(p_body, 2000))
  returning id into v_event;
  insert into public.forge_notification_deliveries(event_id, organization_id, recipient_user_id, recipient_audience, channel, status, title, body, link_path, sent_at)
  select v_event, null, m.user_id, 'internal', 'in_app', 'sent', left(p_title, 200), left(p_body, 2000), p_link, now()
  from (
    select distinct tm.user_id
    from public.forge_support_team_members tm
    join public.forge_support_teams tt on tt.id = tm.team_id and tt.is_active
    join public.forge_platform_users pu on pu.user_id = tm.user_id and pu.is_active
    where tm.user_id is distinct from p_actor_user_id
  ) m
  on conflict do nothing;
  return v_event;
end $$;
revoke all on function public.forge_support_staff_notify(text, text, uuid, uuid, text, text, text) from public;

create or replace function public.forge_support_create_incident(
  p_actor_user_id uuid,
  p_fields jsonb,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_fields->>'title', ''));
  v_message text := btrim(coalesce(p_fields->>'public_message', ''));
  v_impact text := coalesce(p_fields->>'impact', '');
  v_product uuid := nullif(p_fields->>'product_id', '')::uuid;
  v_all boolean := coalesce((p_fields->>'all_tenants_affected')::boolean, false);
  v_public boolean := coalesce((p_fields->>'is_public')::boolean, true);
  v_other text := nullif(left(btrim(coalesce(p_fields->>'other_component_note', '')), 300), '');
  v_tenants uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_fields->'tenant_ids', '[]'::jsonb))::uuid), '{}'::uuid[]);
  v_component jsonb;
  v_id uuid;
  v_number text;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.admin.incidents') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to declare platform incidents.');
  end if;
  if char_length(v_title) not between 4 and 200 then return jsonb_build_object('ok', false, 'error', 'Title must be 4 to 200 characters.'); end if;
  if char_length(v_message) not between 4 and 2000 then return jsonb_build_object('ok', false, 'error', 'Status message must be 4 to 2000 characters.'); end if;
  if v_impact not in ('minor','major','critical') then return jsonb_build_object('ok', false, 'error', 'Choose an impact level.'); end if;
  if v_product is not null and not exists (select 1 from public.forge_support_products where id = v_product) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid product.');
  end if;
  if exists (select 1 from unnest(v_tenants) u where not exists (select 1 from public.organizations o where o.id = u)) then
    return jsonb_build_object('ok', false, 'error', 'One or more affected tenants do not exist.');
  end if;
  if jsonb_array_length(coalesce(p_fields->'components', '[]'::jsonb)) = 0 and v_other is null then
    return jsonb_build_object('ok', false, 'error', 'Select at least one affected component.');
  end if;

  v_number := public.forge_support_next_number('incident');
  insert into public.forge_support_platform_incidents(incident_number, title, public_message, impact, product_id, all_tenants_affected,
    other_component_note, is_public, created_by)
  values (v_number, v_title, v_message, v_impact, v_product, v_all, v_other, v_public, p_actor_user_id)
  returning id into v_id;

  for v_component in select * from jsonb_array_elements(coalesce(p_fields->'components', '[]'::jsonb)) loop
    if not exists (select 1 from public.forge_support_platform_components where id = (v_component->>'component_id')::uuid and is_active) then
      raise exception 'Invalid component.';
    end if;
    if coalesce(v_component->>'status', '') not in ('degraded_performance','partial_outage','major_outage','maintenance') then
      raise exception 'Invalid component status.';
    end if;
    insert into public.forge_support_incident_components(incident_id, component_id, component_status)
    values (v_id, (v_component->>'component_id')::uuid, v_component->>'status')
    on conflict (incident_id, component_id) do update set component_status = excluded.component_status;
    perform public.forge_support_refresh_component_status((v_component->>'component_id')::uuid, p_actor_user_id, v_id);
  end loop;

  insert into public.forge_support_incident_tenants(incident_id, organization_id, added_by)
  select v_id, u, p_actor_user_id from unnest(v_tenants) u on conflict do nothing;

  insert into public.forge_support_incident_updates(incident_id, status, message, is_public, posted_by)
  values (v_id, 'investigating', v_message, v_public, p_actor_user_id);

  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', null, 'helpdesk.incident.created', 'support_platform_incident', v_id::text,
    null, jsonb_build_object('incident_number', v_number, 'impact', v_impact, 'title', v_title, 'tenants', to_jsonb(v_tenants), 'all_tenants', v_all),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  perform public.forge_support_staff_notify('platform_incident_declared', 'support_platform_incident', v_id, p_actor_user_id,
    v_number || ' declared (' || v_impact || ')', v_title, '/help-desk/console/incidents/' || v_id::text);
  return jsonb_build_object('ok', true, 'incident_id', v_id, 'incident_number', v_number);
exception when raise_exception then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

create or replace function public.forge_support_post_incident_update(
  p_incident_id uuid,
  p_actor_user_id uuid,
  p_status text,
  p_message text,
  p_is_public boolean,
  p_notify_customers boolean,
  p_ticket_action text,
  p_expected_row_version bigint,
  p_resolution jsonb default '{}'::jsonb,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.forge_support_platform_incidents%rowtype;
  v_message text := btrim(coalesce(p_message, ''));
  v_update uuid;
  v_ticket record;
  v_tickets integer := 0;
  v_notified integer := 0;
  v_component uuid;
  v_action text := coalesce(nullif(p_ticket_action, ''), 'none');
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.admin.incidents') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to update platform incidents.');
  end if;
  select * into i from public.forge_support_platform_incidents where id = p_incident_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Platform incident not found.'); end if;
  if p_expected_row_version is not null and p_expected_row_version <> i.row_version then
    return jsonb_build_object('ok', false, 'conflict', true, 'error', 'This incident changed after you opened it. Refresh and try again.');
  end if;
  if char_length(v_message) not between 2 and 4000 then return jsonb_build_object('ok', false, 'error', 'Enter an update message.'); end if;
  if p_status not in ('investigating','identified','monitoring','resolved') then
    return jsonb_build_object('ok', false, 'error', 'Invalid incident status.');
  end if;
  if i.status = 'resolved' and p_status <> 'resolved' then
    return jsonb_build_object('ok', false, 'error', 'Resolved incidents cannot be reopened. Declare a new incident and link it.');
  end if;
  if i.status = 'resolved' and p_status = 'resolved' and p_is_public then
    return jsonb_build_object('ok', false, 'error', 'This incident is already resolved. Post an internal note instead.');
  end if;
  if v_action not in ('none','waiting_on_customer','resolved') then
    return jsonb_build_object('ok', false, 'error', 'Invalid linked-ticket action.');
  end if;
  if v_action <> 'none' and p_status <> 'resolved' then
    return jsonb_build_object('ok', false, 'error', 'Bulk ticket updates are only available when resolving the incident.');
  end if;
  if p_status = 'resolved' and i.status <> 'resolved' and nullif(btrim(coalesce(p_resolution->>'resolution', '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Describe the resolution before resolving the incident.');
  end if;

  update public.forge_support_platform_incidents
  set status = p_status,
      public_message = case when p_is_public then left(v_message, 2000) else public_message end,
      identified_at = case when p_status = 'identified' and identified_at is null then now() else identified_at end,
      monitoring_at = case when p_status = 'monitoring' and monitoring_at is null then now() else monitoring_at end,
      resolved_at = case when p_status = 'resolved' then coalesce(resolved_at, now()) else null end,
      resolved_by = case when p_status = 'resolved' then coalesce(resolved_by, p_actor_user_id) else null end,
      resolution = coalesce(nullif(left(btrim(coalesce(p_resolution->>'resolution', '')), 4000), ''), resolution),
      root_cause = coalesce(nullif(left(btrim(coalesce(p_resolution->>'root_cause', '')), 4000), ''), root_cause),
      preventive_action = coalesce(nullif(left(btrim(coalesce(p_resolution->>'preventive_action', '')), 4000), ''), preventive_action),
      updated_at = now(),
      row_version = row_version + 1
  where id = i.id;

  insert into public.forge_support_incident_updates(incident_id, status, message, is_public, posted_by)
  values (i.id, p_status, v_message, p_is_public, p_actor_user_id)
  returning id into v_update;

  if p_status = 'resolved' and i.status <> 'resolved' then
    for v_component in select component_id from public.forge_support_incident_components where incident_id = i.id loop
      perform public.forge_support_refresh_component_status(v_component, p_actor_user_id, i.id);
    end loop;
  end if;

  if p_is_public and (p_notify_customers or v_action <> 'none') then
    for v_ticket in
      select t.id, t.organization_id, t.status, t.ticket_number
      from public.forge_support_incident_tickets it
      join public.forge_support_tickets t on t.id = it.ticket_id
      where it.incident_id = i.id and it.unlinked_at is null and t.status <> 'closed' and t.merged_into_ticket_id is null
      for update of t
    loop
      if p_notify_customers then
        insert into public.forge_support_messages(organization_id, ticket_id, author_user_id, author_kind, visibility, message_type, body)
        values (v_ticket.organization_id, v_ticket.id, p_actor_user_id, 'system', 'public', 'system_event',
                'Platform incident ' || i.incident_number || ' update (' || p_status || '): ' || left(v_message, 3800));
        perform public.forge_support_notify(v_ticket.id,
          case when p_status = 'resolved' then 'platform_incident_resolved' else 'platform_incident_updated' end,
          'customer', p_actor_user_id,
          case when p_status = 'resolved' then i.incident_number || ' resolved: ' || v_ticket.ticket_number
               else i.incident_number || ' update: ' || v_ticket.ticket_number end,
          left(v_message, 600), '{}'::uuid[], false, true, false, false);
        v_notified := v_notified + 1;
      end if;
      if v_action <> 'none' and v_ticket.status <> v_action
         and public.forge_support_transition_allowed(v_ticket.status, v_action, 'staff') then
        perform public.forge_support_set_status_internal(v_ticket.id, v_action, p_actor_user_id, 'staff',
          'Platform incident ' || i.incident_number || ' resolved',
          case when v_action = 'resolved' then 'Resolved with platform incident ' || i.incident_number || ': ' || left(v_message, 3500) end);
        update public.forge_support_tickets set row_version = row_version + 1 where id = v_ticket.id;
        v_tickets := v_tickets + 1;
      end if;
    end loop;
    update public.forge_support_incident_updates set tickets_updated = v_tickets, customers_notified = v_notified where id = v_update;
  end if;

  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', null,
    case when p_status = 'resolved' and i.status <> 'resolved' then 'helpdesk.incident.resolved' else 'helpdesk.incident.updated' end,
    'support_platform_incident', i.id::text, jsonb_build_object('status', i.status),
    jsonb_build_object('status', p_status, 'public', p_is_public, 'tickets_updated', v_tickets, 'customers_notified', v_notified, 'ticket_action', v_action),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'update_id', v_update, 'tickets_updated', v_tickets, 'customers_notified', v_notified);
end $$;

create or replace function public.forge_support_set_incident_scope(
  p_incident_id uuid,
  p_actor_user_id uuid,
  p_components jsonb,
  p_tenant_ids uuid[],
  p_all_tenants boolean,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.forge_support_platform_incidents%rowtype;
  v_component jsonb;
  v_ids uuid[] := '{}'::uuid[];
  v_old uuid[];
  v_c uuid;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.admin.incidents') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to update platform incidents.');
  end if;
  select * into i from public.forge_support_platform_incidents where id = p_incident_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Platform incident not found.'); end if;
  if i.status = 'resolved' then return jsonb_build_object('ok', false, 'error', 'Resolved incidents are read-only.'); end if;
  if exists (select 1 from unnest(coalesce(p_tenant_ids, '{}'::uuid[])) u where not exists (select 1 from public.organizations o where o.id = u)) then
    return jsonb_build_object('ok', false, 'error', 'One or more affected tenants do not exist.');
  end if;
  select array_agg(component_id) into v_old from public.forge_support_incident_components where incident_id = i.id;

  for v_component in select * from jsonb_array_elements(coalesce(p_components, '[]'::jsonb)) loop
    if not exists (select 1 from public.forge_support_platform_components where id = (v_component->>'component_id')::uuid and is_active)
       or coalesce(v_component->>'status', '') not in ('degraded_performance','partial_outage','major_outage','maintenance') then
      return jsonb_build_object('ok', false, 'error', 'Invalid component or component status.');
    end if;
    v_ids := v_ids || (v_component->>'component_id')::uuid;
  end loop;

  delete from public.forge_support_incident_components where incident_id = i.id and not (component_id = any(v_ids));
  for v_component in select * from jsonb_array_elements(coalesce(p_components, '[]'::jsonb)) loop
    insert into public.forge_support_incident_components(incident_id, component_id, component_status)
    values (i.id, (v_component->>'component_id')::uuid, v_component->>'status')
    on conflict (incident_id, component_id) do update set component_status = excluded.component_status;
  end loop;
  for v_c in select distinct unnest(coalesce(v_old, '{}'::uuid[]) || v_ids) loop
    perform public.forge_support_refresh_component_status(v_c, p_actor_user_id, i.id);
  end loop;

  delete from public.forge_support_incident_tenants where incident_id = i.id and not (organization_id = any(coalesce(p_tenant_ids, '{}'::uuid[])));
  insert into public.forge_support_incident_tenants(incident_id, organization_id, added_by)
  select i.id, u, p_actor_user_id from unnest(coalesce(p_tenant_ids, '{}'::uuid[])) u on conflict do nothing;

  update public.forge_support_platform_incidents
  set all_tenants_affected = coalesce(p_all_tenants, false), updated_at = now(), row_version = row_version + 1
  where id = i.id;

  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', null, 'helpdesk.incident.scope_updated', 'support_platform_incident', i.id::text,
    jsonb_build_object('components', to_jsonb(coalesce(v_old, '{}'::uuid[])), 'all_tenants', i.all_tenants_affected),
    jsonb_build_object('components', to_jsonb(v_ids), 'tenants', to_jsonb(coalesce(p_tenant_ids, '{}'::uuid[])), 'all_tenants', coalesce(p_all_tenants, false)),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.forge_support_link_incident_ticket(
  p_incident_id uuid,
  p_ticket_id uuid,
  p_actor_user_id uuid,
  p_link boolean,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.forge_support_platform_incidents%rowtype;
  t public.forge_support_tickets%rowtype;
  v_existing public.forge_support_incident_tickets%rowtype;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.link_incident') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to link platform incidents.');
  end if;
  select * into i from public.forge_support_platform_incidents where id = p_incident_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Platform incident not found.'); end if;
  select * into t from public.forge_support_tickets where id = p_ticket_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Ticket not found.'); end if;
  select * into v_existing from public.forge_support_incident_tickets where incident_id = i.id and ticket_id = t.id for update;

  if p_link then
    if i.status = 'resolved' then return jsonb_build_object('ok', false, 'error', 'Link tickets before the incident is resolved.'); end if;
    if found and v_existing.unlinked_at is null then return jsonb_build_object('ok', true, 'unchanged', true); end if;
    if found then
      update public.forge_support_incident_tickets set unlinked_at = null, unlinked_by = null, linked_by = p_actor_user_id, linked_at = now() where id = v_existing.id;
    else
      insert into public.forge_support_incident_tickets(incident_id, organization_id, ticket_id, linked_by)
      values (i.id, t.organization_id, t.id, p_actor_user_id);
    end if;
    insert into public.forge_support_incident_tenants(incident_id, organization_id, added_by)
    values (i.id, t.organization_id, p_actor_user_id) on conflict do nothing;
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, detail, visibility, metadata)
    values (t.organization_id, t.id, p_actor_user_id, 'platform_incident_linked', i.incident_number,
            case when i.is_public then i.title else 'Linked to internal platform incident' end,
            case when i.is_public then 'public' else 'internal' end, jsonb_build_object('incident_id', i.id));
    if i.is_public then
      perform public.forge_support_notify(t.id, 'platform_incident_linked', 'customer', p_actor_user_id,
        t.ticket_number || ' is linked to ' || i.incident_number, i.title || ': ' || i.public_message, '{}'::uuid[], false, true, false, false);
    end if;
  else
    if not found or v_existing.unlinked_at is not null then return jsonb_build_object('ok', true, 'unchanged', true); end if;
    update public.forge_support_incident_tickets set unlinked_at = now(), unlinked_by = p_actor_user_id where id = v_existing.id;
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, visibility, metadata)
    values (t.organization_id, t.id, p_actor_user_id, 'platform_incident_unlinked', i.incident_number, 'internal', jsonb_build_object('incident_id', i.id));
  end if;
  update public.forge_support_tickets set updated_at = now(), row_version = row_version + 1 where id = t.id;
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', t.organization_id,
    case when p_link then 'helpdesk.incident.ticket_linked' else 'helpdesk.incident.ticket_unlinked' end,
    'support_ticket', t.id::text, null, jsonb_build_object('incident_id', i.id, 'incident_number', i.incident_number),
    null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.forge_support_set_component_status(
  p_component_id uuid,
  p_actor_user_id uuid,
  p_status text,
  p_note text,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare c public.forge_support_platform_components%rowtype;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.admin.status') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to change service status.');
  end if;
  if p_status not in ('operational','degraded_performance','partial_outage','major_outage','maintenance') then
    return jsonb_build_object('ok', false, 'error', 'Invalid component status.');
  end if;
  select * into c from public.forge_support_platform_components where id = p_component_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Component not found.'); end if;
  if c.current_status = p_status then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.forge_support_platform_components set current_status = p_status, status_updated_at = now(), updated_at = now() where id = c.id;
  insert into public.forge_support_component_status_history(component_id, from_status, to_status, changed_by, note)
  values (c.id, c.current_status, p_status, p_actor_user_id, nullif(left(btrim(coalesce(p_note, '')), 1000), ''));
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', null, 'helpdesk.status.component_changed', 'support_platform_component', c.id::text,
    jsonb_build_object('status', c.current_status), jsonb_build_object('status', p_status), p_note,
    p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table public.forge_support_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 4 and 200),
  body text not null check (char_length(body) between 4 and 8000),
  announcement_type text not null check (announcement_type in (
    'planned_maintenance','platform_update','known_issue','feature_release','support_hours','training_event','system_notice')),
  product_id uuid references public.forge_support_products(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete cascade,
  audience text not null default 'all_users' check (audience in ('all_users','tenant_admins')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  incident_id uuid references public.forge_support_platform_incidents(id) on delete set null,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  check (ends_at is null or ends_at > starts_at)
);
create index forge_support_announcements_active_idx on public.forge_support_announcements(is_active, starts_at, ends_at);

create or replace function public.forge_support_save_announcement(
  p_announcement_id uuid,
  p_actor_user_id uuid,
  p_fields jsonb,
  p_expected_row_version bigint default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.forge_support_announcements%rowtype;
  v_title text := btrim(coalesce(p_fields->>'title', ''));
  v_body text := btrim(coalesce(p_fields->>'body', ''));
  v_type text := coalesce(p_fields->>'announcement_type', '');
  v_product uuid := nullif(p_fields->>'product_id', '')::uuid;
  v_org uuid := nullif(p_fields->>'organization_id', '')::uuid;
  v_audience text := coalesce(nullif(p_fields->>'audience', ''), 'all_users');
  v_starts timestamptz := coalesce(nullif(p_fields->>'starts_at', '')::timestamptz, now());
  v_ends timestamptz := nullif(p_fields->>'ends_at', '')::timestamptz;
  v_active boolean := coalesce((p_fields->>'is_active')::boolean, true);
  v_publish boolean := coalesce((p_fields->>'publish')::boolean, false);
  v_incident uuid := nullif(p_fields->>'incident_id', '')::uuid;
  v_id uuid;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.admin.announcements') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to manage announcements.');
  end if;
  if char_length(v_title) not between 4 and 200 then return jsonb_build_object('ok', false, 'error', 'Title must be 4 to 200 characters.'); end if;
  if char_length(v_body) not between 4 and 8000 then return jsonb_build_object('ok', false, 'error', 'Body must be 4 to 8000 characters.'); end if;
  if v_type not in ('planned_maintenance','platform_update','known_issue','feature_release','support_hours','training_event','system_notice') then
    return jsonb_build_object('ok', false, 'error', 'Choose an announcement type.');
  end if;
  if v_audience not in ('all_users','tenant_admins') then return jsonb_build_object('ok', false, 'error', 'Invalid audience.'); end if;
  if v_ends is not null and v_ends <= v_starts then return jsonb_build_object('ok', false, 'error', 'End time must be after the start time.'); end if;
  if v_product is not null and not exists (select 1 from public.forge_support_products where id = v_product) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid product.');
  end if;
  if v_org is not null and not exists (select 1 from public.organizations where id = v_org) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid tenant.');
  end if;
  if v_incident is not null and not exists (select 1 from public.forge_support_platform_incidents where id = v_incident) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid platform incident.');
  end if;

  if p_announcement_id is null then
    insert into public.forge_support_announcements(title, body, announcement_type, product_id, organization_id, audience, starts_at, ends_at,
      is_active, incident_id, published_at, created_by, updated_by)
    values (v_title, v_body, v_type, v_product, v_org, v_audience, v_starts, v_ends, v_active, v_incident,
      case when v_publish then now() end, p_actor_user_id, p_actor_user_id)
    returning id into v_id;
    perform public.forge_support_audit(p_actor_user_id, 'forge_staff', v_org, 'helpdesk.announcement.created', 'support_announcement', v_id::text,
      null, jsonb_build_object('title', v_title, 'type', v_type, 'published', v_publish), null,
      p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
    return jsonb_build_object('ok', true, 'announcement_id', v_id);
  end if;

  select * into a from public.forge_support_announcements where id = p_announcement_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Announcement not found.'); end if;
  if p_expected_row_version is not null and p_expected_row_version <> a.row_version then
    return jsonb_build_object('ok', false, 'conflict', true, 'error', 'This announcement changed after you opened it. Refresh and try again.');
  end if;
  update public.forge_support_announcements
  set title = v_title, body = v_body, announcement_type = v_type, product_id = v_product, organization_id = v_org, audience = v_audience,
      starts_at = v_starts, ends_at = v_ends, is_active = v_active, incident_id = v_incident,
      published_at = case when v_publish then coalesce(published_at, now()) else published_at end,
      updated_by = p_actor_user_id, updated_at = now(), row_version = row_version + 1
  where id = a.id;
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', coalesce(v_org, a.organization_id), 'helpdesk.announcement.updated', 'support_announcement', a.id::text,
    jsonb_build_object('title', a.title, 'is_active', a.is_active, 'published_at', a.published_at),
    jsonb_build_object('title', v_title, 'is_active', v_active, 'published', v_publish or a.published_at is not null), null,
    p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'announcement_id', a.id);
end $$;

-- ---------------------------------------------------------------------------
-- Development issues (provider abstraction: forge_internal now, external later)
-- ---------------------------------------------------------------------------
create table public.forge_support_development_issues (
  id uuid primary key default gen_random_uuid(),
  issue_number text not null unique check (issue_number ~ '^DEV-[0-9]{4}-[0-9]{4,}$'),
  title text not null check (char_length(title) between 4 and 200),
  description text not null check (char_length(description) between 4 and 20000),
  issue_type text not null check (issue_type in ('bug','feature_request','improvement','known_issue','task')),
  state text not null default 'open' check (state in ('open','triaged','in_progress','in_review','fixed','released','wont_fix','duplicate','closed')),
  priority text not null check (priority in ('p1_critical','p2_high','p3_normal','p4_low')),
  product_id uuid references public.forge_support_products(id) on delete restrict,
  module_id uuid references public.forge_support_product_areas(id) on delete set null,
  customer_impact text check (customer_impact is null or char_length(customer_impact) <= 4000),
  reproduction_steps text check (reproduction_steps is null or char_length(reproduction_steps) <= 8000),
  error_identifiers text check (error_identifiers is null or char_length(error_identifiers) <= 1000),
  known_issue_reference text check (known_issue_reference is null or char_length(known_issue_reference) <= 300),
  fix_version text check (fix_version is null or char_length(fix_version) <= 80),
  customer_update text check (customer_update is null or char_length(customer_update) <= 2000),
  external_provider text not null default 'forge_internal'
    check (external_provider in ('forge_internal','github','jira','azure_devops','linear','other')),
  external_issue_id text check (external_issue_id is null or char_length(external_issue_id) <= 120),
  external_url text check (external_url is null or (external_url ~ '^https://' and char_length(external_url) <= 1000)),
  linked_at timestamptz,
  linked_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  check (external_provider = 'forge_internal' or (external_issue_id is not null and external_url is not null and linked_at is not null))
);
create unique index forge_support_dev_external_uidx on public.forge_support_development_issues(external_provider, external_issue_id)
  where external_provider <> 'forge_internal';
create index forge_support_dev_state_idx on public.forge_support_development_issues(state, updated_at desc);

create table public.forge_support_development_links (
  id uuid primary key default gen_random_uuid(),
  development_issue_id uuid not null references public.forge_support_development_issues(id) on delete cascade,
  organization_id uuid not null,
  ticket_id uuid not null,
  linked_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  unlinked_by uuid references auth.users(id) on delete set null,
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade,
  unique (development_issue_id, ticket_id)
);
create index forge_support_dev_links_ticket_idx on public.forge_support_development_links(ticket_id) where unlinked_at is null;

create table public.forge_support_development_updates (
  id uuid primary key default gen_random_uuid(),
  development_issue_id uuid not null references public.forge_support_development_issues(id) on delete cascade,
  from_state text,
  to_state text,
  note text check (note is null or char_length(note) <= 4000),
  shared_with_customers boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.forge_support_link_development_internal(p_issue_id uuid, p_ticket_id uuid, p_actor_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.forge_support_development_issues%rowtype;
  t public.forge_support_tickets%rowtype;
  v_link public.forge_support_development_links%rowtype;
begin
  select * into d from public.forge_support_development_issues where id = p_issue_id;
  select * into t from public.forge_support_tickets where id = p_ticket_id and deleted_at is null for update;
  if d.id is null or t.id is null then return false; end if;
  select * into v_link from public.forge_support_development_links where development_issue_id = d.id and ticket_id = t.id for update;
  if found and v_link.unlinked_at is null then return true; end if;
  if found then
    update public.forge_support_development_links set unlinked_at = null, unlinked_by = null, linked_at = now(), linked_by = p_actor_user_id where id = v_link.id;
  else
    insert into public.forge_support_development_links(development_issue_id, organization_id, ticket_id, linked_by)
    values (d.id, t.organization_id, t.id, p_actor_user_id);
  end if;
  insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, detail, visibility, metadata)
  values (t.organization_id, t.id, p_actor_user_id, 'development_linked', d.issue_number, d.title, 'internal', jsonb_build_object('development_issue_id', d.id));
  update public.forge_support_tickets
  set fix_version = coalesce(d.fix_version, fix_version), updated_at = now(), row_version = row_version + 1
  where id = t.id;
  return true;
end $$;
revoke all on function public.forge_support_link_development_internal(uuid, uuid, uuid) from public;

create or replace function public.forge_support_create_development_issue(
  p_actor_user_id uuid,
  p_fields jsonb,
  p_ticket_id uuid default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_fields->>'title', ''));
  v_description text := btrim(coalesce(p_fields->>'description', ''));
  v_type text := coalesce(p_fields->>'issue_type', '');
  v_priority text := coalesce(p_fields->>'priority', 'p3_normal');
  v_product uuid := nullif(p_fields->>'product_id', '')::uuid;
  v_module uuid := nullif(p_fields->>'module_id', '')::uuid;
  t public.forge_support_tickets%rowtype;
  v_id uuid;
  v_number text;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.link_development') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to create development issues.');
  end if;
  if char_length(v_title) not between 4 and 200 then return jsonb_build_object('ok', false, 'error', 'Title must be 4 to 200 characters.'); end if;
  if char_length(v_description) not between 4 and 20000 then return jsonb_build_object('ok', false, 'error', 'Description is required.'); end if;
  if v_type not in ('bug','feature_request','improvement','known_issue','task') then return jsonb_build_object('ok', false, 'error', 'Choose an issue type.'); end if;
  if v_priority not in ('p1_critical','p2_high','p3_normal','p4_low') then return jsonb_build_object('ok', false, 'error', 'Invalid priority.'); end if;
  if p_ticket_id is not null then
    select * into t from public.forge_support_tickets where id = p_ticket_id and deleted_at is null;
    if not found then return jsonb_build_object('ok', false, 'error', 'Ticket not found.'); end if;
    v_product := coalesce(v_product, t.product_id);
    v_module := coalesce(v_module, t.module_id);
  end if;
  if v_product is not null and not exists (select 1 from public.forge_support_products where id = v_product) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid product.');
  end if;
  if v_module is not null and not exists (
    select 1 from public.forge_support_product_areas where id = v_module and (v_product is null or product_id = v_product)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Product area does not belong to the selected product.');
  end if;

  v_number := public.forge_support_next_number('development');
  insert into public.forge_support_development_issues(issue_number, title, description, issue_type, priority, product_id, module_id,
    customer_impact, reproduction_steps, error_identifiers, known_issue_reference, created_by)
  values (v_number, v_title, v_description, v_type, v_priority, v_product, v_module,
    nullif(left(btrim(coalesce(p_fields->>'customer_impact', '')), 4000), ''),
    nullif(left(btrim(coalesce(p_fields->>'reproduction_steps', '')), 8000), ''),
    nullif(left(btrim(coalesce(p_fields->>'error_identifiers', '')), 1000), ''),
    nullif(left(btrim(coalesce(p_fields->>'known_issue_reference', '')), 300), ''),
    p_actor_user_id)
  returning id into v_id;
  insert into public.forge_support_development_updates(development_issue_id, to_state, note, created_by)
  values (v_id, 'open', 'Created' || case when t.id is not null then ' from ' || t.ticket_number else '' end, p_actor_user_id);
  if t.id is not null then
    perform public.forge_support_link_development_internal(v_id, t.id, p_actor_user_id);
  end if;
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', t.organization_id, 'helpdesk.development.created', 'support_development_issue', v_id::text,
    null, jsonb_build_object('issue_number', v_number, 'type', v_type, 'ticket_id', t.id), null,
    p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'development_issue_id', v_id, 'issue_number', v_number);
end $$;

create or replace function public.forge_support_link_development_issue(
  p_issue_id uuid,
  p_ticket_id uuid,
  p_actor_user_id uuid,
  p_link boolean,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.forge_support_development_issues%rowtype;
  t public.forge_support_tickets%rowtype;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.link_development') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to link development issues.');
  end if;
  select * into d from public.forge_support_development_issues where id = p_issue_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'Development issue not found.'); end if;
  select * into t from public.forge_support_tickets where id = p_ticket_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Ticket not found.'); end if;
  if p_link then
    perform public.forge_support_link_development_internal(d.id, t.id, p_actor_user_id);
  else
    update public.forge_support_development_links set unlinked_at = now(), unlinked_by = p_actor_user_id
    where development_issue_id = d.id and ticket_id = t.id and unlinked_at is null;
    if not found then return jsonb_build_object('ok', true, 'unchanged', true); end if;
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, visibility)
    values (t.organization_id, t.id, p_actor_user_id, 'development_unlinked', d.issue_number, 'internal');
    update public.forge_support_tickets set updated_at = now(), row_version = row_version + 1 where id = t.id;
  end if;
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', t.organization_id,
    case when p_link then 'helpdesk.development.linked' else 'helpdesk.development.unlinked' end,
    'support_ticket', t.id::text, null, jsonb_build_object('development_issue_id', d.id, 'issue_number', d.issue_number), null,
    p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.forge_support_update_development_issue(
  p_issue_id uuid,
  p_actor_user_id uuid,
  p_changes jsonb,
  p_expected_row_version bigint,
  p_note text default null,
  p_customer_update text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.forge_support_development_issues%rowtype;
  n public.forge_support_development_issues%rowtype;
  v_state text;
  v_provider text;
  v_ext_id text;
  v_ext_url text;
  v_share text := nullif(left(btrim(coalesce(p_customer_update, '')), 2000), '');
  v_ticket record;
  v_shared integer := 0;
begin
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.link_development') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to update development issues.');
  end if;
  select * into d from public.forge_support_development_issues where id = p_issue_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Development issue not found.'); end if;
  if p_expected_row_version is not null and p_expected_row_version <> d.row_version then
    return jsonb_build_object('ok', false, 'conflict', true, 'error', 'This development issue changed after you opened it. Refresh and try again.');
  end if;
  v_state := coalesce(nullif(p_changes->>'state', ''), d.state);
  if v_state not in ('open','triaged','in_progress','in_review','fixed','released','wont_fix','duplicate','closed') then
    return jsonb_build_object('ok', false, 'error', 'Invalid development state.');
  end if;
  v_provider := coalesce(nullif(p_changes->>'external_provider', ''), d.external_provider);
  if v_provider not in ('forge_internal','github','jira','azure_devops','linear','other') then
    return jsonb_build_object('ok', false, 'error', 'Unsupported development provider.');
  end if;
  v_ext_id := case when v_provider = 'forge_internal' then null
                   else coalesce(nullif(btrim(p_changes->>'external_issue_id'), ''), d.external_issue_id) end;
  v_ext_url := case when v_provider = 'forge_internal' then null
                    else coalesce(nullif(btrim(p_changes->>'external_url'), ''), d.external_url) end;
  if v_provider <> 'forge_internal' and (v_ext_id is null or v_ext_url is null or v_ext_url !~ '^https://') then
    return jsonb_build_object('ok', false, 'error', 'External issues need an issue ID and an https:// URL.');
  end if;
  if v_provider <> 'forge_internal' and exists (
    select 1 from public.forge_support_development_issues where external_provider = v_provider and external_issue_id = v_ext_id and id <> d.id
  ) then
    return jsonb_build_object('ok', false, 'error', 'That external issue is already linked to ' ||
      (select issue_number from public.forge_support_development_issues where external_provider = v_provider and external_issue_id = v_ext_id) || '.');
  end if;

  update public.forge_support_development_issues
  set state = v_state,
      fix_version = case when p_changes ? 'fix_version' then nullif(left(btrim(coalesce(p_changes->>'fix_version', '')), 80), '') else fix_version end,
      priority = coalesce(nullif(p_changes->>'priority', ''), priority),
      external_provider = v_provider,
      external_issue_id = v_ext_id,
      external_url = v_ext_url,
      linked_at = case when v_provider = 'forge_internal' then null
                       when v_ext_id is distinct from d.external_issue_id or v_provider <> d.external_provider then now() else linked_at end,
      linked_by = case when v_provider = 'forge_internal' then null
                       when v_ext_id is distinct from d.external_issue_id or v_provider <> d.external_provider then p_actor_user_id else linked_by end,
      customer_update = coalesce(v_share, customer_update),
      closed_at = case when v_state in ('released','wont_fix','duplicate','closed') then coalesce(closed_at, now()) else null end,
      updated_at = now(),
      row_version = row_version + 1
  where id = d.id
  returning * into n;

  insert into public.forge_support_development_updates(development_issue_id, from_state, to_state, note, shared_with_customers, created_by)
  values (d.id, d.state, n.state, coalesce(nullif(left(btrim(coalesce(p_note, '')), 4000), ''), v_share), v_share is not null, p_actor_user_id);

  for v_ticket in
    select t.id, t.organization_id, t.status, t.ticket_number
    from public.forge_support_development_links l
    join public.forge_support_tickets t on t.id = l.ticket_id
    where l.development_issue_id = d.id and l.unlinked_at is null
    for update of t
  loop
    if n.fix_version is distinct from d.fix_version then
      update public.forge_support_tickets set fix_version = n.fix_version, updated_at = now(), row_version = row_version + 1 where id = v_ticket.id;
    end if;
    if n.state <> d.state then
      insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, from_value, to_value, detail, visibility)
      values (v_ticket.organization_id, v_ticket.id, p_actor_user_id, 'development_state_changed', d.state, n.state, n.issue_number, 'internal');
    end if;
    -- Only explicitly approved updates reach customers; engineering notes stay internal.
    if v_share is not null and v_ticket.status <> 'closed' then
      insert into public.forge_support_messages(organization_id, ticket_id, author_user_id, author_kind, visibility, message_type, body)
      values (v_ticket.organization_id, v_ticket.id, p_actor_user_id, 'system', 'public', 'system_event', 'Engineering update: ' || v_share);
      perform public.forge_support_notify(v_ticket.id, 'development_update', 'customer', p_actor_user_id,
        'Engineering update on ' || v_ticket.ticket_number, v_share, '{}'::uuid[], false, true, false, false);
      v_shared := v_shared + 1;
    end if;
  end loop;

  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', null, 'helpdesk.development.updated', 'support_development_issue', d.id::text,
    jsonb_build_object('state', d.state, 'fix_version', d.fix_version, 'external_provider', d.external_provider, 'external_issue_id', d.external_issue_id),
    jsonb_build_object('state', n.state, 'fix_version', n.fix_version, 'external_provider', n.external_provider, 'external_issue_id', n.external_issue_id,
                       'customer_update_shared', v_shared),
    p_note, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'row_version', n.row_version, 'tickets_notified', v_shared);
end $$;

-- ---------------------------------------------------------------------------
-- Analytics (index-backed aggregates over a bounded date range)
-- ---------------------------------------------------------------------------
create index if not exists forge_support_tickets_created_idx on public.forge_support_tickets(created_at);
create index if not exists forge_support_tickets_resolved_idx on public.forge_support_tickets(resolved_at) where resolved_at is not null;
create index if not exists forge_support_sla_instances_breach_idx on public.forge_support_sla_instances(breached_at) where breached_at is not null;

create or replace function public.forge_support_analytics(
  p_from timestamptz,
  p_to timestamptz,
  p_organization_id uuid default null,
  p_product_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid analytics range.';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'Analytics range cannot exceed 400 days.';
  end if;

  with base as (
    select t.* from public.forge_support_tickets t
    where t.deleted_at is null
      and (p_organization_id is null or t.organization_id = p_organization_id)
      and (p_product_id is null or t.product_id = p_product_id)
  ),
  created as (select * from base where created_at >= p_from and created_at < p_to),
  resolved as (select * from base where resolved_at >= p_from and resolved_at < p_to),
  first_assign as (
    select a.ticket_id, min(a.created_at) as assigned_at
    from public.forge_support_ticket_assignments a
    join created c on c.id = a.ticket_id
    where a.to_user_id is not null
    group by a.ticket_id
  ),
  sla as (
    select i.* from public.forge_support_sla_instances i join created c on c.id = i.ticket_id
  ),
  csat as (
    select s.* from public.forge_support_customer_satisfaction s
    join base b on b.id = s.ticket_id
    where s.submitted_at >= p_from and s.submitted_at < p_to
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'created', (select count(*) from created),
    'resolved', (select count(*) from resolved),
    'open', (select count(*) from base where status not in ('resolved','closed')),
    'backlog', (select count(*) from base where status not in ('resolved','closed') and created_at < p_to),
    'first_response_minutes_avg', (select round(avg(extract(epoch from (first_responded_at - created_at)) / 60)::numeric, 1) from created where first_responded_at is not null),
    'mtta_minutes_avg', (select round(avg(extract(epoch from (f.assigned_at - c.created_at)) / 60)::numeric, 1) from first_assign f join created c on c.id = f.ticket_id),
    'mttr_minutes_avg', (select round(avg(extract(epoch from (resolved_at - created_at)) / 60)::numeric, 1) from resolved),
    'sla_tracked', (select count(*) from sla),
    'sla_breached', (select count(*) from sla where breached_at is not null),
    'sla_compliance_percent', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where breached_at is null) / count(*), 1) end from sla),
    'sla_breach_count_in_range', (
      select count(*) from public.forge_support_sla_instances i join base b on b.id = i.ticket_id
      where i.breached_at >= p_from and i.breached_at < p_to),
    'reopen_rate_percent', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where reopen_count > 0) / count(*), 1) end from created),
    'duplicate_rate_percent', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where disposition = 'duplicate') / count(*), 1) end from created),
    'known_issue_count', (select count(*) from created where disposition = 'known_issue'),
    'feature_request_count', (
      select count(*) from created c left join public.forge_support_categories k on k.id = c.category_id
      where c.disposition = 'feature_request' or k.category_key = 'feature_request'),
    'csat_average', (select round(avg(rating)::numeric, 2) from csat),
    'csat_responses', (select count(*) from csat),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date,
        'created', (select count(*) from created c where c.created_at >= d and c.created_at < d + interval '1 day'),
        'resolved', (select count(*) from resolved r where r.resolved_at >= d and r.resolved_at < d + interval '1 day')) order by d)
      from generate_series(date_trunc('day', p_from), p_to - interval '1 second', interval '1 day') d
    ), '[]'::jsonb),
    'by_status', coalesce((select jsonb_agg(jsonb_build_object('key', status, 'count', n) order by n desc) from (select status, count(*) n from created group by status) s), '[]'::jsonb),
    'by_priority', coalesce((select jsonb_agg(jsonb_build_object('key', priority, 'count', n) order by priority) from (select priority, count(*) n from created group by priority) s), '[]'::jsonb),
    'by_tenant', coalesce((select jsonb_agg(jsonb_build_object('key', s.organization_id, 'label', o.name, 'count', s.n) order by s.n desc)
      from (select organization_id, count(*) n from created group by organization_id order by count(*) desc limit 20) s
      join public.organizations o on o.id = s.organization_id), '[]'::jsonb),
    'by_product', coalesce((select jsonb_agg(jsonb_build_object('key', s.product_id, 'label', coalesce(p.name, 'Unspecified'), 'count', s.n) order by s.n desc)
      from (select product_id, count(*) n from created group by product_id) s
      left join public.forge_support_products p on p.id = s.product_id), '[]'::jsonb),
    'by_module', coalesce((select jsonb_agg(jsonb_build_object('key', s.module_id, 'label', coalesce(m.label, 'Unspecified'), 'count', s.n) order by s.n desc)
      from (select module_id, count(*) n from created group by module_id order by count(*) desc limit 20) s
      left join public.forge_support_product_areas m on m.id = s.module_id), '[]'::jsonb),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('key', s.category_id, 'label', coalesce(k.label, 'Unspecified'), 'count', s.n) order by s.n desc)
      from (select category_id, count(*) n from created group by category_id) s
      left join public.forge_support_categories k on k.id = s.category_id), '[]'::jsonb),
    'by_assignee', coalesce((select jsonb_agg(jsonb_build_object('key', s.assigned_user_id, 'label', coalesce(u.name, u.email, 'Unassigned'), 'count', s.n) order by s.n desc)
      from (select assigned_user_id, count(*) n from created group by assigned_user_id) s
      left join public.users u on u.user_id = s.assigned_user_id), '[]'::jsonb),
    'top_recurring', coalesce((select jsonb_agg(jsonb_build_object('module', coalesce(m.label, 'Unspecified'), 'category', coalesce(k.label, 'Unspecified'), 'count', s.n) order by s.n desc)
      from (select module_id, category_id, count(*) n from created group by module_id, category_id having count(*) > 1 order by count(*) desc limit 10) s
      left join public.forge_support_product_areas m on m.id = s.module_id
      left join public.forge_support_categories k on k.id = s.category_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'forge_support_platform_components','forge_support_component_status_history','forge_support_platform_incidents',
    'forge_support_incident_components','forge_support_incident_tenants','forge_support_incident_tickets','forge_support_incident_updates',
    'forge_support_announcements','forge_support_development_issues','forge_support_development_links','forge_support_development_updates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'forge_support_create_incident(uuid,jsonb,jsonb)',
    'forge_support_post_incident_update(uuid,uuid,text,text,boolean,boolean,text,bigint,jsonb,jsonb)',
    'forge_support_set_incident_scope(uuid,uuid,jsonb,uuid[],boolean,jsonb)',
    'forge_support_link_incident_ticket(uuid,uuid,uuid,boolean,jsonb)',
    'forge_support_set_component_status(uuid,uuid,text,text,jsonb)',
    'forge_support_save_announcement(uuid,uuid,jsonb,bigint,jsonb)',
    'forge_support_create_development_issue(uuid,jsonb,uuid,jsonb)',
    'forge_support_link_development_issue(uuid,uuid,uuid,boolean,jsonb)',
    'forge_support_update_development_issue(uuid,uuid,jsonb,bigint,text,text,jsonb)',
    'forge_support_analytics(timestamptz,timestamptz,uuid,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

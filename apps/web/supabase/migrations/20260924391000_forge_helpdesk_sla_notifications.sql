-- FIS-HD-01 / HD-04: SLA engine + platform notification outbox.

-- ---------------------------------------------------------------------------
-- Platform notifications (reusable by any Forge module; vendor-neutral)
-- ---------------------------------------------------------------------------
create table public.forge_notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  source_module text not null check (source_module ~ '^[a-z_]+$'),
  event_type text not null check (event_type ~ '^[a-z_]+$'),
  visibility text not null check (visibility in ('customer','internal')),
  resource_type text,
  resource_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  body text check (body is null or char_length(body) <= 2000),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index forge_notification_events_resource_idx on public.forge_notification_events(resource_type, resource_id, created_at desc);
create index forge_notification_events_type_idx on public.forge_notification_events(source_module, event_type, created_at desc);

create table public.forge_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.forge_notification_events(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_audience text not null check (recipient_audience in ('customer','internal')),
  channel text not null check (channel in ('in_app','email','sms')),
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  title text not null check (char_length(title) between 1 and 200),
  body text check (body is null or char_length(body) <= 2000),
  link_path text check (link_path is null or link_path ~ '^/[A-Za-z0-9]'),
  read_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  provider text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, recipient_user_id, channel)
);
create index forge_notification_deliveries_inbox_idx on public.forge_notification_deliveries(recipient_user_id, channel, created_at desc);
create index forge_notification_deliveries_unread_idx on public.forge_notification_deliveries(recipient_user_id) where channel = 'in_app' and read_at is null;
create index forge_notification_deliveries_pending_idx on public.forge_notification_deliveries(channel, created_at) where status = 'pending';

create or replace function public.forge_notification_delivery_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_visibility text;
begin
  select visibility into v_visibility from public.forge_notification_events where id = new.event_id;
  if new.recipient_audience = 'internal' and not exists (
    select 1 from public.forge_platform_users where user_id = new.recipient_user_id and is_active
  ) then
    raise exception 'Internal notifications can only be delivered to active Forge staff.';
  end if;
  if v_visibility = 'internal' and new.recipient_audience <> 'internal' then
    raise exception 'Internal notification content cannot be delivered to customers.';
  end if;
  return new;
end $$;
create trigger forge_notification_delivery_guard
before insert or update of event_id, recipient_user_id, recipient_audience on public.forge_notification_deliveries
for each row execute function public.forge_notification_delivery_guard();

-- Help desk fan-out. Customer recipients only receive customer-visibility events.
create or replace function public.forge_support_notify(
  p_ticket_id uuid,
  p_event_type text,
  p_visibility text,
  p_actor_user_id uuid,
  p_title text,
  p_body text,
  p_extra_internal uuid[] default '{}'::uuid[],
  p_include_triage boolean default false,
  p_notify_customers boolean default true,
  p_include_actor boolean default false,
  p_only_extra boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  v_event uuid;
  v_email boolean;
begin
  select * into t from public.forge_support_tickets where id = p_ticket_id;
  if not found then return null; end if;
  select email_notifications_enabled into v_email from public.forge_support_settings where id;

  insert into public.forge_notification_events(organization_id, source_module, event_type, visibility, resource_type, resource_id, actor_user_id, title, body, payload)
  values (t.organization_id, 'helpdesk', p_event_type, p_visibility, 'support_ticket', t.id, p_actor_user_id,
          left(p_title, 200), left(p_body, 2000), jsonb_build_object('ticket_number', t.ticket_number, 'status', t.status, 'priority', t.priority))
  returning id into v_event;

  insert into public.forge_notification_deliveries(event_id, organization_id, recipient_user_id, recipient_audience, channel, status, title, body, link_path, sent_at)
  select v_event, t.organization_id, r.uid, 'internal', ch.channel,
         case when ch.channel = 'in_app' then 'sent' else 'pending' end,
         left(p_title, 200), left(p_body, 2000), '/help-desk/console/tickets/' || t.id::text,
         case when ch.channel = 'in_app' then now() end
  from (
    select distinct uid from (
      select t.assigned_user_id as uid where not p_only_extra
      union all
      select w.user_id from public.forge_support_ticket_watchers w
      where not p_only_extra and w.ticket_id = t.id and w.watcher_type = 'internal'
      union all
      select unnest(coalesce(p_extra_internal, '{}'::uuid[]))
      union all
      select m.user_id
      from public.forge_support_team_members m
      join public.forge_support_teams tm on tm.id = m.team_id and tm.is_active
      where p_include_triage and not p_only_extra
        and ((t.assigned_team_id is not null and m.team_id = t.assigned_team_id)
          or (t.assigned_team_id is null and tm.is_default_triage))
    ) raw where uid is not null
  ) r
  join public.forge_platform_users pu on pu.user_id = r.uid and pu.is_active
  cross join (select 'in_app'::text as channel union all select 'email' where coalesce(v_email, false)) ch
  where p_include_actor or r.uid is distinct from p_actor_user_id
  on conflict (event_id, recipient_user_id, channel) do nothing;

  if p_visibility = 'customer' and p_notify_customers then
    insert into public.forge_notification_deliveries(event_id, organization_id, recipient_user_id, recipient_audience, channel, status, title, body, link_path, sent_at)
    select v_event, t.organization_id, c.uid, 'customer', ch.channel,
           case when ch.channel = 'in_app' then 'sent' else 'pending' end,
           left(p_title, 200), left(p_body, 2000), '/help-desk/tickets/' || t.id::text,
           case when ch.channel = 'in_app' then now() end
    from (
      select distinct uid from (
        select t.requester_user_id as uid
        union all
        select w.user_id from public.forge_support_ticket_watchers w where w.ticket_id = t.id and w.watcher_type = 'customer'
      ) raw
    ) c
    join public.organization_memberships om on om.organization_id = t.organization_id and om.user_id = c.uid and om.is_active
    cross join (select 'in_app'::text as channel union all select 'email' where coalesce(v_email, false)) ch
    where p_include_actor or c.uid is distinct from p_actor_user_id
    on conflict (event_id, recipient_user_id, channel) do nothing;
  end if;

  return v_event;
end $$;
revoke all on function public.forge_support_notify(uuid,text,text,uuid,text,text,uuid[],boolean,boolean,boolean,boolean) from public;
grant execute on function public.forge_support_notify(uuid,text,text,uuid,text,text,uuid[],boolean,boolean,boolean,boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Business calendars
-- ---------------------------------------------------------------------------
create table public.forge_support_business_calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 120),
  timezone text not null default 'America/Chicago',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index forge_support_business_calendars_default on public.forge_support_business_calendars((true)) where is_default;

create table public.forge_support_business_hours (
  calendar_id uuid not null references public.forge_support_business_calendars(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  primary key (calendar_id, day_of_week),
  check (end_time > start_time)
);

insert into public.forge_support_business_calendars(name, timezone, is_default)
values ('Forge Support Standard Hours', 'America/Chicago', true);

insert into public.forge_support_business_hours(calendar_id, day_of_week, start_time, end_time)
select c.id, d, '08:00', '17:00'
from public.forge_support_business_calendars c
cross join generate_series(1, 5) d
where c.is_default;

create or replace function public.forge_support_add_business_minutes(p_start timestamptz, p_minutes integer, p_calendar_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_local timestamp;
  v_remaining double precision := greatest(coalesce(p_minutes, 0), 0);
  v_day date;
  v_start time;
  v_end time;
  v_win_start timestamp;
  v_win_end timestamp;
  v_avail double precision;
  v_guard integer := 0;
begin
  select timezone into v_tz from public.forge_support_business_calendars where id = p_calendar_id;
  if v_tz is null or not exists (select 1 from public.forge_support_business_hours where calendar_id = p_calendar_id) then
    return p_start + make_interval(mins => coalesce(p_minutes, 0));
  end if;
  if v_remaining = 0 then return p_start; end if;

  v_local := p_start at time zone v_tz;
  loop
    v_guard := v_guard + 1;
    if v_guard > 4000 then
      raise exception 'Business-hours calculation exceeded its limit.';
    end if;
    v_day := v_local::date;
    select start_time, end_time into v_start, v_end
    from public.forge_support_business_hours
    where calendar_id = p_calendar_id and day_of_week = extract(dow from v_day)::smallint;
    if found then
      v_win_start := v_day + v_start;
      v_win_end := v_day + v_end;
      if v_local < v_win_start then v_local := v_win_start; end if;
      if v_local < v_win_end then
        v_avail := extract(epoch from (v_win_end - v_local)) / 60.0;
        if v_avail >= v_remaining then
          return (v_local + make_interval(secs => v_remaining * 60)) at time zone v_tz;
        end if;
        v_remaining := v_remaining - v_avail;
      end if;
    end if;
    v_local := (v_day + 1)::timestamp;
  end loop;
end $$;
revoke all on function public.forge_support_add_business_minutes(timestamptz, integer, uuid) from public;
grant execute on function public.forge_support_add_business_minutes(timestamptz, integer, uuid) to service_role;

create or replace function public.forge_support_sla_due(p_start timestamptz, p_minutes integer, p_mode text, p_calendar_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_minutes is null or p_start is null then null
    when p_mode = 'business' then public.forge_support_add_business_minutes(p_start, p_minutes, p_calendar_id)
    else p_start + make_interval(mins => p_minutes)
  end
$$;
revoke all on function public.forge_support_sla_due(timestamptz, integer, text, uuid) from public;
grant execute on function public.forge_support_sla_due(timestamptz, integer, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- SLA policies (replaces the flat per-priority hours table)
-- ---------------------------------------------------------------------------
drop table if exists public.forge_support_sla_policies;

create table public.forge_support_sla_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  priority text not null check (priority in ('p1_critical','p2_high','p3_normal','p4_low')),
  product_id uuid references public.forge_support_products(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete cascade,
  first_response_minutes integer not null check (first_response_minutes between 1 and 43200),
  next_response_minutes integer check (next_response_minutes is null or next_response_minutes between 1 and 43200),
  resolution_minutes integer not null check (resolution_minutes between 1 and 525600),
  hours_mode text not null default 'calendar' check (hours_mode in ('calendar','business')),
  calendar_id uuid references public.forge_support_business_calendars(id) on delete restrict,
  pause_on_waiting_customer boolean not null default true,
  pause_on_waiting_forge boolean not null default false,
  at_risk_percent integer not null default 75 check (at_risk_percent between 10 and 95),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  check (hours_mode = 'calendar' or calendar_id is not null),
  check (resolution_minutes >= first_response_minutes)
);
create unique index forge_support_sla_policies_scope on public.forge_support_sla_policies(
  priority,
  coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where is_active;

insert into public.forge_support_sla_policies(name, priority, first_response_minutes, next_response_minutes, resolution_minutes, hours_mode, calendar_id)
select v.name, v.priority, v.fr, v.nr, v.res, v.mode, case when v.mode = 'business' then c.id end
from (values
  ('P1 Critical (24x7)', 'p1_critical', 60, 120, 1440, 'calendar'),
  ('P2 High (24x7)', 'p2_high', 240, 480, 4320, 'calendar'),
  ('P3 Normal (business hours)', 'p3_normal', 480, 960, 2400, 'business'),
  ('P4 Low (business hours)', 'p4_low', 960, 1920, 4800, 'business')
) v(name, priority, fr, nr, res, mode)
cross join public.forge_support_business_calendars c
where c.is_default;

create or replace function public.forge_support_resolve_sla_policy(p_organization_id uuid, p_product_id uuid, p_priority text)
returns public.forge_support_sla_policies
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.forge_support_sla_policies p
  where p.is_active
    and p.priority = p_priority
    and (p.organization_id is null or p.organization_id = p_organization_id)
    and (p.product_id is null or p.product_id = p_product_id)
  order by (p.organization_id is not null) desc, (p.product_id is not null) desc, p.created_at
  limit 1
$$;
revoke all on function public.forge_support_resolve_sla_policy(uuid, uuid, text) from public;
grant execute on function public.forge_support_resolve_sla_policy(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- SLA instances + events
-- ---------------------------------------------------------------------------
create table public.forge_support_sla_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  ticket_id uuid not null unique,
  policy_id uuid references public.forge_support_sla_policies(id) on delete set null,
  priority text not null,
  hours_mode text not null check (hours_mode in ('calendar','business')),
  calendar_id uuid references public.forge_support_business_calendars(id) on delete set null,
  first_response_minutes integer not null,
  next_response_minutes integer,
  resolution_minutes integer not null,
  at_risk_percent integer not null,
  pause_on_waiting_customer boolean not null,
  pause_on_waiting_forge boolean not null,
  started_at timestamptz not null,
  first_response_due_at timestamptz not null,
  next_response_started_at timestamptz,
  next_response_due_at timestamptz,
  resolution_due_at timestamptz not null,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  paused_at timestamptz,
  total_paused_seconds bigint not null default 0 check (total_paused_seconds >= 0),
  at_risk_at timestamptz,
  breached_at timestamptz,
  first_response_breached_at timestamptz,
  next_response_breached_at timestamptz,
  resolution_breached_at timestamptz,
  state text not null default 'on_track' check (state in ('on_track','at_risk','breached','paused','completed')),
  last_evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);
create index forge_support_sla_instances_active_idx on public.forge_support_sla_instances(state, resolution_due_at) where state in ('on_track','at_risk');

create table public.forge_support_sla_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  ticket_id uuid not null,
  sla_instance_id uuid not null references public.forge_support_sla_instances(id) on delete cascade,
  event_type text not null check (event_type in ('started','paused','resumed','at_risk','breached','first_response_met','completed','reopened','policy_changed')),
  target text check (target is null or target in ('first_response','next_response','resolution')),
  detail text,
  occurred_at timestamptz not null default now(),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);
create index forge_support_sla_events_ticket_idx on public.forge_support_sla_events(ticket_id, occurred_at);
create index forge_support_sla_events_type_idx on public.forge_support_sla_events(event_type, occurred_at);

create or replace function public.forge_support_sla_compute_state(i public.forge_support_sla_instances, p_now timestamptz)
returns text
language plpgsql
immutable
as $$
declare
  v_pct double precision := (100 - i.at_risk_percent) / 100.0;
  v_start timestamptz := i.started_at + make_interval(secs => i.total_paused_seconds);
begin
  if i.resolved_at is not null then return 'completed'; end if;
  if i.paused_at is not null then return 'paused'; end if;
  if i.breached_at is not null then return 'breached'; end if;
  if (i.first_responded_at is null and p_now >= i.first_response_due_at)
     or (i.next_response_due_at is not null and p_now >= i.next_response_due_at)
     or p_now >= i.resolution_due_at then
    return 'breached';
  end if;
  if (i.first_responded_at is null and p_now >= i.first_response_due_at - (i.first_response_due_at - v_start) * v_pct)
     or (i.next_response_due_at is not null and i.next_response_started_at is not null
         and p_now >= i.next_response_due_at - (i.next_response_due_at - i.next_response_started_at) * v_pct)
     or p_now >= i.resolution_due_at - (i.resolution_due_at - v_start) * v_pct then
    return 'at_risk';
  end if;
  return 'on_track';
end $$;

-- Re-evaluates one instance, records at-risk/breach transitions, mirrors state onto the ticket.
create or replace function public.forge_support_sla_refresh(p_instance_id uuid, p_now timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id uuid;
  t public.forge_support_tickets%rowtype;
  i public.forge_support_sla_instances%rowtype;
  v_new text;
  v_target text;
begin
  select ticket_id into v_ticket_id from public.forge_support_sla_instances where id = p_instance_id;
  if v_ticket_id is null then return null; end if;
  -- Lock order everywhere is ticket -> SLA instance.
  select * into t from public.forge_support_tickets where id = v_ticket_id for update;
  select * into i from public.forge_support_sla_instances where id = p_instance_id for update;

  v_new := public.forge_support_sla_compute_state(i, p_now);

  if v_new = 'breached' and i.breached_at is null then
    i.breached_at := p_now;
    if i.first_responded_at is null and p_now >= i.first_response_due_at then
      v_target := 'first_response';
      i.first_response_breached_at := coalesce(i.first_response_breached_at, p_now);
    elsif i.next_response_due_at is not null and p_now >= i.next_response_due_at then
      v_target := 'next_response';
      i.next_response_breached_at := coalesce(i.next_response_breached_at, p_now);
    else
      v_target := 'resolution';
      i.resolution_breached_at := coalesce(i.resolution_breached_at, p_now);
    end if;
    insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, target, detail, occurred_at)
    values (i.organization_id, i.ticket_id, i.id, 'breached', v_target, replace(v_target, '_', ' ') || ' target breached', p_now);
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, to_value, detail, visibility)
    values (i.organization_id, i.ticket_id, null, 'sla_breached', v_target, 'SLA ' || replace(v_target, '_', ' ') || ' target breached', 'internal');
    perform public.forge_support_notify(i.ticket_id, 'sla_breached', 'internal', null,
      'SLA breached: ' || t.ticket_number, t.subject || ' - ' || replace(v_target, '_', ' ') || ' target breached.', '{}'::uuid[], true, false);
  elsif v_new = 'at_risk' and i.state <> 'at_risk' then
    i.at_risk_at := p_now;
    insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, detail, occurred_at)
    values (i.organization_id, i.ticket_id, i.id, 'at_risk', 'SLA target at risk', p_now);
    insert into public.forge_support_events(organization_id, ticket_id, actor_user_id, event_type, detail, visibility)
    values (i.organization_id, i.ticket_id, null, 'sla_at_risk', 'SLA target at risk', 'internal');
    perform public.forge_support_notify(i.ticket_id, 'sla_at_risk', 'internal', null,
      'SLA at risk: ' || t.ticket_number, t.subject, '{}'::uuid[], true, false);
  end if;

  update public.forge_support_sla_instances
  set state = v_new,
      at_risk_at = i.at_risk_at,
      breached_at = i.breached_at,
      first_response_breached_at = i.first_response_breached_at,
      next_response_breached_at = i.next_response_breached_at,
      resolution_breached_at = i.resolution_breached_at,
      last_evaluated_at = p_now,
      updated_at = now()
  where id = i.id;

  update public.forge_support_tickets
  set sla_state = v_new,
      first_response_due_at = i.first_response_due_at,
      next_response_due_at = i.next_response_due_at,
      resolution_due_at = i.resolution_due_at,
      sla_breached_at = i.breached_at
  where id = i.ticket_id;

  return v_new;
end $$;
revoke all on function public.forge_support_sla_refresh(uuid, timestamptz) from public;
grant execute on function public.forge_support_sla_refresh(uuid, timestamptz) to service_role;

-- Applies a ticket lifecycle event to its SLA instance. Called inside ticket RPC transactions.
create or replace function public.forge_support_sla_sync(
  p_ticket_id uuid,
  p_event text,
  p_now timestamptz default now(),
  p_new_status text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  i public.forge_support_sla_instances%rowtype;
  p public.forge_support_sla_policies%rowtype;
  v_delta interval;
  v_pause boolean;
begin
  select * into t from public.forge_support_tickets where id = p_ticket_id for update;
  if not found then return null; end if;

  if p_event = 'created' then
    p := public.forge_support_resolve_sla_policy(t.organization_id, t.product_id, t.priority);
    if p.id is null then return null; end if;
    insert into public.forge_support_sla_instances(
      organization_id, ticket_id, policy_id, priority, hours_mode, calendar_id,
      first_response_minutes, next_response_minutes, resolution_minutes, at_risk_percent,
      pause_on_waiting_customer, pause_on_waiting_forge, started_at,
      first_response_due_at, resolution_due_at, state, last_evaluated_at
    ) values (
      t.organization_id, t.id, p.id, t.priority, p.hours_mode, p.calendar_id,
      p.first_response_minutes, p.next_response_minutes, p.resolution_minutes, p.at_risk_percent,
      p.pause_on_waiting_customer, p.pause_on_waiting_forge, t.created_at,
      public.forge_support_sla_due(t.created_at, p.first_response_minutes, p.hours_mode, p.calendar_id),
      public.forge_support_sla_due(t.created_at, p.resolution_minutes, p.hours_mode, p.calendar_id),
      'on_track', p_now
    )
    on conflict (ticket_id) do nothing
    returning * into i;
    if i.id is null then
      select * into i from public.forge_support_sla_instances where ticket_id = t.id;
    else
      insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, detail, occurred_at)
      values (i.organization_id, i.ticket_id, i.id, 'started', p.name, p_now);
    end if;
    return public.forge_support_sla_refresh(i.id, p_now);
  end if;

  select * into i from public.forge_support_sla_instances where ticket_id = p_ticket_id for update;
  if not found then return null; end if;

  if p_event = 'support_public_reply' then
    if i.first_responded_at is null then
      i.first_responded_at := p_now;
      if p_now > i.first_response_due_at and i.first_response_breached_at is null then
        i.first_response_breached_at := p_now;
        i.breached_at := coalesce(i.breached_at, p_now);
        insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, target, detail, occurred_at)
        values (i.organization_id, i.ticket_id, i.id, 'breached', 'first_response', 'First response sent after target', p_now);
      end if;
      insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, target, occurred_at)
      values (i.organization_id, i.ticket_id, i.id, 'first_response_met', 'first_response', p_now);
    end if;
    i.next_response_due_at := null;
    i.next_response_started_at := null;

  elsif p_event = 'customer_reply' then
    if i.first_responded_at is not null and i.next_response_minutes is not null
       and i.next_response_due_at is null and i.resolved_at is null then
      i.next_response_started_at := p_now;
      i.next_response_due_at := public.forge_support_sla_due(p_now, i.next_response_minutes, i.hours_mode, i.calendar_id);
    end if;

  elsif p_event = 'status' then
    v_pause := (p_new_status = 'waiting_on_customer' and i.pause_on_waiting_customer)
            or (p_new_status = 'waiting_on_forge' and i.pause_on_waiting_forge);

    if i.paused_at is not null and not v_pause then
      v_delta := p_now - i.paused_at;
      i.total_paused_seconds := i.total_paused_seconds + greatest(extract(epoch from v_delta)::bigint, 0);
      if i.first_responded_at is null then i.first_response_due_at := i.first_response_due_at + v_delta; end if;
      if i.next_response_due_at is not null then i.next_response_due_at := i.next_response_due_at + v_delta; end if;
      i.resolution_due_at := i.resolution_due_at + v_delta;
      i.paused_at := null;
      insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, detail, occurred_at)
      values (i.organization_id, i.ticket_id, i.id, 'resumed', 'Paused for ' || justify_interval(date_trunc('second', v_delta))::text, p_now);
    end if;

    if p_new_status in ('resolved','closed') and i.resolved_at is null then
      i.resolved_at := p_now;
      if p_now > i.resolution_due_at and i.resolution_breached_at is null then
        i.resolution_breached_at := p_now;
        i.breached_at := coalesce(i.breached_at, p_now);
        insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, target, detail, occurred_at)
        values (i.organization_id, i.ticket_id, i.id, 'breached', 'resolution', 'Resolved after target', p_now);
      end if;
      insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, target, occurred_at)
      values (i.organization_id, i.ticket_id, i.id, 'completed', 'resolution', p_now);
    elsif p_new_status = 'reopened' and i.resolved_at is not null then
      i.resolved_at := null;
      insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, occurred_at)
      values (i.organization_id, i.ticket_id, i.id, 'reopened', p_now);
    end if;

    if v_pause and i.paused_at is null and i.resolved_at is null then
      i.paused_at := p_now;
      insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, detail, occurred_at)
      values (i.organization_id, i.ticket_id, i.id, 'paused', 'Status ' || p_new_status, p_now);
    end if;

  elsif p_event = 'priority' then
    p := public.forge_support_resolve_sla_policy(t.organization_id, t.product_id, t.priority);
    if p.id is not null then
      i.policy_id := p.id;
      i.priority := t.priority;
      i.hours_mode := p.hours_mode;
      i.calendar_id := p.calendar_id;
      i.first_response_minutes := p.first_response_minutes;
      i.next_response_minutes := p.next_response_minutes;
      i.resolution_minutes := p.resolution_minutes;
      i.at_risk_percent := p.at_risk_percent;
      i.pause_on_waiting_customer := p.pause_on_waiting_customer;
      i.pause_on_waiting_forge := p.pause_on_waiting_forge;
      if i.first_responded_at is null then
        i.first_response_due_at := public.forge_support_sla_due(i.started_at, p.first_response_minutes, p.hours_mode, p.calendar_id)
          + make_interval(secs => i.total_paused_seconds);
      end if;
      i.resolution_due_at := public.forge_support_sla_due(i.started_at, p.resolution_minutes, p.hours_mode, p.calendar_id)
        + make_interval(secs => i.total_paused_seconds);
      if i.next_response_due_at is not null then
        i.next_response_due_at := public.forge_support_sla_due(i.next_response_started_at, p.next_response_minutes, p.hours_mode, p.calendar_id);
      end if;
      insert into public.forge_support_sla_events(organization_id, ticket_id, sla_instance_id, event_type, detail, occurred_at)
      values (i.organization_id, i.ticket_id, i.id, 'policy_changed', p.name, p_now);
    end if;
  end if;

  update public.forge_support_sla_instances
  set policy_id = i.policy_id,
      priority = i.priority,
      hours_mode = i.hours_mode,
      calendar_id = i.calendar_id,
      first_response_minutes = i.first_response_minutes,
      next_response_minutes = i.next_response_minutes,
      resolution_minutes = i.resolution_minutes,
      at_risk_percent = i.at_risk_percent,
      pause_on_waiting_customer = i.pause_on_waiting_customer,
      pause_on_waiting_forge = i.pause_on_waiting_forge,
      first_response_due_at = i.first_response_due_at,
      next_response_started_at = i.next_response_started_at,
      next_response_due_at = i.next_response_due_at,
      resolution_due_at = i.resolution_due_at,
      first_responded_at = i.first_responded_at,
      resolved_at = i.resolved_at,
      paused_at = i.paused_at,
      total_paused_seconds = i.total_paused_seconds,
      breached_at = i.breached_at,
      first_response_breached_at = i.first_response_breached_at,
      resolution_breached_at = i.resolution_breached_at,
      state = case
        when i.resolved_at is not null then 'completed'
        when i.paused_at is not null then 'paused'
        when i.breached_at is not null then 'breached'
        when state in ('completed','paused') then 'on_track'
        else state end,
      updated_at = now()
  where id = i.id;

  return public.forge_support_sla_refresh(i.id, p_now);
end $$;
revoke all on function public.forge_support_sla_sync(uuid, text, timestamptz, text) from public;
grant execute on function public.forge_support_sla_sync(uuid, text, timestamptz, text) to service_role;

-- Scheduled/lazy evaluation entry point. p_now lets tests and backfills evaluate a point in time.
create or replace function public.forge_support_evaluate_sla(p_now timestamptz default now(), p_ticket_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_new text;
  v_checked integer := 0;
  v_at_risk integer := 0;
  v_breached integer := 0;
begin
  for r in
    select id, state from public.forge_support_sla_instances
    where state in ('on_track','at_risk')
      and (p_ticket_id is null or ticket_id = p_ticket_id)
    order by resolution_due_at
    limit 5000
  loop
    v_new := public.forge_support_sla_refresh(r.id, p_now);
    v_checked := v_checked + 1;
    if v_new is distinct from r.state then
      if v_new = 'at_risk' then v_at_risk := v_at_risk + 1; end if;
      if v_new = 'breached' then v_breached := v_breached + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('checked', v_checked, 'at_risk', v_at_risk, 'breached', v_breached, 'evaluated_at', p_now);
end $$;
revoke all on function public.forge_support_evaluate_sla(timestamptz, uuid) from public;
grant execute on function public.forge_support_evaluate_sla(timestamptz, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: service-role only
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'forge_notification_events','forge_notification_deliveries','forge_support_business_calendars',
    'forge_support_business_hours','forge_support_sla_policies','forge_support_sla_instances','forge_support_sla_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

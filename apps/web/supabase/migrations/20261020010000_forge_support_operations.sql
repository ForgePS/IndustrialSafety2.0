-- Support operations: durable in-app notifications, requester feedback, and reports.
create table public.forge_support_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  ticket_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('customer','staff')),
  kind text not null check (kind in ('created','customer_reply','forge_reply','status_changed','assigned','feedback')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id,ticket_id)
    references public.forge_support_tickets(organization_id,id) on delete cascade
);
create index forge_support_notifications_inbox_idx
  on public.forge_support_notifications(recipient_user_id,audience,organization_id,created_at desc);
alter table public.forge_support_notifications enable row level security;
revoke all on public.forge_support_notifications from anon,authenticated;
grant all on public.forge_support_notifications to service_role;

create table public.forge_support_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  ticket_id uuid not null unique,
  requester_user_id uuid not null references auth.users(id),
  rating integer not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (organization_id,ticket_id)
    references public.forge_support_tickets(organization_id,id) on delete cascade
);
alter table public.forge_support_feedback enable row level security;
revoke all on public.forge_support_feedback from anon,authenticated;
grant all on public.forge_support_feedback to service_role;

-- Called inside trigger transactions; no notification body or internal message
-- content is copied into the inbox.
create function public.notify_forge_support_staff(
  p_org uuid,p_ticket uuid,p_assignee uuid,p_actor uuid,p_kind text
) returns void language sql security definer set search_path=public as $$
  insert into public.forge_support_notifications
    (organization_id,ticket_id,recipient_user_id,audience,kind)
  select p_org,p_ticket,u.user_id,'staff',p_kind
  from public.forge_platform_users u
  where u.is_active
    and u.platform_role in ('forge_owner','forge_creator','forge_support')
    and (p_assignee is null or u.user_id=p_assignee)
    and u.user_id is distinct from p_actor;
$$;
revoke all on function public.notify_forge_support_staff(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;

create function public.forge_support_ticket_notify()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='INSERT' then
    perform public.notify_forge_support_staff(new.organization_id,new.id,new.assigned_to,new.requester_user_id,'created');
  else
    if new.status is distinct from old.status then
      insert into public.forge_support_notifications
        (organization_id,ticket_id,recipient_user_id,audience,kind)
      values (new.organization_id,new.id,new.requester_user_id,'customer','status_changed');
    end if;
    if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
      perform public.notify_forge_support_staff(new.organization_id,new.id,new.assigned_to,null,'assigned');
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.forge_support_ticket_notify() from public,anon,authenticated;
create trigger forge_support_ticket_notification after insert or update of status,assigned_to
  on public.forge_support_tickets for each row execute function public.forge_support_ticket_notify();

create function public.forge_support_message_notify()
returns trigger language plpgsql security definer set search_path=public as $$
declare t public.forge_support_tickets%rowtype;
begin
  if new.visibility <> 'public' then return new; end if;
  select * into strict t from public.forge_support_tickets
    where organization_id=new.organization_id and id=new.ticket_id;
  if new.author_kind='forge' then
    if t.requester_user_id <> new.author_user_id then
      insert into public.forge_support_notifications
        (organization_id,ticket_id,recipient_user_id,audience,kind)
      values (t.organization_id,t.id,t.requester_user_id,'customer','forge_reply');
    end if;
  else
    perform public.notify_forge_support_staff(t.organization_id,t.id,t.assigned_to,new.author_user_id,'customer_reply');
  end if;
  return new;
end; $$;
revoke all on function public.forge_support_message_notify() from public,anon,authenticated;
create trigger forge_support_message_notification after insert
  on public.forge_support_messages for each row execute function public.forge_support_message_notify();

-- Lock the ticket while accepting feedback so a concurrent reopen cannot leave
-- a rating accepted for an active request. Only the original requester may rate.
create function public.submit_forge_support_feedback(
  p_org uuid,p_ticket uuid,p_actor uuid,p_rating integer,p_comment text
) returns uuid language plpgsql security definer set search_path=public as $$
declare t public.forge_support_tickets%rowtype; v_id uuid;
begin
  select * into t from public.forge_support_tickets
    where organization_id=p_org and id=p_ticket for update;
  if not found or t.requester_user_id <> p_actor then
    raise exception 'Request not found';
  end if;
  if t.status not in ('resolved','closed') then
    raise exception 'Feedback is available after resolution';
  end if;
  if p_rating is null or p_rating not between 1 and 5 or char_length(p_comment)>2000 then
    raise exception 'Invalid feedback';
  end if;
  insert into public.forge_support_feedback(organization_id,ticket_id,requester_user_id,rating,comment)
  values(p_org,p_ticket,p_actor,p_rating,nullif(btrim(p_comment),''))
  returning id into v_id;
  insert into public.forge_support_events(organization_id,ticket_id,actor_user_id,event_type)
  values(p_org,p_ticket,p_actor,'feedback_submitted');
  perform public.notify_forge_support_staff(p_org,p_ticket,t.assigned_to,p_actor,'feedback');
  return v_id;
end; $$;
revoke all on function public.submit_forge_support_feedback(uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.submit_forge_support_feedback(uuid,uuid,uuid,integer,text) to service_role;

-- Aggregate directly in PostgreSQL; reports do not inherit the queue's row limit.
create function public.forge_support_report(p_start timestamptz,p_end timestamptz)
returns jsonb language sql stable security definer set search_path=public as $$
  with cohort as (
    select * from public.forge_support_tickets
    where created_at>=p_start and created_at<p_end
  ), summary as (
    select count(*) as total,
      count(*) filter(where status not in ('resolved','closed')) as active,
      count(*) filter(where status in ('resolved','closed')) as resolved,
      count(*) filter(where first_responded_at is null and first_response_due_at<now()
        and status not in ('resolved','closed')) as response_overdue,
      count(*) filter(where status not in ('resolved','closed') and resolution_due_at<now()) as resolution_overdue,
      avg(extract(epoch from (first_responded_at-created_at))/3600)
        filter(where first_responded_at is not null) as average_response_hours,
      avg(extract(epoch from (resolved_at-created_at))/3600)
        filter(where resolved_at is not null) as average_resolution_hours,
      count(*) filter(where first_responded_at is not null and first_response_due_at is not null) as responded_with_target,
      count(*) filter(where first_responded_at<=first_response_due_at) as responses_within_target
    from cohort
  ), feedback as (
    select count(*) as responses, avg(f.rating) as average_rating,
      count(*) filter(where f.rating>=4) as satisfied
    from public.forge_support_feedback f join cohort t on t.id=f.ticket_id
  ), categories as (
    select category,count(*) as total from cohort group by category order by total desc,category
  ), priorities as (
    select priority,count(*) as total from cohort group by priority order by total desc,priority
  ), backlog as (
    select count(*) as total,
      count(*) filter(where assigned_to is null) as unassigned
    from public.forge_support_tickets where status not in ('resolved','closed')
  )
  select jsonb_build_object(
    'summary',(select to_jsonb(s) from summary s),
    'feedback',(select to_jsonb(f) from feedback f),
    'categories',coalesce((select jsonb_agg(c) from categories c),'[]'::jsonb),
    'priorities',coalesce((select jsonb_agg(p) from priorities p),'[]'::jsonb),
    'backlog',(select to_jsonb(b) from backlog b)
  );
$$;
revoke all on function public.forge_support_report(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.forge_support_report(timestamptz,timestamptz) to service_role;

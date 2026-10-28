-- Help Desk follow-up to PR #9 (support notifications, feedback and reports), on top of the Help Desk.
-- 1. Staff hear about satisfaction ratings: every rating notifies the ticket's assignee and internal
--    watchers; low ratings (1-2) are flagged and, when nobody is assigned, go to the ticket's team
--    (or the default triage team) so they are never missed.
-- 2. Service report figures the analytics lacked: overdue right now, % satisfied, all-time unassigned
--    open tickets, low-rating count and the latest rating comments.

-- ---------------------------------------------------------------------------
-- 1. Rating notifications (trigger, so every insert path is covered in the same transaction)
-- ---------------------------------------------------------------------------
create or replace function public.forge_support_csat_notify_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.forge_support_tickets%rowtype;
  v_low boolean := new.rating <= 2;
begin
  select * into t from public.forge_support_tickets where id = new.ticket_id;
  if not found then return new; end if;

  perform public.forge_support_notify(
    t.id,
    case when v_low then 'csat_low' else 'csat_received' end,
    'internal',
    new.requester_id,
    case when v_low then 'Low rating (' else 'New rating (' end || new.rating || '/5) on ' || t.ticket_number,
    coalesce(nullif(left(btrim(coalesce(new.comment, '')), 500), ''), 'No comment left.'),
    '{}'::uuid[],
    v_low and t.assigned_user_id is null,  -- unassigned low rating: ticket team or default triage
    false                                  -- never echo a rating back to customers
  );

  return new;
end $$;

revoke all on function public.forge_support_csat_notify_staff() from public, anon, authenticated;

drop trigger if exists forge_support_csat_notify_staff on public.forge_support_customer_satisfaction;
create trigger forge_support_csat_notify_staff
  after insert on public.forge_support_customer_satisfaction
  for each row execute function public.forge_support_csat_notify_staff();

-- ---------------------------------------------------------------------------
-- 2. Service report figures (same tenant/product filters as forge_support_analytics)
-- ---------------------------------------------------------------------------
create or replace function public.forge_support_analytics_service(
  p_from timestamptz,
  p_to timestamptz,
  p_organization_id uuid default null,
  p_product_id uuid default null,
  p_comment_limit integer default 50
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select t.* from public.forge_support_tickets t
    where t.deleted_at is null
      and (p_organization_id is null or t.organization_id = p_organization_id)
      and (p_product_id is null or t.product_id = p_product_id)
  ),
  open_tickets as (
    select * from base where status not in ('resolved', 'closed')
  ),
  open_sla as (
    -- Paused clocks keep their old due times until they resume, so they never count as overdue.
    select i.* from public.forge_support_sla_instances i
    join open_tickets o on o.id = i.ticket_id
    where i.paused_at is null
  ),
  csat as (
    select s.*, b.ticket_number, b.subject, b.assigned_user_id, b.organization_id as ticket_organization_id
    from public.forge_support_customer_satisfaction s
    join base b on b.id = s.ticket_id
    where s.submitted_at >= p_from and s.submitted_at < p_to
  )
  select jsonb_build_object(
    'first_response_overdue_now', (select count(*) from open_sla where first_responded_at is null and first_response_due_at < now()),
    'resolution_overdue_now', (select count(*) from open_sla where resolved_at is null and resolution_due_at < now()),
    'unassigned_open', (select count(*) from open_tickets where assigned_user_id is null),
    'csat_responses', (select count(*) from csat),
    'csat_satisfied_percent', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where rating >= 4) / count(*), 1) end from csat),
    'csat_low_count', (select count(*) from csat where rating <= 2),
    'csat_comments', coalesce((
      select jsonb_agg(c order by c.submitted_at desc)
      from (
        select s.ticket_id, s.ticket_number, s.subject, s.rating, s.comment, s.submitted_at, s.assigned_user_id,
               org.name as organization_name
        from csat s
        left join public.organizations org on org.id = s.ticket_organization_id
        where s.comment is not null and btrim(s.comment) <> ''
        order by s.submitted_at desc
        limit greatest(1, least(coalesce(p_comment_limit, 50), 200))
      ) c
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.forge_support_analytics_service(timestamptz, timestamptz, uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.forge_support_analytics_service(timestamptz, timestamptz, uuid, uuid, integer) to service_role;

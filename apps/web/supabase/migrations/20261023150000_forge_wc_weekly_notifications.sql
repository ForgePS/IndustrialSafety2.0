-- Workers' comp weekly status notice, delivered through the shared notification service
-- (forge_notification_events / forge_notification_deliveries from FIS-HD-01).
--
-- 1.0 emailed a full case table to any typed address. 2.0 sends only to Forge users who can view workers'
-- comp: each gets an in-app notice and an email built from their own scope. Employee details stay behind login.

alter table public.forge_wc_settings drop constraint if exists forge_wc_settings_recipients_when_enabled;
alter table public.forge_wc_settings drop column if exists weekly_email_recipients;

alter table public.forge_wc_settings
  add column if not exists weekly_email_recipient_ids uuid[] not null default '{}'
    check (cardinality(weekly_email_recipient_ids) <= 50);

alter table public.forge_wc_settings
  add constraint forge_wc_settings_recipients_when_enabled check (
    not weekly_email_enabled or cardinality(weekly_email_recipient_ids) > 0
  );

comment on column public.forge_wc_settings.weekly_email_recipient_ids is
  'Forge users who get the weekly status notice. Checked for active membership and workers_comp.view when saved and again when sent.';

-- Queues one week's notice atomically: one event, then an in-app and an email delivery per recipient, then
-- marks the week sent. Locks the settings row, so two overlapping sweeps cannot send the same week twice.
-- p_deliveries: [{ "user_id": uuid, "title": text, "body": text }], one per recipient, built from that
-- recipient's own workers' comp scope by the caller. Recipients must be in the saved list and active members.
create or replace function public.forge_wc_queue_weekly_status(
  p_organization_id uuid,
  p_week_of date,
  p_title text,
  p_body text,
  p_deliveries jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.forge_wc_settings%rowtype;
  v_event uuid;
  v_item jsonb;
  v_user uuid;
  v_count integer := 0;
begin
  if p_deliveries is null or jsonb_typeof(p_deliveries) <> 'array' then
    raise exception 'Deliveries must be a JSON array.' using errcode = '22023';
  end if;

  select * into s from public.forge_wc_settings where organization_id = p_organization_id for update;

  if not found or not s.weekly_email_enabled then
    return jsonb_build_object('queued', 0, 'reason', 'disabled');
  end if;

  if s.last_weekly_email_week is not distinct from p_week_of then
    return jsonb_build_object('queued', 0, 'reason', 'already_sent');
  end if;

  insert into public.forge_notification_events(organization_id, source_module, event_type, visibility, resource_type, title, body, payload)
  values (p_organization_id, 'workers_comp', 'weekly_status', 'customer', 'workers_comp_weekly',
          left(p_title, 200), left(p_body, 2000), jsonb_build_object('week_of', p_week_of))
  returning id into v_event;

  for v_item in select * from jsonb_array_elements(p_deliveries) loop
    v_user := (v_item->>'user_id')::uuid;

    if not (v_user = any(s.weekly_email_recipient_ids)) then
      raise exception 'Recipient % is not on the weekly status list.', v_user using errcode = '42501';
    end if;

    if not exists (
      select 1 from public.organization_memberships m
      where m.organization_id = p_organization_id and m.user_id = v_user and m.is_active
    ) then
      raise exception 'Recipient % is not an active member of this organization.', v_user using errcode = '42501';
    end if;

    insert into public.forge_notification_deliveries(event_id, organization_id, recipient_user_id, recipient_audience, channel, status, title, body, link_path, sent_at)
    select v_event, p_organization_id, v_user, 'customer', ch.channel,
           case when ch.channel = 'in_app' then 'sent' else 'pending' end,
           left(coalesce(v_item->>'title', p_title), 200), left(coalesce(v_item->>'body', p_body), 2000),
           '/workers-comp/weekly',
           case when ch.channel = 'in_app' then now() end
    from (values ('in_app'), ('email')) as ch(channel)
    on conflict (event_id, recipient_user_id, channel) do nothing;

    v_count := v_count + 1;
  end loop;

  update public.forge_wc_settings set last_weekly_email_week = p_week_of where organization_id = p_organization_id;

  return jsonb_build_object('queued', v_count, 'event_id', v_event, 'reason', 'queued');
end $$;

revoke all on function public.forge_wc_queue_weekly_status(uuid, date, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.forge_wc_queue_weekly_status(uuid, date, text, text, jsonb) to service_role;

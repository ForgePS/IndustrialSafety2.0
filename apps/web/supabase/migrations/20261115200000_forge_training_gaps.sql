-- Port slice 6: the rest of 1.0 Training (docs/PORT_S6_TRAINING_GAPS.md).
--
--   * forge_training_settings      new columns: assignment notices, due-soon and overdue reminders,
--                                  expiring-certification notices, automatic retraining
--   * forge_training_completion_files   certificates / proof attached to a completion (1.0 record attachments)
--   * forge_training_notice_log    one row per notice sent, so the hourly job never repeats one
--   * forge_training_material_folders + materials.folder_id / topic   the 1.0 source library
--   * forge_training_queue_notices()       queues in-app + email notices atomically, deduped
--   * forge_training_mark_auto_retrain()   claims a tenant's daily retraining run
--
-- Every table is service-role only, like the rest of training. The app checks training.* permissions and scope.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table public.forge_training_settings
  add column if not exists notify_on_assign boolean not null default true,
  add column if not exists due_reminder_days integer not null default 3 check (due_reminder_days between 0 and 30),
  add column if not exists overdue_notices boolean not null default true,
  add column if not exists expiring_notice_days integer not null default 30 check (expiring_notice_days between 0 and 120),
  add column if not exists auto_retrain boolean not null default false,
  add column if not exists retrain_due_days integer not null default 30 check (retrain_due_days between 1 and 180),
  add column if not exists last_auto_retrain_on date;

comment on column public.forge_training_settings.due_reminder_days is 'Remind learners this many days before an assignment is due. 0 turns due-soon reminders off.';
comment on column public.forge_training_settings.expiring_notice_days is 'Tell learners this many days before a certification expires. 0 turns it off.';
comment on column public.forge_training_settings.auto_retrain is 'Each day, assign group-required training that is missing, expired or expiring (1.0 had no automatic retraining).';

-- ---------------------------------------------------------------------------
-- Completion attachments (1.0: certificate uploads on training records)
-- ---------------------------------------------------------------------------

create table if not exists public.forge_training_completion_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  completion_id uuid not null references public.forge_training_completions(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif')),
  byte_size integer not null check (byte_size between 1 and 12582912),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null
);

create index if not exists forge_training_completion_files_completion
  on public.forge_training_completion_files (completion_id) where removed_at is null;

create or replace function public.forge_training_completion_files_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if tg_op = 'UPDATE' then
    if new.storage_path <> old.storage_path or new.completion_id <> old.completion_id or new.organization_id <> old.organization_id then
      raise exception 'An attachment cannot move.' using errcode = '23514';
    end if;

    if old.removed_at is not null and new.removed_at is null then
      raise exception 'A removed attachment cannot be restored.' using errcode = '23514';
    end if;

    return new;
  end if;

  perform public.forge_assert_same_org('public.forge_training_completions', new.completion_id, new.organization_id, 'Training completion');

  select count(*) into v_count
  from public.forge_training_completion_files
  where completion_id = new.completion_id and removed_at is null;

  if v_count >= 10 then
    raise exception 'At most 10 attachments per training record. Remove one first.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_training_completion_files_guard on public.forge_training_completion_files;
create trigger forge_training_completion_files_guard
before insert or update on public.forge_training_completion_files
for each row execute function public.forge_training_completion_files_guard();

-- ---------------------------------------------------------------------------
-- Source library: folders and topics on materials
-- ---------------------------------------------------------------------------

create table if not exists public.forge_training_material_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.forge_training_courses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (course_id, name)
);

alter table public.forge_training_materials
  add column if not exists folder_id uuid references public.forge_training_material_folders(id) on delete set null,
  add column if not exists topic text not null default 'general';

alter table public.forge_training_materials drop constraint if exists forge_training_materials_topic_check;
alter table public.forge_training_materials add constraint forge_training_materials_topic_check check (topic in (
  'general','new_hire','safety','loto','ppe','emergency','fleet','equipment','compliance','refresher'
));

create or replace function public.forge_training_material_folders_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.forge_assert_same_org('public.forge_training_courses', new.course_id, new.organization_id, 'Course');

  if tg_op = 'UPDATE' and new.course_id <> old.course_id then
    raise exception 'A folder cannot move to another course.' using errcode = '23514';
  end if;

  new.name := btrim(new.name);
  return new;
end;
$$;

drop trigger if exists forge_training_material_folders_guard on public.forge_training_material_folders;
create trigger forge_training_material_folders_guard
before insert or update on public.forge_training_material_folders
for each row execute function public.forge_training_material_folders_guard();

-- A material's folder must belong to the same course (1.0 rule).
create or replace function public.forge_training_material_folder_check()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.folder_id is not null and not exists (
    select 1 from public.forge_training_material_folders f where f.id = new.folder_id and f.course_id = new.course_id
  ) then
    raise exception 'That folder belongs to another course.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_training_material_folder_check on public.forge_training_materials;
create trigger forge_training_material_folder_check
before insert or update of folder_id, course_id on public.forge_training_materials
for each row execute function public.forge_training_material_folder_check();

-- ---------------------------------------------------------------------------
-- Notices
-- ---------------------------------------------------------------------------

create table if not exists public.forge_training_notice_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('assigned','due_soon','overdue','expiring')),
  -- The assignment (assigned / due_soon / overdue) or completion (expiring) the notice is about.
  subject_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.forge_notification_events(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, subject_id, recipient_user_id)
);

create index if not exists forge_training_notice_log_org on public.forge_training_notice_log (organization_id, created_at desc);

-- p_items: [{ "kind", "subject_id", "user_id", "title", "body", "link_path" }]. Each item becomes one event with an
-- in-app and an email delivery, unless the same kind/subject/recipient was already sent. Recipients must be
-- active members. Returns how many were queued and how many were already sent.
create or replace function public.forge_training_queue_notices(p_organization_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_user uuid;
  v_kind text;
  v_subject uuid;
  v_log uuid;
  v_event uuid;
  v_queued integer := 0;
  v_duplicate integer := 0;
  v_skipped integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Notices must be a JSON array.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 1000 then
    raise exception 'At most 1000 notices per call.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_user := (v_item ->> 'user_id')::uuid;
    v_kind := v_item ->> 'kind';
    v_subject := (v_item ->> 'subject_id')::uuid;

    if not exists (
      select 1 from public.organization_memberships m
      where m.organization_id = p_organization_id and m.user_id = v_user and m.is_active
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.forge_training_notice_log (organization_id, kind, subject_id, recipient_user_id)
    values (p_organization_id, v_kind, v_subject, v_user)
    on conflict (kind, subject_id, recipient_user_id) do nothing
    returning id into v_log;

    if v_log is null then
      v_duplicate := v_duplicate + 1;
      continue;
    end if;

    insert into public.forge_notification_events (organization_id, source_module, event_type, visibility, resource_type, resource_id, title, body, payload)
    values (p_organization_id, 'training', v_kind, 'customer',
            case when v_kind = 'expiring' then 'training_completion' else 'training_assignment' end,
            v_subject, left(v_item ->> 'title', 200), left(v_item ->> 'body', 2000), jsonb_build_object('kind', v_kind))
    returning id into v_event;

    insert into public.forge_notification_deliveries (event_id, organization_id, recipient_user_id, recipient_audience, channel, status, title, body, link_path, sent_at)
    select v_event, p_organization_id, v_user, 'customer', ch.channel,
           case when ch.channel = 'in_app' then 'sent' else 'pending' end,
           left(v_item ->> 'title', 200), left(v_item ->> 'body', 2000), nullif(v_item ->> 'link_path', ''),
           case when ch.channel = 'in_app' then now() end
    from (values ('in_app'), ('email')) as ch(channel)
    on conflict (event_id, recipient_user_id, channel) do nothing;

    update public.forge_training_notice_log set event_id = v_event where id = v_log;
    v_queued := v_queued + 1;
    v_log := null;
  end loop;

  return jsonb_build_object('queued', v_queued, 'duplicate', v_duplicate, 'skipped', v_skipped);
end;
$$;

-- Claims today's automatic retraining run for a tenant. Returns false when it already ran today or is off,
-- so overlapping hourly runs never both assign.
create or replace function public.forge_training_mark_auto_retrain(p_organization_id uuid, p_today date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed integer;
begin
  update public.forge_training_settings
  set last_auto_retrain_on = p_today
  where organization_id = p_organization_id
    and auto_retrain
    and last_auto_retrain_on is distinct from p_today;

  get diagnostics v_claimed = row_count;
  return v_claimed > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['forge_training_completion_files','forge_training_material_folders','forge_training_notice_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke all on function public.forge_training_completion_files_guard() from public, anon, authenticated;
revoke all on function public.forge_training_material_folders_guard() from public, anon, authenticated;
revoke all on function public.forge_training_material_folder_check() from public, anon, authenticated;
revoke all on function public.forge_training_queue_notices(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.forge_training_mark_auto_retrain(uuid, date) from public, anon, authenticated;
grant execute on function public.forge_training_queue_notices(uuid, jsonb) to service_role;
grant execute on function public.forge_training_mark_auto_retrain(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- Permission: training reports (QC, overdue, activity, records search)
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('training.reports','training','Training Reports','Search training records, see quiz quality (QC), overdue training and team activity, and export them.','Training','reports',true,true,'organization',false,false,true,'normal',38)
on conflict (permission_key) do nothing;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select t.id, p.id, true, 'organization'
from public.forge_role_templates t
join public.forge_permission_registry p on p.permission_key = 'training.reports'
where t.template_key in ('safety-manager','company-admin')
on conflict do nothing;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key = 'training.reports'
where r.role_key in ('company-administrator','company-owner')
on conflict do nothing;

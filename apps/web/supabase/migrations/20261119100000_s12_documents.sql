-- Port slice 12: Document Control (Industrial 1.0 documents module).
--
-- Controlled documents (policies, procedures, programs) in folders, with numbered file versions that go
-- through review and approval, who each document is for (whole company, a location, a department or a role),
-- read-and-acknowledge records per approved version, and periodic reviews.
--
-- Fixes over 1.0:
-- - Acknowledgments only go to the people a document is distributed to (1.0 asked everyone to acknowledge
--   every published document and never used its distribution scopes).
-- - Only the current approved version needs acknowledging; superseded versions drop off the list.
-- - A version can't be approved by the person who submitted it, unless the company allows it in settings.
-- - Only one version can be in review at a time.
-- - A rejection needs a reason, and the submitter is told.
-- - Approving sets the next review date from the document's review interval, and a review can be confirmed
--   without a new version (1.0 never moved the review date).
-- - Submitted and approved versions can't be changed or deleted (triggers), and every step is in the history.

-- ---------------------------------------------------------------------------
-- Feature, menu
-- ---------------------------------------------------------------------------

insert into public.forge_feature_registry
  (feature_key, name, description, category, feature_type, platform_state, tenant_configurable, location_configurable, user_configurable, requires_entitlement, is_sensitive, sort_order)
values
  ('document_control', 'Document Control', 'Controlled documents with versions, approvals, distribution, acknowledgments and reviews.', 'Compliance', 'module', 'enabled', true, true, true, true, false, 255)
on conflict (feature_key) do update
set name = excluded.name, description = excluded.description, platform_state = excluded.platform_state, updated_at = now();

insert into public.forge_plan_entitlements (plan_id, feature_id, enabled)
select p.id, f.id, true
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key in ('internal-demo', 'enterprise') and f.feature_key = 'document_control'
on conflict (plan_id, feature_id) do update set enabled = excluded.enabled;

insert into public.forge_experience_elements
  (element_key, feature_id, element_type, name, default_label, default_description, route, component_key, category, sort_order, platform_enabled, protection_level, tenant_edit_mode, location_edit_mode, user_edit_mode, can_hide, can_rename, can_reorder, can_duplicate, can_delete, settings)
select 'nav.document_control', f.id, 'menu', 'Document Control', 'Document Control', 'Policies, procedures and controlled documents.', '/documents', 'document-control', 'System Tools', 242, true,
  'configurable', 'presentation', 'presentation', 'preference', true, true, true, false, false,
  '{"route_live": true, "required_permission": "documents.view"}'::jsonb
from public.forge_feature_registry f
where f.feature_key = 'document_control'
on conflict (element_key) do update
set feature_id = excluded.feature_id, route = excluded.route, category = excluded.category,
    default_description = excluded.default_description,
    settings = coalesce(public.forge_experience_elements.settings, '{}'::jsonb) || excluded.settings,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create table if not exists public.forge_document_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Let the person who submitted a version approve it (small companies with one administrator).
  allow_self_approval boolean not null default false,
  -- New documents get this review interval unless one is picked.
  default_review_interval_months integer not null default 12 check (default_review_interval_months between 1 and 60),
  -- "Review due soon" window and reminder lead time.
  review_warning_days integer not null default 30 check (review_warning_days between 1 and 180),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Folders
-- ---------------------------------------------------------------------------

-- A document is in a folder when its category equals the folder name (case-insensitive), as in 1.0.
create table if not exists public.forge_document_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists forge_document_folders_name_key on public.forge_document_folders (organization_id, lower(name));

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

create table if not exists public.forge_document_sequences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  next_value integer not null default 1
);

-- DOC-000001.
create or replace function public.next_forge_document_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.forge_document_sequences (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id)
  do update set next_value = public.forge_document_sequences.next_value + 1
  returning next_value - 1 into v_number;

  return 'DOC-' || lpad(v_number::text, 6, '0');
end;
$$;

create table if not exists public.forge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_number text not null check (char_length(btrim(document_number)) between 1 and 60),
  name text not null check (char_length(btrim(name)) between 1 and 300),
  description text check (description is null or char_length(description) <= 4000),
  -- Folder name (see forge_document_folders). Null = not in a folder.
  category text check (category is null or char_length(btrim(category)) between 1 and 120),
  -- The location the document belongs to; null = company-wide.
  location_id uuid references public.locations(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'obsolete')),
  owner_user_id uuid references auth.users(id) on delete set null,
  review_interval_months integer check (review_interval_months is null or review_interval_months between 1 and 60),
  review_due_on date,
  last_reviewed_on date,
  last_reviewed_by uuid references auth.users(id) on delete set null,
  requires_acknowledgment boolean not null default true,
  current_version_id uuid,
  obsolete_reason text check (obsolete_reason is null or char_length(obsolete_reason) <= 2000),
  obsoleted_at timestamptz,
  obsoleted_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists forge_documents_number_key on public.forge_documents (organization_id, lower(document_number));
create index if not exists forge_documents_org_status_idx on public.forge_documents (organization_id, status) where archived_at is null;
create index if not exists forge_documents_org_category_idx on public.forge_documents (organization_id, lower(category)) where archived_at is null;
create index if not exists forge_documents_review_idx on public.forge_documents (organization_id, review_due_on) where archived_at is null and status = 'published';

create table if not exists public.forge_document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.forge_documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  file_name text not null check (char_length(file_name) between 1 and 255),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  storage_path text not null,
  change_summary text check (change_summary is null or char_length(change_summary) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'superseded')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  effective_on date,
  approval_note text check (approval_note is null or char_length(approval_note) <= 2000),
  -- The last rejection (the version goes back to draft).
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  superseded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version_number)
);

create index if not exists forge_document_versions_doc_idx on public.forge_document_versions (document_id, version_number desc);
create index if not exists forge_document_versions_review_idx on public.forge_document_versions (organization_id, submitted_at) where status = 'in_review';
create unique index if not exists forge_document_versions_one_in_review on public.forge_document_versions (document_id) where status = 'in_review';
create unique index if not exists forge_document_versions_one_approved on public.forge_document_versions (document_id) where status = 'approved';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'forge_documents_current_version_fkey') then
    alter table public.forge_documents
      add constraint forge_documents_current_version_fkey foreign key (current_version_id) references public.forge_document_versions(id) on delete set null;
  end if;
end $$;

-- Who a document is for. No rows = the whole company (as in 1.0).
create table if not exists public.forge_document_distributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.forge_documents(id) on delete cascade,
  scope_type text not null check (scope_type in ('organization', 'location', 'department', 'role')),
  scope_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((scope_type = 'organization') = (scope_id is null))
);

create unique index if not exists forge_document_distributions_key
  on public.forge_document_distributions (document_id, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.forge_document_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.forge_documents(id) on delete cascade,
  version_id uuid not null references public.forge_document_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  personnel_id uuid references public.forge_personnel(id) on delete set null,
  acknowledged_at timestamptz not null default now(),
  unique (version_id, user_id)
);

create index if not exists forge_document_acknowledgments_user_idx on public.forge_document_acknowledgments (organization_id, user_id);
create index if not exists forge_document_acknowledgments_doc_idx on public.forge_document_acknowledgments (document_id, version_id);

create table if not exists public.forge_document_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.forge_documents(id) on delete cascade,
  version_id uuid references public.forge_document_versions(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  activity_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forge_document_activity_doc_idx on public.forge_document_activity (document_id, created_at desc);

-- Review reminder dedupe (one notice per document, review date and kind).
create table if not exists public.forge_document_notice_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.forge_documents(id) on delete cascade,
  notice_key text not null,
  event_id uuid,
  created_at timestamptz not null default now(),
  unique (document_id, notice_key)
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('forge-documents', 'forge-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

create or replace function public.forge_documents_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.document_number := upper(btrim(new.document_number));
  new.category := nullif(regexp_replace(btrim(coalesce(new.category, '')), '\s+', ' ', 'g'), '');

  if new.location_id is not null and not exists (
    select 1 from public.locations l where l.id = new.location_id and l.organization_id = new.organization_id
  ) then
    raise exception 'The location is not in this organization.';
  end if;

  if new.current_version_id is not null and not exists (
    select 1 from public.forge_document_versions v
    where v.id = new.current_version_id and v.document_id = new.id and v.status = 'approved'
  ) then
    raise exception 'The current version must be an approved version of this document.';
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'A document can''t move to another organization.';
    end if;
    -- Status only moves through the workflow functions below (they set forge.document_workflow).
    if new.status is distinct from old.status and coalesce(current_setting('forge.document_workflow', true), '') <> 'on' then
      raise exception 'Use the document workflow to change a document''s status.';
    end if;
    if new.current_version_id is distinct from old.current_version_id and coalesce(current_setting('forge.document_workflow', true), '') <> 'on' then
      raise exception 'Only approval changes the current version.';
    end if;
    if old.status = 'obsolete' and new.archived_at is not distinct from old.archived_at and (
      new.name is distinct from old.name or new.description is distinct from old.description or
      new.document_number is distinct from old.document_number or new.location_id is distinct from old.location_id
    ) then
      raise exception 'An obsolete document can''t be edited.';
    end if;
    new.updated_at := now();
  elsif new.status <> 'draft' or new.current_version_id is not null then
    raise exception 'New documents start as drafts.';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_documents_guard on public.forge_documents;
create trigger forge_documents_guard before insert or update on public.forge_documents
for each row execute function public.forge_documents_guard();

create or replace function public.forge_document_versions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft versions can be deleted.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New versions start as drafts.';
    end if;
    if not exists (
      select 1 from public.forge_documents d
      where d.id = new.document_id and d.organization_id = new.organization_id and d.archived_at is null and d.status <> 'obsolete'
    ) then
      raise exception 'Versions can only be added to an active document in this organization.';
    end if;
    return new;
  end if;

  if new.document_id <> old.document_id or new.organization_id <> old.organization_id or new.version_number <> old.version_number then
    raise exception 'A version can''t move to another document.';
  end if;

  if old.status <> 'draft' and (
    new.file_name is distinct from old.file_name or new.content_type is distinct from old.content_type or
    new.size_bytes is distinct from old.size_bytes or new.storage_path is distinct from old.storage_path or
    new.change_summary is distinct from old.change_summary
  ) then
    raise exception 'A submitted version can''t be changed. Upload a new version instead.';
  end if;

  if new.status is distinct from old.status then
    if coalesce(current_setting('forge.document_workflow', true), '') <> 'on' then
      raise exception 'Use the document workflow to change a version''s status.';
    end if;
    if not (
      (old.status = 'draft' and new.status = 'in_review') or
      (old.status = 'in_review' and new.status in ('draft', 'approved')) or
      (old.status = 'approved' and new.status = 'superseded')
    ) then
      raise exception 'A version can''t go from % to %.', old.status, new.status;
    end if;
  end if;

  if old.status in ('approved', 'superseded') and (
    new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at or
    new.effective_on is distinct from old.effective_on or new.submitted_by is distinct from old.submitted_by
  ) then
    raise exception 'An approved version''s approval can''t be changed.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_document_versions_guard on public.forge_document_versions;
create trigger forge_document_versions_guard before insert or update or delete on public.forge_document_versions
for each row execute function public.forge_document_versions_guard();

create or replace function public.forge_document_distributions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.forge_documents d where d.id = new.document_id and d.organization_id = new.organization_id) then
    raise exception 'The document is not in this organization.';
  end if;
  if new.scope_type = 'location' and not exists (select 1 from public.locations l where l.id = new.scope_id and l.organization_id = new.organization_id) then
    raise exception 'The location is not in this organization.';
  end if;
  if new.scope_type = 'department' and not exists (select 1 from public.forge_departments x where x.id = new.scope_id and x.organization_id = new.organization_id) then
    raise exception 'The department is not in this organization.';
  end if;
  if new.scope_type = 'role' and not exists (select 1 from public.forge_tenant_roles r where r.id = new.scope_id and r.organization_id = new.organization_id) then
    raise exception 'The role is not in this organization.';
  end if;
  return new;
end;
$$;

drop trigger if exists forge_document_distributions_guard on public.forge_document_distributions;
create trigger forge_document_distributions_guard before insert or update on public.forge_document_distributions
for each row execute function public.forge_document_distributions_guard();

-- Acknowledgments are only for the document's current approved version.
create or replace function public.forge_document_acknowledgments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Acknowledgments can''t be changed.';
  end if;
  if not exists (
    select 1 from public.forge_documents d
    join public.forge_document_versions v on v.id = d.current_version_id
    where d.id = new.document_id and d.organization_id = new.organization_id and v.id = new.version_id
      and d.status = 'published' and d.archived_at is null
  ) then
    raise exception 'Only the current published version can be acknowledged.';
  end if;
  return new;
end;
$$;

drop trigger if exists forge_document_acknowledgments_guard on public.forge_document_acknowledgments;
create trigger forge_document_acknowledgments_guard before insert or update on public.forge_document_acknowledgments
for each row execute function public.forge_document_acknowledgments_guard();

-- ---------------------------------------------------------------------------
-- Workflow (called by the server with the service role; every step is atomic and logged)
-- ---------------------------------------------------------------------------

create or replace function public.forge_document_add_months(p_date date, p_months integer)
returns date
language sql
immutable
as $$
  select case when p_date is null or p_months is null then null else (p_date + make_interval(months => p_months))::date end;
$$;

create or replace function public.forge_document_submit_version(
  p_organization_id uuid, p_version_id uuid, p_actor_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.forge_document_versions%rowtype;
  v_doc public.forge_documents%rowtype;
begin
  select * into v_version from public.forge_document_versions where id = p_version_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Version not found.'; end if;
  select * into v_doc from public.forge_documents where id = v_version.document_id for update;
  if v_doc.archived_at is not null or v_doc.status = 'obsolete' then
    raise exception 'This document is no longer active.';
  end if;
  if v_version.status <> 'draft' then
    raise exception 'Only a draft version can be submitted for review.';
  end if;
  if exists (select 1 from public.forge_document_versions where document_id = v_doc.id and status = 'in_review') then
    raise exception 'Another version of this document is already in review.';
  end if;

  perform set_config('forge.document_workflow', 'on', true);
  update public.forge_document_versions
  set status = 'in_review', submitted_by = p_actor_user_id, submitted_at = now()
  where id = v_version.id;
  update public.forge_documents set status = 'in_review', updated_by = p_actor_user_id where id = v_doc.id;
  perform set_config('forge.document_workflow', '', true);

  insert into public.forge_document_activity (organization_id, document_id, version_id, actor_user_id, activity_type, message)
  values (p_organization_id, v_doc.id, v_version.id, p_actor_user_id, 'submitted', 'Version ' || v_version.version_number || ' submitted for review.');
end;
$$;

create or replace function public.forge_document_approve_version(
  p_organization_id uuid, p_version_id uuid, p_actor_user_id uuid, p_effective_on date, p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.forge_document_versions%rowtype;
  v_doc public.forge_documents%rowtype;
  v_allow_self boolean;
  v_effective date := coalesce(p_effective_on, current_date);
begin
  select * into v_version from public.forge_document_versions where id = p_version_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Version not found.'; end if;
  select * into v_doc from public.forge_documents where id = v_version.document_id for update;
  if v_doc.archived_at is not null or v_doc.status = 'obsolete' then
    raise exception 'This document is no longer active.';
  end if;
  if v_version.status <> 'in_review' then
    raise exception 'Only a version in review can be approved.';
  end if;
  select coalesce((select allow_self_approval from public.forge_document_settings where organization_id = p_organization_id), false) into v_allow_self;
  if not v_allow_self and v_version.submitted_by is not null and v_version.submitted_by = p_actor_user_id then
    raise exception 'Someone other than the person who submitted this version must approve it.';
  end if;

  perform set_config('forge.document_workflow', 'on', true);
  update public.forge_document_versions
  set status = 'superseded', superseded_at = now()
  where document_id = v_doc.id and status = 'approved';
  update public.forge_document_versions
  set status = 'approved', approved_by = p_actor_user_id, approved_at = now(), effective_on = v_effective,
      approval_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_version.id;
  update public.forge_documents
  set status = 'published', current_version_id = v_version.id, updated_by = p_actor_user_id,
      last_reviewed_on = v_effective, last_reviewed_by = p_actor_user_id,
      review_due_on = coalesce(public.forge_document_add_months(v_effective, v_doc.review_interval_months), v_doc.review_due_on)
  where id = v_doc.id;
  perform set_config('forge.document_workflow', '', true);

  insert into public.forge_document_activity (organization_id, document_id, version_id, actor_user_id, activity_type, message, metadata)
  values (p_organization_id, v_doc.id, v_version.id, p_actor_user_id, 'approved',
    'Version ' || v_version.version_number || ' approved and published, effective ' || to_char(v_effective, 'YYYY-MM-DD') || '.',
    jsonb_build_object('previous_version_id', v_doc.current_version_id, 'note', nullif(btrim(coalesce(p_note, '')), '')));
end;
$$;

create or replace function public.forge_document_reject_version(
  p_organization_id uuid, p_version_id uuid, p_actor_user_id uuid, p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.forge_document_versions%rowtype;
  v_doc public.forge_documents%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then raise exception 'Give a reason for sending the version back.'; end if;
  select * into v_version from public.forge_document_versions where id = p_version_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Version not found.'; end if;
  select * into v_doc from public.forge_documents where id = v_version.document_id for update;
  if v_version.status <> 'in_review' then
    raise exception 'Only a version in review can be sent back.';
  end if;

  perform set_config('forge.document_workflow', 'on', true);
  update public.forge_document_versions
  set status = 'draft', rejected_by = p_actor_user_id, rejected_at = now(), rejection_reason = left(v_reason, 2000)
  where id = v_version.id;
  update public.forge_documents
  set status = case when current_version_id is not null then 'published' else 'draft' end, updated_by = p_actor_user_id
  where id = v_doc.id and status = 'in_review';
  perform set_config('forge.document_workflow', '', true);

  insert into public.forge_document_activity (organization_id, document_id, version_id, actor_user_id, activity_type, message, metadata)
  values (p_organization_id, v_doc.id, v_version.id, p_actor_user_id, 'rejected',
    'Version ' || v_version.version_number || ' sent back: ' || left(v_reason, 500), jsonb_build_object('reason', left(v_reason, 2000)));
end;
$$;

-- Withdraw a version from review (the submitter or a manager), back to draft.
create or replace function public.forge_document_withdraw_version(
  p_organization_id uuid, p_version_id uuid, p_actor_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.forge_document_versions%rowtype;
begin
  select * into v_version from public.forge_document_versions where id = p_version_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Version not found.'; end if;
  if v_version.status <> 'in_review' then raise exception 'Only a version in review can be withdrawn.'; end if;

  perform set_config('forge.document_workflow', 'on', true);
  update public.forge_document_versions set status = 'draft', submitted_by = null, submitted_at = null where id = v_version.id;
  update public.forge_documents
  set status = case when current_version_id is not null then 'published' else 'draft' end, updated_by = p_actor_user_id
  where id = v_version.document_id and status = 'in_review';
  perform set_config('forge.document_workflow', '', true);

  insert into public.forge_document_activity (organization_id, document_id, version_id, actor_user_id, activity_type, message)
  values (p_organization_id, v_version.document_id, v_version.id, p_actor_user_id, 'withdrawn', 'Version ' || v_version.version_number || ' withdrawn from review.');
end;
$$;

create or replace function public.forge_document_mark_obsolete(
  p_organization_id uuid, p_document_id uuid, p_actor_user_id uuid, p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.forge_documents%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then raise exception 'Give a reason for making the document obsolete.'; end if;
  select * into v_doc from public.forge_documents where id = p_document_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Document not found.'; end if;
  if v_doc.status not in ('published', 'in_review') then
    raise exception 'Only a published document can be made obsolete.';
  end if;

  perform set_config('forge.document_workflow', 'on', true);
  -- A version still in review goes back to draft.
  update public.forge_document_versions set status = 'draft', submitted_by = null, submitted_at = null
  where document_id = v_doc.id and status = 'in_review';
  update public.forge_documents
  set status = 'obsolete', obsolete_reason = left(v_reason, 2000), obsoleted_at = now(), obsoleted_by = p_actor_user_id, updated_by = p_actor_user_id
  where id = v_doc.id;
  perform set_config('forge.document_workflow', '', true);

  insert into public.forge_document_activity (organization_id, document_id, actor_user_id, activity_type, message, metadata)
  values (p_organization_id, v_doc.id, p_actor_user_id, 'obsoleted', 'Made obsolete: ' || left(v_reason, 500), jsonb_build_object('reason', left(v_reason, 2000)));
end;
$$;

-- Confirm a periodic review without a new version: the next review date moves on by the review interval.
create or replace function public.forge_document_confirm_review(
  p_organization_id uuid, p_document_id uuid, p_actor_user_id uuid, p_note text
) returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.forge_documents%rowtype;
  v_interval integer;
  v_next date;
begin
  select * into v_doc from public.forge_documents where id = p_document_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Document not found.'; end if;
  if v_doc.status <> 'published' or v_doc.archived_at is not null then
    raise exception 'Only a published document can be reviewed.';
  end if;
  v_interval := coalesce(v_doc.review_interval_months,
    (select default_review_interval_months from public.forge_document_settings where organization_id = p_organization_id), 12);
  v_next := public.forge_document_add_months(current_date, v_interval);

  update public.forge_documents
  set last_reviewed_on = current_date, last_reviewed_by = p_actor_user_id, review_due_on = v_next, updated_by = p_actor_user_id
  where id = v_doc.id;

  insert into public.forge_document_activity (organization_id, document_id, version_id, actor_user_id, activity_type, message, metadata)
  values (p_organization_id, v_doc.id, v_doc.current_version_id, p_actor_user_id, 'reviewed',
    'Review confirmed with no changes. Next review ' || to_char(v_next, 'YYYY-MM-DD') || '.',
    jsonb_build_object('note', nullif(btrim(coalesce(p_note, '')), ''), 'previous_due_on', v_doc.review_due_on));

  return v_next;
end;
$$;

-- Archive (hide) a document. Draft, obsolete, or published documents can be archived; files are kept.
create or replace function public.forge_document_archive(
  p_organization_id uuid, p_document_id uuid, p_actor_user_id uuid, p_archive boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.forge_documents%rowtype;
begin
  select * into v_doc from public.forge_documents where id = p_document_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Document not found.'; end if;

  if p_archive then
    if v_doc.archived_at is not null then return; end if;
    perform set_config('forge.document_workflow', 'on', true);
    update public.forge_document_versions set status = 'draft', submitted_by = null, submitted_at = null
    where document_id = v_doc.id and status = 'in_review';
    update public.forge_documents
    set archived_at = now(), archived_by = p_actor_user_id, updated_by = p_actor_user_id,
        status = case when status = 'in_review' then case when current_version_id is not null then 'published' else 'draft' end else status end
    where id = v_doc.id;
    perform set_config('forge.document_workflow', '', true);
    insert into public.forge_document_activity (organization_id, document_id, actor_user_id, activity_type, message)
    values (p_organization_id, v_doc.id, p_actor_user_id, 'archived', 'Document archived.');
  else
    if v_doc.archived_at is null then return; end if;
    update public.forge_documents set archived_at = null, archived_by = null, updated_by = p_actor_user_id where id = v_doc.id;
    insert into public.forge_document_activity (organization_id, document_id, actor_user_id, activity_type, message)
    values (p_organization_id, v_doc.id, p_actor_user_id, 'restored', 'Document restored from the archive.');
  end if;
end;
$$;

-- Who a document reaches: the people a user's personnel record, location access and roles put in its audience.
-- Returns true when the document has no distribution rows (whole company) or any rule matches.
create or replace function public.forge_document_reaches_user(p_document_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with doc as (
    select id, organization_id from public.forge_documents where id = p_document_id
  ),
  person as (
    select p.location_id, p.department_id
    from public.forge_personnel p, doc
    where p.organization_id = doc.organization_id and p.auth_user_id = p_user_id and p.archived_at is null
  ),
  locs as (
    select location_id from person where location_id is not null
    union
    select a.location_id from public.forge_tenant_user_location_access a, doc where a.organization_id = doc.organization_id and a.user_id = p_user_id
  ),
  roles as (
    select r.role_id from public.forge_tenant_user_roles r, doc where r.organization_id = doc.organization_id and r.user_id = p_user_id
  )
  select
    not exists (select 1 from public.forge_document_distributions d where d.document_id = p_document_id)
    or exists (
      select 1 from public.forge_document_distributions d
      where d.document_id = p_document_id and (
        d.scope_type = 'organization'
        or (d.scope_type = 'location' and d.scope_id in (select location_id from locs))
        or (d.scope_type = 'department' and d.scope_id in (select department_id from person where department_id is not null))
        or (d.scope_type = 'role' and d.scope_id in (select role_id from roles))
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.forge_document_settings enable row level security;
alter table public.forge_document_folders enable row level security;
alter table public.forge_document_sequences enable row level security;
alter table public.forge_documents enable row level security;
alter table public.forge_document_versions enable row level security;
alter table public.forge_document_distributions enable row level security;
alter table public.forge_document_acknowledgments enable row level security;
alter table public.forge_document_activity enable row level security;
alter table public.forge_document_notice_log enable row level security;

grant all on public.forge_document_settings, public.forge_document_folders, public.forge_document_sequences, public.forge_documents,
  public.forge_document_versions, public.forge_document_distributions, public.forge_document_acknowledgments,
  public.forge_document_activity, public.forge_document_notice_log to service_role;

revoke all on function public.next_forge_document_number(uuid) from public, anon, authenticated;
revoke all on function public.forge_document_submit_version(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.forge_document_approve_version(uuid, uuid, uuid, date, text) from public, anon, authenticated;
revoke all on function public.forge_document_reject_version(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.forge_document_withdraw_version(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.forge_document_mark_obsolete(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.forge_document_confirm_review(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.forge_document_archive(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.forge_document_reaches_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.next_forge_document_number(uuid), public.forge_document_submit_version(uuid, uuid, uuid),
  public.forge_document_approve_version(uuid, uuid, uuid, date, text), public.forge_document_reject_version(uuid, uuid, uuid, text),
  public.forge_document_withdraw_version(uuid, uuid, uuid), public.forge_document_mark_obsolete(uuid, uuid, uuid, text),
  public.forge_document_confirm_review(uuid, uuid, uuid, text), public.forge_document_archive(uuid, uuid, uuid, boolean),
  public.forge_document_reaches_user(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.forge_permission_registry
  (permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
  ('documents.view', 'document_control', 'View Documents', 'Open published documents distributed to you, and read and acknowledge them.', 'Document Control', 'view', true, false, 'organization', false, false, true, 'normal', 10),
  ('documents.manage', 'document_control', 'Manage Documents', 'Create documents and folders, upload versions, submit them for review, set who a document is for, confirm reviews and archive documents.', 'Document Control', 'edit', true, true, 'organization', false, false, true, 'normal', 20),
  ('documents.approve', 'document_control', 'Approve Documents', 'Approve or send back versions in review, and make documents obsolete.', 'Document Control', 'approve', true, true, 'organization', true, false, true, 'sensitive', 30),
  ('documents.view_acknowledgments', 'document_control', 'View Acknowledgments', 'See who has and hasn''t acknowledged a document, and export the list.', 'Document Control', 'export', true, true, 'organization', false, false, true, 'normal', 40),
  ('documents.settings', 'document_control', 'Document Control Settings', 'Change approval and review settings.', 'Document Control', 'configure', true, false, 'organization', true, false, true, 'sensitive', 50)
on conflict (permission_key) do update
set feature_key = excluded.feature_key, name = excluded.name, description = excluded.description, permission_group = excluded.permission_group,
    action = excluded.action, tenant_can_scope = excluded.tenant_can_scope, default_scope = excluded.default_scope,
    is_sensitive = excluded.is_sensitive, sort_order = excluded.sort_order, updated_at = now();

-- Role templates.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key = 'documents.view'
where rt.template_key in ('standard-user', 'read-only')
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, case when p.permission_key = 'documents.view' then 'organization' else 'location' end
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('documents.view', 'documents.view_acknowledgments')
where rt.template_key = 'supervisor'
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.feature_key = 'document_control'
where rt.template_key in ('safety-manager', 'company-admin')
on conflict (template_id, permission_id) do update set allowed = true, scope = excluded.scope;

-- Existing tenant roles.
insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key = 'documents.view'
where r.role_key in ('employee', 'read-only')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, case when p.permission_key = 'documents.view' then 'organization' else 'location' end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('documents.view', 'documents.view_acknowledgments')
where r.role_key in ('supervisor', 'location-administrator')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

insert into public.forge_tenant_role_permissions (role_id, permission_id, allowed, scope)
select r.id, p.id, true, 'organization'
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.feature_key = 'document_control'
where r.role_key in ('company-administrator', 'company-owner')
on conflict (role_id, permission_id) do update set allowed = true, scope = excluded.scope;

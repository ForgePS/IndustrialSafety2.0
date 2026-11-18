-- FIS-HD-01 / HD-05, HD-06: knowledge base, Ask Forge support sessions, AI suggestions.

create table public.forge_support_knowledge_categories (
  id uuid primary key default gen_random_uuid(),
  category_key text not null unique check (category_key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  product_id uuid references public.forge_support_products(id) on delete restrict,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.forge_support_knowledge_categories(category_key, name, sort_order) values
('getting_started','Getting Started',10),('administrator_setup','Administrator Setup',20),('personnel','Personnel',30),
('training','Training',40),('inspections','Inspections',50),('corrective_actions','Corrective Actions',60),
('observations','Observations',70),('risk_management','Risk Management',80),('jsa_jha','JSA / JHA',90),
('loto','LOTO',100),('permits','Permits',110),('contractors','Contractors',120),('equipment_assets','Equipment & Assets',130),
('qr_codes','QR Codes',140),('incident_management','Incident Management',150),('osha_reporting','OSHA Reporting',160),
('dot_compliance','DOT Compliance',170),('reports','Reports',180),('mobile_field_app','Mobile Field App',190),
('integrations','Integrations',200),('troubleshooting','Troubleshooting',210),('release_notes','Release Notes',220)
on conflict (category_key) do nothing;

create table public.forge_support_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title text not null check (char_length(title) between 4 and 200),
  summary text not null default '' check (char_length(summary) <= 500),
  body text not null check (char_length(body) between 1 and 100000),
  category_id uuid not null references public.forge_support_knowledge_categories(id) on delete restrict,
  product_id uuid references public.forge_support_products(id) on delete restrict,
  module_id uuid references public.forge_support_product_areas(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','review','published','archived')),
  visibility text not null default 'authenticated_users' check (visibility in ('public_customer','authenticated_users','tenant_only','forge_internal')),
  organization_id uuid references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  submitted_for_review_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  version integer not null default 1 check (version >= 1),
  search_keywords text not null default '' check (char_length(search_keywords) <= 1000),
  source_ticket_id uuid references public.forge_support_tickets(id) on delete set null,
  view_count bigint not null default 0,
  helpful_count integer not null default 0,
  not_helpful_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1,
  check ((visibility = 'tenant_only') = (organization_id is not null)),
  check (status <> 'published' or published_at is not null),
  check ((status = 'archived') = (archived_at is not null))
);
alter table public.forge_support_knowledge_articles
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(search_keywords, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) stored;
create index forge_support_kb_search_idx on public.forge_support_knowledge_articles using gin(search_vector);
create index forge_support_kb_visibility_idx on public.forge_support_knowledge_articles(status, visibility, organization_id);
create index forge_support_kb_category_idx on public.forge_support_knowledge_articles(category_id, status);

create table public.forge_support_knowledge_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.forge_support_knowledge_articles(id) on delete cascade,
  version integer not null,
  title text not null,
  summary text not null,
  body text not null,
  search_keywords text not null,
  visibility text not null,
  status_at_save text not null,
  change_note text check (change_note is null or char_length(change_note) <= 500),
  edited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (article_id, version)
);

create table public.forge_support_knowledge_feedback (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.forge_support_knowledge_articles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  helpful boolean not null,
  comment text check (comment is null or char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, user_id)
);

create table public.forge_support_knowledge_attachments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.forge_support_knowledge_articles(id) on delete cascade,
  storage_path text not null unique check (storage_path like 'kb/%'),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null,
  byte_size integer not null check (byte_size between 1 and 26214400),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);

create table public.forge_support_knowledge_searches (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  query text not null check (char_length(query) between 1 and 300),
  result_count integer not null check (result_count >= 0),
  source text not null check (source in ('help_center','ask_forge','console','forge_ai')),
  created_at timestamptz not null default now()
);
create index forge_support_kb_searches_created_idx on public.forge_support_knowledge_searches(created_at);

create or replace function public.forge_support_knowledge_visible(
  p_status text, p_visibility text, p_article_org uuid, p_audience text, p_viewer_org uuid, p_include_drafts boolean
) returns boolean
language sql
immutable
as $$
  select case
    when p_audience = 'staff' then p_status = 'published' or (p_include_drafts and p_status in ('draft','review'))
    when p_audience = 'customer' then p_status = 'published'
      and (p_visibility in ('public_customer','authenticated_users')
           or (p_visibility = 'tenant_only' and p_article_org is not null and p_article_org = p_viewer_org))
    else false end
$$;

create or replace function public.forge_support_search_knowledge(
  p_query text,
  p_audience text,
  p_organization_id uuid,
  p_product_id uuid default null,
  p_category_id uuid default null,
  p_limit integer default 10,
  p_include_drafts boolean default false
) returns table (
  id uuid, slug text, title text, summary text, category_id uuid, visibility text, organization_id uuid,
  status text, published_at timestamptz, updated_at timestamptz, rank real, snippet text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_text text := left(btrim(coalesce(p_query, '')), 300);
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_q tsquery;
  v_any text;
begin
  if p_audience not in ('customer','staff') then
    raise exception 'Invalid knowledge audience.';
  end if;
  if v_text = '' then
    return query
      select a.id, a.slug, a.title, a.summary, a.category_id, a.visibility, a.organization_id, a.status, a.published_at, a.updated_at,
             0::real, left(coalesce(nullif(a.summary, ''), a.body), 240)
      from public.forge_support_knowledge_articles a
      where public.forge_support_knowledge_visible(a.status, a.visibility, a.organization_id, p_audience, p_organization_id, p_include_drafts)
        and (p_product_id is null or a.product_id is null or a.product_id = p_product_id)
        and (p_category_id is null or a.category_id = p_category_id)
      order by a.published_at desc nulls last, a.updated_at desc
      limit v_limit;
    return;
  end if;

  v_q := websearch_to_tsquery('english', v_text);
  return query
    select a.id, a.slug, a.title, a.summary, a.category_id, a.visibility, a.organization_id, a.status, a.published_at, a.updated_at,
           ts_rank_cd(a.search_vector, v_q),
           ts_headline('english', a.body, v_q, 'MaxWords=32, MinWords=12, MaxFragments=1, StartSel=[[, StopSel=]]')
    from public.forge_support_knowledge_articles a
    where a.search_vector @@ v_q
      and public.forge_support_knowledge_visible(a.status, a.visibility, a.organization_id, p_audience, p_organization_id, p_include_drafts)
      and (p_product_id is null or a.product_id is null or a.product_id = p_product_id)
      and (p_category_id is null or a.category_id = p_category_id)
    order by 11 desc, a.published_at desc nulls last
    limit v_limit;
  if found then return; end if;

  -- Fallback: any-term match so natural-language questions still find articles.
  v_any := replace(plainto_tsquery('english', v_text)::text, ' & ', ' | ');
  if coalesce(v_any, '') = '' then return; end if;
  v_q := v_any::tsquery;
  return query
    select a.id, a.slug, a.title, a.summary, a.category_id, a.visibility, a.organization_id, a.status, a.published_at, a.updated_at,
           ts_rank_cd(a.search_vector, v_q),
           ts_headline('english', a.body, v_q, 'MaxWords=32, MinWords=12, MaxFragments=1, StartSel=[[, StopSel=]]')
    from public.forge_support_knowledge_articles a
    where a.search_vector @@ v_q
      and public.forge_support_knowledge_visible(a.status, a.visibility, a.organization_id, p_audience, p_organization_id, p_include_drafts)
      and (p_product_id is null or a.product_id is null or a.product_id = p_product_id)
      and (p_category_id is null or a.category_id = p_category_id)
    order by 11 desc, a.published_at desc nulls last
    limit v_limit;
end $$;

create or replace function public.forge_support_slugify(p_text text)
returns text language sql immutable as $$
  select left(trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')), 100)
$$;

create or replace function public.forge_support_save_article(
  p_article_id uuid,
  p_actor_user_id uuid,
  p_fields jsonb,
  p_expected_row_version bigint default null,
  p_change_note text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.forge_support_knowledge_articles%rowtype;
  n public.forge_support_knowledge_articles%rowtype;
  v_title text := btrim(coalesce(p_fields->>'title', ''));
  v_summary text := btrim(coalesce(p_fields->>'summary', ''));
  v_body text := btrim(coalesce(p_fields->>'body', ''));
  v_slug text := public.forge_support_slugify(coalesce(nullif(p_fields->>'slug', ''), p_fields->>'title'));
  v_category uuid := nullif(p_fields->>'category_id', '')::uuid;
  v_product uuid := nullif(p_fields->>'product_id', '')::uuid;
  v_module uuid := nullif(p_fields->>'module_id', '')::uuid;
  v_visibility text := coalesce(nullif(p_fields->>'visibility', ''), 'authenticated_users');
  v_org uuid := nullif(p_fields->>'organization_id', '')::uuid;
  v_keywords text := left(btrim(coalesce(p_fields->>'search_keywords', '')), 1000);
  v_source_ticket uuid := nullif(p_fields->>'source_ticket_id', '')::uuid;
  v_base text;
  v_suffix integer := 1;
  v_can_publish boolean := public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.knowledge.publish');
  v_status text;
begin
  if char_length(v_title) not between 4 and 200 then return jsonb_build_object('ok', false, 'error', 'Title must be 4 to 200 characters.'); end if;
  if char_length(v_summary) > 500 then return jsonb_build_object('ok', false, 'error', 'Summary must be 500 characters or fewer.'); end if;
  if char_length(v_body) not between 1 and 100000 then return jsonb_build_object('ok', false, 'error', 'Article body is required.'); end if;
  if v_slug = '' then return jsonb_build_object('ok', false, 'error', 'Enter a title that produces a valid URL slug.'); end if;
  if not exists (select 1 from public.forge_support_knowledge_categories where id = v_category and is_active) then
    return jsonb_build_object('ok', false, 'error', 'Choose an active category.');
  end if;
  if v_product is not null and not exists (select 1 from public.forge_support_products where id = v_product) then
    return jsonb_build_object('ok', false, 'error', 'Choose a valid product.');
  end if;
  if v_module is not null and not exists (
    select 1 from public.forge_support_product_areas where id = v_module and (v_product is null or product_id = v_product)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Product area does not belong to the selected product.');
  end if;
  if v_visibility not in ('public_customer','authenticated_users','tenant_only','forge_internal') then
    return jsonb_build_object('ok', false, 'error', 'Invalid visibility.');
  end if;
  if v_visibility = 'tenant_only' then
    if v_org is null or not exists (select 1 from public.organizations where id = v_org and status = 'active') then
      return jsonb_build_object('ok', false, 'error', 'Tenant-only articles need an active tenant.');
    end if;
  else
    v_org := null;
  end if;

  if p_article_id is null then
    if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.knowledge.create') then
      return jsonb_build_object('ok', false, 'error', 'You do not have permission to create articles.');
    end if;
    v_base := v_slug;
    while exists (select 1 from public.forge_support_knowledge_articles where slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug := left(v_base, 95) || '-' || v_suffix;
    end loop;
    insert into public.forge_support_knowledge_articles(slug, title, summary, body, category_id, product_id, module_id, status, visibility,
      organization_id, author_id, search_keywords, source_ticket_id)
    values (v_slug, v_title, v_summary, v_body, v_category, v_product, v_module, 'draft', v_visibility, v_org, p_actor_user_id, v_keywords, v_source_ticket)
    returning * into n;
    insert into public.forge_support_knowledge_revisions(article_id, version, title, summary, body, search_keywords, visibility, status_at_save, change_note, edited_by)
    values (n.id, 1, n.title, n.summary, n.body, n.search_keywords, n.visibility, n.status, coalesce(p_change_note, 'Created'), p_actor_user_id);
    perform public.forge_support_audit(p_actor_user_id, 'forge_staff', v_org, 'helpdesk.knowledge.created', 'support_knowledge_article', n.id::text,
      null, jsonb_build_object('slug', n.slug, 'title', n.title, 'visibility', n.visibility, 'status', n.status),
      null, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
    return jsonb_build_object('ok', true, 'article_id', n.id, 'slug', n.slug, 'status', n.status, 'version', n.version, 'row_version', n.row_version);
  end if;

  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.knowledge.edit') then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission to edit articles.');
  end if;
  select * into a from public.forge_support_knowledge_articles where id = p_article_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Article not found.'); end if;
  if a.status = 'archived' then return jsonb_build_object('ok', false, 'error', 'Restore this article to draft before editing.'); end if;
  if p_expected_row_version is not null and p_expected_row_version <> a.row_version then
    return jsonb_build_object('ok', false, 'conflict', true, 'error', 'This article changed after you opened it. Refresh and try again.');
  end if;
  if v_slug <> a.slug and exists (select 1 from public.forge_support_knowledge_articles where slug = v_slug and id <> a.id) then
    return jsonb_build_object('ok', false, 'error', 'Another article already uses that URL slug.');
  end if;
  v_status := case when a.status = 'published' and not v_can_publish then 'review' else a.status end;

  update public.forge_support_knowledge_articles
  set slug = v_slug, title = v_title, summary = v_summary, body = v_body, category_id = v_category, product_id = v_product,
      module_id = v_module, visibility = v_visibility, organization_id = v_org, search_keywords = v_keywords,
      status = v_status,
      submitted_for_review_at = case when v_status = 'review' and a.status <> 'review' then now() else submitted_for_review_at end,
      version = version + 1, row_version = row_version + 1, updated_at = now()
  where id = a.id
  returning * into n;
  insert into public.forge_support_knowledge_revisions(article_id, version, title, summary, body, search_keywords, visibility, status_at_save, change_note, edited_by)
  values (n.id, n.version, n.title, n.summary, n.body, n.search_keywords, n.visibility, n.status, p_change_note, p_actor_user_id);
  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', coalesce(v_org, a.organization_id), 'helpdesk.knowledge.updated', 'support_knowledge_article', n.id::text,
    jsonb_build_object('version', a.version, 'title', a.title, 'visibility', a.visibility, 'status', a.status),
    jsonb_build_object('version', n.version, 'title', n.title, 'visibility', n.visibility, 'status', n.status),
    p_change_note, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'article_id', n.id, 'slug', n.slug, 'status', n.status, 'version', n.version, 'row_version', n.row_version);
end $$;

create or replace function public.forge_support_transition_article(
  p_article_id uuid,
  p_actor_user_id uuid,
  p_to_status text,
  p_expected_row_version bigint default null,
  p_note text default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.forge_support_knowledge_articles%rowtype;
  n public.forge_support_knowledge_articles%rowtype;
  v_permission text;
begin
  select * into a from public.forge_support_knowledge_articles where id = p_article_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Article not found.'); end if;
  if p_expected_row_version is not null and p_expected_row_version <> a.row_version then
    return jsonb_build_object('ok', false, 'conflict', true, 'error', 'This article changed after you opened it. Refresh and try again.');
  end if;

  v_permission := case
    when a.status = 'draft' and p_to_status = 'review' then 'helpdesk.knowledge.edit'
    when a.status = 'review' and p_to_status = 'draft' then 'helpdesk.knowledge.review'
    when a.status in ('draft','review') and p_to_status = 'published' then 'helpdesk.knowledge.publish'
    when a.status = 'published' and p_to_status = 'draft' then 'helpdesk.knowledge.publish'
    when a.status in ('draft','review','published') and p_to_status = 'archived' then 'helpdesk.knowledge.archive'
    when a.status = 'archived' and p_to_status = 'draft' then 'helpdesk.knowledge.edit'
    else null end;
  if v_permission is null then
    return jsonb_build_object('ok', false, 'error', 'Cannot move an article from ' || a.status || ' to ' || coalesce(p_to_status, '?') || '.');
  end if;
  if not public.forge_support_staff_has_permission(p_actor_user_id, v_permission) then
    return jsonb_build_object('ok', false, 'error', 'You do not have permission for this knowledge base step.');
  end if;

  update public.forge_support_knowledge_articles
  set status = p_to_status,
      submitted_for_review_at = case when p_to_status = 'review' then now() else submitted_for_review_at end,
      reviewer_id = case when a.status = 'review' and p_to_status in ('draft','published') then p_actor_user_id else reviewer_id end,
      reviewed_at = case when a.status = 'review' and p_to_status in ('draft','published') then now() else reviewed_at end,
      published_at = case when p_to_status = 'published' then now() else published_at end,
      archived_at = case when p_to_status = 'archived' then now() when a.status = 'archived' then null else archived_at end,
      row_version = row_version + 1,
      updated_at = now()
  where id = a.id
  returning * into n;

  perform public.forge_support_audit(p_actor_user_id, 'forge_staff', a.organization_id,
    case p_to_status when 'published' then 'helpdesk.knowledge.published' when 'archived' then 'helpdesk.knowledge.archived'
                     when 'review' then 'helpdesk.knowledge.submitted' else 'helpdesk.knowledge.returned_to_draft' end,
    'support_knowledge_article', a.id::text, jsonb_build_object('status', a.status), jsonb_build_object('status', n.status, 'version', n.version),
    p_note, p_meta->>'request_id', p_meta->>'source_ip', p_meta->>'user_agent');
  return jsonb_build_object('ok', true, 'article_id', n.id, 'status', n.status, 'row_version', n.row_version);
end $$;

create or replace function public.forge_support_article_feedback(
  p_article_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_helpful boolean,
  p_comment text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a public.forge_support_knowledge_articles%rowtype;
begin
  select * into a from public.forge_support_knowledge_articles where id = p_article_id for update;
  if not found or not public.forge_support_knowledge_visible(a.status, a.visibility, a.organization_id, 'customer', p_organization_id, false) then
    return jsonb_build_object('ok', false, 'error', 'Article not found.');
  end if;
  insert into public.forge_support_knowledge_feedback(article_id, organization_id, user_id, helpful, comment)
  values (a.id, p_organization_id, p_user_id, p_helpful, nullif(left(btrim(coalesce(p_comment, '')), 1000), ''))
  on conflict (article_id, user_id) do update set helpful = excluded.helpful, comment = excluded.comment, updated_at = now();
  update public.forge_support_knowledge_articles
  set helpful_count = (select count(*) from public.forge_support_knowledge_feedback where article_id = a.id and helpful),
      not_helpful_count = (select count(*) from public.forge_support_knowledge_feedback where article_id = a.id and not helpful)
  where id = a.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.forge_support_record_article_view(p_article_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.forge_support_knowledge_articles set view_count = view_count + 1 where id = p_article_id and status = 'published';
$$;

-- ---------------------------------------------------------------------------
-- Ask Forge support sessions (vendor-neutral provider identifiers)
-- ---------------------------------------------------------------------------
create table public.forge_support_assist_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.forge_support_products(id) on delete set null,
  module_id uuid references public.forge_support_product_areas(id) on delete set null,
  question text not null check (char_length(question) between 3 and 4000),
  answer text check (answer is null or char_length(answer) <= 8000),
  answer_provider text not null check (char_length(answer_provider) between 1 and 80),
  answer_model text,
  article_ids uuid[] not null default '{}'::uuid[],
  viewed_article_ids uuid[] not null default '{}'::uuid[],
  troubleshooting_steps text check (troubleshooting_steps is null or char_length(troubleshooting_steps) <= 4000),
  outcome text not null default 'pending' check (outcome in ('pending','resolved','not_resolved')),
  feedback_comment text check (feedback_comment is null or char_length(feedback_comment) <= 2000),
  ticket_id uuid references public.forge_support_tickets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index forge_support_assist_user_idx on public.forge_support_assist_sessions(organization_id, user_id, created_at desc);
create index forge_support_assist_outcome_idx on public.forge_support_assist_sessions(outcome, created_at);

alter table public.forge_support_tickets
  add constraint forge_support_tickets_assist_fk foreign key (assist_session_id) references public.forge_support_assist_sessions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- AI suggestions for staff: never auto-sent, human decision recorded
-- ---------------------------------------------------------------------------
create table public.forge_support_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  ticket_id uuid not null,
  suggestion_type text not null check (suggestion_type in (
    'summarize','suggest_response','suggest_priority','suggest_category','suggest_module','similar_tickets',
    'duplicate_detection','knowledge_search','troubleshooting','likely_cause','suggest_assignee',
    'platform_incident','knowledge_draft')),
  provider text not null check (char_length(provider) between 1 and 80),
  model text,
  input_digest text,
  output jsonb not null default '{}'::jsonb,
  output_text text check (output_text is null or char_length(output_text) <= 20000),
  status text not null default 'generated' check (status in ('generated','accepted','rejected')),
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  final_output text check (final_output is null or char_length(final_output) <= 20000),
  used_in_message_id uuid references public.forge_support_messages(id) on delete set null,
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade,
  check ((status = 'generated') = (decided_at is null))
);
create index forge_support_ai_suggestions_ticket_idx on public.forge_support_ai_suggestions(ticket_id, generated_at desc);

alter table public.forge_support_messages
  add constraint forge_support_messages_ai_suggestion_fk foreign key (ai_suggestion_id) references public.forge_support_ai_suggestions(id) on delete set null;

create or replace function public.forge_support_ai_suggestion_guard()
returns trigger language plpgsql as $$
begin
  if new.suggestion_type is distinct from old.suggestion_type or new.provider is distinct from old.provider
     or new.model is distinct from old.model or new.output is distinct from old.output
     or new.output_text is distinct from old.output_text or new.generated_at is distinct from old.generated_at
     or new.ticket_id is distinct from old.ticket_id or new.organization_id is distinct from old.organization_id then
    raise exception 'AI suggestion output is immutable.';
  end if;
  if old.status <> 'generated' and (new.status is distinct from old.status or new.final_output is distinct from old.final_output
     or new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at) then
    raise exception 'AI suggestion decision is already recorded.';
  end if;
  return new;
end $$;
create trigger forge_support_ai_suggestion_guard before update on public.forge_support_ai_suggestions
for each row execute function public.forge_support_ai_suggestion_guard();

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
  if not public.forge_support_staff_has_permission(p_actor_user_id, 'helpdesk.support.view') then
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

-- Forge AI assistant capability (existing capability registry).
insert into public.forge_ai_capabilities
(capability_key, name, description, category, required_permission_key, capability_type, platform_enabled, sensitive, requires_approval, sort_order)
values ('search_help_articles','Search Help Articles','Search published Forge Help Center articles visible to the current user and tenant.','Help Desk','helpdesk.knowledge.view','read',true,false,false,60)
on conflict (capability_key) do update
set name = excluded.name, description = excluded.description, category = excluded.category,
    required_permission_key = excluded.required_permission_key, capability_type = excluded.capability_type,
    platform_enabled = excluded.platform_enabled, sensitive = excluded.sensitive, requires_approval = excluded.requires_approval,
    sort_order = excluded.sort_order, updated_at = now();

do $$
declare t text;
begin
  foreach t in array array[
    'forge_support_knowledge_categories','forge_support_knowledge_articles','forge_support_knowledge_revisions',
    'forge_support_knowledge_feedback','forge_support_knowledge_attachments','forge_support_knowledge_searches',
    'forge_support_assist_sessions','forge_support_ai_suggestions'
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
    'forge_support_search_knowledge(text,text,uuid,uuid,uuid,integer,boolean)',
    'forge_support_save_article(uuid,uuid,jsonb,bigint,text,jsonb)',
    'forge_support_transition_article(uuid,uuid,text,bigint,text,jsonb)',
    'forge_support_article_feedback(uuid,uuid,uuid,boolean,text)',
    'forge_support_record_article_view(uuid)',
    'forge_support_decide_ai_suggestion(uuid,uuid,text,text,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

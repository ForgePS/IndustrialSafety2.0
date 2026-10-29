-- FIS-HD-01 Help Desk foundation.
-- Extends the existing Customer Support module (forge_support_*) into a platform-level
-- Help Desk that can serve Forge Industrial Safety, Forge Responder, Forge Academy and
-- future products. All help desk tables remain service-role only: every read and write
-- goes through server code that authorizes first, and every RPC re-validates defensively.

-- ---------------------------------------------------------------------------
-- Feature + permissions
-- ---------------------------------------------------------------------------
update public.forge_feature_registry
set name = 'Help Desk',
    description = 'Forge Help Desk: tickets, knowledge base, service status and Forge support operations.',
    updated_at = now()
where feature_key = 'customer_support';

insert into public.forge_permission_registry
(permission_key,feature_key,name,description,permission_group,action,tenant_assignable,tenant_can_scope,default_scope,is_sensitive,requires_confirmation,audit_use,danger_level,sort_order)
values
('helpdesk.ticket.create','customer_support','Create Help Desk Tickets','Submit support tickets to Forge.','Help Desk','ticket_create',true,false,'own',false,false,true,'normal',10),
('helpdesk.ticket.view_own','customer_support','View Own Tickets','View tickets you submitted or follow.','Help Desk','ticket_view_own',true,false,'own',false,false,false,'normal',20),
('helpdesk.ticket.view_location','customer_support','View Location Tickets','View tickets tied to your assigned Locations.','Help Desk','ticket_view_location',true,false,'location',true,false,true,'sensitive',30),
('helpdesk.ticket.view_tenant','customer_support','View Company Tickets','View every support ticket for this company.','Help Desk','ticket_view_tenant',true,false,'organization',true,false,true,'sensitive',40),
('helpdesk.ticket.comment','customer_support','Reply to Tickets','Reply on tickets you are allowed to view.','Help Desk','ticket_comment',true,false,'own',false,false,true,'normal',50),
('helpdesk.ticket.reopen','customer_support','Reopen Tickets','Reopen resolved or closed tickets within policy.','Help Desk','ticket_reopen',true,false,'own',false,false,true,'normal',60),
('helpdesk.ticket.close','customer_support','Close Tickets','Close tickets you are allowed to view.','Help Desk','ticket_close',true,false,'own',false,false,true,'normal',70),
('helpdesk.knowledge.view','customer_support','View Help Center','Search and read published help articles.','Help Desk','knowledge_view',true,false,'organization',false,false,false,'normal',80),
('helpdesk.status.view','customer_support','View Service Status','View Forge service status, incidents and announcements.','Help Desk','status_view',true,false,'organization',false,false,false,'normal',90),

('helpdesk.support.view','customer_support','Forge Support: View Console','View the Forge support console and all tickets.','Help Desk (Forge)','support_view',false,false,'organization',true,false,true,'sensitive',200),
('helpdesk.support.assign','customer_support','Forge Support: Assign','Assign, reassign and unassign tickets and teams.','Help Desk (Forge)','support_assign',false,false,'organization',true,false,true,'sensitive',210),
('helpdesk.support.respond','customer_support','Forge Support: Reply to Customer','Send customer-visible replies.','Help Desk (Forge)','support_respond',false,false,'organization',true,false,true,'sensitive',220),
('helpdesk.support.internal_note','customer_support','Forge Support: Internal Notes','Write internal-only notes and @mentions.','Help Desk (Forge)','support_internal_note',false,false,'organization',true,false,true,'sensitive',230),
('helpdesk.support.change_priority','customer_support','Forge Support: Change Priority','Change operational Forge priority.','Help Desk (Forge)','support_change_priority',false,false,'organization',true,false,true,'sensitive',240),
('helpdesk.support.change_status','customer_support','Forge Support: Change Status','Triage, change status, disposition and tags.','Help Desk (Forge)','support_change_status',false,false,'organization',true,false,true,'sensitive',250),
('helpdesk.support.merge','customer_support','Forge Support: Merge Duplicates','Merge duplicate tickets and manage duplicate links.','Help Desk (Forge)','support_merge',false,false,'organization',true,true,true,'sensitive',260),
('helpdesk.support.escalate','customer_support','Forge Support: Escalate','Escalate tickets to higher support tiers.','Help Desk (Forge)','support_escalate',false,false,'organization',true,false,true,'sensitive',270),
('helpdesk.support.link_incident','customer_support','Forge Support: Link Platform Incidents','Link tickets to platform incidents.','Help Desk (Forge)','support_link_incident',false,false,'organization',true,false,true,'sensitive',280),
('helpdesk.support.link_development','customer_support','Forge Support: Link Development Work','Create and link development issues.','Help Desk (Forge)','support_link_development',false,false,'organization',true,false,true,'sensitive',290),
('helpdesk.support.manage_watchers','customer_support','Forge Support: Manage Watchers','Add and remove ticket watchers.','Help Desk (Forge)','support_manage_watchers',false,false,'organization',true,false,true,'sensitive',300),

('helpdesk.admin.manage','customer_support','Help Desk Admin: Settings','Manage help desk configuration.','Help Desk (Admin)','admin_manage',false,false,'organization',true,true,true,'critical',400),
('helpdesk.admin.sla','customer_support','Help Desk Admin: SLA','Manage SLA policies and business hours.','Help Desk (Admin)','admin_sla',false,false,'organization',true,true,true,'critical',410),
('helpdesk.admin.categories','customer_support','Help Desk Admin: Catalog','Manage products, modules and request types.','Help Desk (Admin)','admin_categories',false,false,'organization',true,false,true,'sensitive',420),
('helpdesk.admin.templates','customer_support','Help Desk Admin: Saved Replies','Manage saved response templates.','Help Desk (Admin)','admin_templates',false,false,'organization',true,false,true,'sensitive',430),
('helpdesk.admin.tags','customer_support','Help Desk Admin: Tags','Manage ticket tags.','Help Desk (Admin)','admin_tags',false,false,'organization',true,false,true,'sensitive',440),
('helpdesk.admin.status','customer_support','Help Desk Admin: Service Status','Manage platform components and status.','Help Desk (Admin)','admin_status',false,false,'organization',true,true,true,'critical',450),
('helpdesk.admin.announcements','customer_support','Help Desk Admin: Announcements','Publish support announcements.','Help Desk (Admin)','admin_announcements',false,false,'organization',true,false,true,'sensitive',460),
('helpdesk.admin.incidents','customer_support','Help Desk Admin: Platform Incidents','Declare and manage platform incidents.','Help Desk (Admin)','admin_incidents',false,false,'organization',true,true,true,'critical',470),

('helpdesk.knowledge.create','customer_support','Knowledge: Create','Create help articles.','Help Desk (Knowledge)','knowledge_create',false,false,'organization',false,false,true,'normal',500),
('helpdesk.knowledge.edit','customer_support','Knowledge: Edit','Edit help articles.','Help Desk (Knowledge)','knowledge_edit',false,false,'organization',false,false,true,'normal',510),
('helpdesk.knowledge.review','customer_support','Knowledge: Review','Review submitted help articles.','Help Desk (Knowledge)','knowledge_review',false,false,'organization',false,false,true,'normal',520),
('helpdesk.knowledge.publish','customer_support','Knowledge: Publish','Publish help articles to customers.','Help Desk (Knowledge)','knowledge_publish',false,false,'organization',true,false,true,'sensitive',530),
('helpdesk.knowledge.archive','customer_support','Knowledge: Archive','Archive help articles.','Help Desk (Knowledge)','knowledge_archive',false,false,'organization',true,false,true,'sensitive',540),

('helpdesk.analytics.view','customer_support','Help Desk Analytics: View','View support analytics.','Help Desk (Analytics)','analytics_view',false,false,'organization',true,false,true,'sensitive',600),
('helpdesk.analytics.export','customer_support','Help Desk Analytics: Export','Export support analytics.','Help Desk (Analytics)','analytics_export',false,false,'organization',true,true,true,'sensitive',610)
on conflict (permission_key) do update
set feature_key=excluded.feature_key,name=excluded.name,description=excluded.description,
    permission_group=excluded.permission_group,action=excluded.action,tenant_assignable=excluded.tenant_assignable,
    tenant_can_scope=excluded.tenant_can_scope,default_scope=excluded.default_scope,is_sensitive=excluded.is_sensitive,
    requires_confirmation=excluded.requires_confirmation,audit_use=excluded.audit_use,danger_level=excluded.danger_level,
    sort_order=excluded.sort_order,updated_at=now();

-- Tenant role templates (applied to new tenants and the local seed).
with grants(template_key, permission_key, scope) as (
  values
  ('standard-user','helpdesk.ticket.create','own'),('standard-user','helpdesk.ticket.view_own','own'),
  ('standard-user','helpdesk.ticket.comment','own'),('standard-user','helpdesk.ticket.reopen','own'),
  ('standard-user','helpdesk.ticket.close','own'),('standard-user','helpdesk.knowledge.view','organization'),
  ('standard-user','helpdesk.status.view','organization'),
  ('supervisor','helpdesk.ticket.create','own'),('supervisor','helpdesk.ticket.view_own','own'),
  ('supervisor','helpdesk.ticket.view_location','location'),('supervisor','helpdesk.ticket.comment','own'),
  ('supervisor','helpdesk.ticket.reopen','own'),('supervisor','helpdesk.ticket.close','own'),
  ('supervisor','helpdesk.knowledge.view','organization'),('supervisor','helpdesk.status.view','organization'),
  ('safety-manager','helpdesk.ticket.create','own'),('safety-manager','helpdesk.ticket.view_own','own'),
  ('safety-manager','helpdesk.ticket.view_location','location'),('safety-manager','helpdesk.ticket.comment','own'),
  ('safety-manager','helpdesk.ticket.reopen','own'),('safety-manager','helpdesk.ticket.close','own'),
  ('safety-manager','helpdesk.knowledge.view','organization'),('safety-manager','helpdesk.status.view','organization'),
  ('company-admin','helpdesk.ticket.create','own'),('company-admin','helpdesk.ticket.view_own','own'),
  ('company-admin','helpdesk.ticket.view_tenant','organization'),('company-admin','helpdesk.ticket.comment','organization'),
  ('company-admin','helpdesk.ticket.reopen','organization'),('company-admin','helpdesk.ticket.close','organization'),
  ('company-admin','helpdesk.knowledge.view','organization'),('company-admin','helpdesk.status.view','organization'),
  ('read-only','helpdesk.knowledge.view','organization'),('read-only','helpdesk.status.view','organization')
)
insert into public.forge_role_template_permissions(template_id,permission_id,allowed,scope)
select rt.id,p.id,true,g.scope
from grants g
join public.forge_role_templates rt on rt.template_key=g.template_key
join public.forge_permission_registry p on p.permission_key=g.permission_key
on conflict (template_id,permission_id) do update set allowed=true,scope=excluded.scope;

-- Existing tenant roles keep equivalent access.
with grants(role_key, permission_key, scope) as (
  values
  ('employee','helpdesk.ticket.create','own'),('employee','helpdesk.ticket.view_own','own'),
  ('employee','helpdesk.ticket.comment','own'),('employee','helpdesk.ticket.reopen','own'),
  ('employee','helpdesk.ticket.close','own'),('employee','helpdesk.knowledge.view','organization'),
  ('employee','helpdesk.status.view','organization'),
  ('supervisor','helpdesk.ticket.create','own'),('supervisor','helpdesk.ticket.view_own','own'),
  ('supervisor','helpdesk.ticket.view_location','location'),('supervisor','helpdesk.ticket.comment','own'),
  ('supervisor','helpdesk.ticket.reopen','own'),('supervisor','helpdesk.ticket.close','own'),
  ('supervisor','helpdesk.knowledge.view','organization'),('supervisor','helpdesk.status.view','organization'),
  ('location-administrator','helpdesk.ticket.create','own'),('location-administrator','helpdesk.ticket.view_own','own'),
  ('location-administrator','helpdesk.ticket.view_location','location'),('location-administrator','helpdesk.ticket.comment','own'),
  ('location-administrator','helpdesk.ticket.reopen','own'),('location-administrator','helpdesk.ticket.close','own'),
  ('location-administrator','helpdesk.knowledge.view','organization'),('location-administrator','helpdesk.status.view','organization'),
  ('company-administrator','helpdesk.ticket.create','own'),('company-administrator','helpdesk.ticket.view_own','own'),
  ('company-administrator','helpdesk.ticket.view_tenant','organization'),('company-administrator','helpdesk.ticket.comment','organization'),
  ('company-administrator','helpdesk.ticket.reopen','organization'),('company-administrator','helpdesk.ticket.close','organization'),
  ('company-administrator','helpdesk.knowledge.view','organization'),('company-administrator','helpdesk.status.view','organization'),
  ('company-owner','helpdesk.ticket.create','own'),('company-owner','helpdesk.ticket.view_own','own'),
  ('company-owner','helpdesk.ticket.view_tenant','organization'),('company-owner','helpdesk.ticket.comment','organization'),
  ('company-owner','helpdesk.ticket.reopen','organization'),('company-owner','helpdesk.ticket.close','organization'),
  ('company-owner','helpdesk.knowledge.view','organization'),('company-owner','helpdesk.status.view','organization'),
  ('read-only','helpdesk.knowledge.view','organization'),('read-only','helpdesk.status.view','organization')
)
insert into public.forge_tenant_role_permissions(role_id,permission_id,allowed,scope)
select r.id,p.id,true,g.scope
from grants g
join public.forge_tenant_roles r on r.role_key=g.role_key
join public.forge_permission_registry p on p.permission_key=g.permission_key
on conflict (role_id,permission_id) do update set allowed=true,scope=excluded.scope;

-- Legacy customer_support.* keys are superseded by helpdesk.* (grants migrated above).
delete from public.forge_permission_registry where permission_key like 'customer_support.%';

update public.forge_experience_elements
set name='Help Desk',
    default_label='Help Desk',
    default_description='Help Center, Ask Forge, tickets and Forge service status.',
    route='/help-desk',
    component_key='help-desk',
    settings='{"route_live":true,"required_permission":"helpdesk.knowledge.view"}'::jsonb,
    updated_at=now()
where element_key='nav.customer_support';

-- Forge staff hold help desk permissions through their platform role, never through tenant roles.
create table public.forge_support_platform_role_permissions (
  platform_role text not null check (platform_role in ('forge_owner','forge_creator','forge_support','forge_billing','forge_read_only')),
  permission_key text not null references public.forge_permission_registry(permission_key) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (platform_role, permission_key)
);

insert into public.forge_support_platform_role_permissions(platform_role,permission_key)
select r.role, p.permission_key
from (values ('forge_owner'),('forge_creator')) r(role)
join public.forge_permission_registry p on p.permission_key like 'helpdesk.support.%'
  or p.permission_key like 'helpdesk.admin.%'
  or p.permission_key in ('helpdesk.knowledge.create','helpdesk.knowledge.edit','helpdesk.knowledge.review','helpdesk.knowledge.publish','helpdesk.knowledge.archive','helpdesk.analytics.view','helpdesk.analytics.export')
on conflict do nothing;

insert into public.forge_support_platform_role_permissions(platform_role,permission_key)
select 'forge_support', p.permission_key
from public.forge_permission_registry p
where p.permission_key like 'helpdesk.support.%'
  or p.permission_key in ('helpdesk.knowledge.create','helpdesk.knowledge.edit','helpdesk.knowledge.review','helpdesk.analytics.view','helpdesk.admin.templates')
on conflict do nothing;

insert into public.forge_support_platform_role_permissions(platform_role,permission_key)
values ('forge_read_only','helpdesk.support.view'),('forge_read_only','helpdesk.analytics.view')
on conflict do nothing;

create or replace function public.forge_support_staff_has_permission(p_user_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.forge_platform_users pu
    join public.forge_support_platform_role_permissions rp on rp.platform_role = pu.platform_role
    where pu.user_id = p_user_id
      and pu.is_active = true
      and rp.permission_key = p_permission_key
  );
$$;
revoke all on function public.forge_support_staff_has_permission(uuid, text) from public;
grant execute on function public.forge_support_staff_has_permission(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Product catalog (cross-product architecture)
-- ---------------------------------------------------------------------------
create table public.forge_support_products (
  id uuid primary key default gen_random_uuid(),
  product_key text not null unique check (product_key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.forge_support_products(product_key,name,description,is_active,sort_order) values
('forge_industrial_safety','Forge Industrial Safety','EHS operations platform.',true,10),
('forge_responder','Forge Responder','Emergency response product.',false,20),
('forge_academy','Forge Academy','Training and learning product.',false,30)
on conflict (product_key) do nothing;

create table public.forge_support_product_areas (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.forge_support_products(id) on delete restrict,
  area_key text not null check (area_key ~ '^[a-z0-9_]+$'),
  label text not null check (char_length(label) between 2 and 120),
  feature_key text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, area_key),
  unique (product_id, id)
);

insert into public.forge_support_product_areas(product_id,area_key,label,feature_key,sort_order)
select p.id, a.area_key, a.label, a.feature_key, a.sort_order
from public.forge_support_products p
cross join (values
  ('dashboard','Dashboard',null,10),('personnel','Personnel','personnel',20),('training','Training','training',30),
  ('incidents','Incidents','incidents',40),('claims','Claims',null,50),('inspections','Inspections','inspections',60),
  ('corrective_actions','Corrective Actions','corrective_actions',70),('observations','Observations','observations',80),
  ('risk_register','Risk Register','risk_register',90),('jsa_jha','JSA / JHA','jsa_jha',100),('loto','LOTO','loto',110),
  ('permits','Permits',null,120),('equipment_assets','Equipment / Assets','assets_equipment',130),('qr_codes','QR Codes','qr_management',140),
  ('contractors','Contractors',null,150),('emergency_management','Emergency Management',null,160),('dot_compliance','DOT Compliance',null,170),
  ('osha_reporting','OSHA Reporting','osha',180),('reports_analytics','Reports / Analytics',null,190),('ask_forge','Ask Forge','forge_ai',200),
  ('administration','Administration',null,210),('integrations','Integrations',null,220),('mobile_field','Mobile / Field Version',null,230),
  ('other','Other',null,240)
) as a(area_key,label,feature_key,sort_order)
where p.product_key='forge_industrial_safety'
on conflict (product_id, area_key) do nothing;

create table public.forge_support_categories (
  id uuid primary key default gen_random_uuid(),
  category_key text not null check (category_key ~ '^[a-z0-9_]+$'),
  label text not null check (char_length(label) between 2 and 120),
  description text,
  product_id uuid references public.forge_support_products(id) on delete restrict,
  default_priority text check (default_priority in ('p1_critical','p2_high','p3_normal','p4_low')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index forge_support_categories_global_key on public.forge_support_categories(category_key) where product_id is null;
create unique index forge_support_categories_product_key on public.forge_support_categories(product_id, category_key) where product_id is not null;

insert into public.forge_support_categories(category_key,label,description,default_priority,sort_order) values
('technical_issue','Technical Issue','Something is broken or behaving unexpectedly.','p3_normal',10),
('how_do_i','How Do I...?','Help completing a task in Forge.','p4_low',20),
('account_login','Account / Login','Sign-in, password or account access problems.','p3_normal',30),
('permissions','Permissions','Users cannot see or do what they should.','p3_normal',40),
('feature_request','Feature Request','An idea or enhancement for Forge.','p4_low',50),
('data_issue','Data Issue','Records are missing, incorrect or duplicated.','p2_high',60),
('integration_issue','Integration Issue','A connected system is not syncing correctly.','p3_normal',70),
('mobile_app_issue','Mobile App Issue','Problems in the mobile or field version.','p3_normal',80),
('billing_subscription','Billing / Subscription','Invoices, plans and subscriptions.','p4_low',90),
('training_request','Training Request','Request Forge training for your team.','p4_low',100),
('report_problem','Report Problem','Report a safety-critical or urgent platform problem.','p2_high',110),
('other','Other','Anything else.','p4_low',120);

create table public.forge_support_teams (
  id uuid primary key default gen_random_uuid(),
  team_key text not null unique check (team_key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  product_id uuid references public.forge_support_products(id) on delete restrict,
  is_default_triage boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index forge_support_teams_one_triage on public.forge_support_teams((true)) where is_default_triage;

insert into public.forge_support_teams(team_key,name,description,is_default_triage) values
('customer_support','Customer Support','Tier 1 triage and customer communication.',true),
('technical_support','Technical Support','Tier 2 technical investigation.',false),
('engineering_liaison','Engineering Liaison','Bugs, development work and releases.',false);

create table public.forge_support_team_members (
  team_id uuid not null references public.forge_support_teams(id) on delete cascade,
  user_id uuid not null references public.forge_platform_users(user_id) on delete cascade,
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.forge_support_settings (
  id boolean primary key default true check (id),
  reopen_window_days integer not null default 30 check (reopen_window_days between 1 and 365),
  allow_customer_close boolean not null default true,
  csat_enabled boolean not null default true,
  capture_technical_context boolean not null default true,
  ai_answer_mode text not null default 'auto' check (ai_answer_mode in ('auto','knowledge_only','disabled')),
  email_notifications_enabled boolean not null default true,
  attachment_max_mb integer not null default 10 check (attachment_max_mb between 1 and 25),
  video_max_mb integer not null default 25 check (video_max_mb between 1 and 25),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.forge_support_settings(id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Concurrency-safe numbering: SUP-YYYY-######, INC-YYYY-####, DEV-YYYY-####
-- ---------------------------------------------------------------------------
create table public.forge_support_number_sequences (
  sequence_key text not null check (sequence_key in ('ticket','incident','development')),
  sequence_year integer not null check (sequence_year between 2000 and 2999),
  next_value bigint not null check (next_value > 0),
  primary key (sequence_key, sequence_year)
);

create or replace function public.forge_support_next_number(p_sequence_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from (now() at time zone 'UTC'))::integer;
  v_value bigint;
  v_prefix text;
  v_width integer;
begin
  case p_sequence_key
    when 'ticket' then v_prefix := 'SUP'; v_width := 6;
    when 'incident' then v_prefix := 'INC'; v_width := 4;
    when 'development' then v_prefix := 'DEV'; v_width := 4;
    else raise exception 'Unknown help desk sequence %', p_sequence_key;
  end case;

  -- The upsert takes a row lock on (key, year), so concurrent callers serialize here.
  insert into public.forge_support_number_sequences(sequence_key, sequence_year, next_value)
  values (p_sequence_key, v_year, 2)
  on conflict (sequence_key, sequence_year)
  do update set next_value = public.forge_support_number_sequences.next_value + 1
  returning next_value - 1 into v_value;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_value::text, greatest(v_width, length(v_value::text)), '0');
end;
$$;
revoke all on function public.forge_support_next_number(text) from public;
grant execute on function public.forge_support_next_number(text) to service_role;

drop function if exists public.next_forge_support_number(uuid);
drop table if exists public.forge_support_sequences;

-- ---------------------------------------------------------------------------
-- Ticket schema upgrade
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.forge_support_tickets'::regclass and contype = 'c'
  loop
    execute format('alter table public.forge_support_tickets drop constraint %I', r.conname);
  end loop;
end $$;
-- Ticket numbers become platform-unique; (organization_id, id) stays for tenant-aware FKs.
alter table public.forge_support_tickets drop constraint if exists forge_support_tickets_organization_id_ticket_number_key;

alter table public.forge_support_tickets rename column assigned_to to assigned_user_id;

alter table public.forge_support_tickets
  add column product_id uuid references public.forge_support_products(id) on delete restrict,
  add column module_id uuid,
  add column category_id uuid references public.forge_support_categories(id) on delete restrict,
  add column requester_name text,
  add column requester_email text,
  add column source text not null default 'web',
  add column customer_reported_severity text,
  add column disposition text,
  add column assigned_team_id uuid references public.forge_support_teams(id) on delete set null,
  add column location_id uuid references public.locations(id) on delete set null,
  add column division_id uuid references public.divisions(id) on delete set null,
  add column related_entity_type text,
  add column related_entity_id uuid,
  add column next_response_due_at timestamptz,
  add column sla_state text not null default 'on_track',
  add column sla_breached_at timestamptz,
  add column resolved_by uuid references auth.users(id) on delete set null,
  add column closed_by uuid references auth.users(id) on delete set null,
  add column reopened_at timestamptz,
  add column reopen_count integer not null default 0,
  add column escalation_level integer not null default 0,
  add column escalated_at timestamptz,
  add column fix_version text,
  add column merged_into_ticket_id uuid,
  add column assist_session_id uuid,
  add column idempotency_key text,
  add column row_version bigint not null default 1,
  add column deleted_at timestamptz;

update public.forge_support_tickets set status = 'triage' where status = 'triaged';
update public.forge_support_tickets set priority = case priority
  when 'urgent' then 'p1_critical' when 'high' then 'p2_high' when 'low' then 'p4_low' else 'p3_normal' end;
update public.forge_support_tickets set customer_reported_severity = priority;

update public.forge_support_tickets t
set product_id = p.id
from public.forge_support_products p
where p.product_key = 'forge_industrial_safety';

update public.forge_support_tickets t
set category_id = c.id
from public.forge_support_categories c
where c.product_id is null and c.category_key = case t.category
  when 'account' then 'account_login'
  when 'access' then 'permissions'
  when 'billing' then 'billing_subscription'
  when 'bug' then 'technical_issue'
  when 'feature_request' then 'feature_request'
  when 'data' then 'data_issue'
  when 'integration' then 'integration_issue'
  when 'training' then 'training_request'
  when 'incident' then 'report_problem'
  else 'other' end;

update public.forge_support_tickets t
set module_id = a.id
from public.forge_support_product_areas a
where a.product_id = t.product_id
  and t.product_area is not null
  and lower(a.label) = lower(t.product_area);

update public.forge_support_tickets t
set requester_name = coalesce(u.name, u.email), requester_email = u.email
from public.users u
where u.user_id = t.requester_user_id;

with numbered as (
  select id,
         extract(year from (created_at at time zone 'UTC'))::integer as y,
         row_number() over (partition by extract(year from (created_at at time zone 'UTC')) order by created_at, id) as n
  from public.forge_support_tickets
)
update public.forge_support_tickets t
set ticket_number = 'SUP-' || numbered.y::text || '-' || lpad(numbered.n::text, 6, '0')
from numbered
where numbered.id = t.id;

insert into public.forge_support_number_sequences(sequence_key, sequence_year, next_value)
select 'ticket', extract(year from (created_at at time zone 'UTC'))::integer, count(*) + 1
from public.forge_support_tickets
group by 2
on conflict (sequence_key, sequence_year) do update set next_value = excluded.next_value;

-- Technical context is stored separately from the customer-authored description.
create table public.forge_support_ticket_technical_context (
  ticket_id uuid primary key,
  organization_id uuid not null,
  captured boolean not null default true,
  user_role text,
  product_key text,
  module_key text,
  route text,
  page_url text,
  browser_name text,
  browser_version text,
  os_name text,
  device_type text check (device_type is null or device_type in ('desktop','tablet','mobile','unknown')),
  viewport_width integer check (viewport_width is null or viewport_width between 0 and 20000),
  viewport_height integer check (viewport_height is null or viewport_height between 0 and 20000),
  is_mobile boolean,
  app_version text,
  build_version text,
  client_timezone text,
  client_timestamp timestamptz,
  correlation_id text,
  client_error_id text,
  user_agent text,
  captured_at timestamptz not null default now(),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);

insert into public.forge_support_ticket_technical_context(ticket_id, organization_id, captured, page_url, user_agent)
select id, organization_id, false, page_url, environment
from public.forge_support_tickets
where page_url is not null or environment is not null;

alter table public.forge_support_tickets
  drop column category,
  drop column product_area,
  drop column page_url,
  drop column environment;

update public.forge_support_tickets set resolution_summary = coalesce(resolution_summary, 'Resolved before Help Desk upgrade.') where status in ('resolved','closed');

alter table public.forge_support_tickets
  alter column product_id set not null,
  alter column category_id set not null,
  alter column priority set default 'p3_normal',
  add constraint forge_support_tickets_number_key unique (ticket_number),
  add constraint forge_support_tickets_number_format check (ticket_number ~ '^SUP-[0-9]{4}-[0-9]{6,}$'),
  add constraint forge_support_tickets_subject_len check (char_length(subject) between 4 and 160),
  add constraint forge_support_tickets_description_len check (char_length(description) between 10 and 10000),
  add constraint forge_support_tickets_status_valid check (status in ('new','triage','assigned','in_progress','waiting_on_customer','waiting_on_forge','resolved','closed','reopened')),
  add constraint forge_support_tickets_priority_valid check (priority in ('p1_critical','p2_high','p3_normal','p4_low')),
  add constraint forge_support_tickets_severity_valid check (customer_reported_severity is null or customer_reported_severity in ('p1_critical','p2_high','p3_normal','p4_low')),
  add constraint forge_support_tickets_source_valid check (source in ('web','mobile','ask_forge','email','phone','internal','api')),
  add constraint forge_support_tickets_disposition_valid check (disposition is null or disposition in ('duplicate','known_issue','feature_request','cannot_reproduce','configuration_issue','training_issue','third_party_issue','bug_confirmed','working_as_designed')),
  add constraint forge_support_tickets_sla_state_valid check (sla_state in ('on_track','at_risk','breached','paused','completed')),
  add constraint forge_support_tickets_resolved_state check (resolved_at is null or status in ('resolved','closed')),
  add constraint forge_support_tickets_closed_state check (closed_at is null or status = 'closed'),
  add constraint forge_support_tickets_resolution_required check (status not in ('resolved','closed') or resolution_summary is not null),
  add constraint forge_support_tickets_not_self_merged check (merged_into_ticket_id is null or merged_into_ticket_id <> id),
  add constraint forge_support_tickets_related_pair check ((related_entity_type is null) = (related_entity_id is null)),
  add constraint forge_support_tickets_reopen_count check (reopen_count >= 0 and escalation_level >= 0),
  add constraint forge_support_tickets_module_product foreign key (product_id, module_id) references public.forge_support_product_areas(product_id, id),
  add constraint forge_support_tickets_merged_same_tenant foreign key (organization_id, merged_into_ticket_id) references public.forge_support_tickets(organization_id, id);

create unique index forge_support_tickets_idempotency on public.forge_support_tickets(organization_id, requester_user_id, idempotency_key) where idempotency_key is not null;
create index forge_support_tickets_created_idx on public.forge_support_tickets(created_at);
create index forge_support_tickets_resolved_idx on public.forge_support_tickets(resolved_at) where resolved_at is not null;
create index forge_support_tickets_sla_idx on public.forge_support_tickets(sla_state, status);
create index forge_support_tickets_location_idx on public.forge_support_tickets(organization_id, location_id);
create index forge_support_tickets_product_module_idx on public.forge_support_tickets(product_id, module_id);
create index forge_support_tickets_disposition_idx on public.forge_support_tickets(disposition) where disposition is not null;
create index forge_support_tickets_merged_idx on public.forge_support_tickets(merged_into_ticket_id) where merged_into_ticket_id is not null;

alter table public.forge_support_tickets
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(ticket_number, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(subject, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(requester_name, '') || ' ' || coalesce(requester_email, '')), 'C')
  ) stored;
create index forge_support_tickets_search_idx on public.forge_support_tickets using gin(search_vector);

-- ---------------------------------------------------------------------------
-- Messages, events, attachments
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.forge_support_messages'::regclass and contype = 'c'
  loop
    execute format('alter table public.forge_support_messages drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.forge_support_messages
  add column message_type text,
  add column saved_reply_id uuid,
  add column ai_suggestion_id uuid,
  add column source_ticket_id uuid,
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

update public.forge_support_messages set message_type = case
  when author_kind = 'customer' then 'customer_message'
  when visibility = 'internal' then 'internal_note'
  else 'support_reply' end;

alter table public.forge_support_messages
  alter column message_type set not null,
  add constraint forge_support_messages_body_len check (char_length(body) between 1 and 10000),
  add constraint forge_support_messages_author_kind_valid check (author_kind in ('customer','forge','system')),
  add constraint forge_support_messages_visibility_valid check (visibility in ('public','internal')),
  add constraint forge_support_messages_type_valid check (message_type in ('customer_message','support_reply','internal_note','system_event','ai_draft')),
  add constraint forge_support_messages_internal_types check ((visibility = 'internal') = (message_type in ('internal_note','ai_draft'))),
  add constraint forge_support_messages_customer_kind check (message_type <> 'customer_message' or author_kind = 'customer'),
  add constraint forge_support_messages_forge_kind check (message_type not in ('support_reply','internal_note','ai_draft') or author_kind = 'forge');

create index forge_support_messages_ticket_visibility_idx on public.forge_support_messages(ticket_id, visibility, created_at);

create table public.forge_support_message_mentions (
  message_id uuid not null references public.forge_support_messages(id) on delete cascade,
  organization_id uuid not null,
  ticket_id uuid not null,
  mentioned_user_id uuid not null references public.forge_platform_users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, mentioned_user_id),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);

alter table public.forge_support_events
  alter column actor_user_id drop not null,
  add column visibility text not null default 'internal' check (visibility in ('public','internal')),
  add column metadata jsonb not null default '{}'::jsonb;

update public.forge_support_events
set visibility = 'public'
where event_type in ('created','customer_reply','forge_reply','attachment_added','status_changed','reopened');

do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.forge_support_attachments'::regclass and contype = 'c'
  loop
    execute format('alter table public.forge_support_attachments drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.forge_support_attachments
  add column message_id uuid references public.forge_support_messages(id) on delete set null,
  add column original_file_name text,
  add column sha256 text,
  add column scan_status text not null default 'not_scanned',
  add column scan_provider text,
  add column scan_detail text,
  add column scanned_at timestamptz,
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete set null;

update public.forge_support_attachments set original_file_name = file_name;

alter table public.forge_support_attachments
  alter column original_file_name set not null,
  add constraint forge_support_attachments_visibility_valid check (visibility in ('public','internal')),
  add constraint forge_support_attachments_name_len check (char_length(file_name) between 1 and 255 and char_length(original_file_name) between 1 and 255),
  add constraint forge_support_attachments_size check (byte_size between 1 and 26214400),
  add constraint forge_support_attachments_scan_valid check (scan_status in ('pending','clean','blocked','not_scanned')),
  add constraint forge_support_attachments_deleted_pair check ((deleted_at is null) = (deleted_by is null));

update storage.buckets set file_size_limit = 26214400 where id = 'forge-support';

-- ---------------------------------------------------------------------------
-- Status / priority / assignment history
-- ---------------------------------------------------------------------------
create table public.forge_support_ticket_status_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  ticket_id uuid not null,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('customer','staff','system')),
  reason text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);
create index forge_support_status_history_ticket_idx on public.forge_support_ticket_status_history(ticket_id, created_at);
create index forge_support_status_history_to_idx on public.forge_support_ticket_status_history(to_status, created_at);

insert into public.forge_support_ticket_status_history(organization_id, ticket_id, from_status, to_status, changed_by, actor_type, created_at)
select organization_id, id, null, 'new', requester_user_id, 'customer', created_at from public.forge_support_tickets;

create table public.forge_support_ticket_priority_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  ticket_id uuid not null,
  from_priority text,
  to_priority text not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);
create index forge_support_priority_history_ticket_idx on public.forge_support_ticket_priority_history(ticket_id, created_at);

create table public.forge_support_ticket_assignments (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  ticket_id uuid not null,
  from_user_id uuid,
  to_user_id uuid,
  from_team_id uuid,
  to_team_id uuid,
  assigned_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);
create index forge_support_assignments_ticket_idx on public.forge_support_ticket_assignments(ticket_id, created_at);

create table public.forge_support_status_transitions (
  from_status text not null,
  to_status text not null,
  actor_scope text not null check (actor_scope in ('staff','customer','system')),
  primary key (from_status, to_status, actor_scope)
);

insert into public.forge_support_status_transitions(from_status,to_status,actor_scope)
select f, t, 'staff' from (values
  ('new','triage'),('new','assigned'),('new','in_progress'),('new','waiting_on_customer'),('new','waiting_on_forge'),('new','resolved'),
  ('triage','assigned'),('triage','in_progress'),('triage','waiting_on_customer'),('triage','waiting_on_forge'),('triage','resolved'),
  ('assigned','triage'),('assigned','in_progress'),('assigned','waiting_on_customer'),('assigned','waiting_on_forge'),('assigned','resolved'),
  ('in_progress','assigned'),('in_progress','waiting_on_customer'),('in_progress','waiting_on_forge'),('in_progress','resolved'),
  ('waiting_on_customer','in_progress'),('waiting_on_customer','assigned'),('waiting_on_customer','waiting_on_forge'),('waiting_on_customer','resolved'),
  ('waiting_on_forge','in_progress'),('waiting_on_forge','assigned'),('waiting_on_forge','waiting_on_customer'),('waiting_on_forge','resolved'),
  ('resolved','closed'),('resolved','reopened'),('closed','reopened'),
  ('reopened','triage'),('reopened','assigned'),('reopened','in_progress'),('reopened','waiting_on_customer'),('reopened','waiting_on_forge'),('reopened','resolved')
) s(f,t)
union all
select f, 'closed', 'customer' from unnest(array['new','triage','assigned','in_progress','waiting_on_customer','waiting_on_forge','reopened','resolved']) f
union all
select f, 'reopened', 'customer' from unnest(array['resolved','closed']) f
union all
select 'waiting_on_customer', 'waiting_on_forge', 'system'
union all
select f, 'closed', 'system' from unnest(array['new','triage','assigned','in_progress','waiting_on_customer','waiting_on_forge','reopened','resolved']) f
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Tags, watchers, relations
-- ---------------------------------------------------------------------------
create table public.forge_support_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 60),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index forge_support_tags_scope_slug on public.forge_support_tags(coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

insert into public.forge_support_tags(label,slug,description) values
('bug','bug','Confirmed or suspected defect.'),
('feature-request','feature-request','Enhancement request.'),
('login','login','Sign-in or authentication.'),
('permissions','permissions','Roles, scopes and access.'),
('inspection','inspection','Inspections module.'),
('mobile','mobile','Mobile or field version.'),
('data','data','Data quality or migration.'),
('integration','integration','External system integrations.'),
('critical-client','critical-client','Customer with elevated support handling.'),
('known-issue','known-issue','Matches a published known issue.'),
('training','training','Training or enablement need.'),
('billing','billing','Billing or subscription.');

create table public.forge_support_ticket_tags (
  organization_id uuid not null,
  ticket_id uuid not null,
  tag_id uuid not null references public.forge_support_tags(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (ticket_id, tag_id),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);
create index forge_support_ticket_tags_tag_idx on public.forge_support_ticket_tags(tag_id);

create or replace function public.forge_support_ticket_tag_scope_guard()
returns trigger language plpgsql as $$
declare v_tag_org uuid; v_active boolean;
begin
  select organization_id, is_active into v_tag_org, v_active from public.forge_support_tags where id = new.tag_id;
  if v_tag_org is not null and v_tag_org <> new.organization_id then
    raise exception 'Tag belongs to another tenant.';
  end if;
  if not coalesce(v_active, false) then
    raise exception 'Tag is inactive.';
  end if;
  return new;
end $$;
create trigger forge_support_ticket_tag_scope before insert on public.forge_support_ticket_tags
for each row execute function public.forge_support_ticket_tag_scope_guard();

create table public.forge_support_ticket_watchers (
  organization_id uuid not null,
  ticket_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  watcher_type text not null check (watcher_type in ('customer','internal')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id),
  foreign key (organization_id, ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);
create index forge_support_watchers_user_idx on public.forge_support_ticket_watchers(user_id, watcher_type);

create table public.forge_support_ticket_relations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_ticket_id uuid not null,
  target_ticket_id uuid not null,
  relation_type text not null check (relation_type in ('related','parent_of','duplicate_of')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  check (source_ticket_id <> target_ticket_id),
  foreign key (organization_id, source_ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade,
  foreign key (organization_id, target_ticket_id) references public.forge_support_tickets(organization_id, id) on delete cascade
);
create unique index forge_support_relations_active on public.forge_support_ticket_relations(source_ticket_id, target_ticket_id, relation_type) where archived_at is null;
create index forge_support_relations_target_idx on public.forge_support_ticket_relations(target_ticket_id) where archived_at is null;
create unique index forge_support_relations_one_parent on public.forge_support_ticket_relations(target_ticket_id) where relation_type = 'parent_of' and archived_at is null;

-- ---------------------------------------------------------------------------
-- Saved replies
-- ---------------------------------------------------------------------------
create table public.forge_support_saved_replies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  category text not null default 'general' check (char_length(category) between 2 and 60),
  body text not null check (char_length(body) between 2 and 10000),
  is_active boolean not null default true,
  product_id uuid references public.forge_support_products(id) on delete restrict,
  team_id uuid references public.forge_support_teams(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version bigint not null default 1
);
create unique index forge_support_saved_replies_name on public.forge_support_saved_replies(lower(name));

alter table public.forge_support_messages
  add constraint forge_support_messages_saved_reply_fk foreign key (saved_reply_id) references public.forge_support_saved_replies(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Audit hardening: actor type, request metadata, append-only
-- ---------------------------------------------------------------------------
alter table public.forge_creator_audit_log
  add column if not exists actor_type text check (actor_type is null or actor_type in ('tenant_user','forge_staff','system','ai')),
  add column if not exists source_ip text,
  add column if not exists user_agent text;

create index if not exists forge_creator_audit_log_entity_idx on public.forge_creator_audit_log(entity_type, entity_id, created_at desc);

create or replace function public.forge_audit_log_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'forge_creator_audit_log is append-only.';
  end if;
  -- Only foreign-key SET NULL maintenance (user/org deletion) may touch existing rows.
  if (to_jsonb(new) - 'actor_user_id' - 'organization_id') is distinct from (to_jsonb(old) - 'actor_user_id' - 'organization_id')
     or (new.actor_user_id is not null and new.actor_user_id is distinct from old.actor_user_id)
     or (new.organization_id is not null and new.organization_id is distinct from old.organization_id) then
    raise exception 'forge_creator_audit_log is append-only.';
  end if;
  return new;
end $$;
drop trigger if exists forge_audit_log_append_only on public.forge_creator_audit_log;
create trigger forge_audit_log_append_only before update or delete on public.forge_creator_audit_log
for each row execute function public.forge_audit_log_append_only();

-- Internal helper used by every help desk RPC.
create or replace function public.forge_support_audit(
  p_actor_user_id uuid,
  p_actor_type text,
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_before jsonb,
  p_after jsonb,
  p_reason text,
  p_request_id text,
  p_source_ip text,
  p_user_agent text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  insert into public.forge_creator_audit_log(actor_user_id, organization_id, action, entity_type, entity_id, before_value, after_value, reason, request_id, actor_type, source_ip, user_agent)
  values (p_actor_user_id, p_organization_id, p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason, p_request_id, p_actor_type, left(p_source_ip, 100), left(p_user_agent, 400))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.forge_support_audit(uuid,text,uuid,text,text,text,jsonb,jsonb,text,text,text,text) from public;
grant execute on function public.forge_support_audit(uuid,text,uuid,text,text,text,jsonb,jsonb,text,text,text,text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: service-role only (server authorizes, RPCs re-validate)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'forge_support_platform_role_permissions','forge_support_products','forge_support_product_areas','forge_support_categories',
    'forge_support_teams','forge_support_team_members','forge_support_settings','forge_support_number_sequences',
    'forge_support_ticket_technical_context','forge_support_message_mentions','forge_support_ticket_status_history',
    'forge_support_ticket_priority_history','forge_support_ticket_assignments','forge_support_status_transitions',
    'forge_support_tags','forge_support_ticket_tags','forge_support_ticket_watchers','forge_support_ticket_relations',
    'forge_support_saved_replies'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;

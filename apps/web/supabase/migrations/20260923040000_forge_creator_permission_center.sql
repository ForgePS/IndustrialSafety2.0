-- Forge Creator 2.0 permission center and reusable tenant role templates.

alter table public.forge_permission_registry
  add column if not exists tenant_can_scope boolean not null default true,
  add column if not exists default_scope text not null default 'organization',
  add column if not exists danger_level text not null default 'normal'
    check (danger_level in ('normal','sensitive','critical'));

create table if not exists public.forge_role_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  description text,
  category text not null default 'general',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forge_role_template_permissions (
  template_id uuid not null references public.forge_role_templates(id) on delete cascade,
  permission_id uuid not null references public.forge_permission_registry(id) on delete cascade,
  allowed boolean not null default true,
  scope text,
  constraints jsonb not null default '{}'::jsonb,
  primary key (template_id, permission_id)
);

alter table public.forge_role_templates enable row level security;
alter table public.forge_role_template_permissions enable row level security;

grant all on public.forge_role_templates to service_role;
grant all on public.forge_role_template_permissions to service_role;

insert into public.forge_permission_registry
(permission_key, feature_key, name, description, permission_group, action, tenant_assignable, tenant_can_scope, default_scope, is_sensitive, requires_confirmation, audit_use, danger_level, sort_order)
values
('personnel.view_sensitive','personnel','View Sensitive Personnel Data','View restricted personnel fields and documents.','Personnel','view_sensitive',true,true,'organization',true,true,true,'sensitive',60),
('personnel.export','personnel','Export Personnel','Export personnel data.','Personnel','export',true,true,'organization',true,true,true,'critical',70),
('personnel.manage_documents','personnel','Manage Personnel Documents','Upload, replace and archive personnel documents.','Personnel','manage_documents',true,true,'organization',true,false,true,'sensitive',80),

('training.create_course','training','Create Courses','Create and configure training courses.','Training','create_course',true,true,'organization',false,false,true,'normal',40),
('training.record_completion','training','Record Completions','Record completed training for personnel.','Training','record_completion',true,true,'organization',false,false,true,'normal',50),
('training.issue_certificate','training','Issue Certificates','Issue or regenerate training certificates.','Training','issue_certificate',true,true,'organization',true,true,true,'sensitive',60),
('training.delete','training','Delete Training Records','Delete eligible training records.','Training','delete',true,true,'organization',true,true,true,'critical',70),
('training.export','training','Export Training','Export training records and transcripts.','Training','export',true,true,'organization',true,true,true,'sensitive',80),

('incidents.reopen','incidents','Reopen Incidents','Reopen a closed or approved incident.','Incidents','reopen',true,true,'organization',true,true,true,'sensitive',60),
('incidents.investigate','incidents','Manage Investigations','Manage incident investigations and findings.','Incidents','investigate',true,true,'organization',true,false,true,'sensitive',70),
('incidents.view_restricted','incidents','View Restricted Incident Data','View restricted medical, claims or investigation information.','Incidents','view_restricted',true,true,'organization',true,true,true,'critical',80),
('incidents.export','incidents','Export Incidents','Export incident data.','Incidents','export',true,true,'organization',true,true,true,'critical',90),

('inspections.edit','inspections','Edit Inspections','Edit eligible inspections.','Inspections','edit',true,true,'organization',false,false,true,'normal',40),
('inspections.assign','inspections','Assign Inspections','Assign inspections to personnel.','Inspections','assign',true,true,'organization',false,false,true,'normal',50),
('inspections.close_findings','inspections','Close Findings','Verify and close inspection findings or corrective actions.','Inspections','close_findings',true,true,'organization',true,true,true,'sensitive',60),
('inspections.delete','inspections','Delete Inspections','Delete eligible inspections.','Inspections','delete',true,true,'organization',true,true,true,'critical',70),
('inspections.export','inspections','Export Inspections','Export inspection data.','Inspections','export',true,true,'organization',true,true,true,'sensitive',80),

('osha.view','osha','View OSHA','View OSHA recordkeeping data.','OSHA','view',true,true,'organization',true,false,true,'sensitive',10),
('osha.edit','osha','Edit OSHA','Create and edit OSHA recordkeeping data.','OSHA','edit',true,true,'organization',true,true,true,'critical',20),
('osha.certify','osha','Certify OSHA Records','Certify or finalize OSHA records and annual summaries.','OSHA','certify',true,true,'organization',true,true,true,'critical',30),
('osha.export','osha','Export OSHA','Export OSHA records and forms.','OSHA','export',true,true,'organization',true,true,true,'critical',40),

('workers_comp.view','workers_comp','View Workers Compensation','View workers compensation cases.','Workers Compensation','view',true,true,'organization',true,true,true,'critical',10),
('workers_comp.create','workers_comp','Create Workers Compensation Cases','Create workers compensation cases.','Workers Compensation','create',true,true,'organization',true,true,true,'critical',20),
('workers_comp.edit','workers_comp','Edit Workers Compensation','Edit workers compensation cases.','Workers Compensation','edit',true,true,'organization',true,true,true,'critical',30),
('workers_comp.export','workers_comp','Export Workers Compensation','Export workers compensation case data.','Workers Compensation','export',true,true,'organization',true,true,true,'critical',40),

('dot.view','dot','View DOT','View DOT compliance records.','DOT','view',true,true,'organization',false,false,false,'normal',10),
('dot.edit','dot','Edit DOT','Create and edit DOT compliance records.','DOT','edit',true,true,'organization',true,false,true,'sensitive',20),
('dot.approve','dot','Approve DOT','Approve or certify DOT compliance records.','DOT','approve',true,true,'organization',true,true,true,'critical',30),
('dot.export','dot','Export DOT','Export DOT compliance data.','DOT','export',true,true,'organization',true,true,true,'sensitive',40),

('assets_equipment.view','assets_equipment','View Assets & Equipment','View assets and equipment records.','Assets & Equipment','view',true,true,'organization',false,false,false,'normal',10),
('assets_equipment.create','assets_equipment','Create Assets & Equipment','Create asset and equipment records.','Assets & Equipment','create',true,true,'organization',false,false,true,'normal',20),
('assets_equipment.edit','assets_equipment','Edit Assets & Equipment','Edit asset and equipment records.','Assets & Equipment','edit',true,true,'organization',false,false,true,'normal',30),
('assets_equipment.retire','assets_equipment','Retire Assets & Equipment','Retire or archive equipment.','Assets & Equipment','retire',true,true,'organization',true,true,true,'sensitive',40),

('fleet.view','fleet','View Fleet','View fleet records.','Fleet','view',true,true,'organization',false,false,false,'normal',10),
('fleet.create','fleet','Create Fleet Records','Create vehicles and fleet records.','Fleet','create',true,true,'organization',false,false,true,'normal',20),
('fleet.edit','fleet','Edit Fleet','Edit vehicle and fleet records.','Fleet','edit',true,true,'organization',false,false,true,'normal',30),
('fleet.maintenance','fleet','Manage Fleet Maintenance','Manage maintenance and service records.','Fleet','maintenance',true,true,'organization',false,false,true,'normal',40),
('fleet.retire','fleet','Retire Vehicles','Retire or archive fleet vehicles.','Fleet','retire',true,true,'organization',true,true,true,'sensitive',50),

('loto.view','loto','View LOTO','View lockout/tagout procedures.','Lockout / Tagout','view',true,true,'organization',false,false,false,'normal',10),
('loto.create','loto','Create LOTO','Create lockout/tagout procedures.','Lockout / Tagout','create',true,true,'organization',true,false,true,'sensitive',20),
('loto.edit','loto','Edit LOTO','Edit lockout/tagout procedures.','Lockout / Tagout','edit',true,true,'organization',true,false,true,'sensitive',30),
('loto.approve','loto','Approve LOTO','Approve and publish lockout/tagout procedures.','Lockout / Tagout','approve',true,true,'organization',true,true,true,'critical',40),

('emergency_management.view','emergency_management','View Emergency Management','View emergency plans, drills and readiness records.','Emergency Management','view',true,true,'organization',false,false,false,'normal',10),
('emergency_management.edit','emergency_management','Edit Emergency Management','Create and edit emergency management content.','Emergency Management','edit',true,true,'organization',true,false,true,'sensitive',20),
('emergency_management.send_alerts','emergency_management','Send Emergency Alerts','Send emergency notifications and alerts.','Emergency Management','send_alerts',true,true,'organization',true,true,true,'critical',30),

('qr_management.view','qr_management','View QR Management','View managed QR codes and scan history.','QR Management','view',true,true,'organization',false,false,false,'normal',10),
('qr_management.create','qr_management','Create QR Codes','Create and assign managed QR codes.','QR Management','create',true,true,'organization',false,false,true,'normal',20),
('qr_management.edit','qr_management','Edit QR Codes','Edit QR destinations and metadata.','QR Management','edit',true,true,'organization',true,false,true,'sensitive',30),
('qr_management.delete','qr_management','Delete QR Codes','Delete managed QR codes.','QR Management','delete',true,true,'organization',true,true,true,'critical',40),

('reporting.create','reporting','Create Reports','Build and save custom reports.','Reporting','create',true,true,'organization',false,false,true,'normal',30),
('reporting.manage_dashboards','reporting','Manage Dashboards','Create and modify dashboards and widgets.','Reporting','manage_dashboards',true,true,'organization',false,false,true,'normal',40),

('tenant.users.view',null,'View Company Users','View company users and role assignments.','Company Administration','users_view',true,false,'organization',true,false,true,'sensitive',10),
('tenant.users.manage',null,'Manage Company Users','Invite, edit, suspend and restore company users.','Company Administration','users_manage',true,false,'organization',true,true,true,'critical',20),
('tenant.roles.view',null,'View Roles & Permissions','View company roles and effective permissions.','Company Administration','roles_view',true,false,'organization',true,false,true,'sensitive',30),
('tenant.roles.manage',null,'Manage Roles & Permissions','Create roles and change assignable permissions.','Company Administration','roles_manage',true,false,'organization',true,true,true,'critical',40),
('tenant.settings.view',null,'View Company Settings','View tenant configuration.','Company Administration','settings_view',true,false,'organization',false,false,false,'normal',50),
('tenant.settings.manage',null,'Manage Company Settings','Change tenant-configurable settings.','Company Administration','settings_manage',true,false,'organization',true,true,true,'critical',60),
('tenant.lookups.manage',null,'Manage Dropdowns & Lookups','Manage tenant-customizable dropdown options.','Company Administration','lookups_manage',true,false,'organization',true,false,true,'sensitive',70),
('tenant.navigation.manage',null,'Manage Navigation','Manage tenant-configurable navigation labels and visibility.','Company Administration','navigation_manage',true,false,'organization',true,false,true,'sensitive',80)
on conflict (permission_key) do update
set
  name = excluded.name,
  description = excluded.description,
  permission_group = excluded.permission_group,
  action = excluded.action,
  tenant_assignable = excluded.tenant_assignable,
  tenant_can_scope = excluded.tenant_can_scope,
  default_scope = excluded.default_scope,
  is_sensitive = excluded.is_sensitive,
  requires_confirmation = excluded.requires_confirmation,
  audit_use = excluded.audit_use,
  danger_level = excluded.danger_level,
  sort_order = excluded.sort_order;

insert into public.forge_role_templates (template_key, name, description, category, sort_order)
values
('read-only','Read Only','View-only access to common operational modules.','quick-start',10),
('standard-user','Standard User','Typical employee access for assigned work and records.','quick-start',20),
('supervisor','Supervisor','Supervisor access with assigned-personnel and Location-level authority.','quick-start',30),
('safety-manager','Safety Manager','Broad safety, training, incident, inspection and reporting access.','quick-start',40),
('company-admin','Company Administrator','Broad tenant administration excluding Forge platform controls.','quick-start',50)
on conflict (template_key) do update
set name=excluded.name, description=excluded.description, category=excluded.category, sort_order=excluded.sort_order, updated_at=now();

-- Read-only template.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.action = 'view'
where rt.template_key = 'read-only' and p.tenant_assignable = true
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

-- Standard employee template.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true,
  case when p.default_scope in ('own','assigned') then p.default_scope else 'own' end
from public.forge_role_templates rt
join public.forge_permission_registry p
  on p.permission_key in (
    'personnel.view','training.view','incidents.view','incidents.create',
    'inspections.view','inspections.create','assets_equipment.view','fleet.view',
    'loto.view','emergency_management.view','qr_management.view'
  )
where rt.template_key = 'standard-user'
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

-- Supervisor template.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'location'
from public.forge_role_templates rt
join public.forge_permission_registry p
  on p.permission_key in (
    'personnel.view','personnel.edit','training.view','training.assign','training.record_completion',
    'incidents.view','incidents.create','incidents.edit','inspections.view','inspections.create',
    'inspections.edit','inspections.assign','assets_equipment.view','assets_equipment.edit',
    'fleet.view','fleet.maintenance','loto.view','emergency_management.view','reporting.view'
  )
where rt.template_key = 'supervisor'
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

-- Safety manager template.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p
  on p.permission_group in ('Personnel','Training','Incidents','Inspections','OSHA','Workers Compensation','DOT','Reporting')
where rt.template_key = 'safety-manager'
  and p.tenant_assignable = true
  and p.action <> 'delete'
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

-- Company administrator template.
insert into public.forge_role_template_permissions (template_id, permission_id, allowed, scope)
select rt.id, p.id, true, 'organization'
from public.forge_role_templates rt
join public.forge_permission_registry p on p.tenant_assignable = true
where rt.template_key = 'company-admin'
  and p.action <> 'delete'
on conflict (template_id, permission_id) do update set allowed=true, scope=excluded.scope;

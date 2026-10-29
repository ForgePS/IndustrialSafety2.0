-- Customer support is a Forge-operated workspace. All data access is through
-- authenticated server actions that verify membership or Forge platform role.
insert into public.forge_feature_registry
(feature_key,name,description,category,feature_type,platform_state,tenant_configurable,location_configurable,user_configurable,requires_entitlement,is_sensitive,sort_order)
values ('customer_support','Customer Support','Customer tickets and Forge support conversations.','Administration','module','enabled',false,false,false,false,false,910)
on conflict (feature_key) do update set name=excluded.name,description=excluded.description,platform_state='enabled',requires_entitlement=false,updated_at=now();

insert into public.forge_permission_registry
(permission_key,feature_key,name,description,permission_group,action,tenant_assignable,tenant_can_scope,default_scope,is_sensitive,requires_confirmation,audit_use,danger_level,sort_order)
values
('customer_support.view','customer_support','View Support','View own requests or company requests when authorized.','Customer Support','view',true,true,'own',false,false,false,'normal',10),
('customer_support.create','customer_support','Create Support Request','Open a request with Forge.','Customer Support','create',true,false,'own',false,false,true,'normal',20),
('customer_support.company_view','customer_support','View Company Support','View all support requests for this company.','Customer Support','company_view',true,false,'organization',true,false,true,'sensitive',30),
('customer_support.company_reply','customer_support','Reply for Company','Reply to any company support request.','Customer Support','company_reply',true,false,'organization',true,false,true,'sensitive',40)
on conflict (permission_key) do update set feature_key=excluded.feature_key,name=excluded.name,description=excluded.description,updated_at=now();

insert into public.forge_role_template_permissions(template_id,permission_id,allowed,scope)
select rt.id,p.id,true,case when p.permission_key in ('customer_support.company_view','customer_support.company_reply') then 'organization' else 'own' end
from public.forge_role_templates rt
join public.forge_permission_registry p on p.permission_key in ('customer_support.view','customer_support.create','customer_support.company_view','customer_support.company_reply')
where rt.template_key in ('standard-user','supervisor','safety-manager','company-admin')
and (p.permission_key not in ('customer_support.company_view','customer_support.company_reply') or rt.template_key in ('company-admin'))
on conflict (template_id,permission_id) do update set allowed=true,scope=excluded.scope;

insert into public.forge_tenant_role_permissions(role_id,permission_id,allowed,scope)
select r.id,p.id,true,case when p.permission_key in ('customer_support.company_view','customer_support.company_reply') then 'organization' else 'own' end
from public.forge_tenant_roles r
join public.forge_permission_registry p on p.permission_key in ('customer_support.view','customer_support.create','customer_support.company_view','customer_support.company_reply')
where r.role_key in ('employee','supervisor','location-administrator','company-administrator','company-owner')
and (p.permission_key not in ('customer_support.company_view','customer_support.company_reply') or r.role_key in ('company-administrator','company-owner'))
on conflict (role_id,permission_id) do update set allowed=true,scope=excluded.scope;

insert into public.forge_experience_elements
(element_key,element_type,name,default_label,default_description,route,component_key,category,sort_order,platform_enabled,protection_level,tenant_edit_mode,location_edit_mode,user_edit_mode,can_hide,can_rename,can_reorder,settings)
values ('nav.customer_support','menu','Customer Support','Support','Contact Forge and track your requests.','/support','customer-support','Administration',905,true,'configurable','presentation','none','none',false,true,true,'{"route_live":true,"required_permission":"customer_support.view"}'::jsonb)
on conflict (element_key) do update set route=excluded.route,settings=excluded.settings,updated_at=now();

create table public.forge_support_sequences (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 next_value integer not null default 1 check (next_value > 0)
);
create or replace function public.next_forge_support_number(p_organization_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_number integer;
begin
 insert into public.forge_support_sequences(organization_id,next_value) values(p_organization_id,2)
 on conflict(organization_id) do update set next_value=public.forge_support_sequences.next_value+1
 returning next_value-1 into v_number;
 return 'SUP-' || lpad(v_number::text,6,'0');
end; $$;
revoke all on function public.next_forge_support_number(uuid) from public;
grant execute on function public.next_forge_support_number(uuid) to service_role;

create table public.forge_support_tickets (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 ticket_number text not null,
 subject text not null check (char_length(subject) between 4 and 160),
 description text not null check (char_length(description) between 10 and 10000),
 category text not null default 'general' check (category in ('general','account','access','billing','bug','feature_request','data','integration','training','incident')),
 priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
 status text not null default 'new' check (status in ('new','triaged','in_progress','waiting_on_customer','waiting_on_forge','resolved','closed')),
 requester_user_id uuid not null references auth.users(id),
 assigned_to uuid references public.forge_platform_users(user_id) on delete set null,
 product_area text,
 page_url text,
 environment text,
 first_response_due_at timestamptz,
 resolution_due_at timestamptz,
 first_responded_at timestamptz,
 resolved_at timestamptz,
 closed_at timestamptz,
 resolution_summary text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organization_id,ticket_number),
 unique(organization_id,id),
 check (resolved_at is null or status in ('resolved','closed')),
 check (closed_at is null or status='closed')
);
create index forge_support_tickets_queue_idx on public.forge_support_tickets(status,priority,created_at);
create index forge_support_tickets_org_idx on public.forge_support_tickets(organization_id,updated_at desc);
create index forge_support_tickets_requester_idx on public.forge_support_tickets(requester_user_id,updated_at desc);
create index forge_support_tickets_assignee_idx on public.forge_support_tickets(assigned_to,status);

create table public.forge_support_messages (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 ticket_id uuid not null,
 author_user_id uuid not null references auth.users(id),
 author_kind text not null check(author_kind in ('customer','forge')),
 visibility text not null default 'public' check(visibility in ('public','internal')),
 body text not null check(char_length(body) between 1 and 10000),
 created_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.forge_support_tickets(organization_id,id) on delete cascade,
 check (visibility <> 'internal' or author_kind='forge')
);
create index forge_support_messages_ticket_idx on public.forge_support_messages(organization_id,ticket_id,created_at);

create table public.forge_support_events (
 id bigint generated always as identity primary key,
 organization_id uuid not null,
 ticket_id uuid not null,
 actor_user_id uuid not null references auth.users(id),
 event_type text not null,
 from_value text,
 to_value text,
 detail text,
 created_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.forge_support_tickets(organization_id,id) on delete cascade
);
create index forge_support_events_ticket_idx on public.forge_support_events(organization_id,ticket_id,created_at);

-- No direct authenticated access: the service role is used only after server-side
-- permission checks. This also prevents internal messages from being selected by
-- tenant members through a broad organization RLS policy.
alter table public.forge_support_sequences enable row level security;
alter table public.forge_support_tickets enable row level security;
alter table public.forge_support_messages enable row level security;
alter table public.forge_support_events enable row level security;
revoke all on public.forge_support_sequences,public.forge_support_tickets,public.forge_support_messages,public.forge_support_events from anon,authenticated;
grant all on public.forge_support_sequences,public.forge_support_tickets,public.forge_support_messages,public.forge_support_events to service_role;
grant usage,select on sequence public.forge_support_events_id_seq to service_role;

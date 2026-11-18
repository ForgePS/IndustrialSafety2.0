-- Private ticket evidence. Storage access is brokered by authenticated server routes.
insert into storage.buckets(id,name,public,file_size_limit)
values('forge-support','forge-support',false,10485760)
on conflict(id) do update set public=false,file_size_limit=10485760;

create table public.forge_support_attachments(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 ticket_id uuid not null,
 uploaded_by uuid not null references auth.users(id),
 visibility text not null check(visibility in ('public','internal')),
 storage_path text not null unique,
 file_name text not null check(char_length(file_name) between 1 and 255),
 mime_type text not null,
 byte_size integer not null check(byte_size between 1 and 10485760),
 created_at timestamptz not null default now(),
 foreign key(organization_id,ticket_id) references public.forge_support_tickets(organization_id,id) on delete cascade
);
create index forge_support_attachments_ticket_idx on public.forge_support_attachments(organization_id,ticket_id,created_at);
alter table public.forge_support_attachments enable row level security;
revoke all on public.forge_support_attachments from anon,authenticated;
grant all on public.forge_support_attachments to service_role;

-- Forge staff can tune response targets without changing customer-facing ticket data.
create table public.forge_support_sla_policies(
 priority text primary key check(priority in ('low','normal','high','urgent')),
 first_response_hours integer not null check(first_response_hours between 1 and 720),
 resolution_hours integer not null check(resolution_hours between 1 and 2160),
 updated_at timestamptz not null default now()
);
insert into public.forge_support_sla_policies(priority,first_response_hours,resolution_hours) values
('low',48,240),('normal',24,120),('high',8,72),('urgent',4,24)
on conflict(priority) do nothing;
alter table public.forge_support_sla_policies enable row level security;
revoke all on public.forge_support_sla_policies from anon,authenticated;
grant all on public.forge_support_sla_policies to service_role;

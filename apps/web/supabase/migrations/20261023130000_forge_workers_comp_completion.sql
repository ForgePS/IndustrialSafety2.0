-- Port slice 2 completion: workers' comp weekly-status email settings.
--
-- 1.0 kept these in tenant settings (workers_comp.weekly_status) plus a reporting schedule that its hourly
-- sweep delivered (default Fridays 7:00 AM Central). 2.0 stores the settings now; delivery is wired to the
-- shared notification/email service when that lands.

create table if not exists public.forge_wc_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  weekly_email_enabled boolean not null default false,
  weekly_email_recipients text[] not null default '{}'
    check (cardinality(weekly_email_recipients) <= 50),
  -- 0 = Sunday ... 6 = Saturday (1.0 default: Friday).
  weekly_email_weekday smallint not null default 5 check (weekly_email_weekday between 0 and 6),
  weekly_email_hour smallint not null default 7 check (weekly_email_hour between 0 and 23),
  time_zone text not null default 'America/Chicago',
  -- Thursday week_of last delivered, so a sweep never sends the same week twice.
  last_weekly_email_week date,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_wc_settings_recipients_when_enabled check (
    not weekly_email_enabled or cardinality(weekly_email_recipients) > 0
  )
);

create or replace function public.forge_touch_wc_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists forge_wc_settings_touch on public.forge_wc_settings;
create trigger forge_wc_settings_touch
before update on public.forge_wc_settings
for each row execute function public.forge_touch_wc_settings();

alter table public.forge_wc_settings enable row level security;
revoke all on public.forge_wc_settings from anon, authenticated;
grant all on public.forge_wc_settings to service_role;

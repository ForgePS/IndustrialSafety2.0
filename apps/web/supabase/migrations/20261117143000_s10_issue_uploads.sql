-- Port slice 10 (agent C): photos uploaded with a scan issue report.
--
-- The issue form uploads each photo first (server actions are capped at 1 MB), through
-- /scan/<token>/report/photos, and gets back an opaque upload id. The report action only accepts upload ids
-- that this table holds for the same QR code and the same reporter, not yet used by another report, and
-- then stamps report_id. Counting rows per QR also bounds abuse of public QRs (30 uploads per 10 minutes).
-- Uploads never attached to a report are left in storage (known gap: no sweeper yet).

create table if not exists public.forge_qr_issue_uploads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  qr_code_id uuid not null references public.forge_qr_codes(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploader_user_id uuid references auth.users(id) on delete set null,
  uploader_personnel_id uuid references public.forge_personnel(id) on delete set null,
  report_id uuid references public.forge_qr_issue_reports(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists forge_qr_issue_uploads_qr_idx
  on public.forge_qr_issue_uploads (qr_code_id, created_at desc);

alter table public.forge_qr_issue_uploads enable row level security;
revoke all on public.forge_qr_issue_uploads from anon, authenticated;
grant all on public.forge_qr_issue_uploads to service_role;

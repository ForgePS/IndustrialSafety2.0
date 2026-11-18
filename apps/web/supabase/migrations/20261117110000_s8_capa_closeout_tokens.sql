-- Port slice 8, piece B: public CAPA closeout links (Industrial 1.0 corrective-action close-out link,
-- industrial-domain.service getCloseoutByToken / submitCloseoutByToken, migration 0051).
--
-- A signed-in user with corrective_actions.edit issues a link for one CAPA. The raw token
-- (randomBytes(24), base64url) is shown once; only its sha256 hex hash is stored. Anyone with the link
-- can submit closeout notes, their name and photos once, before the link expires (90 days) or is
-- revoked. The submission moves the CAPA to pending_verification; a signed-in verifier still verifies.
--
-- 1.0 kept the token on the CAPA row and resolved it through a SECURITY DEFINER lookup. 2.0 keeps a
-- token table read and written only by server code with the service role, so no lookup function and
-- no member or anonymous policies are needed.
--
-- Photos reuse the private forge-evidence bucket and forge_record_evidence rows (resource_type
-- corrective_action), so they appear in the CAPA's Evidence panel. No new bucket.

create table if not exists public.forge_corrective_action_closeout_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  corrective_action_id uuid not null references public.forge_corrective_actions(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  submitted_name text check (submitted_name is null or char_length(submitted_name) <= 200),
  submitted_notes text check (submitted_notes is null or char_length(submitted_notes) <= 5000),
  submitted_photos jsonb not null default '[]'::jsonb check (jsonb_typeof(submitted_photos) = 'array')
);

create index if not exists forge_capa_closeout_tokens_capa_idx
  on public.forge_corrective_action_closeout_tokens (organization_id, corrective_action_id, created_at desc);

alter table public.forge_corrective_action_closeout_tokens enable row level security;
revoke all on public.forge_corrective_action_closeout_tokens from anon, authenticated;
grant all on public.forge_corrective_action_closeout_tokens to service_role;

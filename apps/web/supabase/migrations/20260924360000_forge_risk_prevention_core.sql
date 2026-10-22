-- NX-02 Part A: Shared Risk Matrix Engine (core tables + Forge 5x5 template).
-- Tenant operational matrices clone/version from this foundation.

-- ---------------------------------------------------------------------------
-- Risk matrices
-- ---------------------------------------------------------------------------
create table if not exists public.forge_risk_matrices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  matrix_key text not null,
  name text not null,
  description text,
  version integer not null default 1 check (version >= 1),
  is_core boolean not null default false,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_risk_matrices_key_len check (char_length(matrix_key) between 1 and 120),
  constraint forge_risk_matrices_name_len check (char_length(name) between 1 and 200)
);

create unique index if not exists forge_risk_matrices_core_key_version_uidx
  on public.forge_risk_matrices (matrix_key, version)
  where organization_id is null;

create unique index if not exists forge_risk_matrices_tenant_key_version_uidx
  on public.forge_risk_matrices (organization_id, matrix_key, version)
  where organization_id is not null;

create unique index if not exists forge_risk_matrices_core_default_uidx
  on public.forge_risk_matrices (is_default)
  where organization_id is null and is_default = true and is_active = true;

create unique index if not exists forge_risk_matrices_tenant_default_uidx
  on public.forge_risk_matrices (organization_id)
  where organization_id is not null and is_default = true and is_active = true;

create index if not exists forge_risk_matrices_org_active_idx
  on public.forge_risk_matrices (organization_id, is_active, is_default);

alter table public.forge_risk_matrices enable row level security;
revoke all on public.forge_risk_matrices from public, anon, authenticated;
grant all on public.forge_risk_matrices to service_role;

-- ---------------------------------------------------------------------------
-- Likelihood levels
-- ---------------------------------------------------------------------------
create table if not exists public.forge_risk_likelihood_levels (
  id uuid primary key default gen_random_uuid(),
  risk_matrix_id uuid not null references public.forge_risk_matrices(id) on delete cascade,
  level_key text not null,
  label text not null,
  description text,
  numeric_value integer not null check (numeric_value >= 1),
  sort_order integer not null default 100,
  constraint forge_risk_likelihood_levels_key_len check (char_length(level_key) between 1 and 80),
  unique (risk_matrix_id, level_key),
  unique (risk_matrix_id, numeric_value)
);

create index if not exists forge_risk_likelihood_levels_matrix_idx
  on public.forge_risk_likelihood_levels (risk_matrix_id, sort_order);

alter table public.forge_risk_likelihood_levels enable row level security;
revoke all on public.forge_risk_likelihood_levels from public, anon, authenticated;
grant all on public.forge_risk_likelihood_levels to service_role;

-- ---------------------------------------------------------------------------
-- Severity levels
-- ---------------------------------------------------------------------------
create table if not exists public.forge_risk_severity_levels (
  id uuid primary key default gen_random_uuid(),
  risk_matrix_id uuid not null references public.forge_risk_matrices(id) on delete cascade,
  level_key text not null,
  label text not null,
  description text,
  numeric_value integer not null check (numeric_value >= 1),
  sort_order integer not null default 100,
  constraint forge_risk_severity_levels_key_len check (char_length(level_key) between 1 and 80),
  unique (risk_matrix_id, level_key),
  unique (risk_matrix_id, numeric_value)
);

create index if not exists forge_risk_severity_levels_matrix_idx
  on public.forge_risk_severity_levels (risk_matrix_id, sort_order);

alter table public.forge_risk_severity_levels enable row level security;
revoke all on public.forge_risk_severity_levels from public, anon, authenticated;
grant all on public.forge_risk_severity_levels to service_role;

-- ---------------------------------------------------------------------------
-- Risk bands
-- ---------------------------------------------------------------------------
create table if not exists public.forge_risk_bands (
  id uuid primary key default gen_random_uuid(),
  risk_matrix_id uuid not null references public.forge_risk_matrices(id) on delete cascade,
  band_key text not null,
  label text not null,
  description text,
  sort_order integer not null default 100,
  requires_review boolean not null default false,
  requires_approval boolean not null default false,
  constraint forge_risk_bands_key_len check (char_length(band_key) between 1 and 80),
  unique (risk_matrix_id, band_key)
);

create index if not exists forge_risk_bands_matrix_idx
  on public.forge_risk_bands (risk_matrix_id, sort_order);

alter table public.forge_risk_bands enable row level security;
revoke all on public.forge_risk_bands from public, anon, authenticated;
grant all on public.forge_risk_bands to service_role;

-- ---------------------------------------------------------------------------
-- Matrix cells (explicit mapping — not assumed multiplication)
-- ---------------------------------------------------------------------------
create table if not exists public.forge_risk_matrix_cells (
  id uuid primary key default gen_random_uuid(),
  risk_matrix_id uuid not null references public.forge_risk_matrices(id) on delete cascade,
  likelihood_level_id uuid not null references public.forge_risk_likelihood_levels(id) on delete cascade,
  severity_level_id uuid not null references public.forge_risk_severity_levels(id) on delete cascade,
  score integer not null check (score >= 0),
  risk_band_id uuid not null references public.forge_risk_bands(id) on delete restrict,
  unique (risk_matrix_id, likelihood_level_id, severity_level_id)
);

create index if not exists forge_risk_matrix_cells_matrix_idx
  on public.forge_risk_matrix_cells (risk_matrix_id);

create index if not exists forge_risk_matrix_cells_band_idx
  on public.forge_risk_matrix_cells (risk_band_id);

alter table public.forge_risk_matrix_cells enable row level security;
revoke all on public.forge_risk_matrix_cells from public, anon, authenticated;
grant all on public.forge_risk_matrix_cells to service_role;

-- ---------------------------------------------------------------------------
-- Completeness validation helper
-- ---------------------------------------------------------------------------
create or replace function public.forge_validate_risk_matrix(p_matrix_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matrix public.forge_risk_matrices%rowtype;
  v_likelihood_count integer;
  v_severity_count integer;
  v_band_count integer;
  v_cell_count integer;
  v_expected integer;
  v_orphan_cells integer;
begin
  select * into v_matrix from public.forge_risk_matrices where id = p_matrix_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Risk matrix not found.');
  end if;

  select count(*) into v_likelihood_count
  from public.forge_risk_likelihood_levels where risk_matrix_id = p_matrix_id;

  select count(*) into v_severity_count
  from public.forge_risk_severity_levels where risk_matrix_id = p_matrix_id;

  select count(*) into v_band_count
  from public.forge_risk_bands where risk_matrix_id = p_matrix_id;

  select count(*) into v_cell_count
  from public.forge_risk_matrix_cells where risk_matrix_id = p_matrix_id;

  v_expected := v_likelihood_count * v_severity_count;

  select count(*) into v_orphan_cells
  from public.forge_risk_matrix_cells c
  left join public.forge_risk_likelihood_levels l on l.id = c.likelihood_level_id and l.risk_matrix_id = c.risk_matrix_id
  left join public.forge_risk_severity_levels s on s.id = c.severity_level_id and s.risk_matrix_id = c.risk_matrix_id
  left join public.forge_risk_bands b on b.id = c.risk_band_id and b.risk_matrix_id = c.risk_matrix_id
  where c.risk_matrix_id = p_matrix_id
    and (l.id is null or s.id is null or b.id is null);

  if v_likelihood_count < 1 or v_severity_count < 1 then
    return jsonb_build_object(
      'ok', false,
      'error', 'Matrix requires at least one likelihood and one severity level.',
      'likelihood_count', v_likelihood_count,
      'severity_count', v_severity_count,
      'band_count', v_band_count,
      'cell_count', v_cell_count,
      'expected_cells', v_expected
    );
  end if;

  if v_band_count < 1 then
    return jsonb_build_object('ok', false, 'error', 'Matrix requires at least one risk band.');
  end if;

  if v_orphan_cells > 0 then
    return jsonb_build_object('ok', false, 'error', 'Matrix cells reference invalid levels or bands.');
  end if;

  if v_cell_count <> v_expected then
    return jsonb_build_object(
      'ok', false,
      'error', 'Matrix cells incomplete. Expected ' || v_expected || ' cells, found ' || v_cell_count || '.',
      'likelihood_count', v_likelihood_count,
      'severity_count', v_severity_count,
      'band_count', v_band_count,
      'cell_count', v_cell_count,
      'expected_cells', v_expected
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'matrix_id', p_matrix_id,
    'likelihood_count', v_likelihood_count,
    'severity_count', v_severity_count,
    'band_count', v_band_count,
    'cell_count', v_cell_count,
    'expected_cells', v_expected
  );
end;
$$;

revoke all on function public.forge_validate_risk_matrix(uuid) from public;
grant execute on function public.forge_validate_risk_matrix(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Seed Forge core 5x5 template (organization_id NULL)
-- ---------------------------------------------------------------------------
do $$
declare
  v_matrix_id uuid;
  v_l1 uuid; v_l2 uuid; v_l3 uuid; v_l4 uuid; v_l5 uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid;
  v_low uuid; v_mod uuid; v_high uuid; v_crit uuid;
  v_ll record;
  v_ss record;
  v_score integer;
  v_band uuid;
begin
  if exists (
    select 1 from public.forge_risk_matrices
    where organization_id is null and matrix_key = 'forge.core.5x5' and version = 1
  ) then
    return;
  end if;

  insert into public.forge_risk_matrices (
    organization_id, matrix_key, name, description, version, is_core, is_default, is_active
  ) values (
    null,
    'forge.core.5x5',
    'Forge Core 5×5 Risk Matrix',
    'Default Forge Industrial Safety 5×5 likelihood × severity template. Tenants may clone and version this matrix.',
    1,
    true,
    true,
    true
  )
  returning id into v_matrix_id;

  insert into public.forge_risk_likelihood_levels (risk_matrix_id, level_key, label, description, numeric_value, sort_order)
  values
    (v_matrix_id, 'rare', 'Rare', 'May occur only in exceptional circumstances.', 1, 10),
    (v_matrix_id, 'unlikely', 'Unlikely', 'Could occur at some time but not expected.', 2, 20),
    (v_matrix_id, 'possible', 'Possible', 'Might occur at some time.', 3, 30),
    (v_matrix_id, 'likely', 'Likely', 'Will probably occur in most circumstances.', 4, 40),
    (v_matrix_id, 'almost_certain', 'Almost Certain', 'Expected to occur in most circumstances.', 5, 50);

  select id into v_l1 from public.forge_risk_likelihood_levels where risk_matrix_id=v_matrix_id and level_key='rare';
  select id into v_l2 from public.forge_risk_likelihood_levels where risk_matrix_id=v_matrix_id and level_key='unlikely';
  select id into v_l3 from public.forge_risk_likelihood_levels where risk_matrix_id=v_matrix_id and level_key='possible';
  select id into v_l4 from public.forge_risk_likelihood_levels where risk_matrix_id=v_matrix_id and level_key='likely';
  select id into v_l5 from public.forge_risk_likelihood_levels where risk_matrix_id=v_matrix_id and level_key='almost_certain';

  insert into public.forge_risk_severity_levels (risk_matrix_id, level_key, label, description, numeric_value, sort_order)
  values
    (v_matrix_id, 'insignificant', 'Insignificant', 'Negligible injury or impact.', 1, 10),
    (v_matrix_id, 'minor', 'Minor', 'First aid or limited operational impact.', 2, 20),
    (v_matrix_id, 'moderate', 'Moderate', 'Medical treatment or moderate disruption.', 3, 30),
    (v_matrix_id, 'major', 'Major', 'Serious injury, lost time, or major disruption.', 4, 40),
    (v_matrix_id, 'catastrophic', 'Catastrophic', 'Fatality, SIF, or severe operational failure.', 5, 50);

  select id into v_s1 from public.forge_risk_severity_levels where risk_matrix_id=v_matrix_id and level_key='insignificant';
  select id into v_s2 from public.forge_risk_severity_levels where risk_matrix_id=v_matrix_id and level_key='minor';
  select id into v_s3 from public.forge_risk_severity_levels where risk_matrix_id=v_matrix_id and level_key='moderate';
  select id into v_s4 from public.forge_risk_severity_levels where risk_matrix_id=v_matrix_id and level_key='major';
  select id into v_s5 from public.forge_risk_severity_levels where risk_matrix_id=v_matrix_id and level_key='catastrophic';

  insert into public.forge_risk_bands (
    risk_matrix_id, band_key, label, description, sort_order, requires_review, requires_approval
  ) values
    (v_matrix_id, 'low', 'Low', 'Acceptable with routine controls.', 10, false, false),
    (v_matrix_id, 'moderate', 'Moderate', 'Manage with documented controls and monitoring.', 20, true, false),
    (v_matrix_id, 'high', 'High', 'Requires formal review and treatment plan.', 30, true, true),
    (v_matrix_id, 'critical', 'Critical', 'Immediate escalation and approval required.', 40, true, true);

  select id into v_low from public.forge_risk_bands where risk_matrix_id=v_matrix_id and band_key='low';
  select id into v_mod from public.forge_risk_bands where risk_matrix_id=v_matrix_id and band_key='moderate';
  select id into v_high from public.forge_risk_bands where risk_matrix_id=v_matrix_id and band_key='high';
  select id into v_crit from public.forge_risk_bands where risk_matrix_id=v_matrix_id and band_key='critical';

  for v_ll in
    select * from public.forge_risk_likelihood_levels where risk_matrix_id = v_matrix_id
  loop
    for v_ss in
      select * from public.forge_risk_severity_levels where risk_matrix_id = v_matrix_id
    loop
      v_score := v_ll.numeric_value * v_ss.numeric_value;
      if v_score <= 4 then
        v_band := v_low;
      elsif v_score <= 9 then
        v_band := v_mod;
      elsif v_score <= 16 then
        v_band := v_high;
      else
        v_band := v_crit;
      end if;

      insert into public.forge_risk_matrix_cells (
        risk_matrix_id, likelihood_level_id, severity_level_id, score, risk_band_id
      ) values (
        v_matrix_id, v_ll.id, v_ss.id, v_score, v_band
      );
    end loop;
  end loop;

  if (public.forge_validate_risk_matrix(v_matrix_id)->>'ok')::boolean is not true then
    raise exception 'Forge core 5x5 risk matrix failed validation';
  end if;
end;
$$;

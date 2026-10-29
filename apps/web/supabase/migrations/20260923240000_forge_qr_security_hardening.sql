-- QR runtime hardening: enforce same-tenant asset targets and keep scan/token tables server-mediated.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'forge_assets_org_id_unique'
      and conrelid = 'public.forge_assets'::regclass
  ) then
    alter table public.forge_assets
      add constraint forge_assets_org_id_unique unique (organization_id, id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'forge_qr_codes_target_asset_fk'
      and conrelid = 'public.forge_qr_codes'::regclass
  ) then
    alter table public.forge_qr_codes
      add constraint forge_qr_codes_target_asset_fk
      foreign key (organization_id, target_id)
      references public.forge_assets(organization_id, id)
      on delete restrict;
  end if;
end
$$;

revoke select on public.forge_qr_codes from authenticated;
revoke select on public.forge_qr_scans from authenticated;

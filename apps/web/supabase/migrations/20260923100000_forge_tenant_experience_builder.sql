-- Forge Creator 2.0 tenant-specific Experience Builder controls.

alter table public.forge_tenant_experience_overrides
  add column if not exists tenant_edit_mode_override text
    check (tenant_edit_mode_override is null or tenant_edit_mode_override in ('none','content','presentation','full')),
  add column if not exists location_edit_mode_override text
    check (location_edit_mode_override is null or location_edit_mode_override in ('none','content','presentation','full')),
  add column if not exists user_edit_mode_override text
    check (user_edit_mode_override is null or user_edit_mode_override in ('none','preference','presentation')),
  add column if not exists can_hide_override boolean,
  add column if not exists can_rename_override boolean,
  add column if not exists can_reorder_override boolean;

create index if not exists forge_tenant_experience_overrides_org_element_idx
  on public.forge_tenant_experience_overrides(organization_id, element_id);

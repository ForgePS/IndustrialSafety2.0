-- Port slice 11 (agent C): link a repeating maintenance item to the one it follows, so the completed item
-- can show "Next scheduled" and the new one "Follows".

alter table public.forge_fleet_maintenance
  add column if not exists repeated_from_id uuid references public.forge_fleet_maintenance(id) on delete set null;

create index if not exists forge_fleet_maintenance_repeated_from_idx
  on public.forge_fleet_maintenance (repeated_from_id) where repeated_from_id is not null;

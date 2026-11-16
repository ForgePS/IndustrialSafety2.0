-- Batch 1 workers' comp parity: the employee, incident and Location can be changed after a case is opened
-- (1.0 PATCH /workers-comp/:id). Same-organization checks already live in forge_guard_wc_case.
--
-- A case that is linked to a live (not voided) OSHA case keeps its incident and employee: that OSHA case was
-- opened for exactly that incident and employee, so relinking would leave the OSHA log describing a different
-- injury. Clear the OSHA recordable flag and void or unlink the OSHA case first. Location changes are allowed.

create or replace function public.forge_guard_wc_case_relink()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_osha_status text;
begin
  if new.osha_case_id is null or new.osha_case_id is distinct from old.osha_case_id then
    return new;
  end if;

  if new.incident_id is not distinct from old.incident_id and new.personnel_id is not distinct from old.personnel_id then
    return new;
  end if;

  select status into v_osha_status from public.forge_osha_cases where id = new.osha_case_id;

  if v_osha_status is not null and v_osha_status <> 'voided' then
    raise exception 'This case is linked to an OSHA case. Its incident and employee cannot change while that link is live.'
      using errcode = '23514', constraint = 'forge_wc_cases_osha_relink';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_wc_cases_relink_guard on public.forge_wc_cases;
create trigger forge_wc_cases_relink_guard
before update of incident_id, personnel_id on public.forge_wc_cases
for each row execute function public.forge_guard_wc_case_relink();

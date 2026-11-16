-- Batch 1 DOT parity (Industrial 1.0 -> 2.0).
--
--   * forge_dot_records.due_on: an optional follow-up date. Open records past it show "Overdue Nd"
--     (1.0 dotDueOverdueLabel). It cannot be before the record date.
--   * An index for the "Related DOT records" list on a driver's file.

alter table public.forge_dot_records add column if not exists due_on date;

alter table public.forge_dot_records drop constraint if exists forge_dot_records_due_after_record;
alter table public.forge_dot_records
  add constraint forge_dot_records_due_after_record
  check (due_on is null or record_date is null or due_on >= record_date);

comment on column public.forge_dot_records.due_on is
  'Optional follow-up date. Open records past it are overdue; closed records never are.';

create index if not exists forge_dot_records_person
  on public.forge_dot_records (organization_id, personnel_id)
  where personnel_id is not null;

create index if not exists forge_dot_records_open_due
  on public.forge_dot_records (organization_id, due_on)
  where status = 'open' and due_on is not null;

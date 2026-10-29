-- Normalize mixed-case personnel status values (e.g. Active -> ACTIVE).
update industrial_personnel
set status = upper(btrim(status)),
    updated_at = now()
where status is not null
  and btrim(status) <> ''
  and status <> upper(btrim(status));

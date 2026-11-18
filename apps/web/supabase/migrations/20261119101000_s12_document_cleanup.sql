-- Port slice 12: let a document be deleted as a whole (service role only: cleanup and tenant removal).
--
-- The versions guard refuses to delete submitted versions, which also blocked the ON DELETE CASCADE from
-- forge_documents (the cascade runs the guard for every version). A version may now be deleted when its
-- document is already gone, i.e. during that cascade. Deleting a single submitted version is still refused.

create or replace function public.forge_document_versions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from public.forge_documents d where d.id = old.document_id) then
      raise exception 'Only draft versions can be deleted.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New versions start as drafts.';
    end if;
    if not exists (
      select 1 from public.forge_documents d
      where d.id = new.document_id and d.organization_id = new.organization_id and d.archived_at is null and d.status <> 'obsolete'
    ) then
      raise exception 'Versions can only be added to an active document in this organization.';
    end if;
    return new;
  end if;

  if new.document_id <> old.document_id or new.organization_id <> old.organization_id or new.version_number <> old.version_number then
    raise exception 'A version can''t move to another document.';
  end if;

  if old.status <> 'draft' and (
    new.file_name is distinct from old.file_name or new.content_type is distinct from old.content_type or
    new.size_bytes is distinct from old.size_bytes or new.storage_path is distinct from old.storage_path or
    new.change_summary is distinct from old.change_summary
  ) then
    raise exception 'A submitted version can''t be changed. Upload a new version instead.';
  end if;

  if new.status is distinct from old.status then
    if coalesce(current_setting('forge.document_workflow', true), '') <> 'on' then
      raise exception 'Use the document workflow to change a version''s status.';
    end if;
    if not (
      (old.status = 'draft' and new.status = 'in_review') or
      (old.status = 'in_review' and new.status in ('draft', 'approved')) or
      (old.status = 'approved' and new.status = 'superseded')
    ) then
      raise exception 'A version can''t go from % to %.', old.status, new.status;
    end if;
  end if;

  if old.status in ('approved', 'superseded') and (
    new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at or
    new.effective_on is distinct from old.effective_on or new.submitted_by is distinct from old.submitted_by
  ) then
    raise exception 'An approved version''s approval can''t be changed.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

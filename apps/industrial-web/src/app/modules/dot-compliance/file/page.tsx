"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import {
  DOT_API,
  DOT_TAB_META,
  dotFileHref,
  dotListHref,
  dotLocationText,
  dotPersonnelId,
  dotRecordCategory,
  dotStatusBadgeClass,
  isDotRecordOpen,
  isIndustrialRecordUuid,
  buildDotProfileView,
} from "@/lib/dot-compliance-module";
import {
  buildDotFile,
  categoryLabel,
  dotFileDraftFromRecord,
  dotFileEditSections,
  dotFileHeading,
  dotFilePatchFromDraft,
  dotFileSubtitle,
  type DotFileGroup,
} from "@/lib/dot-file";
import { isDvirRecord, openPrintableHtmlPopup } from "@/lib/dvir";
import { formatApiErrorMessage } from "@/lib/api-error";
import { personFileHref, rosterInitials } from "@/lib/personnel-directory";
import { DotDqfWorksheet } from "@/components/dot-dqf-worksheet";
import { DotFileEditor } from "@/components/dot-file-editor";
import { dotDqfDetailsFromRecord, dotDqfPatchForField, dotDqfPatchFromDetails } from "@/lib/dot-dqf-record";
import { buildDqfFormIdMap } from "@/lib/dot-dqf-form-links";
import { FORMS_API } from "@/lib/forms-module";

function SectionCard({ group }: { group: DotFileGroup }) {
  return (
    <div className="card mb-3">
      <div className="card-header d-flex align-items-center gap-3">
        <div className="avatar avatar-sm flex-shrink-0">
          <span className="avatar-initial rounded bg-label-primary">
            <i className={`bx ${group.icon}`} aria-hidden="true" />
          </span>
        </div>
        <h6 className="card-title mb-0">{group.title}</h6>
      </div>
      <div className="card-body">
        <dl className="row mb-0">
          {group.rows.map((row) => (
            <div className={row.wide ? "col-12 mb-3" : "col-md-6 mb-3"} key={row.label}>
              <dt className="text-muted small text-uppercase fw-normal">{row.label}</dt>
              <dd className={`mb-0${row.wide ? " text-break" : ""}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function DotFileInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const focusField = searchParams.get("focus") ?? "";
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.dot.view") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.dot.manage") || permissions.has("industrial.admin");
  const canViewSensitive =
    permissions.has("industrial.dot.view_sensitive") || permissions.has("industrial.admin");

  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [sourceRecord, setSourceRecord] = useState<Record<string, unknown> | null>(null);
  const [related, setRelated] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [formDefinitions, setFormDefinitions] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    if (!id) {
      setError("No DOT file was selected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Record<string, unknown>>(
        `${DOT_API}/${encodeURIComponent(id)}`,
      );
      // Do not crawl the entire DOT list for related rows — that multiplies full-table
      // API scans and made the file page unusable as record counts grew. Detail payload
      // is enough for the worksheet; related links can be added via a dedicated API later.
      const view = buildDotProfileView(data, [data]);
      setSourceRecord(data);
      setRecord(view.record);
      setRelated(view.related);
      setEditing(false);
      setDraft({});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load this DOT file");
      setRecord(null);
      setSourceRecord(null);
      setRelated([]);
      setEditing(false);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  const activeTenant = useMemo(
    () => me?.tenants?.find((tenant) => tenant.tenantId === me.tenantId) ?? me?.tenants?.[0],
    [me?.tenantId, me?.tenants],
  );

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiGet<{ items?: Array<Record<string, unknown>> }>(FORMS_API, {
          query: { page: "1", pageSize: "200" },
        });
        if (!cancelled) setFormDefinitions(res.items ?? []);
      } catch {
        if (!cancelled) setFormDefinitions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canView]);

  async function transitionRecord(action: string) {
    if (!id || !canManage) return;
    setUpdating(true);
    setError(null);
    try {
      await apiSend<Record<string, unknown>>(`${DOT_API}/${id}/${action}`, "POST", {});
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setUpdating(false);
    }
  }

  const editSections = useMemo(
    () => (sourceRecord ? dotFileEditSections(sourceRecord) : []),
    [sourceRecord],
  );

  function startEdit() {
    if (!sourceRecord || isDvirRecord(sourceRecord)) return;
    if (category === "drivers") {
      setDraft(dotDqfDetailsFromRecord(sourceRecord));
    } else {
      setDraft(dotFileDraftFromRecord(sourceRecord, editSections));
    }
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft({});
  }

  async function saveEdit() {
    if (!id || !canManage || !sourceRecord) return;
    setUpdating(true);
    setError(null);
    try {
      const patch =
        category === "drivers" && sourceRecord
          ? dotDqfPatchFromDetails(draft, sourceRecord)
          : dotFilePatchFromDraft(draft, editSections);
      await apiSend(`${DOT_API}/${encodeURIComponent(id)}`, "PATCH", patch);
      await load();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Failed to save DOT file"));
    } finally {
      setUpdating(false);
    }
  }

  async function onDqfFieldChange(fieldId: string, value: string) {
    if (editing) {
      setDraft((prev) => ({ ...prev, [fieldId]: value }));
      return;
    }
    if (!canManage || !id) return;
    setUpdating(true);
    setError(null);
    try {
      await apiSend(
        `${DOT_API}/${encodeURIComponent(id)}`,
        "PATCH",
        dotDqfPatchForField(fieldId, value),
      );
      await load();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Failed to save DQF field"));
    } finally {
      setUpdating(false);
    }
  }

  async function printDvir() {
    if (!id || !record || !isDvirRecord(record)) return;
    setPrinting(true);
    setError(null);
    try {
      const data = await apiGet<{ html: string }>(
        `/api/v1/industrial/dot/${encodeURIComponent(id)}/printable`,
      );
      const blocked = openPrintableHtmlPopup(data.html, true);
      if (blocked) setError(blocked);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Could not print DVIR"));
    } finally {
      setPrinting(false);
    }
  }

  const heading = record ? dotFileHeading(record) : "DOT file";
  const category = record ? dotRecordCategory(record) : "other";
  const groups = useMemo(() => (record ? buildDotFile(record) : []), [record]);
  const personnelId = record ? dotPersonnelId(record) : "";
  const personnelHref =
    personnelId && isIndustrialRecordUuid(personnelId) ? personFileHref(personnelId) : null;
  const sensitiveJson = record?.sensitiveJson as Record<string, unknown> | undefined;
  const sensitiveRedacted = Boolean(sensitiveJson && sensitiveJson.redacted === true);
  const listHref = dotListHref(category);
  const dqfDetails = useMemo(
    () => (record && category === "drivers" ? dotDqfDetailsFromRecord(record) : {}),
    [record, category],
  );
  const dqfFormIds = useMemo(() => buildDqfFormIdMap(formDefinitions), [formDefinitions]);
  const mergedProfile =
    typeof record?.profileRecordCount === "number" && record.profileRecordCount > 1;

  if (!canView) {
    return (
      <div className="alert alert-warning d-flex align-items-start gap-2" role="alert">
        <i className="bx bx-lock-alt fs-4" aria-hidden="true" />
        <div>
          <h5 className="alert-heading mb-1">DOT file</h5>
          <p className="mb-0">You do not have permission to view DOT compliance records.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 py-3">
        <div>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb breadcrumb-style1 mb-1">
              <li className="breadcrumb-item">
                <Link href={listHref}>DOT Compliance</Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                {heading}
              </li>
            </ol>
          </nav>
          <h4 className="fw-bold mb-0">DOT file</h4>
        </div>
        <Link className="btn btn-outline-secondary" href={listHref}>
          <i className="bx bx-arrow-back me-1" aria-hidden="true" />
          Back to DOT
        </Link>
      </div>

      {error ? (
        <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
          <i className="bx bx-error-circle fs-5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <p className="text-muted" role="status" aria-live="polite">
          Loading DOT file…
        </p>
      ) : record ? (
        <>
          <section className="card mb-4">
            <div className="card-header d-flex flex-wrap align-items-start gap-3">
              <div className="avatar avatar-lg flex-shrink-0">
                <span className="avatar-initial rounded bg-label-primary">
                  {rosterInitials(heading)}
                </span>
              </div>
              <div className="flex-grow-1 min-w-0">
                <h5 className="mb-1">{heading}</h5>
                <p className="text-muted mb-1">{dotFileSubtitle(record)}</p>
                <p className="text-muted mb-0">
                  {typeof record.profileRecordCount === "number" && record.profileRecordCount > 1
                    ? `${record.profileRecordCount} combined DOT files`
                    : dotLocationText(record) || DOT_TAB_META[category].description}
                </p>
              </div>
              <span className={`badge ${dotStatusBadgeClass(String(record.status ?? ""))}`}>
                {String(record.status ?? "—")}
              </span>
            </div>
            <div className="card-body">
              {personnelHref ? (
                <p className="mb-3">
                  <Link href={personnelHref} className="fw-semibold">
                    View personnel file
                  </Link>
                </p>
              ) : null}
              <p className="text-muted small mb-3">
                Sensitive fields:{" "}
                {canViewSensitive
                  ? sensitiveRedacted
                    ? "redacted by server"
                    : "visible (authorized)"
                  : "restricted — requires sensitive permission"}
              </p>
              {isDvirRecord(record) ? (
                <p className="text-muted small mb-3">
                  Submitted DVIRs cannot be edited. Use Print or certify follow-up signatures from DOT
                  DVIRs.
                </p>
              ) : null}
              <div className="d-flex flex-wrap gap-2">
                {isDvirRecord(record) ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={printing || updating}
                    onClick={() => void printDvir()}
                  >
                    {printing ? "Preparing…" : "Print DVIR"}
                  </button>
                ) : null}
                {canManage && !isDvirRecord(record) ? (
                  <>
                    {!editing ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={updating}
                        onClick={startEdit}
                      >
                        Edit file
                      </button>
                    ) : null}
                    {isDotRecordOpen(String(record.status ?? "")) ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          disabled={updating}
                          onClick={() => void transitionRecord("complete")}
                        >
                          Mark complete
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={updating}
                          onClick={() => void transitionRecord("close")}
                        >
                          Close
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={updating}
                        onClick={() => void transitionRecord("reopen")}
                      >
                        Reopen
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-warning"
                      disabled={updating}
                      onClick={() => void transitionRecord("archive")}
                    >
                      Archive
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          {category === "drivers" ? (
            <div className="card mb-4">
              <div className="card-body">
                {mergedProfile ? (
                  <p className="text-muted small mb-3">
                    This profile combines multiple DOT files. Changes here apply only to the file you
                    opened, not other combined records.
                  </p>
                ) : null}
                <DotDqfWorksheet
                  details={editing ? draft : dqfDetails}
                  driverName={heading}
                  tenantSlug={activeTenant?.slug ?? null}
                  personnelId={personnelId || null}
                  dotRecordId={id || null}
                  dqfFormIds={dqfFormIds}
                  formDefinitions={formDefinitions}
                  {...(focusField ? { focusFieldId: focusField } : {})}
                  editing={editing && canManage}
                  canUpload={canManage}
                  disabled={updating}
                  onChange={(fieldId, value) => void onDqfFieldChange(fieldId, value)}
                />
                {editing && canManage ? (
                  <div className="d-flex flex-wrap gap-2 mt-4 pt-3 border-top">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={updating}
                      onClick={() => void saveEdit()}
                    >
                      {updating ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      disabled={updating}
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {category !== "drivers" && editing && sourceRecord ? (
            <DotFileEditor
              sections={editSections}
              draft={draft}
              saving={updating}
              mergedProfile={mergedProfile}
              onChange={(key, value) => setDraft((prev) => ({ ...prev, [key]: value }))}
              onSave={() => void saveEdit()}
              onCancel={cancelEdit}
            />
          ) : null}

          {category !== "drivers" && !editing && groups.length === 0 ? (
            <div className="card mb-4">
              <div className="card-body text-center py-4">
                <p className="text-muted mb-0">No additional field details recorded.</p>
              </div>
            </div>
          ) : category !== "drivers" && !editing ? (
            groups.map((group) => <SectionCard group={group} key={group.id} />)
          ) : null}

          {isDvirRecord(record) ? (
            <div className="card mb-4">
              <div className="card-header">
                <h6 className="card-title mb-0">Signature images</h6>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {[
                    { key: "driverSignatureDataUrl", label: "DRIVER" },
                    { key: "mechanicSignatureDataUrl", label: "Mechanic" },
                    { key: "driverReviewSignatureDataUrl", label: "DRIVER review" },
                  ].map((sig) => {
                    const src = String(record[sig.key] ?? "");
                    if (!src.startsWith("data:image/")) return null;
                    return (
                      <div className="col-md-4" key={sig.key}>
                        <div className="text-muted small mb-1">{sig.label}</div>
                        <img
                          src={src}
                          alt={`${sig.label} signature`}
                          className="border rounded bg-white w-100"
                          style={{ maxHeight: 120, objectFit: "contain" }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {related.length > 0 ? (
            <div className="card">
              <div className="card-header">
                <h6 className="card-title mb-0">Related DOT records</h6>
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Record</th>
                      <th scope="col">Category</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {related.map((row) => (
                      <tr key={String(row.id)}>
                        <td>
                          <Link href={dotFileHref(String(row.id))} className="fw-semibold">
                            {String(row.title ?? dotFileHeading(row))}
                          </Link>
                        </td>
                        <td>{categoryLabel(dotRecordCategory(row))}</td>
                        <td>
                          <span className={`badge ${dotStatusBadgeClass(String(row.status ?? ""))}`}>
                            {String(row.status ?? "—")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function DotFilePage() {
  return (
    <Suspense
      fallback={
        <p className="text-muted" role="status">
          Loading DOT file…
        </p>
      }
    >
      <DotFileInner />
    </Suspense>
  );
}

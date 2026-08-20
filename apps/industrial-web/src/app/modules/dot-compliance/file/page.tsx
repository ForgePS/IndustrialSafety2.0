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
  buildDotProfileView,
} from "@/lib/dot-compliance-module";
import {
  buildDotFile,
  categoryLabel,
  dotFileHeading,
  dotFileSubtitle,
  type DotFileGroup,
} from "@/lib/dot-file";
import { personFileHref, rosterInitials } from "@/lib/personnel-directory";
import { personnelLicenseCopies } from "@/lib/license-copies";
import { LicenseCopiesCard } from "@/components/license-copies-card";

type ListResponse = {
  items: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
};

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
  const [related, setRelated] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

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
      const items: Array<Record<string, unknown>> = [];
      let page = 1;
      while (page <= 50) {
        const res = await apiGet<ListResponse>(DOT_API, {
          query: { page: String(page), pageSize: "100" },
        });
        const batch = res.items ?? [];
        items.push(...batch);
        if (batch.length < 100) break;
        page += 1;
      }
      const listed = items.find((row) => String(row.id) === String(data.id));
      const overlay = listed ? { ...listed, ...data } : data;
      const all = items.map((row) => (String(row.id) === String(overlay.id) ? overlay : row));
      if (!all.some((row) => String(row.id) === String(overlay.id))) all.push(overlay);
      const view = buildDotProfileView(overlay, all);
      setRecord(view.record);
      setRelated(view.related);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load this DOT file");
      setRecord(null);
      setRelated([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  async function transitionRecord(action: string) {
    if (!id || !canManage) return;
    setUpdating(true);
    setError(null);
    try {
      const row = await apiSend<Record<string, unknown>>(`${DOT_API}/${id}/${action}`, "POST", {});
      setRecord(row);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setUpdating(false);
    }
  }

  const heading = record ? dotFileHeading(record) : "DOT file";
  const category = record ? dotRecordCategory(record) : "other";
  const groups = useMemo(() => (record ? buildDotFile(record) : []), [record]);
  const personnelId = record ? dotPersonnelId(record) : "";
  const sensitiveJson = record?.sensitiveJson as Record<string, unknown> | undefined;
  const sensitiveRedacted = Boolean(sensitiveJson && sensitiveJson.redacted === true);
  const listHref = dotListHref(category);
  const licenseCopies = record ? personnelLicenseCopies(record) : { front: null, back: null };
  const needsLicenseCopies = category === "drivers";

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
              {personnelId ? (
                <p className="mb-3">
                  <Link href={personFileHref(personnelId)} className="fw-semibold">
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
              {canManage ? (
                <div className="d-flex flex-wrap gap-2">
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
                </div>
              ) : null}
            </div>
          </section>

          <LicenseCopiesCard
            copies={licenseCopies}
            personName={heading}
            required={needsLicenseCopies}
          />

          {groups.length === 0 ? (
            <div className="card mb-4">
              <div className="card-body text-center py-4">
                <p className="text-muted mb-0">No additional field details recorded.</p>
              </div>
            </div>
          ) : (
            groups.map((group) => <SectionCard group={group} key={group.id} />)
          )}

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

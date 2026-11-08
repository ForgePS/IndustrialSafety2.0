"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, useAuth } from "@forge/web-kit";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { formatApiErrorMessage } from "@/lib/api-error";
import {
  acknowledgeVersions,
  approveVersion,
  archiveControlledDocument,
  createControlledDocument,
  DOCUMENT_CONTROL_TABS,
  downloadControlledVersion,
  formatWorkflowLabel,
  getControlledDocument,
  listApprovalsQueue,
  listControlledDocuments,
  listMyPendingAcks,
  listOverdueReviews,
  obsoleteControlledDocument,
  rejectVersion,
  submitVersionReview,
  updateControlledDocument,
  uploadControlledVersion,
  workflowBadgeClass,
  type ControlledDocument,
  type ControlledDocumentVersion,
  type DocumentControlTab,
} from "@/lib/document-control";
import { DOCUMENT_FOLDERS, sortByDocumentName } from "@/lib/document-folders";

export function DocumentsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const searchParams = useSearchParams();
  const permissions = useMemo(() => new Set(me?.permissions ?? []), [me?.permissions]);
  const canView =
    permissions.has("industrial.documents.view") ||
    permissions.has("industrial.documents.manage") ||
    permissions.has("industrial.documents.approve") ||
    permissions.has("industrial.documents.acknowledge") ||
    permissions.has("industrial.admin") ||
    permissions.has("industrial.access");
  const canManage =
    permissions.has("industrial.documents.manage") || permissions.has("industrial.admin");
  const canApprove =
    permissions.has("industrial.documents.approve") ||
    permissions.has("industrial.documents.manage") ||
    permissions.has("industrial.admin");
  const canAck =
    permissions.has("industrial.documents.acknowledge") ||
    permissions.has("industrial.documents.view") ||
    canManage ||
    permissions.has("industrial.access");

  const deepLinkId = searchParams.get("id")?.trim() || searchParams.get("recordId")?.trim() || "";

  const [tab, setTab] = useState<DocumentControlTab>(deepLinkId ? "document" : "library");
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: DOCUMENT_CONTROL_TABS,
        moduleCode: "DOCUMENTS",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  useEffect(() => {
    setTab((current) =>
      ensureActiveModuleTab(
        current,
        visibleTabs.map((t) => t.id),
        "library",
      ),
    );
  }, [visibleTabs]);
  const [items, setItems] = useState<ControlledDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string>(deepLinkId);
  const [detail, setDetail] = useState<ControlledDocument | null>(null);
  const [approvals, setApprovals] = useState<
    Array<ControlledDocumentVersion & { document: ControlledDocument }>
  >([]);
  const [pendingAcks, setPendingAcks] = useState<
    Array<{
      requirementId: string;
      document: ControlledDocument;
      version: ControlledDocumentVersion;
    }>
  >([]);
  const [reviews, setReviews] = useState<ControlledDocument[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [folderId, setFolderId] = useState(DOCUMENT_FOLDERS[0]!.id);
  const activeFolder = DOCUMENT_FOLDERS.find((f) => f.id === folderId) ?? DOCUMENT_FOLDERS[0]!;
  const sortedItems = useMemo(() => sortByDocumentName(items), [items]);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("GENERAL");
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editReviewDue, setEditReviewDue] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadLibrary = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, string> = { pageSize: "100" };
      if (q.trim()) query.q = q.trim();
      if (statusFilter) query.workflowStatus = statusFilter;
      if (activeFolder.category) query.category = activeFolder.category;
      const result = await listControlledDocuments(query);
      setItems(result.items ?? []);
    } catch (e) {
      setError(
        formatApiErrorMessage(e, e instanceof ApiError ? e.message : "Unable to load documents"),
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canView, q, statusFilter, activeFolder.category]);

  function selectFolder(id: string) {
    const folder = DOCUMENT_FOLDERS.find((f) => f.id === id);
    setFolderId(id);
    setNewCategory(folder?.category ?? "GENERAL");
  }

  const loadDetail = useCallback(
    async (id: string) => {
      if (!id || !canView) {
        setDetail(null);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const doc = await getControlledDocument(id);
        setDetail(doc);
        setEditName(doc.name);
        setEditCategory(doc.category ?? "");
        setEditNumber(doc.documentNumber ?? "");
        setEditReviewDue(doc.reviewDueAt ? doc.reviewDueAt.slice(0, 10) : "");
      } catch (e) {
        setError(formatApiErrorMessage(e, "Unable to load document"));
        setDetail(null);
      } finally {
        setBusy(false);
      }
    },
    [canView],
  );

  const loadApprovals = useCallback(async () => {
    if (!canApprove) return;
    try {
      const result = await listApprovalsQueue();
      setApprovals(result.items ?? []);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to load approvals"));
    }
  }, [canApprove]);

  const loadAcks = useCallback(async () => {
    if (!canAck) return;
    try {
      const result = await listMyPendingAcks();
      setPendingAcks(result.items ?? []);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to load acknowledgments"));
    }
  }, [canAck]);

  const loadReviews = useCallback(async () => {
    if (!canManage && !canApprove) return;
    try {
      const result = await listOverdueReviews();
      setReviews(result.items ?? []);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to load reviews"));
    }
  }, [canManage, canApprove]);

  useEffect(() => {
    if (tab === "library") void loadLibrary();
    if (tab === "document" && selectedId) void loadDetail(selectedId);
    if (tab === "approvals") void loadApprovals();
    if (tab === "acknowledgments") void loadAcks();
    if (tab === "reviews") void loadReviews();
  }, [tab, selectedId, loadLibrary, loadDetail, loadApprovals, loadAcks, loadReviews]);

  useEffect(() => {
    if (deepLinkId) {
      setSelectedId(deepLinkId);
      setTab("document");
    }
  }, [deepLinkId]);

  function openDocument(id: string) {
    setSelectedId(id);
    setTab("document");
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createControlledDocument({
        name: newName,
        category: newCategory || "GENERAL",
      });
      setNewName("");
      setNotice("Document created");
      await loadLibrary();
      openDocument(created.id);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to create document"));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveMeta() {
    if (!selectedId || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      await updateControlledDocument(selectedId, {
        name: editName,
        category: editCategory || null,
        documentNumber: editNumber || null,
        reviewDueAt: editReviewDue || null,
      });
      setNotice("Document updated");
      await loadDetail(selectedId);
      await loadLibrary();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to update document"));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(file: File | null) {
    if (!file || !selectedId || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      await uploadControlledVersion(selectedId, file, changeSummary || undefined);
      setChangeSummary("");
      setNotice("Version uploaded");
      await loadDetail(selectedId);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to upload version"));
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(versionId: string) {
    if (!selectedId) return;
    try {
      const result = await downloadControlledVersion(selectedId, versionId);
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to download"));
    }
  }

  if (!canView) {
    return (
      <div className="alert alert-warning" role="alert">
        You do not have permission to view Document Control. Ask an admin for{" "}
        <code>industrial.documents.view</code>.
      </div>
    );
  }

  return (
    <section aria-labelledby="documents-title">
      <ModuleWorkspaceHeader
        id="documents-title"
        eyebrow="System Tools"
        title={moduleName}
        description="Controlled documents with versioning, approval, acknowledgments, and review dates."
        onRefresh={() => {
          if (tab === "library") void loadLibrary();
          if (tab === "document" && selectedId) void loadDetail(selectedId);
          if (tab === "approvals") void loadApprovals();
          if (tab === "acknowledgments") void loadAcks();
          if (tab === "reviews") void loadReviews();
        }}
        refreshing={loading || busy}
      />

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      ) : null}

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
        active={tab}
        onChange={setTab}
        ariaLabel="Document Control sections"
      />

      {tab === "library" ? (
        <div className="d-flex flex-column gap-3">
          <div className="d-flex flex-wrap gap-2" role="group" aria-label="Document folders">
            {DOCUMENT_FOLDERS.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={`btn btn-sm ${
                  folder.id === activeFolder.id ? "btn-primary" : "btn-outline-secondary"
                }`}
                aria-pressed={folder.id === activeFolder.id}
                onClick={() => selectFolder(folder.id)}
              >
                <i className="bx bx-folder me-1" aria-hidden="true" />
                {folder.label}
              </button>
            ))}
          </div>

          <div className="card border shadow-none">
            <div className="card-body">
              <div className="row g-2 align-items-end">
                <div className="col-md-5">
                  <label className="form-label" htmlFor="doc-q">
                    Search
                  </label>
                  <input
                    id="doc-q"
                    className="form-control form-control-sm"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Name, category, number"
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="doc-status">
                    Status
                  </label>
                  <select
                    id="doc-status"
                    className="form-select form-select-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">All</option>
                    <option value="DRAFT">Draft</option>
                    <option value="IN_REVIEW">In review</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="OBSOLETE">Obsolete</option>
                  </select>
                </div>
                <div className="col-md-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary w-100"
                    onClick={() => void loadLibrary()}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>

          {canManage ? (
            <div className="card border shadow-none">
              <div className="card-header">
                <h6 className="card-title mb-0">Create document</h6>
              </div>
              <div className="card-body">
                <form className="row g-2 align-items-end" onSubmit={(e) => void onCreate(e)}>
                  <div className="col-md-5">
                    <label className="form-label" htmlFor="new-doc-name">
                      Name
                    </label>
                    <input
                      id="new-doc-name"
                      className="form-control form-control-sm"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label" htmlFor="new-doc-cat">
                      Category
                    </label>
                    <input
                      id="new-doc-cat"
                      className="form-control form-control-sm"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                    />
                  </div>
                  <div className="col-md-2">
                    <button type="submit" className="btn btn-sm btn-primary w-100" disabled={busy}>
                      Create
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          <div className="card border shadow-none">
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Number</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Review</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-muted text-center py-4">
                        {loading
                          ? "Loading…"
                          : activeFolder.category
                            ? `No documents in ${activeFolder.label} yet.`
                            : "No controlled documents found."}
                      </td>
                    </tr>
                  ) : (
                    sortedItems.map((item) => (
                      <tr key={item.id}>
                        <td className="fw-medium">{item.name}</td>
                        <td className="text-muted">{item.documentNumber ?? "—"}</td>
                        <td className="text-muted">{item.category ?? "—"}</td>
                        <td>
                          <span className={`badge ${workflowBadgeClass(item.workflowStatus)}`}>
                            {formatWorkflowLabel(item.workflowStatus)}
                          </span>
                        </td>
                        <td className="small">
                          {item.reviewOverdue ? (
                            <span className="text-danger">Overdue</span>
                          ) : item.reviewDueSoon ? (
                            <span className="text-warning">Due soon</span>
                          ) : item.reviewDueAt ? (
                            item.reviewDueAt.slice(0, 10)
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => openDocument(item.id)}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "document" ? (
        !selectedId ? (
          <p className="text-muted">Select a document from the Library tab.</p>
        ) : !detail ? (
          <p className="text-muted">{busy ? "Loading…" : "Document not found."}</p>
        ) : (
          <div className="row g-3">
            <div className="col-lg-5">
              <div className="card border shadow-none mb-3">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h6 className="card-title mb-0">Metadata</h6>
                  <span className={`badge ${workflowBadgeClass(detail.workflowStatus)}`}>
                    {formatWorkflowLabel(detail.workflowStatus)}
                  </span>
                </div>
                <div className="card-body">
                  {canManage ? (
                    <div className="d-flex flex-column gap-2">
                      <div>
                        <label className="form-label small" htmlFor="edit-name">
                          Name
                        </label>
                        <input
                          id="edit-name"
                          className="form-control form-control-sm"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label small" htmlFor="edit-number">
                          Document number
                        </label>
                        <input
                          id="edit-number"
                          className="form-control form-control-sm"
                          value={editNumber}
                          onChange={(e) => setEditNumber(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label small" htmlFor="edit-cat">
                          Category
                        </label>
                        <input
                          id="edit-cat"
                          className="form-control form-control-sm"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label small" htmlFor="edit-review">
                          Review due
                        </label>
                        <input
                          id="edit-review"
                          type="date"
                          className="form-control form-control-sm"
                          value={editReviewDue}
                          onChange={(e) => setEditReviewDue(e.target.value)}
                        />
                      </div>
                      <div className="d-flex flex-wrap gap-2 mt-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => void onSaveMeta()}
                        >
                          Save
                        </button>
                        {canApprove ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={busy}
                            onClick={() =>
                              void obsoleteControlledDocument(selectedId).then(() =>
                                loadDetail(selectedId),
                              )
                            }
                          >
                            Obsolete
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={busy}
                          onClick={() =>
                            void archiveControlledDocument(selectedId).then(() => {
                              setNotice("Archived");
                              setTab("library");
                              void loadLibrary();
                            })
                          }
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  ) : (
                    <dl className="row mb-0 small">
                      <dt className="col-4">Number</dt>
                      <dd className="col-8">{detail.documentNumber ?? "—"}</dd>
                      <dt className="col-4">Category</dt>
                      <dd className="col-8">{detail.category ?? "—"}</dd>
                      <dt className="col-4">Review due</dt>
                      <dd className="col-8">{detail.reviewDueAt?.slice(0, 10) ?? "—"}</dd>
                    </dl>
                  )}
                </div>
              </div>

              {canManage ? (
                <div className="card border shadow-none">
                  <div className="card-header">
                    <h6 className="card-title mb-0">Upload new version</h6>
                  </div>
                  <div className="card-body">
                    <label className="form-label small" htmlFor="change-summary">
                      Change summary
                    </label>
                    <textarea
                      id="change-summary"
                      className="form-control form-control-sm mb-2"
                      rows={2}
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                    />
                    <input
                      type="file"
                      className="form-control form-control-sm"
                      disabled={busy}
                      onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="col-lg-7">
              <div className="card border shadow-none">
                <div className="card-header">
                  <h6 className="card-title mb-0">Versions</h6>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm mb-0 align-middle">
                    <thead>
                      <tr>
                        <th>Ver</th>
                        <th>File</th>
                        <th>Status</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.versions ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-muted text-center py-3">
                            No versions yet.
                          </td>
                        </tr>
                      ) : (
                        (detail.versions ?? []).map((v) => (
                          <tr key={v.id}>
                            <td>v{v.versionNumber}</td>
                            <td className="small">{v.filename ?? "—"}</td>
                            <td>
                              <span className={`badge ${workflowBadgeClass(v.workflowStatus)}`}>
                                {formatWorkflowLabel(v.workflowStatus)}
                              </span>
                            </td>
                            <td className="text-end text-nowrap">
                              <div className="d-inline-flex gap-1">
                                {v.hasFile ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => void onDownload(v.id)}
                                  >
                                    Download
                                  </button>
                                ) : null}
                                {canManage &&
                                v.workflowStatus === "DRAFT" &&
                                v.status !== "PENDING_UPLOAD" ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    disabled={busy}
                                    onClick={() =>
                                      void submitVersionReview(selectedId, v.id).then(() =>
                                        loadDetail(selectedId),
                                      )
                                    }
                                  >
                                    Submit
                                  </button>
                                ) : null}
                                {canApprove && v.workflowStatus === "IN_REVIEW" ? (
                                  <>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-primary"
                                      disabled={busy}
                                      onClick={() =>
                                        void approveVersion(selectedId, v.id).then(() =>
                                          loadDetail(selectedId),
                                        )
                                      }
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-danger"
                                      disabled={busy}
                                      onClick={() =>
                                        void rejectVersion(selectedId, v.id).then(() =>
                                          loadDetail(selectedId),
                                        )
                                      }
                                    >
                                      Reject
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )
      ) : null}

      {tab === "approvals" ? (
        <div className="card border shadow-none">
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Version</th>
                  <th>Submitted</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!canApprove ? (
                  <tr>
                    <td colSpan={4} className="text-muted text-center py-4">
                      Approver permission required.
                    </td>
                  </tr>
                ) : approvals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted text-center py-4">
                      No versions awaiting approval.
                    </td>
                  </tr>
                ) : (
                  approvals.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0"
                          onClick={() => openDocument(row.document.id)}
                        >
                          {row.document.name}
                        </button>
                      </td>
                      <td>v{row.versionNumber}</td>
                      <td className="small">{row.submittedAt?.slice(0, 16) ?? "—"}</td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary me-1"
                          onClick={() =>
                            void approveVersion(row.document.id, row.id).then(() => loadApprovals())
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() =>
                            void rejectVersion(row.document.id, row.id).then(() => loadApprovals())
                          }
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "acknowledgments" ? (
        <div className="card border shadow-none">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h6 className="card-title mb-0">My pending acknowledgments</h6>
            {pendingAcks.length > 0 ? (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() =>
                  void acknowledgeVersions(pendingAcks.map((p) => p.version.id)).then(() => {
                    setNotice("Acknowledged");
                    void loadAcks();
                  })
                }
              >
                Acknowledge all
              </button>
            ) : null}
          </div>
          <div className="table-responsive">
            <table className="table mb-0 align-middle">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Version</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingAcks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted text-center py-4">
                      No pending acknowledgments.
                    </td>
                  </tr>
                ) : (
                  pendingAcks.map((row) => (
                    <tr key={row.requirementId}>
                      <td>{row.document.name}</td>
                      <td>v{row.version.versionNumber}</td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() =>
                            void acknowledgeVersions([row.version.id]).then(() => loadAcks())
                          }
                        >
                          Acknowledge
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "reviews" ? (
        <div className="card border shadow-none">
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Review due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted text-center py-4">
                      No reviews due in the next 30 days.
                    </td>
                  </tr>
                ) : (
                  reviews.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>
                        {row.reviewOverdue ? (
                          <span className="text-danger">{row.reviewDueAt?.slice(0, 10)}</span>
                        ) : (
                          row.reviewDueAt?.slice(0, 10)
                        )}
                      </td>
                      <td>
                        <span className={`badge ${workflowBadgeClass(row.workflowStatus)}`}>
                          {formatWorkflowLabel(row.workflowStatus)}
                        </span>
                      </td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => openDocument(row.id)}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

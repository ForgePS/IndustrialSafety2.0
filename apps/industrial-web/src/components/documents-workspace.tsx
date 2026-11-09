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
import {
  createDocumentFolder,
  canRenameFolder,
  deleteDocumentFolder,
  deleteFolderPrompt,
  renameDocumentFolder,
  FALLBACK_DOCUMENT_FOLDERS,
  listDocumentFolders,
  sameFolderName,
  sortByDocumentName,
  type DocumentFolder,
} from "@/lib/document-folders";

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
  const [folders, setFolders] = useState<DocumentFolder[]>([...FALLBACK_DOCUMENT_FOLDERS]);
  /** Selected folder name; null shows every document. */
  const [activeFolderName, setActiveFolderName] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  /** Name of the folder being renamed; null when the rename form is closed. */
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const activeFolder = activeFolderName
    ? (folders.find((f) => sameFolderName(f.name, activeFolderName)) ?? null)
    : null;
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
      if (activeFolderName) query.category = activeFolderName;
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
  }, [canView, q, statusFilter, activeFolderName]);

  const loadFolders = useCallback(async () => {
    if (!canView) return;
    try {
      const result = await listDocumentFolders();
      setFolders(result.items?.length ? result.items : [...FALLBACK_DOCUMENT_FOLDERS]);
    } catch {
      // Older APIs have no folder list; keep the built-in folders.
      setFolders([...FALLBACK_DOCUMENT_FOLDERS]);
    }
  }, [canView]);

  function selectFolder(name: string | null) {
    if (!sameFolderName(name, renamingFolder)) setRenamingFolder(null);
    setActiveFolderName(name);
    setNewCategory(name ?? "GENERAL");
  }

  async function onCreateFolder(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const name = newFolderName.replace(/\s+/g, " ").trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createDocumentFolder(name);
      setNewFolderName("");
      setShowNewFolder(false);
      setNotice(`Folder "${created.name}" created`);
      await loadFolders();
      selectFolder(created.name);
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to create folder"));
    } finally {
      setBusy(false);
    }
  }

  function startRenameFolder(folder: DocumentFolder) {
    setShowNewFolder(false);
    setRenameFolderName(folder.name);
    setRenamingFolder(folder.name);
  }

  async function onRenameFolder(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !renamingFolder) return;
    const newName = renameFolderName.replace(/\s+/g, " ").trim();
    if (!newName) return;
    if (newName === renamingFolder) {
      setRenamingFolder(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await renameDocumentFolder(renamingFolder, newName);
      setRenamingFolder(null);
      setNotice(
        `Folder renamed to "${result.name}"` +
          (result.documentsMoved ? ` (${result.documentsMoved} documents updated)` : ""),
      );
      selectFolder(result.name);
      await loadFolders();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to rename folder"));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteFolder(folder: DocumentFolder) {
    if (!canManage || !folder.canDelete) return;
    if (!window.confirm(deleteFolderPrompt(folder))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await deleteDocumentFolder(folder.name);
      setNotice(
        `Folder "${folder.name}" deleted` +
          (result.documentsMoved
            ? `; ${result.documentsMoved} documents moved to All documents`
            : ""),
      );
      setRenamingFolder(null);
      selectFolder(null);
      await loadFolders();
    } catch (e) {
      setError(formatApiErrorMessage(e, "Unable to delete folder"));
    } finally {
      setBusy(false);
    }
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
    if (tab === "library" || tab === "document") void loadFolders();
    if (tab === "document" && selectedId) void loadDetail(selectedId);
    if (tab === "approvals") void loadApprovals();
    if (tab === "acknowledgments") void loadAcks();
    if (tab === "reviews") void loadReviews();
  }, [tab, selectedId, loadLibrary, loadFolders, loadDetail, loadApprovals, loadAcks, loadReviews]);

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
      await Promise.all([loadLibrary(), loadFolders()]);
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
      await Promise.all([loadLibrary(), loadFolders()]);
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
          <div className="d-flex flex-wrap align-items-center gap-2">
            <div className="d-flex flex-wrap gap-2" role="group" aria-label="Document folders">
              <button
                type="button"
                className={`btn btn-sm ${
                  activeFolderName == null ? "btn-primary" : "btn-outline-secondary"
                }`}
                aria-pressed={activeFolderName == null}
                onClick={() => selectFolder(null)}
              >
                <i className="bx bx-folder-open me-1" aria-hidden="true" />
                All documents
              </button>
              {folders.map((folder) => {
                const active = sameFolderName(folder.name, activeFolderName);
                return (
                  <button
                    key={folder.id ?? `name:${folder.name}`}
                    type="button"
                    className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
                    aria-pressed={active}
                    onClick={() => selectFolder(folder.name)}
                  >
                    <i className="bx bx-folder me-1" aria-hidden="true" />
                    {folder.name}
                    <span className="badge rounded-pill bg-label-secondary ms-2">
                      {folder.documentCount}
                    </span>
                  </button>
                );
              })}
            </div>
            {canManage && !showNewFolder ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => setShowNewFolder(true)}
              >
                <i className="bx bx-folder-plus me-1" aria-hidden="true" />
                New folder
              </button>
            ) : null}
            {canManage && activeFolder && canRenameFolder(activeFolder) && !renamingFolder ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={busy}
                onClick={() => startRenameFolder(activeFolder)}
              >
                <i className="bx bx-edit-alt me-1" aria-hidden="true" />
                Rename folder
              </button>
            ) : null}
            {canManage && activeFolder?.canDelete ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={busy}
                onClick={() => void onDeleteFolder(activeFolder)}
              >
                <i className="bx bx-trash me-1" aria-hidden="true" />
                Delete folder
              </button>
            ) : null}
          </div>

          {canManage && renamingFolder ? (
            <form
              className="d-flex flex-wrap align-items-end gap-2"
              onSubmit={(e) => void onRenameFolder(e)}
            >
              <div>
                <label className="form-label" htmlFor="rename-folder-name">
                  Rename &ldquo;{renamingFolder}&rdquo; to
                </label>
                <input
                  id="rename-folder-name"
                  className="form-control form-control-sm"
                  required
                  maxLength={120}
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
                Save
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setRenamingFolder(null)}
              >
                Cancel
              </button>
            </form>
          ) : null}

          {canManage && showNewFolder ? (
            <form
              className="d-flex flex-wrap align-items-end gap-2"
              onSubmit={(e) => void onCreateFolder(e)}
            >
              <div>
                <label className="form-label" htmlFor="new-folder-name">
                  Folder name
                </label>
                <input
                  id="new-folder-name"
                  className="form-control form-control-sm"
                  required
                  maxLength={120}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Safety Data Sheets"
                />
              </div>
              <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
                Create folder
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName("");
                }}
              >
                Cancel
              </button>
            </form>
          ) : null}

          <datalist id="doc-folder-options">
            {folders.map((folder) => (
              <option key={folder.id ?? `name:${folder.name}`} value={folder.name} />
            ))}
          </datalist>

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
                      Folder / category
                    </label>
                    <input
                      id="new-doc-cat"
                      className="form-control form-control-sm"
                      list="doc-folder-options"
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
                          : activeFolderName
                            ? `No documents in ${activeFolder?.name ?? activeFolderName} yet.`
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
                          Folder / category
                        </label>
                        <input
                          id="edit-cat"
                          className="form-control form-control-sm"
                          list="doc-folder-edit-options"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                        />
                        <datalist id="doc-folder-edit-options">
                          {folders.map((folder) => (
                            <option key={folder.id ?? `name:${folder.name}`} value={folder.name} />
                          ))}
                        </datalist>
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

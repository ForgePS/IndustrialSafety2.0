"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, useAuth } from "@forge/web-kit";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { TrainingAccessPanel } from "@/components/training-access-panel";
import { TrainingComplianceMatrixPanel } from "@/components/training-compliance-matrix-panel";
import { TrainingQcPanel } from "@/components/training-qc-panel";
import { TrainingAgencyPanel, type AgencySection } from "@/components/training-agency-panel";
import { TrainingMaterialsPanel } from "@/components/training-materials-panel";
import { TrainingMaterialViewer } from "@/components/training-material-viewer";
import { TrainingRecordsSearchPanel } from "@/components/training-records-search-panel";
import { TrainingStudyPanel } from "@/components/training-study-panel";
import { trainingApi } from "@/features/training/api";
import { unlockTrainingAudioPlayback } from "@/lib/training-slide-audio-player";
import type {
  TrainingMaterial,
  TrainingMaterialTopic,
  TrainingSource,
  TrainingSourceFolder,
  TrainingTab,
} from "@/features/training/types";
import {
  MAX_TRAINING_MATERIAL_BYTES,
  TRAINING_MATERIAL_ACCEPT,
  TRAINING_MATERIAL_TOPICS,
  formatMaterialBytes,
  uploadTrainingMaterialFile,
  canViewInApp,
} from "@/features/training/materials";
import { personNameDisplay } from "@/lib/person-name-display";
import { canDeleteForms } from "@/lib/form-signatory";
import {
  canAccessUserManagement,
  toDirectoryUsers,
  type DirectoryUser,
} from "@/lib/user-management";
import { useIndustrialModuleGate } from "@/hooks/use-industrial-module-gate";

const NAV: Array<{ id: AgencySection; label: string; icon: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "bx-home-alt" },
  { id: "users", label: "Users", icon: "bx-group" },
  { id: "groups", label: "Groups", icon: "bx-collection" },
  { id: "assignments", label: "Assignments", icon: "bx-send" },
  { id: "paper", label: "Paper quiz", icon: "bx-printer" },
  { id: "stats", label: "Team progress", icon: "bx-bar-chart-alt-2" },
  { id: "missed", label: "Missed trainings", icon: "bx-error-circle" },
  { id: "records", label: "Records search", icon: "bx-search-alt" },
  { id: "sources", label: "Courses", icon: "bx-book-open" },
  { id: "materials", label: "Materials", icon: "bx-folder-open" },
  { id: "access", label: "QR / Access", icon: "bx-qr" },
  { id: "qc", label: "QC", icon: "bx-check-shield" },
  { id: "compliance", label: "Compliance", icon: "bx-grid-alt" },
];

function parseTrainingSection(raw: string | null): AgencySection {
  if (raw && NAV.some((item) => item.id === raw)) return raw as AgencySection;
  return "dashboard";
}

function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
      <div className="min-w-0">
        <h4 className="mb-1">{title}</h4>
        <p className="text-muted mb-0">{description}</p>
      </div>
      {actions ? <div className="d-flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "primary",
  icon,
}: {
  label: string;
  value: string | number;
  tone?: string;
  icon: string;
}) {
  return (
    <div className="card h-100">
      <div className="card-body d-flex align-items-center gap-3">
        <span className={`avatar avatar-md rounded bg-label-${tone}`}>
          <i className={`bx ${icon} bx-sm`} aria-hidden />
        </span>
        <div>
          <div className="fs-4 fw-bold lh-1">{value}</div>
          <div className="text-muted small">{label}</div>
        </div>
      </div>
    </div>
  );
}

export function TrainingWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const searchParams = useSearchParams();
  const tenantId = me?.tenantId ?? "";
  const tenantName =
    me?.tenants?.find((t) => t.tenantId === me.tenantId)?.displayName ?? "Your facility";
  const permissions = new Set(me?.permissions ?? []);
  const canView =
    permissions.has("industrial.training.view") || permissions.has("industrial.admin");
  const canManage =
    permissions.has("industrial.training.manage") || permissions.has("industrial.admin");
  const canPurgeCourses = canDeleteForms({
    isPlatformAdmin: me?.isPlatformAdmin,
    activeProducts: me?.activeProducts,
    permissions,
  });
  const canUsers = canAccessUserManagement(me);

  const [section, setSection] = useState<AgencySection>(() =>
    parseTrainingSection(searchParams.get("section")),
  );

  useEffect(() => {
    setSection(parseTrainingSection(searchParams.get("section")));
  }, [searchParams]);

  const { explicitlyDisabled, awsReady } = useIndustrialModuleGate({
    moduleCode: "TRAINING",
    canView,
  });
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<TrainingSource[]>([]);
  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [previewMaterial, setPreviewMaterial] = useState<TrainingMaterial | null>(null);
  const [materialUploading, setMaterialUploading] = useState(false);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialCategory, setMaterialCategory] = useState<TrainingMaterialTopic>("GENERAL");
  const [materialSourceId, setMaterialSourceId] = useState("");
  const [materialFolderId, setMaterialFolderId] = useState("");
  const [sourceFolders, setSourceFolders] = useState<TrainingSourceFolder[]>([]);
  const [editingMaterial, setEditingMaterial] = useState<TrainingMaterial | null>(null);
  const [materialEditForm, setMaterialEditForm] = useState({
    title: "",
    description: "",
    category: "GENERAL" as TrainingMaterialTopic,
    sourceId: "",
  });
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [progress, setProgress] = useState<{
    stats: Array<Record<string, unknown>>;
    recentAttempts: Array<Record<string, unknown>>;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [studyFocus, setStudyFocus] = useState<{
    tab?: TrainingTab;
    sourceId?: string;
  } | null>(null);

  const publishedSources = useMemo(
    () => sources.filter((s) => s.status === "PUBLISHED"),
    [sources],
  );
  const linkableSources = canManage ? sources : publishedSources;

  const refresh = useCallback(async () => {
    if (!awsReady) return;
    setBusy(true);
    setError(null);
    try {
      const [src, mats, prog] = await Promise.all([
        trainingApi.listSources(),
        trainingApi.listMaterials().catch(() => ({ items: [] as TrainingMaterial[] })),
        trainingApi.progress().catch(() => null),
      ]);
      setSources(src.items ?? []);
      setMaterials(mats.items ?? []);
      setProgress(prog);
      if (canUsers && tenantId) {
        try {
          const [memberships, platformUsers] = await Promise.all([
            apiGet<unknown[]>(`/api/v1/tenants/${tenantId}/memberships`),
            apiGet<unknown[]>(`/api/v1/tenants/${tenantId}/users`).catch(() => []),
          ]);
          setUsers(toDirectoryUsers(memberships, platformUsers));
        } catch {
          setUsers([]);
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load training data");
    } finally {
      setBusy(false);
    }
  }, [awsReady, canUsers, tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // After video upload, complete returns PROCESSING while normalize runs in the
  // background (often <1s for already-playable MP4). Poll so the badge clears.
  const hasProcessingMaterials = useMemo(
    () => materials.some((m) => m.status === "PROCESSING"),
    [materials],
  );
  useEffect(() => {
    if (!hasProcessingMaterials || !awsReady) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [hasProcessingMaterials, awsReady, refresh]);

  useEffect(() => {
    setQuery("");
  }, [section]);

  useEffect(() => {
    if (!materialSourceId) {
      setSourceFolders([]);
      setMaterialFolderId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await trainingApi.listSourceFolders(materialSourceId);
        if (!cancelled) setSourceFolders(rows ?? []);
      } catch {
        if (!cancelled) setSourceFolders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [materialSourceId]);

  async function uploadMaterial(file: File | null) {
    if (!file || !canManage) return;
    setMaterialUploading(true);
    setError(null);
    try {
      await uploadTrainingMaterialFile({
        file,
        title: materialTitle,
        description: materialDescription,
        category: materialCategory,
        sourceId: materialSourceId || null,
        folderId: materialFolderId || null,
      });
      setMaterialTitle("");
      setMaterialDescription("");
      setMaterialSourceId("");
      setMaterialFolderId("");
      await refresh();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Upload failed",
      );
    } finally {
      setMaterialUploading(false);
    }
  }

  function openMaterial(material: TrainingMaterial) {
    setError(null);
    if (material.status === "PROCESSING") {
      setError("This video is still being optimized for tablet playback. Try again in a minute.");
      return;
    }
    if (material.status === "FAILED") {
      setError("Mobile video optimization failed. Re-upload the file or contact support.");
      return;
    }
    if (!canViewInApp(material.mimeType, material.originalFilename)) {
      setError("This file type is not supported for in-app viewing.");
      return;
    }
    // Unlock autoplay during this click so slide narration can start without a second tap.
    unlockTrainingAudioPlayback();
    setPreviewMaterial(material);
  }

  async function updateMaterialCategory(
    material: TrainingMaterial,
    category: TrainingMaterialTopic,
  ) {
    if (!canManage || material.category === category) return;
    setBusy(true);
    setError(null);
    try {
      await trainingApi.updateMaterial(material.id, { category });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update category");
    } finally {
      setBusy(false);
    }
  }

  async function linkMaterialSource(material: TrainingMaterial, sourceId: string | null) {
    if (!canManage) return;
    const next = sourceId?.trim() || null;
    if ((material.sourceId ?? null) === next) return;
    setBusy(true);
    setError(null);
    try {
      await trainingApi.updateMaterial(material.id, { sourceId: next });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not link material to course");
    } finally {
      setBusy(false);
    }
  }

  async function removeMaterial(material: TrainingMaterial) {
    if (!canManage) return;
    if (
      !window.confirm(
        `Delete “${material.title}”? This removes the file for all learners and cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await trainingApi.archiveMaterial(material.id);
      if (editingMaterial?.id === material.id) setEditingMaterial(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not archive material");
    }
  }

  async function reoptimizeMaterialVideo(material: TrainingMaterial) {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      await trainingApi.reoptimizeMaterialVideo(material.id);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start tablet video optimization");
    } finally {
      setBusy(false);
    }
  }

  function openMaterialEditor(material: TrainingMaterial) {
    setEditingMaterial(material);
    setMaterialEditForm({
      title: material.title,
      description: material.description ?? "",
      category: (material.category as TrainingMaterialTopic) || "GENERAL",
      sourceId: material.sourceId ?? "",
    });
  }

  async function saveMaterialEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !editingMaterial) return;
    setBusy(true);
    setError(null);
    try {
      await trainingApi.updateMaterial(editingMaterial.id, {
        title: materialEditForm.title.trim(),
        description: materialEditForm.description.trim() || null,
        category: materialEditForm.category,
        sourceId: materialEditForm.sourceId || null,
      });
      setEditingMaterial(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update material");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return <ModuleUnavailable moduleName={moduleName} status="permission" />;
  }
  if (explicitlyDisabled) {
    return <ModuleUnavailable moduleName={moduleName} status="disabled" />;
  }

  const seatsUsed = users.length;
  const activeMembers = users.filter((u) => u.membershipStatus === "ACTIVE").length;

  return (
    <div className="card" data-walkthrough="training-admin">
      <div className="card-body p-0">
        <div className="row g-0">
          <aside className="col-lg-3 border-end">
            <div className="p-3 border-bottom">
              <div className="text-uppercase text-muted small fw-semibold mb-1">
                Safety Training
              </div>
              <div className="fw-bold">{tenantName}</div>
              <button
                type="button"
                className="btn btn-sm btn-outline-primary mt-2"
                onClick={() => setSection("study")}
              >
                <i className="bx bx-book-reader me-1" aria-hidden />
                Company Training Portal
              </button>
            </div>
            <nav className="nav flex-column p-2" aria-label="Training agency">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-link text-start rounded ${
                    section === item.id ? "active" : "text-body"
                  }`}
                  onClick={() => setSection(item.id)}
                >
                  <i className={`bx ${item.icon} me-2`} aria-hidden />
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          <div className="col-lg-9 p-3 p-md-4">
            {error ? (
              <div className="alert alert-warning" role="alert">
                {error}
                <button
                  type="button"
                  className="btn-close float-end"
                  onClick={() => setError(null)}
                />
              </div>
            ) : null}
            {busy ? <p className="text-muted small">Refreshing…</p> : null}

            {section === "users" ? (
              <>
                <SectionHeader
                  title="Facility users"
                  description="MEMBERS with access to training. Invite and manage users from Settings when you have permission."
                  actions={
                    canUsers ? (
                      <Link href="/settings/users/" className="btn btn-primary btn-sm">
                        Open user management
                      </Link>
                    ) : null
                  }
                />
                <div className="row g-3 mb-3">
                  <div className="col-md-4">
                    <StatCard label="Seats used" value={seatsUsed} icon="bx-group" />
                  </div>
                  <div className="col-md-4">
                    <StatCard
                      label="Active"
                      value={activeMembers}
                      icon="bx-user-check"
                      tone="success"
                    />
                  </div>
                  <div className="col-md-4">
                    <StatCard
                      label="Pending"
                      value={users.filter((u) => u.pending).length}
                      icon="bx-envelope"
                      tone="warning"
                    />
                  </div>
                </div>
                <input
                  className="form-control mb-3"
                  style={{ maxWidth: "22rem" }}
                  placeholder="Search by name or email…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search users"
                />
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>MEMBER</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Roles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users
                        .filter((u) => {
                          const q = query.trim().toLowerCase();
                          if (!q) return true;
                          return `${u.displayName} ${u.email}`.toLowerCase().includes(q);
                        })
                        .map((u) => (
                          <tr key={u.membershipId}>
                            <td>{personNameDisplay(u.displayName)}</td>
                            <td>{u.email}</td>
                            <td>{u.membershipStatus}</td>
                            <td>{u.roles.map((r) => r.roleName).join(", ") || "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!users.length ? (
                  <p className="text-muted">
                    {canUsers
                      ? "No memberships loaded yet."
                      : "You need user-management permission to list MEMBERS here."}
                  </p>
                ) : null}
              </>
            ) : null}

            {section === "materials" ? (
              <>
                <SectionHeader
                  title="Training materials"
                  description="Upload PowerPoints, videos, PDFs, and other files. Link materials to a course so learners can take the quiz after reviewing."
                />
                {canManage ? (
                  <div className="card border mb-4">
                    <div className="card-body">
                      <h6 className="mb-3">Upload material</h6>
                      <div className="row g-3">
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="material-title">
                            Title
                          </label>
                          <input
                            id="material-title"
                            className="form-control"
                            value={materialTitle}
                            onChange={(e) => setMaterialTitle(e.target.value)}
                            placeholder="Optional — defaults to filename"
                          />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="material-category">
                            Category
                          </label>
                          <select
                            id="material-category"
                            className="form-select"
                            value={materialCategory}
                            onChange={(e) =>
                              setMaterialCategory(e.target.value as TrainingMaterialTopic)
                            }
                          >
                            {TRAINING_MATERIAL_TOPICS.map((topic) => (
                              <option key={topic.id} value={topic.id}>
                                {topic.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="material-source">
                            Linked course
                          </label>
                          <select
                            id="material-source"
                            className="form-select"
                            value={materialSourceId}
                            onChange={(e) => {
                              setMaterialSourceId(e.target.value);
                              setMaterialFolderId("");
                            }}
                          >
                            <option value="">None</option>
                            {linkableSources.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                                {s.status === "DRAFT" ? " (draft)" : ""}
                              </option>
                            ))}
                          </select>
                          {!linkableSources.length ? (
                            <div className="form-text">
                              Create a course under Courses first, then link materials here.
                            </div>
                          ) : null}
                        </div>
                        {materialSourceId ? (
                          <div className="col-md-4">
                            <label className="form-label" htmlFor="material-folder">
                              Folder
                            </label>
                            <select
                              id="material-folder"
                              className="form-select"
                              value={materialFolderId}
                              onChange={(e) => setMaterialFolderId(e.target.value)}
                            >
                              <option value="">Uncategorized</option>
                              {sourceFolders.map((folder) => (
                                <option key={folder.id} value={folder.id}>
                                  {folder.name}
                                </option>
                              ))}
                            </select>
                            {!sourceFolders.length ? (
                              <div className="form-text">
                                Create folders under Courses to organize uploads.
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="col-md-4">
                          <label className="form-label" htmlFor="material-file">
                            File
                          </label>
                          <input
                            id="material-file"
                            className="form-control"
                            type="file"
                            accept={TRAINING_MATERIAL_ACCEPT}
                            disabled={materialUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              e.target.value = "";
                              void uploadMaterial(file);
                            }}
                          />
                        </div>
                        <div className="col-12">
                          <label className="form-label" htmlFor="material-description">
                            Description
                          </label>
                          <textarea
                            id="material-description"
                            className="form-control"
                            rows={2}
                            value={materialDescription}
                            onChange={(e) => setMaterialDescription(e.target.value)}
                            placeholder="Optional summary for learners"
                          />
                        </div>
                        <div className="col-12">
                          <div className="form-text">
                            PDF, PowerPoint, Word, Excel, MP4/WebM/MOV, or images — up to{" "}
                            {formatMaterialBytes(MAX_TRAINING_MATERIAL_BYTES)}. Videos are
                            automatically optimized for tablet playback (Android and iPhone/iPad)
                            after upload.
                            {materialUploading ? " Uploading…" : ""}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted mb-3">Browse materials by category below.</p>
                )}
                {editingMaterial ? (
                  <form className="card border mb-4" onSubmit={(e) => void saveMaterialEdit(e)}>
                    <div className="card-body">
                      <div className="d-flex justify-content-between align-items-start gap-2 mb-3">
                        <h6 className="mb-0">Edit material</h6>
                        <button
                          type="button"
                          className="btn-close"
                          aria-label="Close"
                          onClick={() => setEditingMaterial(null)}
                        />
                      </div>
                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="edit-material-title">
                            Title
                          </label>
                          <input
                            id="edit-material-title"
                            className="form-control"
                            value={materialEditForm.title}
                            onChange={(e) =>
                              setMaterialEditForm((p) => ({ ...p, title: e.target.value }))
                            }
                            required
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="edit-material-source">
                            Linked course
                          </label>
                          <select
                            id="edit-material-source"
                            className="form-select"
                            value={materialEditForm.sourceId}
                            onChange={(e) =>
                              setMaterialEditForm((p) => ({ ...p, sourceId: e.target.value }))
                            }
                          >
                            <option value="">None</option>
                            {linkableSources.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                                {s.status === "DRAFT" ? " (draft)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label" htmlFor="edit-material-category">
                            Category
                          </label>
                          <select
                            id="edit-material-category"
                            className="form-select"
                            value={materialEditForm.category}
                            onChange={(e) =>
                              setMaterialEditForm((p) => ({
                                ...p,
                                category: e.target.value as TrainingMaterialTopic,
                              }))
                            }
                          >
                            {TRAINING_MATERIAL_TOPICS.map((topic) => (
                              <option key={topic.id} value={topic.id}>
                                {topic.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-12">
                          <label className="form-label" htmlFor="edit-material-description">
                            Description
                          </label>
                          <textarea
                            id="edit-material-description"
                            className="form-control"
                            rows={2}
                            value={materialEditForm.description}
                            onChange={(e) =>
                              setMaterialEditForm((p) => ({ ...p, description: e.target.value }))
                            }
                          />
                        </div>
                        <div className="col-12">
                          <button type="submit" className="btn btn-primary" disabled={busy}>
                            Save material
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                ) : null}
                {previewMaterial ? (
                  <TrainingMaterialViewer
                    material={previewMaterial}
                    onClose={() => setPreviewMaterial(null)}
                    {...(canManage
                      ? {
                          onDelete: (material: TrainingMaterial) => void removeMaterial(material),
                          deleteBusy: busy,
                        }
                      : {})}
                  />
                ) : null}
                <TrainingMaterialsPanel
                  materials={materials}
                  canManage={canManage}
                  busy={busy || materialUploading}
                  linkableSources={linkableSources}
                  onOpen={(material) => openMaterial(material)}
                  {...(canManage
                    ? {
                        onEdit: (material: TrainingMaterial) => openMaterialEditor(material),
                        onArchive: (material: TrainingMaterial) => void removeMaterial(material),
                        onUpdateCategory: (
                          material: TrainingMaterial,
                          category: TrainingMaterialTopic,
                        ) => void updateMaterialCategory(material, category),
                        onLinkSource: (material: TrainingMaterial, sourceId: string | null) =>
                          void linkMaterialSource(material, sourceId),
                        onReoptimizeVideo: (material: TrainingMaterial) =>
                          void reoptimizeMaterialVideo(material),
                      }
                    : {})}
                />
              </>
            ) : null}

            {section === "study" ? (
              <>
                <SectionHeader
                  title="Training app"
                  description="Library, assignments, quizzes, progress, and authoring for learners and content managers."
                  actions={
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setSection("dashboard")}
                    >
                      Back to dashboard
                    </button>
                  }
                />
                <TrainingStudyPanel
                  moduleName={moduleName}
                  {...(studyFocus?.tab ? { focusTab: studyFocus.tab } : {})}
                  {...(studyFocus?.sourceId ? { focusSourceId: studyFocus.sourceId } : {})}
                  onFocusApplied={() => setStudyFocus(null)}
                />
              </>
            ) : null}

            {section === "access" ? (
              <>
                <SectionHeader
                  title="QR / Employee access"
                  description="View, download, and print the company training portal QR. Portal QR creation is managed in Settings (admin only)."
                />
                <TrainingAccessPanel />
              </>
            ) : null}

            {section === "qc" ? (
              <>
                <SectionHeader
                  title="Training quality control"
                  description="Analytical view of pass rates, retries, score distribution, course performance, and question-level results."
                />
                <TrainingQcPanel />
              </>
            ) : null}

            {section === "compliance" ? (
              <>
                <SectionHeader
                  title="Company training compliance matrix"
                  description="Person-by-course completion status across the roster. Export CSV for audits."
                />
                <TrainingComplianceMatrixPanel />
              </>
            ) : null}

            {section === "records" ? (
              <>
                <SectionHeader
                  title="Training records search"
                  description="Find employees by training type across imported, manual, and other completion records."
                />
                <TrainingRecordsSearchPanel />
              </>
            ) : null}

            {section !== "users" &&
            section !== "materials" &&
            section !== "study" &&
            section !== "access" &&
            section !== "qc" &&
            section !== "compliance" &&
            section !== "records" ? (
              <TrainingAgencyPanel
                section={section}
                canManage={canManage}
                canPurgeCourses={canPurgeCourses}
                users={users}
                sources={sources}
                materials={materials}
                progress={progress}
                query={query}
                onQuery={setQuery}
                onOpenStudy={() => setSection("study")}
                onOpenStudyAuthor={(sourceId) => {
                  setStudyFocus({ tab: "author", ...(sourceId ? { sourceId } : {}) });
                  setSection("study");
                }}
                onRefreshSources={refresh}
                onRefreshMaterials={refresh}
                onError={setError}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

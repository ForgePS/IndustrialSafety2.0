"use client";

import { useRef, useState } from "react";
import { ApiError } from "@forge/web-kit";
import { trainingApi } from "@/features/training/api";
import {
  groupMaterialsByFolder,
  TRAINING_MATERIAL_ACCEPT,
  uploadTrainingMaterialFile,
} from "@/features/training/materials";
import type { TrainingMaterial, TrainingSource, TrainingSourceFolder } from "@/features/training/types";
import { TrainingQuestionImportPanel } from "@/components/training-question-import-panel";

type Props = {
  source: TrainingSource;
  materials: TrainingMaterial[];
  folders: TrainingSourceFolder[];
  canManage: boolean;
  busy: boolean;
  unlinkedMaterials: TrainingMaterial[];
  onRefreshMaterials: () => Promise<void>;
  onRefreshFolders: () => Promise<void>;
  onRefreshSources?: () => Promise<void>;
  onError: (message: string | null) => void;
  /** Hide per-folder upload buttons when the parent provides a top-level upload zone. */
  showUploadButtons?: boolean;
  /** Hide quiz import when shown in a dedicated course builder section. */
  showQuizImport?: boolean;
  layout?: "inline" | "builder";
};

function MaterialBadge({
  material,
  canManage,
  folders,
  busy,
  onUnlink,
  onMove,
}: {
  material: TrainingMaterial;
  canManage: boolean;
  folders: TrainingSourceFolder[];
  busy: boolean;
  onUnlink: () => void;
  onMove: (folderId: string | null) => void;
}) {
  return (
    <span className="badge bg-label-info d-inline-flex align-items-center gap-1">
      {material.title}
      {canManage ? (
        <>
          <select
            className="form-select form-select-sm border-0 bg-transparent py-0 ps-1"
            style={{ width: "auto", minWidth: "6rem" }}
            aria-label={`Move ${material.title}`}
            value={material.folderId ?? ""}
            disabled={busy}
            onChange={(e) => onMove(e.target.value || null)}
          >
            <option value="">Uncategorized</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-link btn-sm p-0 text-decoration-none"
            aria-label={`Unlink ${material.title}`}
            onClick={onUnlink}
          >
            ×
          </button>
        </>
      ) : null}
    </span>
  );
}

export function TrainingSourceMaterials({
  source,
  materials,
  folders,
  canManage,
  busy,
  unlinkedMaterials,
  onRefreshMaterials,
  onRefreshFolders,
  onRefreshSources,
  onError,
  showUploadButtons = true,
  showQuizImport = true,
  layout = "inline",
}: Props) {
  const [newFolderName, setNewFolderName] = useState("");
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);

  const grouped = groupMaterialsByFolder(materials, folders);

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !newFolderName.trim()) return;
    onError(null);
    try {
      await trainingApi.createSourceFolder(source.id, { name: newFolderName.trim() });
      setNewFolderName("");
      await onRefreshFolders();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not create folder");
    }
  }

  async function deleteFolder(folder: TrainingSourceFolder) {
    if (!canManage) return;
    if (!window.confirm(`Delete folder "${folder.name}"? Materials will move to Uncategorized.`)) return;
    onError(null);
    try {
      await trainingApi.updateSourceFolder(folder.id, { status: "ARCHIVED" });
      await onRefreshFolders();
      await onRefreshMaterials();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not delete folder");
    }
  }

  async function linkMaterial(materialId: string, folderId: string | null) {
    if (!canManage) return;
    onError(null);
    try {
      await trainingApi.updateMaterial(materialId, { sourceId: source.id, folderId });
      await onRefreshMaterials();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not link material");
    }
  }

  async function moveMaterial(materialId: string, folderId: string | null) {
    if (!canManage) return;
    onError(null);
    try {
      await trainingApi.updateMaterial(materialId, { folderId });
      await onRefreshMaterials();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not move material");
    }
  }

  async function unlinkMaterial(materialId: string) {
    if (!canManage) return;
    onError(null);
    try {
      await trainingApi.updateMaterial(materialId, { sourceId: null, folderId: null });
      await onRefreshMaterials();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not unlink material");
    }
  }

  function openUpload(folderId: string | null) {
    uploadTargetRef.current = folderId;
    uploadInputRef.current?.click();
  }

  function folderUploadKey(folderId: string | null): string {
    return folderId ?? "__uncategorized__";
  }

  async function handleUpload(file: File | null) {
    const folderId = uploadTargetRef.current;
    if (!file || !canManage) return;
    const key = folderUploadKey(folderId);
    setUploadingKey(key);
    onError(null);
    try {
      await uploadTrainingMaterialFile({
        file,
        sourceId: source.id,
        folderId,
      });
      await onRefreshMaterials();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingKey(null);
      uploadTargetRef.current = null;
    }
  }

  return (
    <div className={layout === "builder" ? "mt-3" : "mt-2"}>
      {layout === "inline" ? (
        <div className="text-muted small mb-1">Materials & folders</div>
      ) : null}
      {canManage ? (
        <form className="d-flex flex-wrap gap-2 mb-2" onSubmit={(e) => void createFolder(e)}>
          <input
            className="form-control form-control-sm"
            style={{ maxWidth: "14rem" }}
            placeholder="New folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn btn-sm btn-outline-primary" disabled={busy || !newFolderName.trim()}>
            Add folder
          </button>
        </form>
      ) : null}
      <input
        ref={uploadInputRef}
        type="file"
        className="d-none"
        accept={TRAINING_MATERIAL_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          void handleUpload(file);
        }}
      />
      <div className="d-flex flex-column gap-2">
        {grouped.map((group) => (
          <div key={group.folderId ?? "uncategorized"} className="border rounded p-2 bg-light-subtle">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1">
              <span className="small fw-semibold">{group.label}</span>
              {canManage && showUploadButtons ? (
                <div className="d-flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busy || uploadingKey === folderUploadKey(group.folderId)}
                    onClick={() => openUpload(group.folderId)}
                  >
                    {uploadingKey === folderUploadKey(group.folderId) ? "Uploading…" : "Upload"}
                  </button>
                  {group.folderId ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      disabled={busy}
                      onClick={() => {
                        const folder = folders.find((f) => f.id === group.folderId);
                        if (folder) void deleteFolder(folder);
                      }}
                    >
                      Delete folder
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {group.items.length ? (
              <div className="d-flex flex-wrap gap-1">
                {group.items.map((material) => (
                  <MaterialBadge
                    key={material.id}
                    material={material}
                    canManage={canManage}
                    folders={folders}
                    busy={busy}
                    onUnlink={() => void unlinkMaterial(material.id)}
                    onMove={(folderId) => void moveMaterial(material.id, folderId)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-muted small">No materials in this folder.</div>
            )}
          </div>
        ))}
      </div>
      {canManage && unlinkedMaterials.length ? (
        <div className="mt-2" style={{ maxWidth: "20rem" }}>
          <label className="form-label small mb-1" htmlFor={`link-material-${source.id}`}>
            Link existing material
          </label>
          <select
            id={`link-material-${source.id}`}
            className="form-select form-select-sm"
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const materialId = e.target.value;
              if (!materialId) return;
              void linkMaterial(materialId, null);
              e.target.value = "";
            }}
          >
            <option value="">Choose material…</option>
            {unlinkedMaterials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {canManage && showQuizImport ? (
        <TrainingQuestionImportPanel
          sourceId={source.id}
          sourceTitle={source.title}
          compact
          disabled={busy}
          onImported={async () => {
            if (onRefreshSources) await onRefreshSources();
          }}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "../app/page.module.css";
import {
  archiveAttachment,
  completeAttachmentUpload,
  initializeAttachmentUpload,
  listAttachments,
  patchAttachment,
  type AttachmentDto,
} from "@/lib/specialty-api";

const CATEGORIES = [
  "SCENE_PHOTO",
  "FIRE_PHOTO",
  "HAZMAT_PHOTO",
  "RESCUE_PHOTO",
  "EXPLOSION_PHOTO",
  "EXPOSURE_PHOTO",
  "ALARM_DOCUMENT",
  "FIRE_PROTECTION_DOCUMENT",
  "INVESTIGATION_REFERRAL",
  "SKETCH",
  "FLOOR_PLAN",
  "PDF",
  "OTHER",
] as const;

export function AttachmentGallery({
  tenantId,
  incidentId,
  specialtySection,
  canUpload,
  canArchive,
  readOnly,
}: {
  tenantId: string;
  incidentId: string;
  specialtySection?: string;
  canUpload: boolean;
  canArchive: boolean;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<AttachmentDto[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "uploading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      const rows = await listAttachments(tenantId, incidentId);
      setItems(
        specialtySection
          ? rows.filter(
              (r) =>
                (r as { specialtySection?: string }).specialtySection === specialtySection || true,
            )
          : rows,
      );
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attachments");
      setStatus("error");
    }
  }, [tenantId, incidentId, specialtySection]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onFileSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !canUpload || readOnly) return;
    const file = fileList[0]!;
    setStatus("uploading");
    setProgress(0);
    setError(null);
    try {
      const init = await initializeAttachmentUpload(tenantId, incidentId, {
        originalFilename: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSizeBytes: file.size,
        category: file.type.startsWith("image/")
          ? "SCENE_PHOTO"
          : file.type === "application/pdf"
            ? "PDF"
            : "OTHER",
        specialtySection: specialtySection ?? null,
        source: "MOBILE_CAMERA",
      });
      await putWithProgress(init.uploadUrl, file, setProgress);
      await completeAttachmentUpload(tenantId, incidentId, init.attachmentId);
      setProgress(100);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed — you can retry");
      setStatus("error");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className={styles.panel}>
      <h2>Attachments</h2>
      <p className={styles.muted}>
        Photos and documents are stored privately. Uploads stay quarantined until malware scanning
        is available — they are never shown as cleared by default.
      </p>
      {status === "loading" ? <p className={styles.muted}>Loading…</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {progress != null ? <p className={styles.muted}>Upload progress: {progress}%</p> : null}

      {canUpload && !readOnly ? (
        <div className={styles.formRow}>
          <label htmlFor="attachment-file">Add photo or document</label>
          <input
            id="attachment-file"
            type="file"
            accept="image/*,application/pdf,image/heic"
            capture="environment"
            onChange={(event) => void onFileSelected(event.target.files)}
          />
        </div>
      ) : null}

      {items.length === 0 && status === "ready" ? (
        <p className={styles.muted}>No attachments yet.</p>
      ) : null}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          display: "grid",
          gap: "0.75rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {items.map((item) => (
          <li
            key={item.attachmentId}
            style={{ border: "1px solid var(--border, #ddd)", borderRadius: 8, padding: "0.75rem" }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>{item.originalFilename}</p>
            <p className={styles.muted} style={{ margin: "0.25rem 0" }}>
              {item.mimeType} · {Math.round(item.fileSizeBytes / 1024)} KB
            </p>
            <p className={styles.muted} style={{ margin: "0.25rem 0" }}>
              Malware scan status: {item.malwareScanStatus}
              {item.clearedForUse
                ? " — cleared for use"
                : " — not cleared (quarantined or scanner unavailable)"}
            </p>
            {item.isPdf ? <p className={styles.muted}>PDF document</p> : null}
            <label htmlFor={`cap-${item.attachmentId}`}>Caption</label>
            <input
              id={`cap-${item.attachmentId}`}
              defaultValue={item.caption ?? ""}
              disabled={readOnly}
              onBlur={(event) => {
                if (readOnly) return;
                if (event.target.value !== (item.caption ?? "")) {
                  void patchAttachment(
                    tenantId,
                    incidentId,
                    item.attachmentId,
                    { caption: event.target.value },
                    item.recordVersion,
                  ).then(() => reload());
                }
              }}
            />
            <label htmlFor={`cat-${item.attachmentId}`}>Category</label>
            <select
              id={`cat-${item.attachmentId}`}
              defaultValue={item.category}
              disabled={readOnly}
              onChange={(event) => {
                if (readOnly) return;
                void patchAttachment(
                  tenantId,
                  incidentId,
                  item.attachmentId,
                  { category: event.target.value },
                  item.recordVersion,
                ).then(() => reload());
              }}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            {canArchive && !readOnly ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() =>
                  void archiveAttachment(
                    tenantId,
                    incidentId,
                    item.attachmentId,
                    item.recordVersion,
                  ).then(() => reload())
                }
              >
                Archive
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}). Retry the file.`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload. Retry the file."));
    xhr.send(file);
  });
}

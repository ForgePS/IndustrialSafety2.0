"use client";

import { useState } from "react";
import { ApiError, apiGet } from "@forge/web-kit";
import {
  certCopyFromRecord,
  type PersonnelCertKind,
} from "@/lib/personnel-cert-upload";

type DownloadResponse = { downloadUrl: string; originalFilename?: string };

async function openCertCopy(personnelId: string, kind: PersonnelCertKind) {
  const data = await apiGet<DownloadResponse>(
    `/api/v1/industrial/personnel/${encodeURIComponent(personnelId)}/certifications/${kind}/download-url`,
  );
  if (!data.downloadUrl) throw new Error("Download URL missing");
  window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
}

function CertRow({
  personnelId,
  kind,
  label,
  record,
}: {
  personnelId: string;
  kind: PersonnelCertKind;
  label: string;
  record: Record<string, unknown>;
}) {
  const copy = certCopyFromRecord(record, kind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!copy) {
    return (
      <div className="d-flex justify-content-between align-items-center gap-2 py-2 border-bottom">
        <div>
          <div className="fw-medium">{label}</div>
          <small className="text-muted">No copy on file</small>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-bottom">
      <div className="min-w-0">
        <div className="fw-medium">{label}</div>
        <small className="text-muted text-truncate d-block">{copy.originalFilename}</small>
        {error ? <div className="text-danger small">{error}</div> : null}
      </div>
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void openCertCopy(personnelId, kind)
            .catch((e) => {
              setError(e instanceof ApiError ? e.message : "Could not open file");
            })
            .finally(() => setBusy(false));
        }}
      >
        <i className="bx bx-download me-1" aria-hidden="true" />
        {busy ? "Opening…" : "View / download"}
      </button>
    </div>
  );
}

/** Read-only First Aid / CPR certification copy downloads on the personnel file. */
export function PersonnelFirstAidCertCopiesCard({
  personnelId,
  record,
}: {
  personnelId: string;
  record: Record<string, unknown>;
}) {
  const hasAny =
    Boolean(certCopyFromRecord(record, "CPR")) ||
    Boolean(certCopyFromRecord(record, "FIRST_AID"));

  return (
    <div className="card mb-4 mt-4" aria-labelledby="personnel-first-aid-copies-title">
      <div className="card-header d-flex align-items-center gap-3">
        <div className="avatar avatar-sm flex-shrink-0">
          <span className="avatar-initial rounded bg-label-primary">
            <i className="bx bx-first-aid" aria-hidden="true" />
          </span>
        </div>
        <div>
          <h6 className="card-title mb-0" id="personnel-first-aid-copies-title">
            First Aid &amp; CPR certification copies
          </h6>
          <small className="text-muted">
            {hasAny
              ? "Uploaded PDF or image copies of the certificates."
              : "Upload copies from Edit person → First Aid & CPR."}
          </small>
        </div>
      </div>
      <div className="card-body py-2">
        <CertRow personnelId={personnelId} kind="CPR" label="CPR certification" record={record} />
        <CertRow
          personnelId={personnelId}
          kind="FIRST_AID"
          label="First Aid certification"
          record={record}
        />
      </div>
    </div>
  );
}

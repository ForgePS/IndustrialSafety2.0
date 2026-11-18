"use client";

import { useState } from "react";
import { ApiError, apiSend } from "@forge/web-kit";

type Props = {
  templateKey: string;
  module: string;
  recordType: string;
  recordId: string;
  action: string;
  onSigned?: (attestationId: string) => void;
};

/**
 * Affirmative transaction attestation panel. Checkbox must be checked before certify.
 */
export function TransactionAttestationPanel({
  templateKey,
  module,
  recordType,
  recordId,
  action,
  onSigned,
}: Props) {
  const [text] = useState(
    "I certify that the information associated with this action is accurate and complete to the best of my knowledge and that I am performing this action using my individually assigned Forge account.",
  );
  const [version] = useState("1.0");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function certify() {
    if (!checked) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<{ id: string }>("/api/v1/legal/attestations", "POST", {
        templateKey,
        module,
        recordType,
        recordId,
        action,
      });
      setDone(true);
      onSigned?.(result.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Attestation failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="alert alert-success mb-0" role="status">
        Electronic attestation recorded (template {templateKey} v{version}).
      </div>
    );
  }

  return (
    <div className="card border shadow-none">
      <div className="card-body">
        <h3 className="h6">Electronic attestation</h3>
        <p className="small text-muted">
          Template {templateKey} · version {version}
        </p>
        <p>{text}</p>
        {error ? <div className="alert alert-danger">{error}</div> : null}
        <div className="form-check mb-3">
          <input
            id={`attest-${recordId}`}
            className="form-check-input"
            type="checkbox"
            checked={checked}
            onChange={(ev) => setChecked(ev.target.checked)}
          />
          <label className="form-check-label" htmlFor={`attest-${recordId}`}>
            I certify the statement above.
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!checked || busy}
          onClick={() => void certify()}
        >
          {busy ? "Recording…" : "Certify & Continue"}
        </button>
      </div>
    </div>
  );
}

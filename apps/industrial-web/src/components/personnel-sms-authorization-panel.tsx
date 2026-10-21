"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { formatApiErrorMessage } from "@/lib/api-error";
import { openPrintableHtmlPopup } from "@/lib/dvir";
import { personEditHref } from "@/lib/personnel-directory";
import {
  buildSmsConsentPrintableHtml,
  formatSmsNotificationDisplay,
  parsePersonnelSmsAuthorization,
  SMS_AUTHORIZATION_CONSENT_TEXT,
  smsAuthorizationStatusLabel,
  smsConsentMethodLabel,
  type PersonnelSmsAuthorization,
  type PersonnelSmsConsentRecord,
} from "@/lib/personnel-sms-authorization";

type Props = {
  personnelId: string;
  record: Record<string, unknown>;
  canManage?: boolean;
  onRecordChange?: (next: Record<string, unknown>) => void;
};

/**
 * SMS Authorization digital form on the personnel file.
 * SMS Notification number is the personnel phone field (not a separate number).
 */
export function PersonnelSmsAuthorizationPanel({
  personnelId,
  record,
  canManage = false,
  onRecordChange,
}: Props) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [busy, setBusy] = useState<"authorize" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localRecord, setLocalRecord] = useState(record);
  const [consents, setConsents] = useState<PersonnelSmsConsentRecord[] | null>(null);

  useEffect(() => {
    setLocalRecord(record);
  }, [record]);

  const loadConsents = useCallback(async () => {
    try {
      const res = await apiGet<{ items: PersonnelSmsConsentRecord[] }>(
        `/api/v1/industrial/personnel/${encodeURIComponent(personnelId)}/sms-consents`,
      );
      setConsents(res.items ?? []);
    } catch {
      // History is optional for viewers without personnel view permission.
      setConsents(null);
    }
  }, [personnelId]);

  useEffect(() => {
    void loadConsents();
  }, [loadConsents]);

  function printConsent(item: PersonnelSmsConsentRecord) {
    const personName = String(localRecord.displayName ?? localRecord.name ?? "").trim() || "Employee";
    const message = openPrintableHtmlPopup(buildSmsConsentPrintableHtml(item, { personName }), false);
    if (message) setError(message);
  }

  const state: PersonnelSmsAuthorization = parsePersonnelSmsAuthorization(localRecord);
  const status = smsAuthorizationStatusLabel(state);
  const displayNumber =
    formatSmsNotificationDisplay(state.smsNotificationNumber) || "Not on file";

  function applyRecord(next: Record<string, unknown>) {
    setLocalRecord(next);
    onRecordChange?.(next);
  }

  async function authorize() {
    if (!canManage || busy) return;
    setBusy("authorize");
    setError(null);
    try {
      const next = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/personnel/${encodeURIComponent(personnelId)}/sms-authorization`,
        "POST",
        {},
      );
      applyRecord({ ...localRecord, ...next });
      setConsentChecked(false);
      void loadConsents();
    } catch (e) {
      setError(formatApiErrorMessage(e, e instanceof ApiError ? e.message : "Could not authorize SMS"));
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    if (!canManage || busy) return;
    const ok = window.confirm(
      "Revoke SMS authorization for this person? They will no longer receive Emergency Alert SMS until re-authorized.",
    );
    if (!ok) return;
    setBusy("revoke");
    setError(null);
    try {
      const next = await apiSend<Record<string, unknown>>(
        `/api/v1/industrial/personnel/${encodeURIComponent(personnelId)}/sms-authorization/revoke`,
        "POST",
        {},
      );
      applyRecord({ ...localRecord, ...next });
      void loadConsents();
    } catch (e) {
      setError(
        formatApiErrorMessage(
          e,
          e instanceof ApiError ? e.message : "Could not revoke SMS authorization",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card mb-4">
      <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex align-items-center gap-3">
          <div className="avatar avatar-sm flex-shrink-0">
            <span className="avatar-initial rounded bg-label-primary">
              <i className="bx bx-message-detail" aria-hidden="true" />
            </span>
          </div>
          <div>
            <h6 className="card-title mb-0">SMS Authorization</h6>
            <div className="text-muted small">Emergency Alerts opt-in</div>
          </div>
        </div>
        <span
          className={`badge ${
            state.smsAuthorized
              ? "bg-label-success"
              : state.smsOptedOutAt
                ? "bg-label-secondary"
                : "bg-label-warning"
          }`}
        >
          {status}
        </span>
      </div>
      <div className="card-body">
        {error ? (
          <div className="alert alert-danger py-2" role="alert">
            {error}
          </div>
        ) : null}

        <dl className="row mb-3">
          <div className="col-md-6 mb-2">
            <dt className="text-muted small text-uppercase fw-normal">SMS Notification number</dt>
            <dd className="mb-0 fw-medium">{displayNumber}</dd>
            <div className="form-text">Uses the Phone field on this personnel file.</div>
          </div>
          <div className="col-md-6 mb-2">
            <dt className="text-muted small text-uppercase fw-normal">Authorized</dt>
            <dd className="mb-0">
              {state.smsAuthorizedAt
                ? new Date(state.smsAuthorizedAt).toLocaleString()
                : "—"}
            </dd>
          </div>
        </dl>

        {!state.phone ? (
          <div className="alert alert-warning py-2" role="status">
            Add a phone number on the personnel file before authorizing SMS.
            {canManage ? (
              <>
                {" "}
                <Link href={personEditHref(personnelId)}>Edit person</Link>
              </>
            ) : null}
          </div>
        ) : null}

        {state.smsAuthorized ? (
          <p className="text-muted small mb-3">
            This person is authorized to receive Emergency Alert SMS at the notification number
            above. Recipients can reply STOP to opt out.
          </p>
        ) : (
          <>
            <div className="border rounded p-3 mb-3 bg-body-tertiary">
              <div className="text-muted small text-uppercase mb-2">Authorization</div>
              <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                {SMS_AUTHORIZATION_CONSENT_TEXT}
              </p>
            </div>
            {canManage ? (
              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`sms-auth-consent-${personnelId}`}
                  checked={consentChecked}
                  disabled={!state.phoneValid || busy != null}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                />
                <label className="form-check-label" htmlFor={`sms-auth-consent-${personnelId}`}>
                  I confirm this employee authorizes Emergency Alert SMS to{" "}
                  <strong>{displayNumber}</strong>.
                </label>
              </div>
            ) : (
              <p className="text-muted small mb-0">
                An administrator must record SMS authorization on this file.
              </p>
            )}
          </>
        )}

        {canManage ? (
          <div className="d-flex flex-wrap gap-2">
            {!state.smsAuthorized ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!consentChecked || !state.phoneValid || busy != null}
                onClick={() => void authorize()}
              >
                {busy === "authorize" ? "Saving…" : "Authorize SMS"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline-danger"
                disabled={busy != null}
                onClick={() => void revoke()}
              >
                {busy === "revoke" ? "Revoking…" : "Revoke authorization"}
              </button>
            )}
            <Link className="btn btn-outline-secondary" href={personEditHref(personnelId)}>
              Edit phone
            </Link>
          </div>
        ) : null}

        {consents ? (
          <div className="mt-4">
            <div className="text-muted small text-uppercase mb-2">Signed forms</div>
            {consents.length === 0 ? (
              <p className="text-muted small mb-0">
                No signed SMS forms on file yet. Employees can sign up by scanning the Emergency SMS
                Alerts signup QR code.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Action</th>
                      <th>Method</th>
                      <th>Number</th>
                      <th>Signed by</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {consents.map((item) => (
                      <tr key={item.id}>
                        <td className="text-nowrap">{new Date(item.createdAt).toLocaleString()}</td>
                        <td>
                          <span
                            className={`badge ${
                              item.action === "AUTHORIZED" ? "bg-label-success" : "bg-label-secondary"
                            }`}
                          >
                            {item.action === "AUTHORIZED" ? "Authorized" : "Revoked"}
                          </span>
                        </td>
                        <td>{smsConsentMethodLabel(item.method)}</td>
                        <td className="text-nowrap">
                          {formatSmsNotificationDisplay(item.phoneNumber) || "—"}
                          {item.previousPhoneNumber ? (
                            <div className="small text-muted">
                              was {formatSmsNotificationDisplay(item.previousPhoneNumber)}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {item.signatureName ??
                            (item.method === "ADMIN" ? item.actorEmail ?? "Admin" : "—")}
                        </td>
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => printConsent(item)}
                          >
                            <i className="bx bx-printer me-1" aria-hidden />
                            View / print
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

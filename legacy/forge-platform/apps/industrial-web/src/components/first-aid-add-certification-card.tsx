"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { PersonnelCertUploadField } from "@/components/personnel-cert-upload-field";
import {
  buildFirstAidAssignPayload,
  validateFirstAidAddCertification,
} from "@/lib/first-aid-add-certification";
import { personFileHref } from "@/lib/personnel-directory";
import { personNameDisplay } from "@/lib/person-name-display";

type PersonnelSearchHit = {
  id: string;
  personnelId?: string;
  displayName?: string | null;
  employeeNumber?: string | null;
  status?: string | null;
};

type AssignResult = {
  personnelId: string;
  displayName?: string | null;
};

type Props = {
  canManage: boolean;
  onAssigned: () => void | Promise<void>;
};

/**
 * First Aid module: add CPR / First Aid certification details and link them
 * to an existing employee personnel file.
 */
export function FirstAidAddCertificationCard({ canManage, onAssigned }: Props) {
  const [open, setOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<PersonnelSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [personnelId, setPersonnelId] = useState("");
  const [personnelLabel, setPersonnelLabel] = useState("");
  const [tracksFirstAid, setTracksFirstAid] = useState(true);
  const [cprExpiresDate, setCprExpiresDate] = useState("");
  const [firstAidExpiresDate, setFirstAidExpiresDate] = useState("");
  const [cprDocumentId, setCprDocumentId] = useState("");
  const [cprFilename, setCprFilename] = useState("");
  const [firstAidDocumentId, setFirstAidDocumentId] = useState("");
  const [firstAidFilename, setFirstAidFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const data = await apiGet<{ items?: PersonnelSearchHit[] }>(
        "/api/v1/industrial/personnel/search",
        { query: { q: trimmed, limit: "15" } },
      );
      setHits(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Personnel search failed");
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage || !open || personnelId) return;
    const handle = window.setTimeout(() => {
      void runSearch(searchQ);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [canManage, open, personnelId, runSearch, searchQ]);

  function resetForm() {
    setSearchQ("");
    setHits([]);
    setPersonnelId("");
    setPersonnelLabel("");
    setTracksFirstAid(true);
    setCprExpiresDate("");
    setFirstAidExpiresDate("");
    setCprDocumentId("");
    setCprFilename("");
    setFirstAidDocumentId("");
    setFirstAidFilename("");
    setError(null);
  }

  function selectPerson(hit: PersonnelSearchHit) {
    const id = hit.personnelId ?? hit.id;
    setPersonnelId(id);
    setPersonnelLabel(personNameDisplay(hit.displayName, id));
    setSearchQ("");
    setHits([]);
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const draft = {
      personnelId,
      tracksFirstAid,
      cprExpiresDate,
      firstAidExpiresDate,
      cprDocumentId,
      firstAidDocumentId,
    };
    const validationError = validateFirstAidAddCertification(draft);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await apiSend<AssignResult>(
        "/api/v1/industrial/personnel/certifications/assign",
        "POST",
        buildFirstAidAssignPayload(draft),
      );
      const label = personNameDisplay(result.displayName ?? personnelLabel, "personnel file");
      setSuccess(`Linked certification to ${label}.`);
      resetForm();
      setOpen(false);
      await onAssigned();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not link certification");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  return (
    <div className="card mb-4">
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
          <div>
            <h6 className="mb-1">Add certification</h6>
            <p className="text-muted small mb-0">
              Search for an employee, set CPR / First Aid expiry dates, upload copies, and link them
              to that personnel file.
            </p>
          </div>
          {!open ? (
            <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
              Add certification
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                resetForm();
                setSuccess(null);
              }}
            >
              Cancel
            </button>
          )}
        </div>

        {success ? (
          <div className="alert alert-success py-2 small mb-0" role="status">
            {success}
          </div>
        ) : null}

        {open ? (
          <form className="mt-3" onSubmit={(ev) => void onSubmit(ev)}>
            {error ? (
              <div className="alert alert-danger py-2 small" role="alert">
                {error}
              </div>
            ) : null}

            <div className="mb-3">
              <label className="form-label" htmlFor="first-aid-add-personnel-search">
                Employee personnel file
              </label>
              {personnelId ? (
                <div className="border rounded p-2 bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div>
                    <span className="fw-medium">{personnelLabel}</span>
                    <Link
                      className="small ms-2"
                      href={personFileHref(personnelId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open file
                    </Link>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={busy}
                    onClick={() => {
                      setPersonnelId("");
                      setPersonnelLabel("");
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    id="first-aid-add-personnel-search"
                    type="search"
                    className="form-control"
                    placeholder="Search by name or EMPLOYEE #"
                    value={searchQ}
                    onChange={(ev) => setSearchQ(ev.target.value)}
                    autoComplete="off"
                    disabled={busy}
                  />
                  {searching ? (
                    <p className="text-muted small mt-1 mb-0" role="status">
                      Searching…
                    </p>
                  ) : null}
                  {hits.length > 0 ? (
                    <ul className="list-group list-group-flush mt-2 border rounded">
                      {hits.map((hit) => {
                        const id = hit.personnelId ?? hit.id;
                        const name = personNameDisplay(hit.displayName, id);
                        return (
                          <li key={id} className="list-group-item py-2">
                            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                              <div>
                                <span className="fw-medium">{name}</span>
                                {hit.employeeNumber ? (
                                  <span className="text-muted small ms-2">
                                    {hit.employeeNumber}
                                  </span>
                                ) : null}
                                {hit.status ? (
                                  <span className="badge bg-label-secondary ms-2">
                                    {hit.status}
                                  </span>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                disabled={busy}
                                onClick={() => selectPerson(hit)}
                              >
                                Select
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : searchQ.trim().length >= 2 && !searching ? (
                    <p className="text-muted small mt-2 mb-0">No matching personnel.</p>
                  ) : null}
                </>
              )}
            </div>

            <div className="form-check mb-3">
              <input
                id="first-aid-add-tracks"
                className="form-check-input"
                type="checkbox"
                checked={tracksFirstAid}
                disabled={busy}
                onChange={(ev) => setTracksFirstAid(ev.target.checked)}
              />
              <label className="form-check-label" htmlFor="first-aid-add-tracks">
                Track on First Aid roster
              </label>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label" htmlFor="first-aid-add-cpr-expires">
                  CPR certification expiration
                </label>
                <input
                  id="first-aid-add-cpr-expires"
                  type="date"
                  className="form-control"
                  value={cprExpiresDate}
                  disabled={busy}
                  onChange={(ev) => setCprExpiresDate(ev.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="first-aid-add-fa-expires">
                  First Aid certification expiration
                </label>
                <input
                  id="first-aid-add-fa-expires"
                  type="date"
                  className="form-control"
                  value={firstAidExpiresDate}
                  disabled={busy}
                  onChange={(ev) => setFirstAidExpiresDate(ev.target.value)}
                />
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <PersonnelCertUploadField
                  id="first-aid-add-cpr-copy"
                  label="CPR certification copy"
                  kind="CPR"
                  documentId={cprDocumentId}
                  filename={cprFilename}
                  disabled={busy}
                  help="PDF or image. Linked to the selected personnel file when you save."
                  onChange={({ documentId, filename }) => {
                    setCprDocumentId(documentId);
                    setCprFilename(filename);
                  }}
                />
              </div>
              <div className="col-md-6">
                <PersonnelCertUploadField
                  id="first-aid-add-fa-copy"
                  label="First Aid certification copy"
                  kind="FIRST_AID"
                  documentId={firstAidDocumentId}
                  filename={firstAidFilename}
                  disabled={busy}
                  help="PDF or image. Linked to the selected personnel file when you save."
                  onChange={({ documentId, filename }) => {
                    setFirstAidDocumentId(documentId);
                    setFirstAidFilename(filename);
                  }}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save and link to personnel file"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

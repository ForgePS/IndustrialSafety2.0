"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiGet, apiSend } from "@forge/web-kit";
import { splitDriverPersonName } from "@/lib/company-driver-merge";
import { personFileHref } from "@/lib/personnel-directory";
import { personNameDisplay } from "@/lib/person-name-display";
import type { CompanyVehicleDriver } from "@/lib/company-vehicle-drivers";

type PersonnelSearchHit = {
  id: string;
  personnelId?: string;
  displayName?: string | null;
  employeeNumber?: string | null;
  status?: string | null;
};

type MergeResult = {
  personnelId?: string | null;
  personnelDisplayName?: string | null;
  unlinkedDriverId?: string | null;
  unlinkedDriverName?: string | null;
  forceMerge?: boolean;
};

type Props = {
  driver: CompanyVehicleDriver;
  canManage: boolean;
  onMerged: () => void | Promise<void>;
};

export function CompanyDriverMergePanel({ driver, canManage, onMerged }: Props) {
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<PersonnelSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [forceMerge, setForceMerge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const driverName = personNameDisplay(driver.personnelName, "Unnamed");
  const previewName = splitDriverPersonName(driverName);

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
    if (!canManage || driver.personnelId) return;
    const handle = window.setTimeout(() => {
      void runSearch(searchQ);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [canManage, driver.personnelId, runSearch, searchQ]);

  async function merge(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await apiSend<MergeResult>(
        `/api/v1/industrial/fleet/drivers/${encodeURIComponent(driver.id)}/merge-personnel`,
        "POST",
        body,
      );
      const personnelId = result.personnelId ?? body.personnelId;
      const label = result.personnelDisplayName ?? driverName;
      let message = `Linked to ${label}.`;
      if (result.forceMerge && result.unlinkedDriverName) {
        message += ` Removed the previous link for ${result.unlinkedDriverName}.`;
      } else if (result.forceMerge && result.unlinkedDriverId) {
        message += " Removed the previous company DRIVER link on this person.";
      }
      if (personnelId) {
        message += " Open the personnel file to review MVR and license details.";
      }
      setSuccess(message);
      setSearchQ("");
      setHits([]);
      setSelectedId("");
      setForceMerge(false);
      await onMerged();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not link to personnel file";
      setError(message);
      if (message.includes("already linked to another company driver")) {
        setForceMerge(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function linkSelected() {
    if (!selectedId) return;
    const payload: Record<string, unknown> = { personnelId: selectedId };
    if (forceMerge) payload.forceMerge = true;
    if (forceMerge) {
      const selected = hits.find((hit) => (hit.personnelId ?? hit.id) === selectedId);
      const personLabel = personNameDisplay(selected?.displayName, "this person");
      if (
        !window.confirm(
          `Force merge will unlink any other company DRIVER already linked to ${personLabel}, then link ${driverName} to that personnel file.`,
        )
      ) {
        return;
      }
    }
    void merge(payload);
  }

  if (driver.personnelId) {
    return (
      <div className="col-12">
        <div className="alert alert-success py-2 mb-0 small">
          Linked to{" "}
          <Link href={personFileHref(driver.personnelId)} className="alert-link">
            {personNameDisplay(driver.personnelName, "personnel file")}
          </Link>
          . MVR and license details stay on this DRIVER record and appear on the personnel safety
          profile.
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="col-12">
        <p className="text-muted small mb-0">
          No personnel file linked. Ask an administrator to merge this DRIVER with a personnel
          record.
        </p>
      </div>
    );
  }

  return (
    <div className="col-12">
      <div className="border rounded p-3 bg-white">
        <h6 className="mb-2">Merge with personnel file</h6>
        <p className="text-muted small mb-3">
          Link <span className="fw-medium">{driverName}</span> to an existing personnel file so
          insurance / MVR data and the person record are one file. Search by name or EMPLOYEE
          number, or create a new personnel file from this DRIVER.
        </p>

        {error ? (
          <div className="alert alert-danger py-2 small" role="alert">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="alert alert-success py-2 small" role="status">
            {success}
          </div>
        ) : null}

        <div className="row g-3">
          <div className="col-lg-7">
            <label className="form-label small" htmlFor={`merge-search-${driver.id}`}>
              Search personnel
            </label>
            <input
              id={`merge-search-${driver.id}`}
              type="search"
              className="form-control form-control-sm"
              placeholder="Name or EMPLOYEE #"
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
                  const selected = selectedId === id;
                  return (
                    <li key={id} className="list-group-item py-2">
                      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                        <div>
                          <span className="fw-medium">{name}</span>
                          {hit.employeeNumber ? (
                            <span className="text-muted small ms-2">{hit.employeeNumber}</span>
                          ) : null}
                          {hit.status ? (
                            <span className="badge bg-label-secondary ms-2">{hit.status}</span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={`btn btn-sm ${selected ? "btn-primary" : "btn-outline-primary"}`}
                          disabled={busy}
                          onClick={() => setSelectedId(id)}
                        >
                          {selected ? "Selected" : "Select"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : searchQ.trim().length >= 2 && !searching ? (
              <p className="text-muted small mt-2 mb-0">No personnel matches this search.</p>
            ) : null}
            <div className="d-flex flex-wrap align-items-center gap-3 mt-3">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy || !selectedId}
                onClick={linkSelected}
              >
                {forceMerge ? "Force link to selected file" : "Link to selected file"}
              </button>
              <label className="form-check-label small mb-0">
                <input
                  type="checkbox"
                  className="form-check-input me-1"
                  checked={forceMerge}
                  onChange={(ev) => setForceMerge(ev.target.checked)}
                  disabled={busy}
                />
                Force merge (replace existing company DRIVER on that person)
              </label>
            </div>
          </div>
          <div className="col-lg-5">
            <div className="border rounded p-3 bg-lighter">
              <div className="fw-medium mb-1">Create new personnel file</div>
              <p className="text-muted small mb-2">
                Creates{" "}
                <span className="fw-medium">
                  {personNameDisplay(previewName.firstName)}{" "}
                  {personNameDisplay(previewName.lastName)}
                </span>
                {driver.employeeNumber ? <> (EMPLOYEE {driver.employeeNumber})</> : null} and marks
                them as a company DRIVER.
              </p>
              <button
                type="button"
                className="btn btn-sm btn-outline-success"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Create a new personnel file for ${driverName} and link this DRIVER record?`,
                    )
                  ) {
                    void merge({ createPersonnel: true });
                  }
                }}
              >
                Create personnel file
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

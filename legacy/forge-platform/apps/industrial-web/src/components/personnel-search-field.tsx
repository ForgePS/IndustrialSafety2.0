"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { ApiError, apiGet } from "@forge/web-kit";
import { personFileHref } from "@/lib/personnel-directory";
import { personNameDisplay } from "@/lib/person-name-display";

export type PersonnelSearchHit = {
  id: string;
  personnelId?: string;
  displayName?: string | null;
  employeeNumber?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: string | null;
  siteId?: string | null;
  siteLabel?: string | null;
  site?: string | null;
  location?: string | null;
  divisionName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  hireDate?: string | null;
  dateOfBirth?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  gender?: string | null;
};

export type PersonnelSearchSelection = {
  personnelId: string;
  displayName: string;
  employeeNumber: string;
  siteId: string;
  siteLabel: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
  hireDate: string;
  dateOfBirth: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  gender: string;
};

type Props = {
  id?: string;
  label?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
  /** Selected personnel id (empty = none linked). */
  personnelId: string;
  /** Display name shown when linked, or free-text visitor name when unlinked. */
  displayName: string;
  onLinkedChange: (selection: PersonnelSearchSelection | null) => void;
  /** Allow typing a visitor / non-employee name without linking a profile. */
  allowUnlinkedText?: boolean;
  onUnlinkedTextChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
};

function hitId(hit: PersonnelSearchHit): string {
  return (hit.personnelId ?? hit.id ?? "").trim();
}

function hitLabel(hit: PersonnelSearchHit): string {
  const name = personNameDisplay(hit.displayName, hitId(hit));
  const emp = (hit.employeeNumber ?? "").trim();
  return emp ? `${name} (${emp})` : name;
}

/**
 * Searchable link to an Employee Profile (last name or employee #).
 * Used by incidents Person affected and similar pickers.
 */
export function PersonnelSearchField({
  id,
  label = "Employee",
  required = false,
  hint,
  disabled = false,
  personnelId,
  displayName,
  onLinkedChange,
  allowUnlinkedText = false,
  onUnlinkedTextChange,
  placeholder = "Search by last name or EMPLOYEE #",
  className,
}: Props) {
  const autoId = useId();
  const inputId = id ?? `personnel-search-${autoId}`;
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<PersonnelSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (disabled || personnelId) return;
    const handle = window.setTimeout(() => {
      void runSearch(searchQ);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [disabled, personnelId, runSearch, searchQ]);

  function hitText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  function hitHireDate(value: unknown): string {
    const raw = hitText(value);
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "";
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function selectPerson(hit: PersonnelSearchHit) {
    const idValue = hitId(hit);
    if (!idValue) return;
    onLinkedChange({
      personnelId: idValue,
      displayName: personNameDisplay(hit.displayName, idValue),
      employeeNumber: hitText(hit.employeeNumber),
      siteId: hitText(hit.siteId),
      siteLabel: hitText(hit.siteLabel) || hitText(hit.site) || hitText(hit.location),
      divisionName: hitText(hit.divisionName),
      departmentId: hitText(hit.departmentId),
      departmentName: hitText(hit.departmentName),
      hireDate: hitHireDate(hit.hireDate),
      dateOfBirth: hitHireDate(hit.dateOfBirth),
      street: hitText(hit.street),
      city: hitText(hit.city),
      state: hitText(hit.state),
      zip: hitText(hit.zip),
      gender: (() => {
        const raw = hitText(hit.gender).toUpperCase();
        if (raw === "M" || raw === "MALE") return "MALE";
        if (raw === "F" || raw === "FEMALE") return "FEMALE";
        return "";
      })(),
    });
    setSearchQ("");
    setHits([]);
    setError(null);
  }

  function clearLink() {
    onLinkedChange(null);
    setSearchQ("");
    setHits([]);
  }

  return (
    <div className={className}>
      <label className="form-label" htmlFor={inputId}>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {hint ? <p className="text-muted small mb-1">{hint}</p> : null}

      {personnelId ? (
        <div className="border rounded p-2 bg-white d-flex flex-wrap align-items-center justify-content-between gap-2">
          {required ? (
            <input
              type="text"
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden
              readOnly
              required
              value={displayName.trim() || personnelId}
            />
          ) : null}
          <div className="min-w-0">
            <span className="fw-medium">{displayName || "Linked employee"}</span>
            <Link
              className="small ms-2"
              href={personFileHref(personnelId)}
              target="_blank"
              rel="noreferrer"
            >
              Open profile
            </Link>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={disabled}
            onClick={clearLink}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          {required ? (
            <input
              type="text"
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden
              readOnly
              required
              value={displayName.trim() || personnelId}
            />
          ) : null}
          <input
            id={inputId}
            type="search"
            className="form-control"
            placeholder={placeholder}
            value={searchQ || (allowUnlinkedText ? displayName : "")}
            onChange={(ev) => {
              const next = ev.target.value;
              setSearchQ(next);
              if (allowUnlinkedText) onUnlinkedTextChange?.(next);
            }}
            autoComplete="off"
            disabled={disabled}
          />
          {searching ? (
            <p className="text-muted small mt-1 mb-0" role="status">
              Searching…
            </p>
          ) : null}
          {error ? (
            <p className="text-danger small mt-1 mb-0" role="alert">
              {error}
            </p>
          ) : null}
          {hits.length > 0 ? (
            <ul className="list-group list-group-flush mt-2 border rounded">
              {hits.map((hit) => {
                const idValue = hitId(hit);
                return (
                  <li key={idValue} className="list-group-item py-2">
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                      <div>
                        <span className="fw-medium">{hitLabel(hit)}</span>
                        {hit.status ? (
                          <span className="badge bg-label-secondary ms-2">{hit.status}</span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        disabled={disabled}
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
            <p className="text-muted small mt-2 mb-0">
              No matching personnel.
              {allowUnlinkedText ? " You can keep typing a visitor name." : ""}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

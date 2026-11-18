"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ApiError, apiGet } from "@forge/web-kit";
import {
  canonicalEmployeeNumber,
  EMPLOYEE_NUMBER_PREFIX,
  employeeNumberDigitsForInput,
  formatEmployeeNumberFromDigits,
  sanitizeEmployeeNumberDigitsInput,
} from "@/lib/employee-number";
import { personFileHref } from "@/lib/personnel-directory";

type PersonnelHit = {
  id: string;
  displayName: string;
  employeeNumber: string;
};

type ListResponse = {
  items?: Array<Record<string, unknown>>;
};

type Props = {
  id?: string;
  label: string;
  value: string;
  required?: boolean;
  readOnly?: boolean;
  onChange: (canonicalEmployeeNumber: string) => void;
  onPersonnelResolved: (personnelId: string | null, person?: PersonnelHit | null) => void;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function mapHit(row: Record<string, unknown>): PersonnelHit | null {
  const id = asText(row.id);
  if (!id) return null;
  return {
    id,
    displayName: asText(row.displayName) || asText(row.name) || "Personnel",
    employeeNumber: canonicalEmployeeNumber(
      asText(row.employeeNumber) || asText(row.employee_number),
    ),
  };
}

async function lookupPersonnelByEmployeeNumber(raw: string): Promise<PersonnelHit | null> {
  const emp = canonicalEmployeeNumber(raw);
  if (!emp) return null;
  try {
    const res = await apiGet<ListResponse>("/api/v1/industrial/personnel", {
      query: { q: emp, pageSize: "25" },
    });
    const items = (res.items ?? []).map(mapHit).filter((row): row is PersonnelHit => row != null);
    const exact = items.find((row) => canonicalEmployeeNumber(row.employeeNumber) === emp);
    return exact ?? null;
  } catch (err) {
    if (err instanceof ApiError) return null;
    return null;
  }
}

export function FormEmployeeNumberField({
  id,
  label,
  value,
  required = false,
  readOnly = false,
  onChange,
  onPersonnelResolved,
}: Props) {
  const autoId = useId();
  const inputId = id || autoId;
  const [digits, setDigits] = useState(() => employeeNumberDigitsForInput(value));
  const [status, setStatus] = useState<"idle" | "looking" | "found" | "missing">("idle");
  const [matched, setMatched] = useState<PersonnelHit | null>(null);

  useEffect(() => {
    setDigits(employeeNumberDigitsForInput(value));
  }, [value]);

  useEffect(() => {
    if (readOnly) return;
    const emp = formatEmployeeNumberFromDigits(digits);
    if (!emp) {
      setStatus("idle");
      setMatched(null);
      onPersonnelResolved(null, null);
      return;
    }

    let cancelled = false;
    setStatus("looking");
    const timer = window.setTimeout(() => {
      void lookupPersonnelByEmployeeNumber(emp).then((hit) => {
        if (cancelled) return;
        if (hit) {
          setMatched(hit);
          setStatus("found");
          onPersonnelResolved(hit.id, hit);
          // Keep the stored answer canonical even if the user typed digits only.
          if (canonicalEmployeeNumber(value) !== hit.employeeNumber) {
            onChange(hit.employeeNumber);
          }
        } else {
          setMatched(null);
          setStatus("missing");
          onPersonnelResolved(null, null);
        }
      });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Intentionally omit onChange/onPersonnelResolved to avoid re-lookup loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, readOnly]);

  return (
    <div className="col-md-6">
      <label className="form-label" htmlFor={inputId}>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <div className="input-group">
        <span className="input-group-text">{EMPLOYEE_NUMBER_PREFIX}</span>
        <input
          id={inputId}
          className="form-control"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          disabled={readOnly}
          value={digits}
          placeholder="1234"
          onChange={(ev) => {
            const nextDigits = sanitizeEmployeeNumberDigitsInput(ev.target.value);
            setDigits(nextDigits);
            onChange(formatEmployeeNumberFromDigits(nextDigits));
          }}
        />
      </div>
      {status === "looking" ? (
        <small className="text-muted d-block mt-1">Looking up personnel file…</small>
      ) : null}
      {status === "found" && matched ? (
        <small className="text-success d-block mt-1">
          Linked to{" "}
          <Link href={personFileHref(matched.id)} className="link-success">
            {matched.displayName}
          </Link>{" "}
          ({matched.employeeNumber || canonicalEmployeeNumber(value)})
        </small>
      ) : null}
      {status === "missing" ? (
        <small className="text-danger d-block mt-1">
          No personnel file found for {formatEmployeeNumberFromDigits(digits) || "that number"}.
        </small>
      ) : null}
      {status === "idle" && !readOnly ? (
        <small className="text-muted d-block mt-1">
          Enter the employee number to attach this form to their personnel file.
        </small>
      ) : null}
    </div>
  );
}

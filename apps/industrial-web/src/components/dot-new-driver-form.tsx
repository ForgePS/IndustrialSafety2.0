"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { DotDqfWorksheet } from "@/components/dot-dqf-worksheet";
import { DOT_API, dotFileHref } from "@/lib/dot-compliance-module";
import { deriveDotDqfTitle } from "@/lib/dot-dqf-fields";
import { dotDqfPatchFromDetails } from "@/lib/dot-dqf-record";
import {
  divisionsForLocationCascade,
  filterDepartmentsForSite,
  type DivisionOption,
} from "@/lib/personnel-assignment";
import {
  loadOrgFilterCatalogs,
  type LookupOption,
  type OrgFilterCatalogs,
} from "@/lib/personnel-lookups";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS = ["Open", "Compliant", "Non-Compliant", "Expired", "Draft"] as const;

type Props = {
  tenantSlug?: string | null;
  onCancel: () => void;
  onCreated?: () => void;
};

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function joinDriverName(first: string, middle: string, last: string): string {
  return [first.trim(), middle.trim(), last.trim()].filter(Boolean).join(" ");
}

export function DotNewDriverForm({ tenantSlug, onCancel, onCreated }: Props) {
  const router = useRouter();
  const { me } = useAuth();
  const companyDefault =
    me?.tenants?.find((tenant) => tenant.tenantId === me.tenantId)?.displayName?.trim() ||
    me?.tenants?.[0]?.displayName?.trim() ||
    "";

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string>("Open");
  const [eventDate, setEventDate] = useState(todayInputValue);
  const [firstName, setFirstName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState(companyDefault);
  const [siteId, setSiteId] = useState("");
  const [divisionName, setDivisionName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [terminalCode, setTerminalCode] = useState("");
  const [reportedBy, setReportedBy] = useState("Signed-in user");
  const [catalogs, setCatalogs] = useState<OrgFilterCatalogs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profile = await apiGet<{
          accountEmail?: string | null;
          email?: string | null;
          displayName?: string | null;
          username?: string | null;
        }>("/api/v1/auth/profile");
        if (cancelled) return;
        const label =
          profile.accountEmail?.trim() ||
          profile.email?.trim() ||
          profile.displayName?.trim() ||
          profile.username?.trim() ||
          "Signed-in user";
        setReportedBy(label);
      } catch {
        if (!cancelled) setReportedBy("Signed-in user");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadOrgFilterCatalogs(me?.tenantId ?? null);
        if (!cancelled) setCatalogs(loaded);
      } catch {
        if (!cancelled) {
          setCatalogs({
            sites: [],
            departments: [],
            divisions: [],
            divisionEntries: [],
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.tenantId]);

  useEffect(() => {
    if (companyDefault && !company) setCompany(companyDefault);
  }, [companyDefault, company]);

  const sites = catalogs?.sites ?? [];
  const divisionEntries: DivisionOption[] = catalogs?.divisionEntries ?? [];
  const departments: LookupOption[] = catalogs?.departments ?? [];

  const divisionsForSite = useMemo(
    () =>
      divisionsForLocationCascade(
        divisionEntries,
        departments.map((row) => ({
          id: row.id,
          label: row.label,
          siteId: row.siteId ?? null,
          divisionName: row.divisionName ?? null,
        })),
        siteId || undefined,
      ),
    [departments, divisionEntries, siteId],
  );
  const departmentsForSite = useMemo(
    () =>
      filterDepartmentsForSite(
        departments.map((row) => ({
          id: row.id,
          label: row.label,
          siteId: row.siteId ?? null,
          divisionName: row.divisionName ?? null,
        })),
        siteId || undefined,
        { includeUnscoped: false },
      ),
    [departments, siteId],
  );

  const driverName = joinDriverName(firstName, middleInitial, lastName);
  const siteLabel = sites.find((site) => site.id === siteId)?.label ?? "";
  const departmentLabel =
    departmentsForSite.find((row) => row.id === departmentId)?.label ?? "";
  const locationDepartment =
    details.locationDepartment?.trim() ||
    [siteLabel, divisionName, departmentLabel].filter(Boolean).join(" / ");

  function onDetailChange(fieldId: string, value: string) {
    setDetails((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const first = firstName.trim();
    const middle = middleInitial.trim();
    const last = lastName.trim();
    if (!first || !middle || !last) {
      setError("Enter first name, middle initial, and last name exactly as shown on the CDL.");
      return;
    }
    if (!siteId) {
      setError("Select a location.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const name = joinDriverName(first, middle, last);
      const nextDetails: Record<string, string> = {
        ...details,
        locationDepartment:
          details.locationDepartment?.trim() ||
          [siteLabel, divisionName.trim(), departmentLabel].filter(Boolean).join(" / "),
      };
      const derivedTitle =
        title.trim() ||
        deriveDotDqfTitle({
          category: "drivers",
          dqf: true,
          firstName: first,
          lastName: last,
          workerName: name,
          driverName: name,
          locationDepartment: nextDetails.locationDepartment,
          employeeNumber: nextDetails.employeeNumber,
          cdlNumber: nextDetails.cdlNumber,
        });
      if (!derivedTitle) {
        setError("Could not derive a DRIVER title. Check name and location.");
        return;
      }

      const patch = dotDqfPatchFromDetails(nextDetails, {
        id: "",
        title: derivedTitle,
        firstName: first,
        lastName: last,
        workerName: name,
        driverName: name,
      });

      const created = await apiSend<Record<string, unknown>>(DOT_API, "POST", {
        ...patch,
        title: derivedTitle,
        category: "drivers",
        dqf: true,
        status: status || "Open",
        recordDate: eventDate || undefined,
        firstName: first,
        middleInitial: middle,
        middleName: middle,
        lastName: last,
        workerName: name,
        driverName: name,
        personnelName: name,
        reportedBy,
        companyName: company.trim() || undefined,
        siteId: siteId || undefined,
        siteName: siteLabel || undefined,
        divisionName: divisionName.trim() || undefined,
        departmentId: departmentId || undefined,
        departmentName: departmentLabel || undefined,
        locationText: nextDetails.locationDepartment || undefined,
        terminalCode: terminalCode.trim() || undefined,
        notes: notes.trim() || undefined,
        details: {
          ...(typeof patch.details === "object" && patch.details && !Array.isArray(patch.details)
            ? (patch.details as Record<string, unknown>)
            : {}),
          firstName: first,
          middleInitial: middle,
          lastName: last,
          companyName: company.trim() || undefined,
          siteId,
          divisionName: divisionName.trim() || undefined,
          departmentId: departmentId || undefined,
          terminalCode: terminalCode.trim() || undefined,
          notes: notes.trim() || undefined,
          reportedBy,
          recordDate: eventDate || undefined,
        },
      });

      const createdId = String(created.id ?? "").trim();
      onCreated?.();
      if (createdId) {
        router.push(dotFileHref(createdId));
        return;
      }
      onCancel();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create DRIVER file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card border shadow-none mb-4" onSubmit={(e) => void onSubmit(e)}>
      <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <h5 className="card-title mb-0">New driver (DQF)</h5>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
      <div className="card-body">
        {error ? (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        ) : null}

        <div className="row g-3 mb-4">
          <div className="col-md-6">
            <label className="form-label" htmlFor="new-driver-title">
              Title
            </label>
            <input
              id="new-driver-title"
              className="form-control"
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              placeholder="Auto-generated from DRIVER (DQF) fields if blank"
              disabled={busy}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="new-driver-status">
              Status <span className="text-danger">*</span>
            </label>
            <select
              id="new-driver-status"
              className="form-select"
              required
              value={status}
              onChange={(ev) => setStatus(ev.target.value)}
              disabled={busy}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label" htmlFor="new-driver-event-date">
              Event Date <span className="text-danger">*</span>
            </label>
            <input
              id="new-driver-event-date"
              type="date"
              className="form-control"
              required
              value={eventDate}
              onChange={(ev) => setEventDate(ev.target.value)}
              disabled={busy}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="new-driver-reported-by">
              Reported By
            </label>
            <input
              id="new-driver-reported-by"
              className="form-control"
              value={reportedBy}
              readOnly
              disabled
            />
            <div className="form-text">Automatically set to the signed-in user.</div>
          </div>
        </div>

        <fieldset className="border rounded p-3 mb-4">
          <legend className="float-none w-auto px-2 fs-6 mb-0">
            CDL License Holder Name <span className="text-danger">*</span>
          </legend>
          <p className="text-muted small mb-3">
            Enter the name exactly as shown on the CDL. All three fields are required.
          </p>
          <div className="row g-3">
            <div className="col-md-5">
              <label className="form-label" htmlFor="new-driver-first">
                First Name <span className="text-danger">*</span>
              </label>
              <input
                id="new-driver-first"
                className="form-control"
                required
                value={firstName}
                onChange={(ev) => setFirstName(ev.target.value.toUpperCase())}
                placeholder="FIRST"
                disabled={busy}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label" htmlFor="new-driver-mi">
                M.I. <span className="text-danger">*</span>
              </label>
              <input
                id="new-driver-mi"
                className="form-control"
                required
                maxLength={1}
                value={middleInitial}
                onChange={(ev) => setMiddleInitial(ev.target.value.toUpperCase().slice(0, 1))}
                placeholder="M"
                disabled={busy}
              />
            </div>
            <div className="col-md-5">
              <label className="form-label" htmlFor="new-driver-last">
                Last Name <span className="text-danger">*</span>
              </label>
              <input
                id="new-driver-last"
                className="form-control"
                required
                value={lastName}
                onChange={(ev) => setLastName(ev.target.value.toUpperCase())}
                placeholder="LAST"
                disabled={busy}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="border rounded p-3 mb-4">
          <legend className="float-none w-auto px-2 fs-6 mb-0">
            Company / Location / Division / Department <span className="text-danger">*</span>
          </legend>
          <div className="row g-3 mt-1">
            <div className="col-md-6">
              <label className="form-label" htmlFor="new-driver-company">
                Company <span className="text-danger">*</span>
              </label>
              <input
                id="new-driver-company"
                className="form-control"
                required
                value={company}
                onChange={(ev) => setCompany(ev.target.value)}
                disabled={busy}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="new-driver-location">
                Location <span className="text-danger">*</span>
              </label>
              <select
                id="new-driver-location"
                className="form-select"
                required
                value={siteId}
                onChange={(ev) => {
                  setSiteId(ev.target.value);
                  setDivisionName("");
                  setDepartmentId("");
                }}
                disabled={busy}
              >
                <option value="">Select location…</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="new-driver-division">
                Division
              </label>
              <select
                id="new-driver-division"
                className="form-select"
                value={divisionName}
                onChange={(ev) => setDivisionName(ev.target.value)}
                disabled={busy || !siteId}
              >
                <option value="">Select division…</option>
                {divisionsForSite.map((division) => (
                  <option key={`${division.siteId ?? "x"}-${division.name}`} value={division.name}>
                    {division.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="new-driver-department">
                Department
              </label>
              <select
                id="new-driver-department"
                className="form-select"
                value={departmentId}
                onChange={(ev) => setDepartmentId(ev.target.value)}
                disabled={busy || !siteId}
              >
                <option value="">Select department…</option>
                {departmentsForSite.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <div className="mb-4">
          <DotDqfWorksheet
            details={
              locationDepartment && !details.locationDepartment
                ? { ...details, locationDepartment }
                : details
            }
            driverName={driverName || "New driver"}
            tenantSlug={tenantSlug ?? null}
            editing
            canUpload
            disabled={busy}
            onChange={onDetailChange}
          />
        </div>

        <div className="border rounded p-3 mb-4">
          <h6 className="mb-1">Additional DOT fields</h6>
          <p className="text-muted small mb-3">Tenant configured fields for this record type.</p>
          <label className="form-label" htmlFor="new-driver-terminal">
            Terminal code
          </label>
          <input
            id="new-driver-terminal"
            className="form-control"
            value={terminalCode}
            onChange={(ev) => setTerminalCode(ev.target.value)}
            disabled={busy}
          />
        </div>

        <div className="mb-4">
          <label className="form-label" htmlFor="new-driver-notes">
            Notes
          </label>
          <textarea
            id="new-driver-notes"
            className="form-control"
            rows={3}
            value={notes}
            onChange={(ev) => setNotes(ev.target.value)}
            placeholder="Additional compliance notes, corrective actions, or references"
            disabled={busy}
          />
        </div>

        <div className="d-flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create Record"}
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

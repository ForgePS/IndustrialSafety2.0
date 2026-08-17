"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, apiSend, useAuth } from "@forge/web-kit";
import { PersonnelPersonForm } from "@/components/personnel-person-form";
import {
  buildPersonnelPayload,
  emptyPersonnelForm,
  personnelDisplayName,
  type PersonnelFormValues,
} from "@/lib/personnel-form";
import { resolveLookupLabel, type LookupState } from "@/lib/personnel-lookups";

const ROSTER_HREF = "/modules/personnel/";
const PERSONNEL_PATH = "/api/v1/industrial/personnel";

export default function AddPersonPage() {
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canManage =
    permissions.has("industrial.personnel.manage") || permissions.has("industrial.admin");

  const [savedName, setSavedName] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (!canManage) {
    return (
      <div className="ind-addperson">
        <h4 className="fw-bold py-3 mb-3">Add Person</h4>
        <div className="alert alert-warning d-flex align-items-start gap-2" role="alert">
          <i className="bx bx-lock-alt fs-5" aria-hidden="true" />
          <div>
            <h6 className="alert-heading mb-1">You cannot add personnel records</h6>
            <span className="d-block">Missing industrial.personnel.manage</span>
            <Link className="alert-link" href={ROSTER_HREF}>
              Back to Personnel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (savedName) {
    return (
      <div className="ind-addperson">
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 py-3">
          <div>
            <nav aria-label="breadcrumb">
              <ol className="breadcrumb breadcrumb-style1 mb-1">
                <li className="breadcrumb-item">
                  <Link href={ROSTER_HREF}>Personnel</Link>
                </li>
                <li className="breadcrumb-item active" aria-current="page">
                  Add Person
                </li>
              </ol>
            </nav>
            <h4 className="fw-bold mb-0">Add Person</h4>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center py-5" role="status" aria-live="polite">
            <div className="avatar avatar-lg mx-auto mb-3">
              <span className="avatar-initial rounded-circle bg-label-success">
                <i className="bx bx-check bx-sm" aria-hidden="true" />
              </span>
            </div>
            <h5 className="mb-1">{savedName} was added</h5>
            <p className="text-muted mb-4">The record is now on the roster.</p>
            <div className="d-flex flex-wrap justify-content-center gap-2">
              <Link className="btn btn-primary" href={ROSTER_HREF}>
                <i className="bx bx-list-ul me-1" aria-hidden="true" />
                View roster
              </Link>
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => {
                  setSavedName(null);
                  setFormKey((k) => k + 1);
                }}
              >
                <i className="bx bx-plus me-1" aria-hidden="true" />
                Add another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  async function handleCreate(values: PersonnelFormValues, lookups: LookupState) {
    const payload = buildPersonnelPayload(values, (source, id) =>
      resolveLookupLabel(lookups, source, id),
    );
    try {
      await apiSend(PERSONNEL_PATH, "POST", payload);
    } catch (e) {
      throw new Error(e instanceof ApiError ? e.message : "Could not save this person.");
    }
    setSavedName(personnelDisplayName(values) || "Person");
  }

  return (
    <PersonnelPersonForm
      key={formKey}
      mode="create"
      initialValues={emptyPersonnelForm()}
      onSubmit={handleCreate}
      cancelHref={ROSTER_HREF}
      title="Add Person"
      subtitle="Creates a personnel record for this organization. Only status and name are required."
      submitLabel="Save person"
      breadcrumbCurrent="Add Person"
      {...(me?.tenantId ? { tenantId: me.tenantId } : {})}
    />
  );
}

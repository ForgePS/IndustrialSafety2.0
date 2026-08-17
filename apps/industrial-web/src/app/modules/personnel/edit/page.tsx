"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { PersonnelPersonForm } from "@/components/personnel-person-form";
import { personEditHref, personFileHref } from "@/lib/personnel-directory";
import {
  buildPersonnelUpdatePayload,
  personnelFormFromRecord,
  type PersonnelFormValues,
} from "@/lib/personnel-form";
import { stripImportNotes } from "@/lib/personnel-file";
import { resolveLookupLabel, type LookupState } from "@/lib/personnel-lookups";

const ROSTER_HREF = "/modules/personnel/";

function EditPersonInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { me } = useAuth();
  const permissions = new Set(me?.permissions ?? []);
  const canManage =
    permissions.has("industrial.personnel.manage") || permissions.has("industrial.admin");

  const [initialValues, setInitialValues] = useState<PersonnelFormValues | null>(null);
  const [displayLabel, setDisplayLabel] = useState("Person");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const profileHref = useMemo(() => (id ? personFileHref(id) : ROSTER_HREF), [id]);

  const load = useCallback(async () => {
    if (!id) {
      setError("No person was selected.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const record = await apiGet<Record<string, unknown>>(
        `/api/v1/industrial/personnel/${encodeURIComponent(id)}`,
      );
      const form = personnelFormFromRecord(record);
      if (typeof form.notes === "string") {
        form.notes = stripImportNotes(form.notes);
      }
      setInitialValues(form);
      const name =
        (typeof record.displayName === "string" && record.displayName.trim()) ||
        [record.firstName, record.lastName]
          .filter((part): part is string => typeof part === "string" && part.trim() !== "")
          .join(" ") ||
        "Person";
      setDisplayLabel(name);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load this personnel record");
      setInitialValues(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  if (!canManage) {
    return (
      <div className="ind-addperson">
        <h4 className="fw-bold py-3 mb-3">Edit Person</h4>
        <div className="alert alert-warning d-flex align-items-start gap-2" role="alert">
          <i className="bx bx-lock-alt fs-5" aria-hidden="true" />
          <div>
            <h6 className="alert-heading mb-1">You cannot edit personnel records</h6>
            <span className="d-block">Missing industrial.personnel.manage</span>
            <Link className="alert-link" href={ROSTER_HREF}>
              Back to Personnel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <p className="text-muted py-4" role="status">
        Loading personnel record…
      </p>
    );
  }

  if (error || !initialValues) {
    return (
      <div className="ind-addperson">
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 py-3">
          <h4 className="fw-bold mb-0">Edit Person</h4>
          <Link className="btn btn-outline-secondary" href={ROSTER_HREF}>
            Back to Personnel
          </Link>
        </div>
        <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
          <i className="bx bx-error-circle fs-5" aria-hidden="true" />
          <span>{error ?? "Personnel record not found."}</span>
        </div>
      </div>
    );
  }

  async function handleSave(values: PersonnelFormValues, lookups: LookupState) {
    const payload = buildPersonnelUpdatePayload(values, (source, lookupId) =>
      resolveLookupLabel(lookups, source, lookupId),
    );
    try {
      await apiSend(`/api/v1/industrial/personnel/${encodeURIComponent(id)}`, "PATCH", payload);
    } catch (e) {
      throw new Error(e instanceof ApiError ? e.message : "Could not save changes.");
    }
    router.push(personFileHref(id));
  }

  return (
    <PersonnelPersonForm
      key={personEditHref(id)}
      mode="edit"
      initialValues={initialValues}
      onSubmit={handleSave}
      cancelHref={profileHref}
      title={`Edit ${displayLabel}`}
      subtitle="Update this personnel record. Changes appear on the profile after you save."
      submitLabel="Save changes"
      breadcrumbCurrent="Edit"
      {...(me?.tenantId ? { tenantId: me.tenantId } : {})}
    />
  );
}

export default function EditPersonPage() {
  return (
    <Suspense
      fallback={
        <p className="text-muted py-4" role="status">
          Loading personnel record…
        </p>
      }
    >
      <EditPersonInner />
    </Suspense>
  );
}

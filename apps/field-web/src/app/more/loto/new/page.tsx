"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, useAuth } from "@forge/web-kit";
import { FieldOrgCascade, type FieldOrgCascadeValue } from "@/components/field-org-cascade";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { canAuthorFieldLoto, fieldAuthOpts } from "@/lib/field-permissions";
import { fieldLotoApi } from "@/lib/loto-api";
import {
  emptyFieldLotoStep,
  fieldLotoCreatePayload,
  fieldLotoDraftFromDetail,
  fieldLotoUpdatePayload,
  LOTO_ENERGY_TYPES,
  LOTO_LOCKOUT_DEVICE_OPTIONS,
  LOTO_LOCKOUT_METHOD_OPTIONS,
  profileDisplayName,
  type FieldLotoStepDraft,
} from "@/lib/loto";

function createdProcedureId(result: Record<string, unknown>): string {
  const nested =
    result.procedure && typeof result.procedure === "object"
      ? (result.procedure as Record<string, unknown>)
      : null;
  return String(nested?.id ?? result.id ?? "").trim();
}

const EMPTY_ORG: FieldOrgCascadeValue = {
  siteId: "",
  siteName: "",
  divisionName: "",
  departmentId: "",
  departmentName: "",
};

function NewLotoInner() {
  const router = useRouter();
  const search = useSearchParams();
  const editId = (search.get("id") ?? "").trim();
  const startLockout = (search.get("start") ?? "") === "1" && !editId;
  const { me } = useAuth();
  const org = useFieldOrgOptional();
  const { profile } = useFieldProfile();
  const canAuthor = canAuthorFieldLoto(me?.permissions ?? [], fieldAuthOpts(me));

  const [loadingDetail, setLoadingDetail] = useState(Boolean(editId));
  const [existingDetail, setExistingDetail] = useState<Record<string, unknown> | null>(null);
  const [equipmentName, setEquipmentName] = useState("");
  const [orgValue, setOrgValue] = useState<FieldOrgCascadeValue>(EMPTY_ORG);
  const [areaName, setAreaName] = useState("");
  const [restorationLabel, setRestorationLabel] = useState("Guards replaced / personnel clear");
  const [revision, setRevision] = useState("1");
  const [status, setStatus] = useState("DRAFT");
  const [steps, setSteps] = useState<FieldLotoStepDraft[]>([emptyFieldLotoStep()]);
  const [authorizedEmployee, setAuthorizedEmployee] = useState("");
  const [affectedEmployees, setAffectedEmployees] = useState("");
  const [lockTagId, setLockTagId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seededFromOrg, setSeededFromOrg] = useState(false);

  useEffect(() => {
    const name = profileDisplayName(profile);
    if (name && !authorizedEmployee) setAuthorizedEmployee(name);
  }, [profile, authorizedEmployee]);

  // Prefill create form from current Field org selection (like industrial scope defaults).
  useEffect(() => {
    if (editId || seededFromOrg || !org) return;
    if (!org.selection.locationId) {
      setSeededFromOrg(true);
      return;
    }
    const siteId = org.selection.locationId;
    const siteName = org.locations.find((loc) => loc.id === siteId)?.name ?? "";
    const divisionName = org.selection.divisionName;
    const departmentId = org.selection.departmentId;
    const departmentName =
      org.departments.find((dept) => dept.id === departmentId)?.name ?? "";
    setOrgValue({
      siteId,
      siteName,
      divisionName,
      departmentId,
      departmentName,
    });
    setSeededFromOrg(true);
  }, [editId, org, seededFromOrg]);

  useEffect(() => {
    if (!editId || !canAuthor) {
      setLoadingDetail(false);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    void fieldLotoApi
      .getProcedure(editId)
      .then((detail) => {
        if (cancelled) return;
        setExistingDetail(detail);
        const draft = fieldLotoDraftFromDetail(detail);
        setEquipmentName(draft.equipmentName);
        setOrgValue({
          siteId: draft.siteId,
          siteName: draft.siteName,
          divisionName: draft.divisionName,
          departmentId: draft.departmentId,
          departmentName: draft.departmentName,
        });
        setAreaName(draft.areaName);
        setRestorationLabel(draft.restorationLabel);
        setRevision(draft.revision);
        setStatus(draft.status || "DRAFT");
        setSteps(draft.steps);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError || err instanceof Error
            ? err.message
            : "Unable to load procedure for editing.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId, canAuthor]);

  function updateStep(index: number, patch: Partial<FieldLotoStepDraft>) {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  async function submit(issueAfter: boolean) {
    if (!canAuthor) return;
    const name = equipmentName.trim();
    if (!name) {
      setError("Equipment name is required.");
      return;
    }
    if (!orgValue.siteId || !orgValue.divisionName || !orgValue.departmentId) {
      setError("Location, Division, and Department are required.");
      return;
    }
    if (issueAfter && !authorizedEmployee.trim()) {
      setError("Authorized employee is required to start a lockout.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const draftInput = {
        equipmentName: name,
        siteId: orgValue.siteId,
        siteName: orgValue.siteName,
        divisionName: orgValue.divisionName,
        departmentId: orgValue.departmentId,
        departmentName: orgValue.departmentName,
        areaName,
        steps,
        restorationLabel,
        // Industrial create is DRAFT; activate when starting a lockout from Field.
        status: issueAfter ? "ACTIVE" : editId ? status || "DRAFT" : "DRAFT",
        revision,
      };
      const payload =
        editId && existingDetail
          ? fieldLotoUpdatePayload(draftInput, existingDetail)
          : fieldLotoCreatePayload(draftInput);
      const saved = editId
        ? await fieldLotoApi.updateProcedure(editId, payload)
        : await fieldLotoApi.createProcedure(payload);
      const id = editId || createdProcedureId(saved);
      if (!id) throw new Error("Procedure was saved without an id.");
      if (issueAfter) {
        const issued = await fieldLotoApi.issue(id, {
          authorizedEmployee: authorizedEmployee.trim(),
          ...(affectedEmployees.trim() ? { affectedEmployees: affectedEmployees.trim() } : {}),
          ...(lockTagId.trim() ? { lockTagId: lockTagId.trim() } : {}),
          tryStartRequired: true,
          zeroEnergyVerified: false,
        });
        const lockoutId = String(issued.id ?? "").trim();
        router.replace(
          lockoutId
            ? `/loto/${encodeURIComponent(id)}/?lockoutId=${encodeURIComponent(lockoutId)}`
            : `/loto/${encodeURIComponent(id)}/`,
        );
        return;
      }
      router.replace(`/loto/${encodeURIComponent(id)}/`);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Unable to save LOTO procedure.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canAuthor) {
    return (
      <>
        <h1 className="ff-page-title">{editId ? "Edit LOTO" : "Add Procedure"}</h1>
        <p className="ff-page-body">You do not have permission to create or edit lockout procedures.</p>
      </>
    );
  }

  if (loadingDetail) {
    return <p className="ff-page-body">Loading procedure…</p>;
  }

  return (
    <>
      <h1 className="ff-page-title">
        {editId ? "Edit procedure" : startLockout ? "Start lockout" : "Add Procedure"}
      </h1>
      <p className="ff-page-body">
        {editId
          ? "Update Location, Division, Department, equipment, and isolation steps, then save."
          : "Select Location, Division, and Department, name the equipment, add isolation steps, then save as a draft (same as industrial web)."}
      </p>
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="ff-section"
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit(startLockout);
        }}
      >
        <FieldOrgCascade
          idPrefix="loto"
          required
          disabled={busy}
          value={orgValue}
          onChange={setOrgValue}
        />

        <div className="ff-field">
          <label htmlFor="loto-equip">Equipment name</label>
          <input
            id="loto-equip"
            className="ff-input"
            value={equipmentName}
            onChange={(ev) => setEquipmentName(ev.target.value)}
            required
            placeholder="Enter Equipment Name"
          />
        </div>
        <div className="ff-field">
          <label htmlFor="loto-area">Area</label>
          <input
            id="loto-area"
            className="ff-input"
            value={areaName}
            onChange={(ev) => setAreaName(ev.target.value)}
            placeholder="Optional area"
          />
        </div>

        {steps.map((step, index) => (
          <section key={`step-${index}`} className="ff-section" aria-label={`Isolation step ${index + 1}`}>
            <h2 className="ff-section-title">Isolation {index + 1}</h2>
            <div className="ff-field">
              <label htmlFor={`loto-energy-${index}`}>Energy</label>
              <select
                id={`loto-energy-${index}`}
                className="ff-input"
                value={step.energySourceName}
                onChange={(ev) => updateStep(index, { energySourceName: ev.target.value })}
              >
                {LOTO_ENERGY_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="ff-field">
              <label htmlFor={`loto-mag-${index}`}>Magnitude</label>
              <input
                id={`loto-mag-${index}`}
                className="ff-input"
                value={step.energyMagnitude}
                onChange={(ev) => updateStep(index, { energyMagnitude: ev.target.value })}
                placeholder="480V"
              />
            </div>
            <div className="ff-field">
              <label htmlFor={`loto-loc-${index}`}>Isolation point</label>
              <input
                id={`loto-loc-${index}`}
                className="ff-input"
                value={step.isolationLocationText}
                onChange={(ev) => updateStep(index, { isolationLocationText: ev.target.value })}
              />
            </div>
            <div className="ff-field">
              <label htmlFor={`loto-device-${index}`}>Device</label>
              <select
                id={`loto-device-${index}`}
                className="ff-input"
                value={step.lockoutDeviceName}
                onChange={(ev) => updateStep(index, { lockoutDeviceName: ev.target.value })}
              >
                {LOTO_LOCKOUT_DEVICE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="ff-field">
              <label htmlFor={`loto-method-${index}`}>Method</label>
              <select
                id={`loto-method-${index}`}
                className="ff-input"
                value={step.isolationAction}
                onChange={(ev) => updateStep(index, { isolationAction: ev.target.value })}
              >
                {LOTO_LOCKOUT_METHOD_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="ff-field">
              <label htmlFor={`loto-verify-${index}`}>Verify</label>
              <input
                id={`loto-verify-${index}`}
                className="ff-input"
                value={step.verificationMethodName}
                onChange={(ev) => updateStep(index, { verificationMethodName: ev.target.value })}
              />
            </div>
            <div className="ff-field">
              <label htmlFor={`loto-desc-code-${index}`}>Description code</label>
              <input
                id={`loto-desc-code-${index}`}
                className="ff-input"
                value={step.descriptionCode}
                onChange={(ev) => updateStep(index, { descriptionCode: ev.target.value })}
                placeholder="Optional energy letter / code"
              />
            </div>
            <div className="ff-field">
              <label htmlFor={`loto-custom-desc-${index}`}>Enter your own description</label>
              <input
                id={`loto-custom-desc-${index}`}
                className="ff-input"
                value={step.customDescription}
                onChange={(ev) => updateStep(index, { customDescription: ev.target.value })}
                placeholder="Used on QR label prints when selected"
              />
              <p className="ff-meta">Shown on Brady Print Label when selected — not on the printable sheet.</p>
            </div>
            {steps.length > 1 ? (
              <button
                type="button"
                className="ff-btn ff-btn-secondary"
                onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
              >
                Remove step
              </button>
            ) : null}
          </section>
        ))}

        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          onClick={() => setSteps((prev) => [...prev, emptyFieldLotoStep()])}
        >
          Add isolation step
        </button>

        <div className="ff-field">
          <label htmlFor="loto-restore">Restoration</label>
          <input
            id="loto-restore"
            className="ff-input"
            value={restorationLabel}
            onChange={(ev) => setRestorationLabel(ev.target.value)}
          />
        </div>

        {!editId ? (
          <>
            <div className="ff-field">
              <label htmlFor="loto-auth">Authorized employee</label>
              <input
                id="loto-auth"
                className="ff-input"
                value={authorizedEmployee}
                onChange={(ev) => setAuthorizedEmployee(ev.target.value)}
              />
            </div>
            <div className="ff-field">
              <label htmlFor="loto-affected">Affected employees</label>
              <input
                id="loto-affected"
                className="ff-input"
                value={affectedEmployees}
                onChange={(ev) => setAffectedEmployees(ev.target.value)}
              />
            </div>
            <div className="ff-field">
              <label htmlFor="loto-tag">Lock / tag ID</label>
              <input
                id="loto-tag"
                className="ff-input"
                value={lockTagId}
                onChange={(ev) => setLockTagId(ev.target.value)}
              />
            </div>
          </>
        ) : null}

        <div className="ff-action-grid">
          {!editId ? (
            <button type="button" className="ff-btn" disabled={busy} onClick={() => void submit(true)}>
              Save and start lockout
            </button>
          ) : null}
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            disabled={busy}
            onClick={() => void submit(false)}
          >
            {editId ? "Save changes" : "Save Draft"}
          </button>
          {editId ? (
            <button
              type="button"
              className="ff-btn ff-btn-secondary"
              disabled={busy}
              onClick={() => router.push(`/loto/${encodeURIComponent(editId)}/`)}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </>
  );
}

export default function NewLotoPage() {
  return (
    <Suspense fallback={<p className="ff-page-body">Loading…</p>}>
      <NewLotoInner />
    </Suspense>
  );
}

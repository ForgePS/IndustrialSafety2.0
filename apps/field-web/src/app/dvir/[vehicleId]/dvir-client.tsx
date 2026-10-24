"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { FormSignaturePad } from "@/components/form-signature-pad";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { hasFieldPermission } from "@/lib/field-permissions";
import {
  buildDvirSubmitPayload,
  emptyDvirForm,
  tripTypeLabel,
  validateDvirDriverSubmit,
  type DvirAnswerValue,
  type DvirFormState,
  type DvirItemAnswer,
} from "@/lib/dvir";
import { fleetDisplayName, type FleetVehicleItem } from "@/lib/operations";
import { operationsApi } from "@/lib/operations-api";
import { ensureSignatureDataUrl } from "@/lib/signature-data-url";

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function DvirInner() {
  const params = useParams<{ vehicleId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const org = useFieldOrgOptional();
  const { profile } = useFieldProfile();
  const { moduleEnabled, permissions, opts } = useFieldPermissions();
  const vehicleId = String(params?.vehicleId ?? "").trim();
  const tripFromQuery = String(search.get("trip") ?? search.get("tripType") ?? "")
    .trim()
    .toUpperCase();
  const initialTrip = tripFromQuery === "POST_TRIP" ? "POST_TRIP" : "PRE_TRIP";
  const [vehicle, setVehicle] = useState<FleetVehicleItem | null>(null);
  const [form, setForm] = useState<DvirFormState>(() =>
    emptyDvirForm({ inspectionDate: todayIsoDate(), tripType: initialTrip }),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const canInspect = hasFieldPermission(permissions, "field.fleet.inspect", opts);
  const enabled = moduleEnabled("DOT_COMPLIANCE") || moduleEnabled("FLEET");

  useEffect(() => {
    if (!vehicleId || vehicleId === "placeholder") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void operationsApi
      .getFleetVehicle(vehicleId)
      .then((row) => {
        if (cancelled) return;
        setVehicle(row);
        const unit = String(row.assetNumber ?? row.licensePlate ?? "").trim();
        setForm(
          emptyDvirForm({
            inspectionDate: todayIsoDate(),
            vehicleId,
            truckNumber: unit,
            workerName: String(profile?.displayName ?? "").trim(),
            tripType: initialTrip,
          }),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load vehicle");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, profile?.displayName, initialTrip]);

  const sections = useMemo(() => {
    const groups: Record<string, DvirItemAnswer[]> = { truck: [], safety: [], trailer: [] };
    for (const item of form.items) {
      const key = item.section === "trailer" || item.section === "safety" ? item.section : "truck";
      groups[key] = groups[key] ?? [];
      groups[key].push(item);
    }
    return groups;
  }, [form.items]);

  function setItemAnswer(id: string, answer: DvirAnswerValue) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, answer } : item)),
    }));
  }

  function setItemNotes(id: string, notes: string) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, notes } : item)),
    }));
  }

  async function submit() {
    const withSig: DvirFormState = {
      ...form,
      driverSignatureDataUrl: ensureSignatureDataUrl(form.driverSignatureDataUrl),
    };
    const validation = validateDvirDriverSubmit(withSig);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = buildDvirSubmitPayload(withSig, "office");
      const created = await operationsApi.submitDvir({
        ...payload,
        title: `${tripTypeLabel(withSig.tripType)} DVIR ${withSig.truckNumber}`,
        siteId: vehicle?.siteId || org?.selection.locationId || null,
        vehicleId,
      });
      setSuccessId(String(created.id ?? "ok"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit DVIR");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled || !canInspect) {
    return (
      <EmptyState
        title="DOT / DVIR unavailable"
        message={
          !canInspect
            ? "Fleet inspect permission is required."
            : "DOT Compliance / Fleet is not enabled for this company."
        }
      />
    );
  }

  if (!vehicleId || vehicleId === "placeholder") {
    return (
      <EmptyState
        title="Select a vehicle"
        message="Open DOT / DVIR from Me Tools or scan a fleet QR."
      />
    );
  }

  if (loading) return <LoadingState label="Loading DVIR…" />;
  if (error && !vehicle) {
    return <ErrorState title="DVIR unavailable" message={error} onRetry={() => router.refresh()} />;
  }

  if (successId) {
    return (
      <>
        <h1 className="ff-page-title">DVIR submitted</h1>
        <p className="ff-page-body">
          {tripTypeLabel(form.tripType)} report for {form.truckNumber || "unit"} is on file.
        </p>
        <button
          type="button"
          className="ff-btn"
          onClick={() => router.push(`/equipment/${encodeURIComponent(vehicleId)}/?kind=vehicle`)}
        >
          Back to vehicle
        </button>
      </>
    );
  }

  return (
    <>
      <p className="ff-brand-mark">DVIR</p>
      <h1 className="ff-page-title">
        {vehicle ? fleetDisplayName(vehicle) : "Driver vehicle inspection"}
      </h1>
      <p className="ff-page-body">
        Complete every item. Answer No requires a note.{" "}
        {org?.selection.locationName ? `Location: ${org.selection.locationName}.` : null}
      </p>
      {error ? <p className="ff-error">{error}</p> : null}

      <label className="ff-field">
        <span className="ff-label">Trip type</span>
        <select
          className="ff-select"
          value={form.tripType}
          disabled={busy}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              tripType: e.target.value === "POST_TRIP" ? "POST_TRIP" : "PRE_TRIP",
            }))
          }
        >
          <option value="PRE_TRIP">Pre-trip</option>
          <option value="POST_TRIP">Post-trip</option>
        </select>
      </label>

      <label className="ff-field">
        <span className="ff-label">Inspection date</span>
        <input
          className="ff-input"
          type="date"
          value={form.inspectionDate}
          disabled={busy}
          onChange={(e) => setForm((prev) => ({ ...prev, inspectionDate: e.target.value }))}
        />
      </label>

      <label className="ff-field">
        <span className="ff-label">Truck / tractor number</span>
        <input
          className="ff-input"
          value={form.truckNumber}
          disabled={busy}
          onChange={(e) => setForm((prev) => ({ ...prev, truckNumber: e.target.value }))}
        />
      </label>

      <label className="ff-field">
        <span className="ff-label">Trailer number(s)</span>
        <input
          className="ff-input"
          value={form.trailerNumbers}
          disabled={busy}
          onChange={(e) => setForm((prev) => ({ ...prev, trailerNumbers: e.target.value }))}
        />
      </label>

      <label className="ff-field">
        <span className="ff-label">Driver name</span>
        <input
          className="ff-input"
          value={form.workerName}
          disabled={busy}
          onChange={(e) => setForm((prev) => ({ ...prev, workerName: e.target.value }))}
        />
      </label>

      {(["truck", "safety", "trailer"] as const).map((section) => (
        <section key={section} className="ff-section" aria-label={`${section} checklist`}>
          <h2 className="ff-section-title">
            {section === "truck"
              ? "Truck / tractor"
              : section === "safety"
                ? "Safety equipment"
                : "Trailer"}
          </h2>
          <div className="ff-stack-list">
            {(sections[section] ?? []).map((item) => (
              <div key={item.id} className="ff-placeholder-card">
                <strong>{item.label}</strong>
                <div className="ff-tabs" style={{ marginTop: 8 }}>
                  {(["YES", "NO", "NA"] as const).map((answer) => (
                    <button
                      key={answer}
                      type="button"
                      className={item.answer === answer ? "ff-tab ff-tab-active" : "ff-tab"}
                      disabled={busy}
                      onClick={() => setItemAnswer(item.id, answer)}
                    >
                      {answer === "NA" ? "N/A" : answer === "YES" ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
                {item.answer === "NO" ? (
                  <input
                    className="ff-input"
                    style={{ marginTop: 8 }}
                    value={item.notes}
                    disabled={busy}
                    placeholder="Defect note required"
                    onChange={(e) => setItemNotes(item.id, e.target.value)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}

      <label className="ff-field">
        <span className="ff-label">Remarks</span>
        <textarea
          className="ff-textarea"
          value={form.remarks}
          disabled={busy}
          rows={3}
          onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
        />
      </label>

      <label className="ff-field">
        <span className="ff-label">Condition satisfactory</span>
        <select
          className="ff-select"
          value={form.conditionSatisfactory ? "yes" : "no"}
          disabled={busy}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, conditionSatisfactory: e.target.value === "yes" }))
          }
        >
          <option value="yes">Yes</option>
          <option value="no">No — defects present</option>
        </select>
      </label>

      <div className="ff-field">
        <span className="ff-label">Driver signature</span>
        <FormSignaturePad
          value={form.driverSignatureDataUrl}
          disabled={busy}
          onChange={(value) => setForm((prev) => ({ ...prev, driverSignatureDataUrl: value }))}
        />
      </div>

      <button type="button" className="ff-btn" disabled={busy} onClick={() => void submit()}>
        {busy ? "Submitting…" : "Submit DVIR"}
      </button>
    </>
  );
}

export function DvirClient() {
  return (
    <Suspense fallback={<LoadingState label="Loading DVIR…" />}>
      <DvirInner />
    </Suspense>
  );
}

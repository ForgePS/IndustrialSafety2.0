"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, LoadingState } from "@/components/field-states";
import { FieldPhotoMarkupGate } from "@/components/field-photo-markup-gate";
import { useFieldOrg } from "@/components/field-org-provider";
import { useFieldProfile } from "@/hooks/use-field-profile";
import { fieldReportApi } from "@/lib/report-api";
import {
  BODY_AREA_OPTIONS,
  clearReportDraft,
  compressReportPhoto,
  defaultWhenIso,
  EMPTY_REPORT_DRAFT,
  loadReportDraft,
  REPORT_TYPE_META,
  saveReportDraft,
  validateReportDraft,
  type FieldReportDraft,
  type FieldReportPhoto,
  type FieldReportType,
} from "@/lib/field-reports";

type Step =
  | "loading"
  | "kind"
  | "what"
  | "org"
  | "when"
  | "details"
  | "injury"
  | "hazard"
  | "photos"
  | "actions"
  | "review"
  | "success"
  | "error";

function stepsForType(type: FieldReportType): Step[] {
  if (type === "observation") {
    return ["kind", "what", "org", "when", "details", "photos", "actions", "review"];
  }
  if (type === "hazard") {
    return ["what", "org", "when", "hazard", "photos", "actions", "review"];
  }
  if (type === "equipment") {
    return ["what", "org", "when", "hazard", "photos", "actions", "review"];
  }
  if (type === "near-miss") {
    return ["what", "org", "when", "details", "photos", "actions", "review"];
  }
  // incident + security
  return ["what", "org", "when", "details", "injury", "photos", "actions", "review"];
}

export function FieldReportRunner({ reportType }: { reportType: FieldReportType }) {
  const router = useRouter();
  const search = useSearchParams();
  const org = useFieldOrg();
  const { profile } = useFieldProfile();
  const meta = REPORT_TYPE_META[reportType];
  const flow = useMemo(() => stepsForType(reportType), [reportType]);

  const [step, setStep] = useState<Step>("loading");
  const [draft, setDraft] = useState<FieldReportDraft>(() => ({
    ...EMPTY_REPORT_DRAFT,
    type: reportType,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<FieldReportPhoto | null>(null);
  const bootstrapped = useRef(false);
  const saveTimer = useRef<number | null>(null);

  const stepIndex = Math.max(0, flow.indexOf(step as (typeof flow)[number]));
  const progress = flow.length ? Math.round(((stepIndex + 1) / flow.length) * 100) : 0;

  const persist = useCallback(
    (next: FieldReportDraft) => {
      saveReportDraft(reportType, next);
      setSaveHint("Draft saved on device");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => setSaveHint("Draft saved"), 400);
    },
    [reportType],
  );

  const patchDraft = useCallback(
    (partial: Partial<FieldReportDraft>) => {
      setDraft((prev) => {
        const next = { ...prev, ...partial, type: reportType };
        persist(next);
        return next;
      });
    },
    [persist, reportType],
  );

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const stored = loadReportDraft(reportType);
    const locationName =
      org.selection.locationName ||
      org.locations.find((l) => l.id === org.selection.locationId)?.name ||
      "";
    const departmentName =
      org.selection.departmentName ||
      org.departments.find((d) => d.id === org.selection.departmentId)?.name ||
      "";

    const seeded: FieldReportDraft = {
      ...(stored ?? EMPTY_REPORT_DRAFT),
      type: reportType,
      divisionName: stored?.divisionName || org.selection.divisionName || "",
      locationId: stored?.locationId || org.selection.locationId || "",
      locationName: stored?.locationName || locationName,
      departmentId: stored?.departmentId || org.selection.departmentId || "",
      departmentName: stored?.departmentName || departmentName,
      whenIso: stored?.whenIso || defaultWhenIso(),
    };

    // Query context from Location / Equipment / Scan hubs
    const qLocationId = search.get("locationId") || search.get("siteId");
    const qEquipmentId = search.get("equipmentId") || search.get("targetId");
    const qTargetType = search.get("targetType");
    const qQrLinkId = search.get("qrLinkId");
    if (qLocationId) {
      seeded.locationId = qLocationId;
      seeded.locationName =
        org.locations.find((l) => l.id === qLocationId)?.name || seeded.locationName;
    }
    if (qEquipmentId) {
      seeded.equipmentId = qEquipmentId;
      seeded.targetId = qEquipmentId;
    }
    if (qTargetType) seeded.targetType = qTargetType;
    if (qQrLinkId) seeded.qrLinkId = qQrLinkId;

    setDraft(seeded);
    setStep(flow[0] ?? "what");
  }, [flow, org, reportType, search]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  function goNext() {
    const idx = flow.indexOf(step as (typeof flow)[number]);
    const next = flow[idx + 1];
    if (next) setStep(next);
  }

  function goBack() {
    const idx = flow.indexOf(step as (typeof flow)[number]);
    if (idx <= 0) {
      router.push("/report/");
      return;
    }
    setStep(flow[idx - 1]!);
  }

  async function onAddPhotos(files: FileList | null) {
    if (!files?.length) return;
    if (draft.photos.length >= 8) return;
    setBusy(true);
    setError(null);
    try {
      const file = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      const photo = await compressReportPhoto(file);
      setPendingPhoto(photo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add photo");
    } finally {
      setBusy(false);
    }
  }

  function commitReportPhoto(photo: FieldReportPhoto) {
    patchDraft({ photos: [...draft.photos, photo].slice(0, 8) });
    setPendingPhoto(null);
  }

  async function submit() {
    const validation = validateReportDraft(draft);
    if (!validation.ok) {
      setError(validation.message);
      if (validation.step && flow.includes(validation.step as Step)) {
        setStep(validation.step as Step);
      }
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reporter =
        profile?.displayName ||
        [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
        "Field user";
      const result = await fieldReportApi.submit(draft, reporter);
      clearReportDraft(reportType);
      setResultId(result.id);
      setQueuedOffline(Boolean(result.queued));
      setStep("success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit report");
    } finally {
      setBusy(false);
    }
  }

  if (step === "loading") return <LoadingState label="Opening report…" />;

  if (step === "success") {
    return (
      <>
        <p className="ff-brand-mark">{queuedOffline ? "Queued" : "Submitted"}</p>
        <h1 className="ff-page-title">
          {queuedOffline ? `${meta.label} saved on device` : `${meta.label} submitted`}
        </h1>
        <EmptyState
          title={
            queuedOffline
              ? "Will sync when you are back online"
              : "Sent to Forge Industrial Safety"
          }
          message={
            queuedOffline
              ? "Your report is in the offline queue. The shell banner shows pending sync count."
              : draft.oshaRelevant || draft.injuryIllness === "yes"
                ? "OSHA review stays on the desktop platform. Your operational details were captured."
                : "Supervisors can continue investigation from the administrative workspace."
          }
        />
        {resultId && !queuedOffline ? <p className="ff-meta">Record ID · {resultId}</p> : null}
        <div className="ff-action-grid">
          <button type="button" className="ff-btn" onClick={() => router.push("/")}>
            Home
          </button>
          <button type="button" className="ff-btn ff-btn-secondary" onClick={() => router.push("/report/")}>
            Report another
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="ff-brand-mark">Report</p>
      <h1 className="ff-page-title">{meta.label}</h1>
      <div className="ff-progress-wrap" aria-label={`Progress ${progress}%`}>
        <div className="ff-progress-bar" style={{ width: `${Math.max(8, progress)}%` }} />
      </div>
      <p className="ff-hint ff-hint--left">
        Step {stepIndex + 1} of {flow.length}
        {saveHint ? ` · ${saveHint}` : ""}
      </p>
      {error ? (
        <p className="ff-error" role="alert">
          {error}
        </p>
      ) : null}

      {step === "kind" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">What kind of observation?</h2>
          <div className="ff-answer-row">
            <button
              type="button"
              className={`ff-answer-btn ff-answer-yes ${draft.observationKind === "SAFE" ? "" : ""}`}
              onClick={() => {
                patchDraft({ observationKind: "SAFE", hazardLevel: "low" });
                goNext();
              }}
            >
              SAFE
            </button>
            <button
              type="button"
              className="ff-answer-btn ff-answer-no"
              onClick={() => {
                patchDraft({ observationKind: "UNSAFE", hazardLevel: "medium" });
                goNext();
              }}
            >
              UNSAFE
            </button>
          </div>
        </section>
      ) : null}

      {step === "what" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">What happened?</h2>
          <div className="ff-field">
            <label htmlFor="report-what">Description</label>
            <textarea
              id="report-what"
              className="ff-input"
              style={{ minHeight: 140, padding: 14, width: "100%" }}
              value={draft.whatHappened}
              onChange={(e) => patchDraft({ whatHappened: e.target.value })}
              placeholder="Short description of what you saw or what happened"
            />
          </div>
          {(reportType === "observation" || reportType === "near-miss") && (
            <label className="ff-check-row">
              <input
                type="checkbox"
                checked={draft.anonymous}
                onChange={(e) => patchDraft({ anonymous: e.target.checked })}
              />
              <span>Submit anonymously</span>
            </label>
          )}
        </section>
      ) : null}

      {step === "org" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Where?</h2>
          <div className="ff-field">
            <label htmlFor="report-division">Division</label>
            <select
              id="report-division"
              className="ff-input"
              value={draft.divisionName}
              onChange={(e) => patchDraft({ divisionName: e.target.value })}
            >
              <option value="">Select division</option>
              {org.divisions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="ff-field">
            <label htmlFor="report-location">Location</label>
            <select
              id="report-location"
              className="ff-input"
              value={draft.locationId}
              onChange={(e) => {
                const id = e.target.value;
                const name = org.locations.find((l) => l.id === id)?.name ?? "";
                patchDraft({ locationId: id, locationName: name });
              }}
            >
              <option value="">Select location</option>
              {org.locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="ff-field">
            <label htmlFor="report-department">Department</label>
            <select
              id="report-department"
              className="ff-input"
              value={draft.departmentId}
              onChange={(e) => {
                const id = e.target.value;
                const dep = org.departments.find((d) => d.id === id);
                patchDraft({
                  departmentId: id,
                  departmentName: dep?.name ?? "",
                  ...(dep?.divisionName ? { divisionName: dep.divisionName } : {}),
                });
              }}
            >
              <option value="">Select department</option>
              {org.departments
                .filter(
                  (d) =>
                    !draft.locationId || !d.locationId || d.locationId === draft.locationId,
                )
                .map((dep) => (
                  <option key={dep.id} value={dep.id}>
                    {dep.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="ff-field">
            <label htmlFor="report-area">Exact area</label>
            <input
              id="report-area"
              className="ff-input"
              value={draft.areaDetail}
              onChange={(e) => patchDraft({ areaDetail: e.target.value })}
              placeholder="Bay, line, room…"
            />
          </div>
        </section>
      ) : null}

      {step === "when" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">When?</h2>
          <div className="ff-field">
            <label htmlFor="report-when">Date &amp; time</label>
            <input
              id="report-when"
              className="ff-input"
              type="datetime-local"
              value={draft.whenIso}
              onChange={(e) => patchDraft({ whenIso: e.target.value })}
            />
          </div>
        </section>
      ) : null}

      {step === "details" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Details</h2>
          {reportType === "incident" ? (
            <div className="ff-field">
              <label htmlFor="report-incident-type">Incident type</label>
              <select
                id="report-incident-type"
                className="ff-input"
                value={draft.incidentSubtype}
                onChange={(e) =>
                  patchDraft({
                    incidentSubtype: e.target.value as FieldReportDraft["incidentSubtype"],
                    injuryIllness: e.target.value === "injury" ? "yes" : draft.injuryIllness,
                    oshaRelevant: e.target.value === "injury" ? true : draft.oshaRelevant,
                  })
                }
              >
                <option value="">Select…</option>
                <option value="injury">Injury / illness</option>
                <option value="property">Property damage</option>
                <option value="fire">Fire</option>
                <option value="other">Other</option>
              </select>
            </div>
          ) : null}
          {reportType === "observation" ? (
            <div className="ff-field">
              <label htmlFor="obs-cat">Category</label>
              <input
                id="obs-cat"
                className="ff-input"
                value={draft.observationCategory}
                onChange={(e) => patchDraft({ observationCategory: e.target.value })}
                placeholder="PPE, housekeeping, behavior…"
              />
            </div>
          ) : null}
          <div className="ff-field">
            <label htmlFor="who">Who was involved?</label>
            <input
              id="who"
              className="ff-input"
              value={draft.whoInvolved}
              onChange={(e) => patchDraft({ whoInvolved: e.target.value })}
              placeholder="Name or role (optional)"
            />
          </div>
          <div className="ff-field">
            <label htmlFor="equip">Equipment / property</label>
            <input
              id="equip"
              className="ff-input"
              value={draft.equipmentProperty}
              onChange={(e) => patchDraft({ equipmentProperty: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="ff-field">
            <label htmlFor="witness">Witnesses</label>
            <input
              id="witness"
              className="ff-input"
              value={draft.witnesses}
              onChange={(e) => patchDraft({ witnesses: e.target.value })}
              placeholder="Optional"
            />
          </div>
          {(reportType === "incident" || reportType === "security") && (
            <div className="ff-field">
              <label htmlFor="report-severity">Severity</label>
              <select
                id="report-severity"
                className="ff-input"
                value={draft.severity}
                onChange={(e) =>
                  patchDraft({ severity: e.target.value as FieldReportDraft["severity"] })
                }
              >
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          )}
        </section>
      ) : null}

      {step === "injury" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Injury / illness</h2>
          <p className="ff-page-body">
            Collect operational facts only. Medical records and OSHA forms stay restricted on
            desktop.
          </p>
          <div className="ff-answer-row">
            {(["yes", "no", "unknown"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`ff-btn ${draft.injuryIllness === value ? "" : "ff-btn-secondary"}`}
                onClick={() =>
                  patchDraft({
                    injuryIllness: value,
                    oshaRelevant: value === "yes",
                    incidentSubtype: value === "yes" ? "injury" : draft.incidentSubtype,
                  })
                }
              >
                {value === "yes" ? "Yes" : value === "no" ? "No" : "Unknown"}
              </button>
            ))}
          </div>
          {draft.injuryIllness === "yes" ? (
            <>
              <p className="ff-section-title" style={{ marginTop: 16 }}>
                Body areas
              </p>
              <div className="ff-action-grid">
                {BODY_AREA_OPTIONS.map((area) => {
                  const on = draft.bodyAreas.includes(area);
                  return (
                    <button
                      key={area}
                      type="button"
                      className={`ff-btn ${on ? "" : "ff-btn-secondary"}`}
                      onClick={() =>
                        patchDraft({
                          bodyAreas: on
                            ? draft.bodyAreas.filter((a) => a !== area)
                            : [...draft.bodyAreas, area],
                        })
                      }
                    >
                      {area}
                    </button>
                  );
                })}
              </div>
              <div className="ff-field" style={{ marginTop: 12 }}>
                <label htmlFor="work-day">Work day details (optional)</label>
                <textarea
                  id="work-day"
                  className="ff-input"
                  style={{ minHeight: 88, padding: 12, width: "100%" }}
                  value={draft.workDayDetails}
                  onChange={(e) => patchDraft({ workDayDetails: e.target.value })}
                  placeholder="Shift start, task being performed…"
                />
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {step === "hazard" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">
            {reportType === "equipment" ? "How urgent?" : "Hazard level"}
          </h2>
          <div className="ff-action-grid">
            {(["low", "medium", "high", "critical"] as const).map((level) => (
              <button
                key={level}
                type="button"
                className={`ff-btn ${draft.hazardLevel === level ? "" : "ff-btn-secondary"}`}
                onClick={() => patchDraft({ hazardLevel: level })}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
          {reportType === "equipment" ? (
            <label className="ff-check-row" style={{ marginTop: 16 }}>
              <input
                type="checkbox"
                checked={draft.outOfService}
                onChange={(e) => patchDraft({ outOfService: e.target.checked })}
              />
              <span>Mark equipment out of service / immediate hazard</span>
            </label>
          ) : null}
        </section>
      ) : null}

      {step === "photos" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Photos</h2>
          <label className="ff-btn ff-btn-secondary" style={{ display: "block", textAlign: "center" }}>
            Add photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => void onAddPhotos(e.target.files)}
            />
          </label>
          {draft.photos.length > 0 ? (
            <div className="ff-photo-grid" style={{ marginTop: 12 }}>
              {draft.photos.map((photo) => (
                <div key={photo.id} className="ff-photo-thumb" style={{ position: "relative" }}>
                  <img src={photo.dataUrl} alt={photo.fileName} />
                  {photo.hasMarkup ? (
                    <span
                      style={{
                        position: "absolute",
                        left: 4,
                        bottom: 4,
                        background: "rgba(37,99,235,0.92)",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      MARKED
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="ff-btn ff-btn-secondary"
                    onClick={() =>
                      patchDraft({ photos: draft.photos.filter((p) => p.id !== photo.id) })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="ff-meta">Optional — photos help investigation.</p>
          )}
          <FieldPhotoMarkupGate
            open={Boolean(pendingPhoto)}
            module="reports"
            pending={pendingPhoto ? { original: pendingPhoto } : null}
            onCancel={() => setPendingPhoto(null)}
            onSaveWithoutMarkup={(photo) => commitReportPhoto(photo)}
            onSaveWithMarkup={(photo) => commitReportPhoto(photo)}
          />
        </section>
      ) : null}

      {step === "actions" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Immediate actions taken</h2>
          <div className="ff-field">
            <label htmlFor="actions">What did you do?</label>
            <textarea
              id="actions"
              className="ff-input"
              style={{ minHeight: 120, padding: 14, width: "100%" }}
              value={draft.immediateActions}
              onChange={(e) => patchDraft({ immediateActions: e.target.value })}
              placeholder="Area secured, supervisor notified, first aid…"
            />
          </div>
        </section>
      ) : null}

      {step === "review" ? (
        <section className="ff-section">
          <h2 className="ff-section-title">Review</h2>
          <div className="ff-work-summary">
            <div className="ff-work-row">
              <span>Type</span>
              <span>{meta.label}</span>
            </div>
            <div className="ff-work-row">
              <span>Where</span>
              <span>
                {[draft.divisionName, draft.locationName, draft.departmentName]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
            </div>
            <div className="ff-work-row">
              <span>When</span>
              <span>{draft.whenIso || "—"}</span>
            </div>
            <div className="ff-work-row">
              <span>Photos</span>
              <span>{draft.photos.length}</span>
            </div>
            {draft.injuryIllness === "yes" ? (
              <div className="ff-work-row">
                <span>OSHA handoff</span>
                <span>Operational data captured</span>
              </div>
            ) : null}
          </div>
          <p className="ff-page-body">{draft.whatHappened}</p>
        </section>
      ) : null}

      <div className="ff-action-grid" style={{ marginTop: 16 }}>
        {step === "review" ? (
          <button type="button" className="ff-btn" disabled={busy} onClick={() => void submit()}>
            {busy ? "Submitting…" : "Submit"}
          </button>
        ) : step !== "kind" ? (
          <button
            type="button"
            className="ff-btn"
            disabled={busy}
            onClick={() => {
              setError(null);
              goNext();
            }}
          >
            Next
          </button>
        ) : null}
        <button type="button" className="ff-btn ff-btn-secondary" disabled={busy} onClick={goBack}>
          Back
        </button>
      </div>
    </>
  );
}

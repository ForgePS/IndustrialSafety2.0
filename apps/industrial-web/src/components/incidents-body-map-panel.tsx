"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRegisterUnsavedChanges } from "@/components/unsaved-changes-guard";
import { IncidentBodyMap } from "@/components/incident-body-map";
import {
  aggregateBodyLocations,
  aggregateByOshaPart,
  bodyLocationSummaryLabel,
  bodyMapYearOptions,
  filterIncidentsByBodyRegion,
  filterIncidentsByOshaPart,
  filterIncidentsByYearScope,
  maxRegionCount,
  parseBodyMapYearScope,
  regionById,
  toggleBodyLocation,
  type BodyMapYearScope,
} from "@/lib/incident-body-map";
import {
  incidentOptionLabel,
  incidentReportHref,
  statusBadgeClass,
  type IncidentRecord,
} from "@/lib/incidents-module";

const HEAT_LEGEND: ReadonlyArray<{ tone: string; label: string }> = [
  { tone: "info", label: "Lower" },
  { tone: "warning", label: "Moderate" },
  { tone: "danger", label: "Higher" },
];

type PopupFocus =
  | { type: "region"; regionId: string }
  | { type: "osha"; oshaPart: string };

type Props = {
  incidents: IncidentRecord[];
  /** Compact card for dashboard / Injuries footer. */
  compact?: boolean;
  /** Optional title override. */
  title?: string;
  /** When set, show a link into the full Injury Map tab. */
  mapHref?: string;
  /** Prefill focused region from ?region= (Injury Map deep link). */
  initialRegionId?: string | null;
  /** Selected injury for editing body locations on Tim. */
  selectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;
  canManage?: boolean;
  onSaveLocations?: (incidentId: string, bodyLocations: string[]) => Promise<void>;
};

/**
 * Safety Tim panel — year-scoped severity arrows for injury locations, or
 * interactive marking when an incident is selected. Click a count to open
 * matching injuries in a popup.
 */
export function IncidentsBodyMapPanel({
  incidents,
  compact = false,
  title = "Injury locations",
  mapHref,
  initialRegionId = null,
  selectedId = null,
  onSelectedIdChange,
  canManage = false,
  onSaveLocations,
}: Props) {
  const yearOptions = useMemo(() => bodyMapYearOptions(incidents), [incidents]);
  const [yearScope, setYearScope] = useState<BodyMapYearScope>("ytd");
  const [focusedRegionId, setFocusedRegionId] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupFocus | null>(
    initialRegionId ? { type: "region", regionId: initialRegionId } : null,
  );

  useEffect(() => {
    if (!initialRegionId) return;
    setFocusedRegionId(initialRegionId);
    setPopup({ type: "region", regionId: initialRegionId });
  }, [initialRegionId]);

  useEffect(() => {
    if (!popup) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePopup();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [popup]);

  const scopedIncidents = useMemo(
    () => filterIncidentsByYearScope(incidents, yearScope),
    [incidents, yearScope],
  );

  const selected = useMemo(
    () => (selectedId ? (incidents.find((incident) => incident.id === selectedId) ?? null) : null),
    [incidents, selectedId],
  );

  const counts = useMemo(() => aggregateBodyLocations(scopedIncidents), [scopedIncidents]);
  const maxCount = useMemo(() => maxRegionCount(counts), [counts]);
  const partRanking = useMemo(() => aggregateByOshaPart(scopedIncidents), [scopedIncidents]);
  const mappedIncidents = useMemo(
    () => scopedIncidents.filter((incident) => incident.bodyLocations.length > 0).length,
    [scopedIncidents],
  );

  const popupTitle =
    popup?.type === "region"
      ? (regionById(popup.regionId)?.part ?? "Body area")
      : popup?.type === "osha"
        ? popup.oshaPart
        : "";

  const popupIncidents = useMemo(() => {
    if (!popup) return [];
    if (popup.type === "region") {
      return filterIncidentsByBodyRegion(scopedIncidents, popup.regionId);
    }
    return filterIncidentsByOshaPart(scopedIncidents, popup.oshaPart);
  }, [popup, scopedIncidents]);

  const [draftLocations, setDraftLocations] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftLocations(selected ? [...selected.bodyLocations] : []);
    setSaved(false);
    setError(null);
  }, [selected]);

  useEffect(() => {
    if (!selectedId || !onSelectedIdChange) return;
    if (selected && !scopedIncidents.some((incident) => incident.id === selectedId)) {
      onSelectedIdChange(null);
    }
  }, [selectedId, selected, scopedIncidents, onSelectedIdChange]);

  const editing = Boolean(selected && onSaveLocations);
  const dirty =
    editing &&
    (draftLocations.length !== (selected?.bodyLocations.length ?? 0) ||
      draftLocations.some((id, index) => id !== selected?.bodyLocations[index]));
  useRegisterUnsavedChanges(dirty);

  function closePopup() {
    setPopup(null);
    setFocusedRegionId(null);
  }

  function activateRegion(regionId: string) {
    if (popup?.type === "region" && popup.regionId === regionId) {
      closePopup();
      return;
    }
    setFocusedRegionId(regionId);
    setPopup({ type: "region", regionId });
    onSelectedIdChange?.(null);
  }

  function activateOshaPart(oshaPart: string) {
    if (popup?.type === "osha" && popup.oshaPart === oshaPart) {
      closePopup();
      return;
    }
    setFocusedRegionId(null);
    setPopup({ type: "osha", oshaPart });
    onSelectedIdChange?.(null);
  }

  async function saveLocations() {
    if (!selected || !onSaveLocations || !canManage) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveLocations(selected.id, draftLocations);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save body locations");
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  const periodLabel =
    yearScope === "ytd" ? `${new Date().getFullYear()} YTD` : String(yearScope);

  const yearPicker = (
    <div style={{ minWidth: "9rem" }}>
      <label className="form-label mb-1" htmlFor="bodymap-year">
        Year
      </label>
      <select
        id="bodymap-year"
        className="form-select form-select-sm"
        value={yearScope === "ytd" ? "ytd" : String(yearScope)}
        onChange={(ev) => {
          setYearScope(parseBodyMapYearScope(ev.target.value));
          closePopup();
        }}
      >
        {yearOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  const figure = editing ? (
    <>
      <IncidentBodyMap
        mode="select"
        selected={draftLocations}
        onToggle={(id) => {
          setDraftLocations((prev) => toggleBodyLocation(prev, id));
          setSaved(false);
        }}
      />
      <p className="text-muted small text-center mt-3 mb-0">
        {draftLocations.length > 0 ? (
          <>
            <span className="fw-semibold text-body">Marked:</span>{" "}
            {bodyLocationSummaryLabel(draftLocations)}
          </>
        ) : (
          "Click Tim to mark where this injury occurred."
        )}
      </p>
    </>
  ) : (
    <>
      <IncidentBodyMap
        mode="display"
        counts={counts}
        maxCount={maxCount}
        activeRegionId={focusedRegionId}
        onRegionActivate={activateRegion}
      />
      {mappedIncidents > 0 ? (
        <div className="ind-bodymap-legend mt-3">
          {HEAT_LEGEND.map((entry) => (
            <span className="ind-bodymap-legend__item" key={entry.tone}>
              <span className={`ind-bodymap-legend__swatch bg-label-${entry.tone}`} />
              {entry.label}
            </span>
          ))}
          <span className="text-muted small">Click a number to view injuries</span>
        </div>
      ) : (
        <p className="text-muted small text-center mt-3 mb-0">
          No injury locations recorded for this period. Select an injury below Tim&apos;s map (or
          create a new report) and mark the body part.
        </p>
      )}
    </>
  );

  const picker =
    onSelectedIdChange && scopedIncidents.length > 0 ? (
      <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
        {yearPicker}
        <div className="flex-grow-1" style={{ minWidth: "12rem" }}>
          <label className="form-label mb-1" htmlFor="bodymap-incident">
            Injury record
          </label>
          <select
            id="bodymap-incident"
            className="form-select form-select-sm"
            value={selectedId ?? ""}
            onChange={(ev) => {
              onSelectedIdChange(ev.target.value || null);
              closePopup();
            }}
          >
            <option value="">All injuries (map)</option>
            {scopedIncidents.map((incident) => (
              <option key={incident.id} value={incident.id}>
                {incidentOptionLabel(incident)}
                {incident.bodyLocations.length
                  ? ` · ${bodyLocationSummaryLabel(incident.bodyLocations)}`
                  : ""}
              </option>
            ))}
          </select>
        </div>
        {editing && canManage ? (
          <>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={saving || !dirty}
              onClick={() => void saveLocations()}
            >
              {saving ? "Saving…" : "Save locations"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={saving}
              onClick={() => onSelectedIdChange(null)}
            >
              Show map
            </button>
          </>
        ) : null}
      </div>
    ) : (
      <div className="d-flex flex-wrap align-items-end gap-2 mb-3">{yearPicker}</div>
    );

  const status =
    error || saved ? (
      <div className={`alert alert-${error ? "danger" : "success"} py-2 small mb-3`} role="status">
        {error ?? "Body locations saved."}
      </div>
    ) : null;

  const partList =
    !editing && partRanking.length > 0 ? (
      <>
        <h6 className="mb-3">Most affected body parts</h6>
        <ul className="list-group list-group-flush">
          {partRanking.map((entry) => {
            const isActive = popup?.type === "osha" && popup.oshaPart === entry.oshaPart;
            return (
              <li key={entry.oshaPart} className="list-group-item px-0">
                <button
                  type="button"
                  className={`ind-bodymap-part-btn w-100 d-flex justify-content-between align-items-center text-start${isActive ? " is-active" : ""}`}
                  onClick={() => activateOshaPart(entry.oshaPart)}
                  aria-pressed={isActive}
                >
                  <span>{entry.oshaPart}</span>
                  <span className="badge bg-label-primary rounded-pill">{entry.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </>
    ) : null;

  const incidentPopup =
    popup && !editing ? (
      <>
        <div
          className="modal-backdrop fade show"
          onClick={closePopup}
          aria-hidden="true"
        />
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bodymap-incidents-title"
        >
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <div className="min-w-0">
                  <h5 className="modal-title mb-0" id="bodymap-incidents-title">
                    {popupTitle}
                  </h5>
                  <p className="text-muted small mb-0 mt-1">
                    {popupIncidents.length} injur
                    {popupIncidents.length === 1 ? "y" : "ies"} · {periodLabel}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={closePopup}
                />
              </div>
              <div className="modal-body">
                {popupIncidents.length === 0 ? (
                  <p className="text-muted mb-0">No matching injuries for this period.</p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {popupIncidents.map((incident) => (
                      <li key={incident.id} className="list-group-item px-0">
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div className="min-w-0">
                            <Link
                              className="fw-semibold d-block text-decoration-none"
                              href={incidentReportHref(incident)}
                              onClick={closePopup}
                            >
                              {incident.title}
                            </Link>
                            <span className="text-muted small d-block">
                              {incident.location || "—"}
                              {incident.createdAt
                                ? ` · ${new Date(incident.createdAt).toLocaleDateString()}`
                                : ""}
                            </span>
                            {incident.description ? (
                              <p className="small mb-0 mt-1 text-body">{incident.description}</p>
                            ) : null}
                          </div>
                          <span className={`badge ${statusBadgeClass(incident.status)}`}>
                            {incident.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={closePopup}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    ) : null;

  const showSidePanel = Boolean(partList);

  if (compact) {
    return (
      <div className="card border shadow-none">
        <div className="card-body">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <div className="min-w-0">
              <h6 className="mb-1">{title}</h6>
              <p className="text-muted small mb-0">
                {editing
                  ? `Editing: ${selected?.title ?? "injury"}`
                  : mappedIncidents > 0
                    ? `${mappedIncidents} incident${mappedIncidents === 1 ? "" : "s"} with a location · ${periodLabel}`
                    : `Where injuries have happened · ${periodLabel}`}
              </p>
            </div>
            {mapHref ? (
              <Link className="btn btn-sm btn-outline-primary" href={mapHref}>
                Open map
              </Link>
            ) : null}
          </div>
          {picker}
          {status}
          <div className="row g-3 align-items-start">
            <div className={showSidePanel ? "col-lg-7" : "col-12"}>{figure}</div>
            {showSidePanel ? <div className="col-lg-5">{partList}</div> : null}
          </div>
        </div>
        {incidentPopup}
      </div>
    );
  }

  return (
    <div className="row g-4">
      <div className={showSidePanel ? "col-lg-7" : "col-12"}>
        <div className="card border shadow-none h-100">
          <div className="card-body">
            <h6 className="mb-1">{title}</h6>
            <p className="text-muted small mb-3">
              {editing
                ? "Click body regions on Tim, then save to attach them to this injury."
                : mappedIncidents > 0
                  ? `${mappedIncidents} incident${mappedIncidents === 1 ? "" : "s"} with a recorded location · ${periodLabel}. Click a number to open injuries for that area.`
                  : `Select an injury to mark locations on Tim, or create a new injury report · ${periodLabel}.`}
            </p>
            {picker}
            {status}
            {figure}
          </div>
        </div>
      </div>
      {showSidePanel ? (
        <div className="col-lg-5">
          <div className="card border shadow-none h-100">
            <div className="card-body">{partList}</div>
          </div>
        </div>
      ) : null}
      {incidentPopup}
    </div>
  );
}

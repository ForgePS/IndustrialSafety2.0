"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IncidentBodyMap } from "@/components/incident-body-map";
import {
  aggregateBodyLocations,
  aggregateByOshaPart,
  bodyLocationSummaryLabel,
  maxRegionCount,
  toggleBodyLocation,
} from "@/lib/incident-body-map";
import { incidentOptionLabel, type IncidentRecord } from "@/lib/incidents-module";

const HEAT_LEGEND: ReadonlyArray<{ tone: string; label: string }> = [
  { tone: "info", label: "Lower" },
  { tone: "warning", label: "Moderate" },
  { tone: "danger", label: "Higher" },
];

type Props = {
  incidents: IncidentRecord[];
  /** Compact card for dashboard / Injuries footer. */
  compact?: boolean;
  /** Optional title override. */
  title?: string;
  /** When set, show a link into the full Injury Map tab. */
  mapHref?: string;
  /** Selected injury for editing body locations on Tim. */
  selectedId?: string | null;
  onSelectedIdChange?: (id: string | null) => void;
  canManage?: boolean;
  onSaveLocations?: (incidentId: string, bodyLocations: string[]) => Promise<void>;
};

/**
 * Safety Tim panel — aggregate heatmap of injury locations, or interactive
 * marking when an incident is selected.
 */
export function IncidentsBodyMapPanel({
  incidents,
  compact = false,
  title = "Injury locations",
  mapHref,
  selectedId = null,
  onSelectedIdChange,
  canManage = false,
  onSaveLocations,
}: Props) {
  const selected = useMemo(
    () => (selectedId ? (incidents.find((incident) => incident.id === selectedId) ?? null) : null),
    [incidents, selectedId],
  );

  const counts = useMemo(() => aggregateBodyLocations(incidents), [incidents]);
  const maxCount = useMemo(() => maxRegionCount(counts), [counts]);
  const partRanking = useMemo(() => aggregateByOshaPart(incidents), [incidents]);
  const mappedIncidents = useMemo(
    () => incidents.filter((incident) => incident.bodyLocations.length > 0).length,
    [incidents],
  );

  const [draftLocations, setDraftLocations] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftLocations(selected ? [...selected.bodyLocations] : []);
    setSaved(false);
    setError(null);
  }, [selected]);

  const editing = Boolean(selected && onSaveLocations);
  const dirty =
    editing &&
    (draftLocations.length !== (selected?.bodyLocations.length ?? 0) ||
      draftLocations.some((id, index) => id !== selected?.bodyLocations[index]));

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
      <IncidentBodyMap mode="display" counts={counts} maxCount={maxCount} />
      {mappedIncidents > 0 ? (
        <div className="ind-bodymap-legend mt-3">
          {HEAT_LEGEND.map((entry) => (
            <span className="ind-bodymap-legend__item" key={entry.tone}>
              <span className={`ind-bodymap-legend__swatch bg-label-${entry.tone}`} />
              {entry.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted small text-center mt-3 mb-0">
          No injury locations recorded yet. Select an injury below Tim&apos;s map (or create a new
          report) and mark the body part.
        </p>
      )}
    </>
  );

  const picker =
    onSelectedIdChange && incidents.length > 0 ? (
      <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
        <div className="flex-grow-1" style={{ minWidth: "12rem" }}>
          <label className="form-label mb-1" htmlFor="bodymap-incident">
            Injury record
          </label>
          <select
            id="bodymap-incident"
            className="form-select form-select-sm"
            value={selectedId ?? ""}
            onChange={(ev) => onSelectedIdChange(ev.target.value || null)}
          >
            <option value="">All injuries (heatmap)</option>
            {incidents.map((incident) => (
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
              Show heatmap
            </button>
          </>
        ) : null}
      </div>
    ) : null;

  const status =
    error || saved ? (
      <div className={`alert alert-${error ? "danger" : "success"} py-2 small mb-3`} role="status">
        {error ?? "Body locations saved."}
      </div>
    ) : null;

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
                    ? `${mappedIncidents} incident${mappedIncidents === 1 ? "" : "s"} with a location`
                    : "Where injuries have happened on the body"}
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
          {figure}
        </div>
      </div>
    );
  }

  return (
    <div className="row g-4">
      <div className={!editing && partRanking.length > 0 ? "col-lg-7" : "col-12"}>
        <div className="card border shadow-none h-100">
          <div className="card-body">
            <h6 className="mb-1">{title}</h6>
            <p className="text-muted small mb-3">
              {editing
                ? "Click body regions on Tim, then save to attach them to this injury."
                : mappedIncidents > 0
                  ? `${mappedIncidents} incident${mappedIncidents === 1 ? "" : "s"} with a recorded location.`
                  : "Select an injury to mark locations on Tim, or create a new injury report."}
            </p>
            {picker}
            {status}
            {figure}
          </div>
        </div>
      </div>
      {!editing && partRanking.length > 0 ? (
        <div className="col-lg-5">
          <div className="card border shadow-none h-100">
            <div className="card-body">
              <h6 className="mb-3">Most affected body parts</h6>
              <ul className="list-group list-group-flush">
                {partRanking.map((entry) => (
                  <li
                    key={entry.oshaPart}
                    className="list-group-item d-flex justify-content-between align-items-center px-0"
                  >
                    <span>{entry.oshaPart}</span>
                    <span className="badge bg-label-primary rounded-pill">{entry.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

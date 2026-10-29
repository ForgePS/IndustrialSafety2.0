"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldValueState } from "@/components/field-renderer";
import { PrefillBadge, SearchableSelect } from "@/components/searchable-select";
import {
  batchFieldValues,
  createIncidentPersonnel,
  createIncidentUnit,
  deleteIncidentPersonnel,
  deleteIncidentUnit,
  findDailyRoster,
  getApparatusDetail,
  getOccupancyDetail,
  getPrefillCandidates,
  getPersonnelDetail,
  getUnitDetail,
  listIncidentPersonnel,
  listIncidentUnits,
  lookupMasterData,
  patchIncident,
  type ApparatusDetail,
  type IncidentDetail,
  type IncidentPersonnelAssignment,
  type IncidentUnitAssignment,
  type LookupRow,
  type PrefillCandidate,
} from "@/lib/rms-api";
import { useTenantConfigStudio } from "@/hooks/use-tenant-config-studio";
import styles from "../app/page.module.css";

type PrefillFieldState = {
  value: string;
  prefillSource: string | null;
  userConfirmed: boolean;
};

function formatPrefillValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function usePrefillFields(
  tenantId: string,
  incidentId: string,
  recordVersion: number,
  onIncidentUpdated: (incident: IncidentDetail) => void,
) {
  const [fields, setFields] = useState<Record<string, PrefillFieldState>>({});

  const applyCandidates = useCallback(
    (candidates: PrefillCandidate[], fieldIds: Record<string, string>) => {
      setFields((current) => {
        const next = { ...current };
        for (const candidate of candidates) {
          const key = candidate.fieldKey;
          if (next[key]?.userConfirmed) continue;
          next[key] = {
            value: formatPrefillValue(candidate.value),
            prefillSource: candidate.prefillSource,
            userConfirmed: false,
          };
        }
        return next;
      });

      const values = candidates
        .map((candidate) => {
          const fieldId = fieldIds[candidate.fieldKey];
          if (!fieldId) return null;
          return {
            fieldId,
            sectionKey: candidate.sectionKey,
            valueText: formatPrefillValue(candidate.value),
            prefillSource: candidate.prefillSource,
            userConfirmed: false,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      if (values.length === 0) return Promise.resolve();
      return batchFieldValues(tenantId, incidentId, values, recordVersion).then((result) => {
        onIncidentUpdated(result.data.incident);
      });
    },
    [tenantId, incidentId, recordVersion, onIncidentUpdated],
  );

  function setField(key: string, value: string, confirmed = true) {
    setFields((current) => ({
      ...current,
      [key]: {
        value,
        prefillSource: confirmed ? "MANUAL" : (current[key]?.prefillSource ?? "MANUAL"),
        userConfirmed: confirmed,
      },
    }));
  }

  return { fields, setField, applyCandidates };
}

export function OverviewAssignmentSection({
  tenantId,
  incident,
  onIncidentChange,
}: {
  tenantId: string;
  incident: IncidentDetail;
  onIncidentChange: (incident: IncidentDetail) => void;
}) {
  const [station, setStation] = useState<LookupRow | null>(null);
  const [shift, setShift] = useState<LookupRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fields, setField, applyCandidates } = usePrefillFields(
    tenantId,
    incident.id,
    incident.recordVersion,
    onIncidentChange,
  );

  const searchStations = useCallback(
    (query: string) => lookupMasterData(tenantId, "stations", query),
    [tenantId],
  );
  const searchShifts = useCallback(
    (query: string) => lookupMasterData(tenantId, "shifts", query),
    [tenantId],
  );

  useEffect(() => {
    if (!incident.stationId) {
      setStation(null);
      return;
    }
    if (station?.id === incident.stationId) return;
    void lookupMasterData(tenantId, "stations", "").then((rows) => {
      const match = rows.find((row) => row.id === incident.stationId);
      if (match) setStation(match);
    });
  }, [tenantId, incident.stationId, station?.id]);

  useEffect(() => {
    if (!incident.shiftId) {
      setShift(null);
      return;
    }
    if (shift?.id === incident.shiftId) return;
    void lookupMasterData(tenantId, "shifts", "").then((rows) => {
      const match = rows.find((row) => row.id === incident.shiftId);
      if (match) setShift(match);
    });
  }, [tenantId, incident.shiftId, shift?.id]);

  async function selectStation(option: LookupRow) {
    setBusy(true);
    setError(null);
    try {
      const result = await patchIncident(
        tenantId,
        incident.id,
        { stationId: option.id },
        incident.recordVersion,
      );
      onIncidentChange(result.data);
      setStation(option);
      const candidates = await getPrefillCandidates(tenantId, incident.id, {
        stationId: option.id,
      });
      await applyCandidates(candidates, { response_district: "", station_timezone: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign station");
    } finally {
      setBusy(false);
    }
  }

  async function clearStation() {
    setStation(null);
    setBusy(true);
    setError(null);
    try {
      const result = await patchIncident(
        tenantId,
        incident.id,
        { stationId: null },
        incident.recordVersion,
      );
      onIncidentChange(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear station");
    } finally {
      setBusy(false);
    }
  }

  async function selectShift(option: LookupRow) {
    setBusy(true);
    setError(null);
    try {
      const result = await patchIncident(
        tenantId,
        incident.id,
        { shiftId: option.id },
        incident.recordVersion,
      );
      onIncidentChange(result.data);
      setShift(option);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign shift");
    } finally {
      setBusy(false);
    }
  }

  async function clearShift() {
    setShift(null);
    setBusy(true);
    try {
      const result = await patchIncident(
        tenantId,
        incident.id,
        { shiftId: null },
        incident.recordVersion,
      );
      onIncidentChange(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear shift");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.form}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {busy ? <p className={styles.fieldHelp}>Updating assignment…</p> : null}
      <SearchableSelect
        label="Station"
        selected={station}
        onSearch={searchStations}
        onSelect={(option) => void selectStation(option)}
        onClear={() => void clearStation()}
        disabled={busy}
        helpText="Selecting a station filters units and loads response-district prefill."
      />
      <SearchableSelect
        label="Shift"
        selected={shift}
        onSearch={searchShifts}
        onSelect={(option) => void selectShift(option)}
        onClear={() => void clearShift()}
        disabled={busy}
        helpText="Selecting a shift filters the daily roster for personnel assignment."
      />
      <div className={styles.formRow}>
        <label htmlFor="response-district">Response district</label>
        <div className={styles.prefillFieldRow}>
          {fields.response_district?.prefillSource &&
          fields.response_district.prefillSource !== "MANUAL" ? (
            <PrefillBadge source={fields.response_district.prefillSource} />
          ) : null}
          <input
            id="response-district"
            value={fields.response_district?.value ?? incident.responseDistrict ?? ""}
            onChange={(event) => setField("response_district", event.target.value)}
            onBlur={() => {
              const value = fields.response_district?.value ?? incident.responseDistrict ?? "";
              void patchIncident(
                tenantId,
                incident.id,
                { responseDistrict: value || null },
                incident.recordVersion,
              ).then((result) => onIncidentChange(result.data));
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function LocationAssignmentSection({
  tenantId,
  incident,
  onIncidentChange,
}: {
  tenantId: string;
  incident: IncidentDetail;
  onIncidentChange: (incident: IncidentDetail) => void;
}) {
  const [occupancy, setOccupancy] = useState<LookupRow | null>(null);
  const [occupancyDetail, setOccupancyDetail] = useState<Awaited<
    ReturnType<typeof getOccupancyDetail>
  > | null>(null);
  const [prefillSummary, setPrefillSummary] = useState<PrefillCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fields, setField, applyCandidates } = usePrefillFields(
    tenantId,
    incident.id,
    incident.recordVersion,
    onIncidentChange,
  );

  const searchOccupancies = useCallback(
    (query: string) => lookupMasterData(tenantId, "occupancies", query),
    [tenantId],
  );

  async function selectOccupancy(option: LookupRow) {
    setBusy(true);
    setError(null);
    try {
      const detail = await getOccupancyDetail(tenantId, option.id);
      setOccupancy(option);
      setOccupancyDetail(detail);
      const candidates = await getPrefillCandidates(tenantId, incident.id, {
        occupancyId: option.id,
        ...(detail.preplanId ? { preplanId: detail.preplanId } : {}),
      });
      setPrefillSummary(candidates);
      await applyCandidates(candidates, {
        location_name: "",
        address_line1: "",
        tactical_summary: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load occupancy");
    } finally {
      setBusy(false);
    }
  }

  function clearOccupancy() {
    setOccupancy(null);
    setOccupancyDetail(null);
    setPrefillSummary([]);
  }

  return (
    <div className={styles.form}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {busy ? <p className={styles.fieldHelp}>Loading occupancy…</p> : null}
      <SearchableSelect
        label="Occupancy"
        selected={occupancy}
        onSearch={searchOccupancies}
        onSelect={(option) => void selectOccupancy(option)}
        onClear={clearOccupancy}
        disabled={busy}
        helpText="Occupancy selection offers associated preplan prefill when available."
      />
      {occupancyDetail?.preplanId ? (
        <p className={styles.success}>Associated preplan available for this occupancy.</p>
      ) : occupancy ? (
        <p className={styles.muted}>No preplan linked to this occupancy.</p>
      ) : null}
      {prefillSummary.length > 0 ? (
        <ul className={styles.prefillSummaryList}>
          {prefillSummary.map((row) => (
            <li key={row.fieldKey}>
              <PrefillBadge source={row.prefillSource} /> {row.fieldKey.replaceAll("_", " ")}:{" "}
              {formatPrefillValue(row.value)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.formRow}>
        <label htmlFor="location-name">Location name</label>
        <div className={styles.prefillFieldRow}>
          {fields.location_name?.prefillSource &&
          fields.location_name.prefillSource !== "MANUAL" ? (
            <PrefillBadge source={fields.location_name.prefillSource} />
          ) : null}
          <input
            id="location-name"
            value={fields.location_name?.value ?? ""}
            onChange={(event) => setField("location_name", event.target.value)}
          />
        </div>
      </div>
      <div className={styles.formRow}>
        <label htmlFor="address-line1">Address line 1</label>
        <div className={styles.prefillFieldRow}>
          {fields.address_line1?.prefillSource &&
          fields.address_line1.prefillSource !== "MANUAL" ? (
            <PrefillBadge source={fields.address_line1.prefillSource} />
          ) : null}
          <input
            id="address-line1"
            value={fields.address_line1?.value ?? ""}
            onChange={(event) => setField("address_line1", event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

const DEFAULT_PERSONNEL_ROLES = ["OFFICER", "DRIVER", "FIREFIGHTER", "EMT", "PARAMEDIC", "CHIEF"];

export function UnitsPersonnelSection({
  tenantId,
  incident,
}: {
  tenantId: string;
  incident: IncidentDetail;
}) {
  const { personnelRoles } = useTenantConfigStudio();
  const roleOptions =
    personnelRoles.length > 0
      ? personnelRoles.map((r) => r.value.toUpperCase())
      : DEFAULT_PERSONNEL_ROLES;
  const [units, setUnits] = useState<IncidentUnitAssignment[]>([]);
  const [personnel, setPersonnel] = useState<IncidentPersonnelAssignment[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<LookupRow | null>(null);
  const [unitDetail, setUnitDetail] = useState<Awaited<ReturnType<typeof getUnitDetail>> | null>(
    null,
  );
  const [apparatus, setApparatus] = useState<ApparatusDetail | null>(null);
  const [rosterRows, setRosterRows] = useState<LookupRow[]>([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>("");
  const [personnelRole, setPersonnelRole] = useState("FIREFIGHTER");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stationId = incident.stationId;
  const shiftId = incident.shiftId;
  const rosterDate = incident.incidentDate ?? new Date().toISOString().slice(0, 10);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [unitRows, personnelRows] = await Promise.all([
        listIncidentUnits(tenantId, incident.id),
        listIncidentPersonnel(tenantId, incident.id),
      ]);
      setUnits(unitRows);
      setPersonnel(personnelRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  }, [tenantId, incident.id]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    if (!stationId || !shiftId) {
      setRosterRows([]);
      return;
    }
    void (async () => {
      try {
        const roster = await findDailyRoster(tenantId, { stationId, shiftId, rosterDate });
        if (!roster) {
          setRosterRows([]);
          return;
        }
        const rows: LookupRow[] = [];
        for (const assignment of roster.assignments) {
          try {
            const person = await getPersonnelDetail(tenantId, assignment.personnelId);
            if (person.status && person.status !== "ACTIVE") continue;
            rows.push({
              id: assignment.personnelId,
              label: String(person.rank ?? assignment.personnelId),
              subtitle: assignment.assignmentRole,
            });
          } catch {
            // Skip unavailable roster members.
          }
        }
        setRosterRows(rows);
      } catch {
        setRosterRows([]);
      }
    })();
  }, [tenantId, stationId, shiftId, rosterDate]);

  const searchUnits = useCallback(
    (query: string) =>
      lookupMasterData(tenantId, "units", query, {
        ...(stationId ? { stationId } : {}),
        activeOnly: true,
      }),
    [tenantId, stationId],
  );

  async function assignUnit(option: LookupRow) {
    setBusy(true);
    setError(null);
    try {
      const detail = await getUnitDetail(tenantId, option.id);
      setSelectedUnit(option);
      setUnitDetail(detail);
      if (detail.apparatusId) {
        setApparatus(await getApparatusDetail(tenantId, detail.apparatusId));
      } else {
        setApparatus(null);
      }
      await createIncidentUnit(tenantId, incident.id, {
        unitId: option.id,
        isPrimary: units.length === 0,
        unitRole: "FIRST_DUE",
      });
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign unit");
    } finally {
      setBusy(false);
    }
  }

  async function removeUnit(assignment: IncidentUnitAssignment) {
    setBusy(true);
    setError(null);
    try {
      await deleteIncidentUnit(tenantId, incident.id, assignment.id, assignment.recordVersion);
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove unit");
    } finally {
      setBusy(false);
    }
  }

  async function addPersonnelFromRoster() {
    if (!selectedPersonnelId) return;
    setBusy(true);
    setError(null);
    try {
      const primaryUnit = units[0];
      await createIncidentPersonnel(tenantId, incident.id, {
        personnelId: selectedPersonnelId,
        unitAssignmentId: primaryUnit?.id ?? null,
        role: personnelRole,
      });
      setSelectedPersonnelId("");
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign personnel");
    } finally {
      setBusy(false);
    }
  }

  async function removePersonnel(assignment: IncidentPersonnelAssignment) {
    setBusy(true);
    setError(null);
    try {
      await deleteIncidentPersonnel(tenantId, incident.id, assignment.id, assignment.recordVersion);
      await loadAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove personnel");
    } finally {
      setBusy(false);
    }
  }

  const assignedPersonnelIds = useMemo(
    () => new Set(personnel.map((row) => row.personnelId)),
    [personnel],
  );

  if (loading) {
    return <p className={styles.muted}>Loading unit and personnel assignments…</p>;
  }

  return (
    <div className={styles.form}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {!stationId ? (
        <p className={styles.warning}>Select a station on Overview to filter available units.</p>
      ) : null}
      <SearchableSelect
        label="Unit"
        selected={selectedUnit}
        onSearch={searchUnits}
        onSelect={(option) => void assignUnit(option)}
        onClear={() => {
          setSelectedUnit(null);
          setUnitDetail(null);
          setApparatus(null);
        }}
        disabled={busy || !stationId}
        helpText="Assigns the unit to this incident via the units API."
      />
      {unitDetail ? (
        <div className={styles.panel}>
          <h3>Apparatus info</h3>
          <p className={styles.muted}>
            {unitDetail.callSign} · {unitDetail.unitType}
          </p>
          {apparatus ? (
            <p>
              {apparatus.name} ({apparatus.apparatusType})
              {apparatus.nerisClassification ? ` · ${apparatus.nerisClassification}` : ""}
            </p>
          ) : (
            <p className={styles.muted}>No apparatus linked to this unit.</p>
          )}
        </div>
      ) : null}

      <h3>Assigned units</h3>
      {units.length === 0 ? (
        <p className={styles.muted}>No units assigned yet.</p>
      ) : (
        <ul className={styles.assignmentList}>
          {units.map((row) => (
            <li key={row.id}>
              <span>{row.unitId.slice(0, 8)}…</span>
              <span className={styles.muted}>{row.unitRole ?? "—"}</span>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={busy}
                onClick={() => void removeUnit(row)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Personnel from daily roster</h3>
      {!stationId || !shiftId ? (
        <p className={styles.warning}>
          Select station and shift on Overview to load the daily roster.
        </p>
      ) : rosterRows.length === 0 ? (
        <p className={styles.muted}>No roster entries for {rosterDate}.</p>
      ) : (
        <div className={styles.formRow}>
          <label htmlFor="roster-personnel">Roster member</label>
          <select
            id="roster-personnel"
            value={selectedPersonnelId}
            disabled={busy}
            onChange={(event) => setSelectedPersonnelId(event.target.value)}
          >
            <option value="">Select personnel…</option>
            {rosterRows
              .filter((row) => !assignedPersonnelIds.has(row.id))
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                  {row.subtitle ? ` (${row.subtitle})` : ""}
                </option>
              ))}
          </select>
        </div>
      )}
      <div className={styles.formRow}>
        <label htmlFor="personnel-role">Role</label>
        <select
          id="personnel-role"
          value={personnelRole}
          disabled={busy}
          onChange={(event) => setPersonnelRole(event.target.value)}
        >
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={busy || !selectedPersonnelId}
          onClick={() => void addPersonnelFromRoster()}
        >
          Add personnel
        </button>
      </div>

      <h3>Assigned personnel</h3>
      {personnel.length === 0 ? (
        <p className={styles.muted}>No personnel assigned yet.</p>
      ) : (
        <ul className={styles.assignmentList}>
          {personnel.map((row) => (
            <li key={row.id}>
              <span>{row.personnelId.slice(0, 8)}…</span>
              <span className={styles.muted}>{row.role ?? "—"}</span>
              <button
                type="button"
                className={styles.buttonSecondary}
                disabled={busy}
                onClick={() => void removePersonnel(row)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type { FieldValueState };

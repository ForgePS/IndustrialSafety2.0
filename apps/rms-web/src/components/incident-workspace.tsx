"use client";

import Link from "next/link";
import shellStyles from "../app/shell.module.css";
import styles from "../app/page.module.css";
import { AutosaveIndicator } from "@/hooks/use-autosave";
import type { AvailableSpecialtySection, SpecialtyWorkflowGroup } from "@/lib/rms-api";

const SECTION_LABELS: Record<string, string> = {
  OVERVIEW: "Overview",
  DISPATCH: "Dispatch",
  LOCATION: "Location",
  UNITS_PERSONNEL: "Units and Personnel",
  CLASSIFICATION: "Classification",
  FIRE: "Fire",
  STRUCTURE: "Structure",
  WILDLAND: "Wildland",
  HAZMAT: "Hazmat",
  RESCUE: "Rescue",
  EXPLOSION: "Explosion",
  EXPOSURES: "Exposures",
  CIVILIAN_CASUALTIES: "Civilian Casualties",
  FIRE_SERVICE_CASUALTIES: "Fire Service Casualties",
  ALARM_DETECTION: "Alarm and Detection",
  FIRE_PROTECTION: "Fire Protection Systems",
  EMERGING_HAZARDS: "Emerging Hazards",
  RISK_REDUCTION: "Risk Reduction",
  INCIDENT_ANALYSIS: "Incident Analysis",
  NARRATIVE: "Narrative",
  ATTACHMENTS: "Attachments",
  REVIEW: "Review",
  APPLICABLE_MODULES: "Applicable Modules",
};

export function sectionLabel(key: string, terms?: Record<string, string>): string {
  if (terms?.[key]) return terms[key]!;
  if (terms?.[key.toLowerCase()]) return terms[key.toLowerCase()]!;
  return SECTION_LABELS[key] ?? key.replaceAll("_", " ");
}

export function IncidentHeader({
  incidentNumber,
  status,
  autosaveStatus,
  autosaveError,
  onRetryAutosave,
  saveAndExit,
}: {
  incidentNumber: string;
  status: string;
  autosaveStatus: Parameters<typeof AutosaveIndicator>[0]["status"];
  autosaveError: string | null;
  onRetryAutosave?: () => void;
  saveAndExit?: React.ReactNode;
}) {
  return (
    <header className={shellStyles.incidentHeaderSticky}>
      <div className={shellStyles.incidentHeaderTop}>
        <div>
          <p className={styles.muted} id="incident-context-label">
            Incident
          </p>
          <h1 aria-labelledby="incident-context-label">{incidentNumber}</h1>
        </div>
        <div className={shellStyles.incidentHeaderActions}>
          <span className={styles.statusBadge}>{status}</span>
          <AutosaveIndicator
            status={autosaveStatus}
            error={autosaveError}
            {...(onRetryAutosave ? { onRetry: onRetryAutosave } : {})}
          />
          {saveAndExit}
        </div>
      </div>
    </header>
  );
}

export function IncidentSectionNav({
  incidentId,
  activeSection,
  sections,
  specialtyWorkflows = [],
}: {
  incidentId: string;
  activeSection: string;
  sections: string[];
  specialtyWorkflows?: SpecialtyWorkflowGroup[];
}) {
  const navSections =
    sections.length > 0
      ? sections
      : [
          "OVERVIEW",
          "DISPATCH",
          "LOCATION",
          "UNITS_PERSONNEL",
          "CLASSIFICATION",
          "NARRATIVE",
          "REVIEW",
        ];
  const specialtyByKey = new Map(specialtyWorkflows.map((g) => [g.sectionKey, g]));

  return (
    <nav className={shellStyles.sectionNavSticky} aria-label="Incident sections">
      {navSections.map((section) => {
        const active = activeSection === section;
        const specialty = specialtyByKey.get(section);
        const suffix =
          specialty?.state === "NOT_APPLICABLE"
            ? " (N/A)"
            : specialty?.hasBlockingGaps
              ? " (!)"
              : specialty?.completionPercent != null && specialty.fieldCount
                ? ` (${specialty.completionPercent}%)`
                : "";
        return (
          <Link
            key={section}
            href={`/incidents/${incidentId}/?section=${section}`}
            className={
              active
                ? `${shellStyles.sectionLink} ${shellStyles.sectionLinkActive}`
                : shellStyles.sectionLink
            }
            aria-current={active ? "page" : undefined}
            title={
              specialty?.activationReasons?.length
                ? specialty.activationReasons.join("; ")
                : undefined
            }
          >
            {sectionLabel(section)}
            {suffix}
          </Link>
        );
      })}
    </nav>
  );
}

export function SpecialtySectionBanner({
  group,
  onMarkNotApplicable,
}: {
  group: SpecialtyWorkflowGroup | undefined;
  onMarkNotApplicable?: () => void;
}) {
  if (!group || group.state === "HIDDEN") return null;
  return (
    <div className={styles.panel} style={{ marginBottom: "1rem" }}>
      <p className={styles.muted} style={{ margin: 0 }}>
        {group.plainLanguageSummary}
      </p>
      {group.activationReasons.length > 0 ? (
        <p style={{ margin: "0.5rem 0 0" }}>
          Why this section is shown: {group.activationReasons.join("; ")}
        </p>
      ) : null}
      {group.fieldCount != null ? (
        <p className={styles.muted} style={{ margin: "0.5rem 0 0" }}>
          Completion: {group.completionPercent ?? 0}%
          {group.requiredFieldCount
            ? ` · Required fields ${group.filledRequiredFieldCount ?? 0}/${group.requiredFieldCount}`
            : ""}
          {group.hasBlockingGaps ? " · Blocking gaps remain" : ""}
        </p>
      ) : null}
      {group.state === "REQUIRED" ? (
        <p className={styles.muted} style={{ margin: "0.5rem 0 0" }}>
          Required for this incident — cannot be marked not applicable.
        </p>
      ) : null}
      {group.allowNotApplicable && group.state !== "NOT_APPLICABLE" && onMarkNotApplicable ? (
        <button type="button" className={styles.secondaryButton} onClick={onMarkNotApplicable}>
          Mark not applicable
        </button>
      ) : null}
      {group.state === "NOT_APPLICABLE" ? (
        <p className={styles.muted} style={{ margin: "0.5rem 0 0" }}>
          Marked not applicable. Entered values are preserved.
        </p>
      ) : null}
    </div>
  );
}

export function AddSpecialtySectionControl({
  available,
  onActivate,
}: {
  available: AvailableSpecialtySection[];
  onActivate: (sectionKey: string) => void;
}) {
  if (available.length === 0) return null;
  return (
    <div className={styles.panel}>
      <h2>Add specialty section</h2>
      <p className={styles.muted}>
        Only relevant specialty workflows appear automatically. You can optionally open additional
        sections without exposing every NERIS field.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {available.map((item) => (
          <li
            key={item.sectionKey}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              alignItems: "center",
              padding: "0.5rem 0",
              borderTop: "1px solid var(--border, #ddd)",
            }}
          >
            <div>
              <strong>{item.label}</strong>
              <p className={styles.muted} style={{ margin: 0 }}>
                {item.summary}
              </p>
            </div>
            <button type="button" onClick={() => onActivate(item.sectionKey)}>
              Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IncidentWorkspaceLayout({
  incidentId,
  incidentNumber,
  status,
  activeSection,
  sections,
  specialtyWorkflows,
  autosaveStatus,
  autosaveError,
  onRetryAutosave,
  saveAndExit,
  children,
}: {
  incidentId: string;
  incidentNumber: string;
  status: string;
  activeSection: string;
  sections?: string[];
  specialtyWorkflows?: SpecialtyWorkflowGroup[];
  autosaveStatus: Parameters<typeof AutosaveIndicator>[0]["status"];
  autosaveError: string | null;
  onRetryAutosave?: () => void;
  saveAndExit?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.page}>
      <IncidentHeader
        incidentNumber={incidentNumber}
        status={status}
        autosaveStatus={autosaveStatus}
        autosaveError={autosaveError}
        {...(onRetryAutosave ? { onRetryAutosave } : {})}
        {...(saveAndExit ? { saveAndExit } : {})}
      />
      <IncidentSectionNav
        incidentId={incidentId}
        activeSection={activeSection}
        sections={sections ?? []}
        specialtyWorkflows={specialtyWorkflows ?? []}
      />
      {children}
    </section>
  );
}

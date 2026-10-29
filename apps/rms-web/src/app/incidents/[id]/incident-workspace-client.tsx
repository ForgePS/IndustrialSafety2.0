"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@forge/web-kit";
import type { FieldValueState } from "@/components/field-renderer";
import { SectionFieldGrid } from "@/components/field-renderer";
import {
  LocationAssignmentSection,
  OverviewAssignmentSection,
  UnitsPersonnelSection,
} from "@/components/incident-sections";
import { FeatureGate } from "@/components/feature-gate";
import { AttachmentGallery } from "@/components/attachment-gallery";
import { IncidentCadPanel } from "@/components/incident-cad-panel";
import { AiNarrativeAssistantPanel } from "@/components/ai-narrative-assistant-panel";
import {
  AddSpecialtySectionControl,
  IncidentWorkspaceLayout,
  SpecialtySectionBanner,
  sectionLabel,
} from "@/components/incident-workspace";
import { OfficerReviewPanel } from "@/components/officer-review";
import { SpecialtyReviewPanel } from "@/components/specialty-review";
import { SpecialtyRecordsPanel } from "@/components/specialty-records";
import {
  AutosaveIndicator,
  ConflictDialog,
  SaveAndExitButton,
  useDebouncedAutosave,
} from "@/hooks/use-autosave";
import { IncidentFxWorkspaceLayout } from "@/fx/workspace/incidents/IncidentFxWorkspaceLayout";
import { ensureWorkspacesRegistered } from "@/fx/workspace/register-all";
import { useRmsFxIncidentModule } from "@/fx/modules/use-incident-module";
import { useRmsFxIncidentReviewModule } from "@/fx/modules/use-incident-review-module";
import {
  batchFieldValues,
  getFormDescriptor,
  getIncident,
  getNarrative,
  patchIncident,
  postSpecialtySection,
  upsertNarrative,
  type FormDescriptor,
  type IncidentDetail,
  type NarrativePayload,
} from "@/lib/rms-api";
import styles from "../../page.module.css";

function draftKey(incidentId: string, scope: string): string {
  return `rms-autosave:${incidentId}:${scope}`;
}

function subscribeToLocation(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function getBrowserPathname(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

/**
 * Static export only prebuilds `/incidents/placeholder/`. CloudFront rewrites
 * real `/incidents/<uuid>/` URLs to that shell while keeping the browser path.
 * Next `useParams` / `usePathname` stay on "placeholder", so read the real id
 * from `window.location.pathname`.
 */
function useIncidentRouteId(): string {
  const params = useParams<{ id: string }>();
  const browserPathname = useSyncExternalStore(subscribeToLocation, getBrowserPathname, () => "");

  return useMemo(() => {
    const fromBrowser = browserPathname.match(/^\/incidents\/([^/]+)\/?$/)?.[1];
    if (fromBrowser && fromBrowser !== "new" && fromBrowser !== "placeholder") {
      return fromBrowser;
    }
    const fromParams = typeof params?.id === "string" ? params.id : undefined;
    if (fromParams && fromParams !== "placeholder") {
      return fromParams;
    }
    return fromBrowser ?? fromParams ?? "";
  }, [params?.id, browserPathname]);
}

function IncidentWorkspaceInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const incidentId = useIncidentRouteId();
  const activeSection = searchParams.get("section") ?? "OVERVIEW";
  const { me } = useAuth();
  const { workspace: workspaceMode, loading: fxWorkspaceFlagLoading } = useRmsFxIncidentModule();
  const { detailForms: reviewFormsMode, loading: reviewModuleLoading } =
    useRmsFxIncidentReviewModule();

  useEffect(() => {
    ensureWorkspacesRegistered();
  }, []);

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [descriptor, setDescriptor] = useState<FormDescriptor | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValueState>>({});
  const [narrative, setNarrative] = useState<NarrativePayload | null>(null);
  const [narrativeDraft, setNarrativeDraft] = useState("");
  const [versionNote, setVersionNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictMessage, setConflictMessage] = useState("");
  const descriptorRef = useRef<FormDescriptor | null>(null);
  descriptorRef.current = descriptor;

  const load = useCallback(async () => {
    if (!me?.tenantId || !incidentId || incidentId === "placeholder") return;
    setLoading(true);
    setError(null);
    try {
      const [incidentResult, formDescriptor, narrativeResult] = await Promise.all([
        getIncident(me.tenantId, incidentId),
        getFormDescriptor(me.tenantId, incidentId),
        getNarrative(me.tenantId, incidentId),
      ]);
      setIncident(incidentResult.data);
      setDescriptor(formDescriptor);
      setNarrative(narrativeResult);
      setNarrativeDraft(narrativeResult?.body ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incident");
    } finally {
      setLoading(false);
    }
  }, [me?.tenantId, incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sectionFields = useMemo(() => {
    if (!descriptor) return [];
    return descriptor.modules
      .filter((module) => module.sectionKey === activeSection)
      .flatMap((module) => module.fields);
  }, [descriptor, activeSection]);

  const handleConflict = useCallback((err: { message: string }) => {
    setConflictMessage(err.message);
    setConflictOpen(true);
  }, []);

  const fieldAutosave = useDebouncedAutosave({
    delayMs: 2000,
    maxWaitMs: 10000,
    ...(incident ? { draftKey: draftKey(incident.id, `fields:${activeSection}`) } : {}),
    onConflict: (err) => handleConflict(err),
    save: async (payload: { fieldId: string; sectionKey: string; value: FieldValueState }) => {
      if (!me?.tenantId || !incident) return;
      const result = await batchFieldValues(
        me.tenantId,
        incident.id,
        [
          {
            fieldId: payload.fieldId,
            sectionKey: payload.sectionKey,
            ...payload.value,
          },
        ],
        incident.recordVersion,
      );
      setIncident(result.data.incident);
      // Recompute specialty activation after values change.
      const previous = descriptorRef.current;
      const previousNav = new Set(previous?.navigationSections ?? previous?.sections ?? []);
      const nextDescriptor = await getFormDescriptor(me.tenantId, incident.id);
      const nextNav = nextDescriptor.navigationSections ?? nextDescriptor.sections ?? [];
      const removed = [...previousNav].filter(
        (key) =>
          !nextNav.includes(key) &&
          ![
            "OVERVIEW",
            "DISPATCH",
            "LOCATION",
            "UNITS_PERSONNEL",
            "CLASSIFICATION",
            "NARRATIVE",
            "ATTACHMENTS",
            "REVIEW",
          ].includes(key),
      );
      if (removed.length > 0) {
        window.alert(
          `Classification or answers changed. These sections are no longer shown: ${removed
            .map((key) => sectionLabel(key))
            .join(
              ", ",
            )}. Entered values are preserved and can return if the triggering answers are restored.`,
        );
      }
      setDescriptor(nextDescriptor);
    },
  });

  const incidentAutosave = useDebouncedAutosave({
    delayMs: 2000,
    maxWaitMs: 10000,
    ...(incident ? { draftKey: draftKey(incident.id, "incident") } : {}),
    onConflict: (err) => handleConflict(err),
    save: async (payload: Record<string, unknown>) => {
      if (!me?.tenantId || !incident) return;
      const result = await patchIncident(me.tenantId, incident.id, payload, incident.recordVersion);
      setIncident(result.data);
    },
  });

  const narrativeAutosave = useDebouncedAutosave({
    delayMs: 2000,
    maxWaitMs: 10000,
    ...(incident ? { draftKey: draftKey(incident.id, "narrative") } : {}),
    onConflict: (err) => handleConflict(err),
    save: async (payload: { body: string; versionNote?: string }) => {
      if (!me?.tenantId || !incident) return;
      const result = await upsertNarrative(
        me.tenantId,
        incident.id,
        payload.body,
        incident.recordVersion,
        payload.versionNote,
      );
      setNarrative(result.data);
      setIncident((current) =>
        current
          ? { ...current, recordVersion: result.data.recordVersion ?? current.recordVersion }
          : current,
      );
    },
  });

  const autosaveStatus =
    fieldAutosave.status !== "idle"
      ? fieldAutosave.status
      : incidentAutosave.status !== "idle"
        ? incidentAutosave.status
        : narrativeAutosave.status;

  const autosaveError = fieldAutosave.error ?? incidentAutosave.error ?? narrativeAutosave.error;

  function retryAutosave() {
    fieldAutosave.retrySave();
    incidentAutosave.retrySave();
    narrativeAutosave.retrySave();
  }

  async function saveAndExit() {
    await Promise.all([
      fieldAutosave.flushSave(),
      incidentAutosave.flushSave(),
      narrativeAutosave.flushSave(),
    ]);
    router.push("/incidents/");
  }

  function onFieldChange(fieldId: string, _fieldKey: string, next: FieldValueState) {
    setFieldValues((current) => ({ ...current, [fieldId]: next }));
    fieldAutosave.queueSave({ fieldId, sectionKey: activeSection, value: next });
  }

  const navigationSections = descriptor?.navigationSections ?? descriptor?.sections ?? [];
  const activeSpecialty = descriptor?.specialtyWorkflows?.find(
    (group) => group.sectionKey === activeSection,
  );

  async function activateSpecialty(sectionKey: string) {
    if (!me?.tenantId || !incident) return;
    await postSpecialtySection(me.tenantId, incident.id, sectionKey, "ACTIVATE");
    const nextDescriptor = await getFormDescriptor(me.tenantId, incident.id);
    setDescriptor(nextDescriptor);
    router.push(`/incidents/${incident.id}/?section=${sectionKey}`);
  }

  async function markSpecialtyNotApplicable() {
    if (!me?.tenantId || !incident || !activeSpecialty) return;
    if (!activeSpecialty.allowNotApplicable) return;
    const confirmed = window.confirm(
      "Mark this section not applicable? Entered values will be preserved and the section will stay listed as N/A.",
    );
    if (!confirmed) return;
    await postSpecialtySection(
      me.tenantId,
      incident.id,
      activeSpecialty.sectionKey,
      "MARK_NOT_APPLICABLE",
    );
    const nextDescriptor = await getFormDescriptor(me.tenantId, incident.id);
    setDescriptor(nextDescriptor);
  }

  if (loading) {
    return (
      <section className={styles.page}>
        <p className={styles.muted}>Loading incident…</p>
      </section>
    );
  }

  if (error || !incident) {
    return (
      <section className={styles.page}>
        <p className={styles.error}>{error ?? "Incident not found"}</p>
      </section>
    );
  }

  const useFxChrome = !fxWorkspaceFlagLoading && workspaceMode === "fx";
  const loadedIncident = incident;

  function changeSection(sectionKey: string) {
    router.push(`/incidents/${loadedIncident.id}/?section=${sectionKey}`);
  }

  const workspaceChromeProps = {
    incidentId: loadedIncident.id,
    incidentNumber: loadedIncident.incidentNumber,
    status: loadedIncident.status,
    activeSection,
    sections: navigationSections,
    specialtyWorkflows: descriptor?.specialtyWorkflows ?? [],
    autosaveStatus,
    autosaveError,
    onRetryAutosave: retryAutosave,
    saveAndExit: <SaveAndExitButton onSave={saveAndExit} />,
  };

  const workspaceBody = (
    <>
      {me?.tenantId ? <IncidentCadPanel tenantId={me.tenantId} incidentId={incident.id} /> : null}

      {activeSection === "CLASSIFICATION" ? (
        <FeatureGate flag="specialtyWorkflows" title="Specialty workflows" fallback={null}>
          <AddSpecialtySectionControl
            available={descriptor?.availableSpecialtySections ?? []}
            onActivate={(sectionKey) => void activateSpecialty(sectionKey)}
          />
        </FeatureGate>
      ) : null}

      {activeSection === "OVERVIEW" ? (
        <div className={styles.panel}>
          <h2>Overview</h2>
          <OverviewAssignmentSection
            tenantId={me!.tenantId}
            incident={incident}
            onIncidentChange={setIncident}
          />
          <div className={styles.form}>
            <div className={styles.formRow}>
              <label htmlFor="incidentDate">Incident date</label>
              <input
                id="incidentDate"
                type="date"
                value={incident.incidentDate ?? ""}
                onChange={(event) => {
                  const incidentDate = event.target.value;
                  setIncident({ ...incident, incidentDate });
                  incidentAutosave.queueSave({ incidentDate });
                }}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="dispatchDescription">Dispatch description</label>
              <textarea
                id="dispatchDescription"
                rows={4}
                value={incident.dispatchDescription ?? ""}
                onChange={(event) => {
                  const dispatchDescription = event.target.value;
                  setIncident({ ...incident, dispatchDescription });
                  incidentAutosave.queueSave({ dispatchDescription });
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === "LOCATION" ? (
        <div className={styles.panel}>
          <h2>Location</h2>
          <LocationAssignmentSection
            tenantId={me!.tenantId}
            incident={incident}
            onIncidentChange={setIncident}
          />
          {sectionFields.length > 0 ? (
            <SectionFieldGrid
              tenantId={me!.tenantId}
              fields={sectionFields}
              values={fieldValues}
              onFieldChange={onFieldChange}
            />
          ) : null}
        </div>
      ) : null}

      {activeSection === "UNITS_PERSONNEL" ? (
        <div className={styles.panel}>
          <h2>Units &amp; personnel</h2>
          <UnitsPersonnelSection tenantId={me!.tenantId} incident={incident} />
          {sectionFields.length > 0 ? (
            <SectionFieldGrid
              tenantId={me!.tenantId}
              fields={sectionFields}
              values={fieldValues}
              onFieldChange={onFieldChange}
            />
          ) : null}
        </div>
      ) : null}

      {activeSection === "NARRATIVE" ? (
        <div className={styles.panel}>
          <h2>Narrative</h2>
          <div className={styles.form}>
            <div className={styles.formRow}>
              <label htmlFor="narrative-body">Narrative (plain text)</label>
              <textarea
                id="narrative-body"
                rows={12}
                value={narrativeDraft}
                onChange={(event) => {
                  setNarrativeDraft(event.target.value);
                  narrativeAutosave.queueSave({
                    body: event.target.value,
                    ...(versionNote ? { versionNote } : {}),
                  });
                }}
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="version-note">Version note (optional)</label>
              <input
                id="version-note"
                value={versionNote}
                onChange={(event) => setVersionNote(event.target.value)}
                placeholder="Describe this narrative revision"
              />
            </div>
            <AutosaveIndicator
              status={narrativeAutosave.status}
              error={narrativeAutosave.error}
              onRetry={narrativeAutosave.retrySave}
            />
            {narrative ? (
              <p className={styles.muted}>
                Last updated {new Date(narrative.updatedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          {incident ? (
            <AiNarrativeAssistantPanel
              incidentId={incident.id}
              incidentStatus={incident.status}
              existingNarrative={narrative?.body ?? null}
              onAccepted={() => void load()}
            />
          ) : null}
        </div>
      ) : null}

      {activeSection === "REVIEW" ? (
        <>
          <OfficerReviewPanel
            tenantId={me!.tenantId}
            incidentId={incident.id}
            status={incident.status}
            onChanged={() => void load()}
            presentation={!reviewModuleLoading && reviewFormsMode === "fx" ? "fx" : "legacy"}
          />
          <FeatureGate flag="specialtyWorkflows" title="Specialty review" fallback={null}>
            <SpecialtyReviewPanel
              tenantId={me!.tenantId}
              incidentId={incident.id}
              status={incident.status}
              reportOwnerUserId={incident.reportOwnerUserId ?? null}
              onChanged={() => void load()}
            />
          </FeatureGate>
        </>
      ) : null}

      {activeSection !== "OVERVIEW" &&
      activeSection !== "LOCATION" &&
      activeSection !== "UNITS_PERSONNEL" &&
      activeSection !== "CLASSIFICATION" &&
      activeSection !== "NARRATIVE" &&
      activeSection !== "REVIEW" ? (
        <div className={styles.panel}>
          <h2>{sectionLabel(activeSection)}</h2>
          <SpecialtySectionBanner
            group={activeSpecialty}
            onMarkNotApplicable={() => void markSpecialtyNotApplicable()}
          />
          {activeSpecialty?.state === "NOT_APPLICABLE" ? (
            <p className={styles.muted}>
              This section is marked not applicable. Values are preserved and not required for
              review.
            </p>
          ) : null}

          {activeSection === "ATTACHMENTS" ? (
            <FeatureGate flag="specialtyWorkflows" title="Attachments" fallback={null}>
              <AttachmentGallery
                tenantId={me!.tenantId}
                incidentId={incident.id}
                canUpload={incident.status !== "FINALIZED" && incident.status !== "ARCHIVED"}
                canArchive={incident.status !== "FINALIZED" && incident.status !== "ARCHIVED"}
                readOnly={incident.status === "FINALIZED" || incident.status === "ARCHIVED"}
              />
            </FeatureGate>
          ) : null}

          {activeSection === "EXPOSURES" ? (
            <SpecialtyRecordsPanel
              tenantId={me!.tenantId}
              incidentId={incident.id}
              kind="exposures"
              title="Exposure records"
              createLabel="Add exposure"
              emptyMessage="No exposures yet. Add an exposure card for each exposed property."
              canEdit={incident.status !== "FINALIZED" && incident.status !== "ARCHIVED"}
              fields={[
                { key: "addressLine1", label: "Address" },
                { key: "city", label: "City" },
                { key: "propertyUse", label: "Property use" },
                { key: "damageDescription", label: "Damage", type: "textarea" },
                { key: "narrative", label: "Narrative", type: "textarea" },
              ]}
            />
          ) : null}

          {activeSection === "CIVILIAN_CASUALTIES" ? (
            <SpecialtyRecordsPanel
              tenantId={me!.tenantId}
              incidentId={incident.id}
              kind="civilian-casualties"
              title="Civilian casualties"
              createLabel="Add civilian casualty"
              emptyMessage="No civilian casualty records."
              canEdit={incident.status !== "FINALIZED" && incident.status !== "ARCHIVED"}
              fields={[
                { key: "unknownPersonHandling", label: "Unknown-person handling" },
                { key: "injuryType", label: "Injury type" },
                { key: "injurySeverity", label: "Severity" },
                { key: "outcome", label: "Outcome" },
              ]}
            />
          ) : null}

          {activeSection === "FIRE_SERVICE_CASUALTIES" ? (
            <SpecialtyRecordsPanel
              tenantId={me!.tenantId}
              incidentId={incident.id}
              kind="fire-service-casualties"
              title="Fire-service casualties"
              createLabel="Add fire-service casualty"
              emptyMessage="No fire-service casualty records."
              canEdit={incident.status !== "FINALIZED" && incident.status !== "ARCHIVED"}
              fields={[
                { key: "personnelUnknownException", label: "Personnel exception" },
                { key: "injuryType", label: "Injury type" },
                { key: "injurySeverity", label: "Severity" },
                { key: "maydayDetails", label: "Mayday details", type: "textarea" },
              ]}
            />
          ) : null}

          {activeSection === "HAZMAT" ? (
            <>
              <SpecialtyRecordsPanel
                tenantId={me!.tenantId}
                incidentId={incident.id}
                kind="hazmat/substances"
                title="Hazmat substances"
                createLabel="Add substance"
                emptyMessage="No substances documented."
                canEdit={incident.status !== "FINALIZED" && incident.status !== "ARCHIVED"}
                fields={[
                  { key: "productName", label: "Product name" },
                  { key: "unNaNumber", label: "UN/NA number" },
                  { key: "hazardClass", label: "Hazard class" },
                  { key: "unitOfMeasure", label: "Unit" },
                ]}
              />
              <SpecialtyRecordsPanel
                tenantId={me!.tenantId}
                incidentId={incident.id}
                kind="hazmat/containers"
                title="Hazmat containers"
                createLabel="Add container"
                emptyMessage="No containers documented."
                canEdit={incident.status !== "FINALIZED" && incident.status !== "ARCHIVED"}
                fields={[
                  { key: "containerType", label: "Container type" },
                  { key: "capacityUnit", label: "Capacity unit" },
                  { key: "productName", label: "Product" },
                  { key: "leakLocation", label: "Leak location" },
                ]}
              />
            </>
          ) : null}

          {activeSection === "ALARM_DETECTION" ? (
            <SpecialtyRecordsPanel
              tenantId={me!.tenantId}
              incidentId={incident.id}
              kind="alarm-systems"
              title="Alarm and detection devices"
              createLabel="Add alarm/detection record"
              emptyMessage="No alarm or detection records."
              canEdit={incident.status !== "FINALIZED" && incident.status !== "ARCHIVED"}
              fields={[
                { key: "deviceType", label: "Device type" },
                { key: "location", label: "Location" },
                { key: "presence", label: "Presence" },
                { key: "operation", label: "Operation" },
              ]}
            />
          ) : null}

          {activeSection === "FIRE_PROTECTION" ? (
            <SpecialtyRecordsPanel
              tenantId={me!.tenantId}
              incidentId={incident.id}
              kind="protection-systems"
              title="Fire protection systems"
              createLabel="Add protection system"
              emptyMessage="No protection system records."
              canEdit={incident.status !== "FINALIZED" && incident.status !== "ARCHIVED"}
              fields={[
                { key: "systemType", label: "System type" },
                { key: "location", label: "Location" },
                { key: "presence", label: "Presence" },
                { key: "operation", label: "Operation" },
                { key: "failureReason", label: "Failure reason", type: "textarea" },
              ]}
            />
          ) : null}

          {activeSection !== "ATTACHMENTS" &&
          activeSection !== "EXPOSURES" &&
          activeSection !== "CIVILIAN_CASUALTIES" &&
          activeSection !== "FIRE_SERVICE_CASUALTIES" &&
          activeSection !== "HAZMAT" &&
          activeSection !== "ALARM_DETECTION" &&
          activeSection !== "FIRE_PROTECTION" &&
          activeSpecialty?.state !== "NOT_APPLICABLE" ? (
            sectionFields.length === 0 ? (
              <p className={styles.muted}>
                No applicable fields for this section yet. Complete Classification to activate
                specialty modules, or add an optional section.
              </p>
            ) : (
              <SectionFieldGrid
                tenantId={me!.tenantId}
                fields={sectionFields}
                values={fieldValues}
                onFieldChange={onFieldChange}
              />
            )
          ) : null}
        </div>
      ) : null}

      {activeSection === "CLASSIFICATION" ? (
        <div className={styles.panel}>
          <h2>Classification</h2>
          <p className={styles.muted}>
            Primary and secondary incident types drive which specialty workflows appear. Only
            relevant sections are shown.
          </p>
          {sectionFields.length === 0 ? (
            <p className={styles.muted}>No classification fields configured.</p>
          ) : (
            <SectionFieldGrid
              tenantId={me!.tenantId}
              fields={sectionFields}
              values={fieldValues}
              onFieldChange={onFieldChange}
            />
          )}
        </div>
      ) : null}

      <ConflictDialog
        open={conflictOpen}
        message={conflictMessage}
        onReload={() => {
          setConflictOpen(false);
          fieldAutosave.resetStatus();
          incidentAutosave.resetStatus();
          narrativeAutosave.resetStatus();
          void load();
        }}
        onRetry={() => {
          setConflictOpen(false);
          retryAutosave();
        }}
        onDismiss={() => setConflictOpen(false)}
      />
    </>
  );

  return (
    <FeatureGate flag="incidentShell" title="Incident">
      {useFxChrome ? (
        <IncidentFxWorkspaceLayout
          incident={loadedIncident}
          activeSection={activeSection}
          sections={navigationSections}
          specialtyWorkflows={descriptor?.specialtyWorkflows ?? []}
          autosaveStatus={autosaveStatus}
          autosaveError={autosaveError}
          onRetryAutosave={retryAutosave}
          saveAndExit={<SaveAndExitButton onSave={saveAndExit} />}
          onTabChange={changeSection}
        >
          {workspaceBody}
        </IncidentFxWorkspaceLayout>
      ) : (
        <IncidentWorkspaceLayout {...workspaceChromeProps}>{workspaceBody}</IncidentWorkspaceLayout>
      )}
    </FeatureGate>
  );
}

export default function IncidentWorkspacePage() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
      <IncidentWorkspaceInner />
    </Suspense>
  );
}

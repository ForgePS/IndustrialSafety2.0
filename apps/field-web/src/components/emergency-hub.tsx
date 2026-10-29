"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { OrgContextBar } from "@/components/org-context-bar";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { emergencyApi } from "@/lib/emergency-api";
import { isEmergencyFeatureModuleEnabled } from "@/lib/field-modules";
import {
  alertAppliesToLocation,
  criticalFieldsFromRecord,
  EMERGENCY_CATEGORIES,
  emergencyRecordTitle,
  filterEmergencyByLocation,
  filterEmergencyByTab,
  isActiveEmergencyAlert,
  parseEmergencyCategory,
  plantEmergencyNumber,
  telHref,
  type EmergencyCategoryId,
  type EmergencyRecord,
  type FieldEmergencyAlert,
} from "@/lib/emergency";
import {
  cacheActiveEmergencyAlerts,
  cacheEmergencyProcedures,
  cachePlantEmergencyNumber,
  emergencyCacheAgeLabel,
  readCachedActiveEmergencyAlerts,
  readCachedEmergencyProcedures,
  readCachedPlantEmergencyNumber,
} from "@/lib/offline/emergency-cache";
import { useNetworkStatus } from "@/components/offline-banner";

function EmergencyInner() {
  const router = useRouter();
  const search = useSearchParams();
  const org = useFieldOrgOptional();
  const { can, activeModules, opts, moduleEnabled } = useFieldPermissions();
  const focusId = String(search.get("id") ?? search.get("alertId") ?? "").trim();
  const focusKind = String(search.get("kind") ?? "").toLowerCase();
  const initialTab = parseEmergencyCategory(search.get("category") ?? search.get("tab"));
  const [tab, setTab] = useState<EmergencyCategoryId>(initialTab);
  const [records, setRecords] = useState<EmergencyRecord[]>([]);
  const [alerts, setAlerts] = useState<FieldEmergencyAlert[]>([]);
  const [selected, setSelected] = useState<EmergencyRecord | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<FieldEmergencyAlert | null>(null);
  const [plantNumber, setPlantNumber] = useState("");
  const [cacheHint, setCacheHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ackBusy, setAckBusy] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const locationId = org?.selection.locationId ?? "";
  const enabled = isEmergencyFeatureModuleEnabled(activeModules, opts);
  const canView = can("field.emergency.view");
  const network = useNetworkStatus();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const categoryDef =
        EMERGENCY_CATEGORIES.find((c) => c.id === tab) ?? EMERGENCY_CATEGORIES[0]!;
      const query: Record<string, string> = {};
      if (locationId) query.siteId = locationId;

      const [procedureRows, alertRows, settings] = await Promise.all([
        moduleEnabled("EMERGENCY_RESPONSE")
          ? emergencyApi.listProcedures(categoryDef.apiCategory, query).catch(() => [])
          : Promise.resolve([] as EmergencyRecord[]),
        moduleEnabled("EMERGENCY_ALERTS")
          ? emergencyApi.listActiveAlerts().catch(() => [])
          : Promise.resolve([] as FieldEmergencyAlert[]),
        moduleEnabled("EMERGENCY_ALERTS")
          ? emergencyApi.getSettings().catch(() => null)
          : Promise.resolve(null),
      ]);

      const active = alertRows.filter(isActiveEmergencyAlert);
      const number = plantEmergencyNumber(settings ?? undefined);
      setRecords(procedureRows);
      setAlerts(active);
      setPlantNumber(number);
      setCacheHint(null);

      cacheEmergencyProcedures(categoryDef.apiCategory, locationId, procedureRows);
      cacheActiveEmergencyAlerts(active);
      if (number) cachePlantEmergencyNumber(number);

      if (focusId) {
        if (focusKind === "alert") {
          try {
            const alert = await emergencyApi.getAlert(focusId);
            setSelectedAlert(alert);
            setSelected(null);
            setAckError(null);
          } catch {
            const fromList = active.find((row) => row.id === focusId);
            setSelectedAlert(fromList ?? null);
            setSelected(null);
          }
        } else {
          const fromList = procedureRows.find((row) => row.id === focusId);
          if (fromList) {
            setSelected(fromList);
            setSelectedAlert(null);
          }
        }
      }
    } catch (err) {
      const categoryDef =
        EMERGENCY_CATEGORIES.find((c) => c.id === tab) ?? EMERGENCY_CATEGORIES[0]!;
      const cachedProcedures = readCachedEmergencyProcedures(categoryDef.apiCategory, locationId);
      const cachedAlerts = readCachedActiveEmergencyAlerts();
      const cachedNumber = readCachedPlantEmergencyNumber();
      if (cachedProcedures || cachedAlerts || cachedNumber) {
        setRecords(cachedProcedures ?? []);
        setAlerts(cachedAlerts ?? []);
        setPlantNumber(cachedNumber);
        setCacheHint(
          emergencyCacheAgeLabel(categoryDef.apiCategory, locationId) ?? "Available offline",
        );
        setError(null);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load emergency information");
        setRecords([]);
        setAlerts([]);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, locationId, moduleEnabled, focusId, focusKind]);

  useEffect(() => {
    if (!enabled || !canView) {
      setLoading(false);
      return;
    }
    if (network === "offline") {
      const categoryDef =
        EMERGENCY_CATEGORIES.find((c) => c.id === tab) ?? EMERGENCY_CATEGORIES[0]!;
      const cachedProcedures = readCachedEmergencyProcedures(categoryDef.apiCategory, locationId);
      const cachedAlerts = readCachedActiveEmergencyAlerts();
      const cachedNumber = readCachedPlantEmergencyNumber();
      if (cachedProcedures || cachedAlerts || cachedNumber) {
        setRecords(cachedProcedures ?? []);
        setAlerts(cachedAlerts ?? []);
        setPlantNumber(cachedNumber);
        setCacheHint(
          emergencyCacheAgeLabel(categoryDef.apiCategory, locationId) ?? "Available offline",
        );
        setLoading(false);
        setError(null);
        return;
      }
    }
    void refresh();
  }, [enabled, canView, refresh, network, tab, locationId]);

  const visibleRecords = useMemo(() => {
    const scoped = filterEmergencyByLocation(records, locationId);
    return filterEmergencyByTab(scoped, tab);
  }, [records, locationId, tab]);

  const visibleAlerts = useMemo(
    () => alerts.filter((alert) => alertAppliesToLocation(alert, locationId)),
    [alerts, locationId],
  );

  if (!enabled) {
    return (
      <EmptyState
        title="Emergency not enabled"
        message="Emergency Response / Alerts is not enabled for this company."
      />
    );
  }

  if (!canView) {
    return (
      <EmptyState
        title="Emergency unavailable"
        message="You need emergency view permission to open this hub."
      />
    );
  }

  if (selectedAlert) {
    return (
      <>
        <p className="ff-brand-mark">{selectedAlert.isDrill ? "Drill alert" : "Active alert"}</p>
        <h1 className="ff-page-title">{selectedAlert.headline || "Emergency alert"}</h1>
        <div className="ff-work-summary">
          {selectedAlert.severity ? (
            <div className="ff-work-row">
              <span>Severity</span>
              <span>{selectedAlert.severity}</span>
            </div>
          ) : null}
          {selectedAlert.alertType ? (
            <div className="ff-work-row">
              <span>Type</span>
              <span>{selectedAlert.alertType}</span>
            </div>
          ) : null}
          {selectedAlert.status ? (
            <div className="ff-work-row">
              <span>Status</span>
              <span>{selectedAlert.status}</span>
            </div>
          ) : null}
          {selectedAlert.alertNumber ? (
            <div className="ff-work-row">
              <span>Number</span>
              <span>{selectedAlert.alertNumber}</span>
            </div>
          ) : null}
        </div>
        {selectedAlert.shortMessage ? (
          <p className="ff-page-body">{selectedAlert.shortMessage}</p>
        ) : null}
        {selectedAlert.detailedMessage ? (
          <p className="ff-page-body">{selectedAlert.detailedMessage}</p>
        ) : null}
        {selectedAlert.instructions ? (
          <div className="ff-placeholder-card ff-card-message">
            <strong>Instructions</strong>
            <p>{selectedAlert.instructions}</p>
          </div>
        ) : null}
        {selectedAlert.requiresAcknowledgment ? (
          <section className="ff-section" aria-label="Emergency acknowledgment">
            {selectedAlert.myAcknowledgment?.acknowledgedAt ? (
              <p className="ff-meta" role="status">
                Acknowledged{" "}
                {new Date(selectedAlert.myAcknowledgment.acknowledgedAt).toLocaleString()}
              </p>
            ) : (
              <>
                <p className="ff-page-body">
                  Tap Acknowledge to confirm you have read this emergency alert.
                </p>
                {ackError ? (
                  <p className="ff-error" role="alert">
                    {ackError}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="ff-btn"
                  disabled={ackBusy || network === "offline"}
                  onClick={() => {
                    void (async () => {
                      setAckBusy(true);
                      setAckError(null);
                      try {
                        const body: { locationId?: string } = {};
                        if (locationId) body.locationId = locationId;
                        const result = await emergencyApi.acknowledge(selectedAlert.id, body);
                        setSelectedAlert({
                          ...selectedAlert,
                          ...result.alert,
                          myAcknowledgment: result.acknowledgment,
                        });
                      } catch (err) {
                        setAckError(
                          err instanceof ApiError ? err.message : "Could not record acknowledgment",
                        );
                      } finally {
                        setAckBusy(false);
                      }
                    })();
                  }}
                >
                  {ackBusy ? "Saving…" : "Acknowledge"}
                </button>
                {network === "offline" ? (
                  <p className="ff-hint ff-hint--left">Acknowledgment requires a connection.</p>
                ) : null}
              </>
            )}
          </section>
        ) : null}
        <button
          type="button"
          className="ff-btn ff-btn-secondary"
          onClick={() => {
            setSelectedAlert(null);
            setAckError(null);
            if (focusId) router.replace("/more/emergency/");
          }}
        >
          Back to Emergency
        </button>
      </>
    );
  }

  if (selected) {
    const fields = criticalFieldsFromRecord(selected);
    return (
      <>
        <p className="ff-brand-mark">Procedure</p>
        <h1 className="ff-page-title">{emergencyRecordTitle(selected)}</h1>
        <div className="ff-work-summary">
          {fields.map((field) => (
            <div key={field.label} className="ff-work-row">
              <span>{field.label}</span>
              <span>{field.value}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="ff-btn"
          onClick={() => {
            setSelected(null);
            if (focusId) router.replace(`/more/emergency/?category=${encodeURIComponent(tab)}`);
          }}
        >
          Back to list
        </button>
      </>
    );
  }

  return (
    <>
      <h1 className="ff-page-title">Emergency</h1>
      <p className="ff-page-body">
        Contacts, procedures, and active alerts for your Location. Procedures stay readable offline
        after you open this hub once online.
      </p>
      {cacheHint ? <p className="ff-meta">{cacheHint}</p> : null}
      <OrgContextBar compact />

      <div className="ff-placeholder-card ff-card-message" style={{ marginTop: 12 }}>
        <strong>Plant emergency number</strong>
        {plantNumber ? (
          <p>
            <a className="ff-link" href={telHref(plantNumber) || undefined}>
              {plantNumber}
            </a>
          </p>
        ) : (
          <p>Configured per company when available. Ask a supervisor if this number is missing.</p>
        )}
      </div>

      {loading ? <LoadingState label="Loading emergency…" /> : null}
      {!loading && error ? (
        <ErrorState title="Emergency unavailable" message={error} onRetry={() => void refresh()} />
      ) : null}

      {!loading && !error && visibleAlerts.length > 0 ? (
        <section className="ff-section" aria-label="Active alerts">
          <h2 className="ff-section-title">Active alerts</h2>
          <div className="ff-task-list">
            {visibleAlerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                className="ff-task-card"
                onClick={() => {
                  void (async () => {
                    setAckError(null);
                    try {
                      const full = await emergencyApi.getAlert(alert.id);
                      setSelectedAlert(full);
                    } catch {
                      setSelectedAlert(alert);
                    }
                  })();
                }}
              >
                <div className="ff-task-card-body">
                  <span className="ff-task-kind">
                    {alert.isDrill ? "Drill" : alert.severity || "Alert"}
                  </span>
                  <span className="ff-task-title">{alert.headline || "Emergency alert"}</span>
                  <span className="ff-meta">
                    {[alert.status, alert.shortMessage].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="ff-tabs" role="tablist" aria-label="Emergency procedures">
            {EMERGENCY_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={tab === category.id ? "ff-tab ff-tab-active" : "ff-tab"}
                onClick={() => setTab(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>
          <p className="ff-meta">{EMERGENCY_CATEGORIES.find((c) => c.id === tab)?.detail}</p>
          {visibleRecords.length === 0 ? (
            <EmptyState
              title="No procedures in this category"
              message="When your team publishes emergency procedures, they will appear here."
            />
          ) : (
            <div className="ff-task-list">
              {visibleRecords.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="ff-task-card"
                  onClick={() => setSelected(row)}
                >
                  <div className="ff-task-card-body">
                    <span className="ff-task-kind">{row.responseType || row.category || tab}</span>
                    <span className="ff-task-title">{emergencyRecordTitle(row)}</span>
                    <span className="ff-meta">{row.status || "ACTIVE"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}
    </>
  );
}

export function EmergencyHub() {
  return (
    <Suspense fallback={<LoadingState label="Loading emergency…" />}>
      <EmergencyInner />
    </Suspense>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet, apiSend, useAuth } from "@forge/web-kit";
import { ModuleWorkspaceHeader } from "@/components/module-workspace-header";
import { ModuleWorkspaceTabs } from "@/components/module-workspace-tabs";
import { EmergencyAlertMessagePreview } from "@/components/emergency-alert-message-preview";
import { EmergencySmsSignupQrCard } from "@/components/emergency-sms-signup-qr-card";
import { ensureActiveModuleTab, filterModulePages } from "@/lib/module-page-permissions";
import {
  EMERGENCY_ALERT_CHANNELS,
  EMERGENCY_ALERT_SEVERITIES,
  EMERGENCY_ALERT_TYPES,
  formatAlertStatus,
  type AlertAudience,
  type AlertTargetLookups,
  type AudiencePreview,
  type EmergencyAlert,
  type EmergencyAlertDashboard,
  type EmergencyAlertGroup,
  type EmergencyAlertGroupMember,
  type EmergencyAlertTemplate,
} from "@/lib/emergency-alerts";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "compose", label: "Send Alert" },
  { id: "active", label: "Active" },
  { id: "history", label: "History" },
  { id: "templates", label: "Templates" },
  { id: "groups", label: "Groups" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SMS_SIGNUP_QR_MANAGE_PERMISSIONS = [
  "industrial.emergency_alerts.manage_settings",
  "industrial.emergency_alerts.admin",
  "industrial.admin",
  "industrial.access",
];

function emptyAudience(): AlertAudience {
  return { scope: "TENANT", locationIds: [], departmentIds: [], groupIds: [], personnelIds: [] };
}

/** Map provider/config notes to customer-facing copy (never surface config keys). */
function friendlySmsNote(note: string | null | undefined): string {
  if (!note) return "";
  const lower = note.toLowerCase();
  if (lower.includes("stub") || lower.includes("configure") || lower.includes("smsprovider")) {
    return "Text messaging is not enabled for this organization. In-app and display channels were used when selected.";
  }
  if (lower.includes("smsenabled is false") || lower.includes("smsenabled")) {
    return "Text messaging is turned off in emergency alert settings.";
  }
  if (lower.includes("dry run") || lower.includes("dry-run")) {
    return "SMS ran in dry-run mode — no live texts were sent.";
  }
  // Avoid leaking raw config; keep short operational feedback only when already plain.
  if (/[=_]/.test(note) || /aws|origination|provider/i.test(note)) {
    return "Text messaging could not be delivered. Other selected channels were used when available.";
  }
  return note;
}

function friendlyDashboardSmsNote(dashboard: EmergencyAlertDashboard | null): string | null {
  if (!dashboard) return null;
  if (dashboard.smsProviderReady && dashboard.smsEnabled) return null;
  if (dashboard.note) return friendlySmsNote(dashboard.note);
  if (dashboard.smsProviderReady && !dashboard.smsEnabled) {
    return "Text messaging is turned off in emergency alert settings.";
  }
  return "Text messaging is not enabled for this organization.";
}

export function EmergencyAlertsWorkspace({ moduleName }: { moduleName: string }) {
  const { me } = useAuth();
  const [tab, setTab] = useState<TabId>("dashboard");
  const visibleTabs = useMemo(
    () =>
      filterModulePages({
        tabs: TABS,
        moduleCode: "EMERGENCY_ALERTS",
        permissions: me?.permissions ?? [],
      }),
    [me?.permissions],
  );
  useEffect(() => {
    setTab((current) =>
      ensureActiveModuleTab(
        current,
        visibleTabs.map((t) => t.id),
        "dashboard",
      ),
    );
  }, [visibleTabs]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<EmergencyAlertDashboard | null>(null);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [templates, setTemplates] = useState<EmergencyAlertTemplate[]>([]);
  const [groups, setGroups] = useState<EmergencyAlertGroup[]>([]);
  const [targets, setTargets] = useState<AlertTargetLookups | null>(null);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [headline, setHeadline] = useState("");
  const [shortMessage, setShortMessage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [alertType, setAlertType] = useState<string>("GENERAL");
  const [severity, setSeverity] = useState<string>("SEVERE");
  const [isDrill, setIsDrill] = useState(true);
  const [requiresAck, setRequiresAck] = useState(false);
  const [channels, setChannels] = useState<string[]>(["IN_APP", "MVIX"]);
  const [audienceScope, setAudienceScope] = useState<"TENANT" | "TARGETED">("TENANT");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);

  const [templateName, setTemplateName] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupMode, setGroupMode] = useState<"STATIC" | "DYNAMIC">("DYNAMIC");
  const [groupLocationId, setGroupLocationId] = useState("");
  const [groupDepartmentId, setGroupDepartmentId] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNotice, setGroupNotice] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupMembers, setGroupMembers] = useState<EmergencyAlertGroupMember[]>([]);
  const [memberSearchQ, setMemberSearchQ] = useState("");
  const [memberSearchHits, setMemberSearchHits] = useState<
    Array<{
      id: string;
      displayName: string;
      employeeNumber?: string | null;
      status?: string | null;
    }>
  >([]);
  const [memberSearchBusy, setMemberSearchBusy] = useState(false);

  function buildAudience(): AlertAudience {
    if (audienceScope === "TENANT") return emptyAudience();
    return {
      scope: "TARGETED",
      locationIds,
      departmentIds,
      groupIds,
      personnelIds: [],
    };
  }

  const loadDashboard = useCallback(async () => {
    setDashboard(
      await apiGet<EmergencyAlertDashboard>("/api/v1/industrial/emergency-alerts/dashboard"),
    );
  }, []);

  const loadAlerts = useCallback(async (status: string) => {
    const data = await apiGet<{ items: EmergencyAlert[] }>(
      `/api/v1/industrial/emergency-alerts?status=${encodeURIComponent(status)}`,
    );
    setAlerts(data.items);
  }, []);

  const loadTemplates = useCallback(async () => {
    const data = await apiGet<{ items: EmergencyAlertTemplate[] }>(
      "/api/v1/industrial/emergency-alerts/templates",
    );
    setTemplates(data.items);
  }, []);

  const loadTargets = useCallback(async () => {
    setTargets(await apiGet<AlertTargetLookups>("/api/v1/industrial/emergency-alerts/targets"));
  }, []);

  const loadGroups = useCallback(async () => {
    const data = await apiGet<{ items: EmergencyAlertGroup[] }>(
      "/api/v1/industrial/emergency-alerts/groups",
    );
    setGroups(data.items);
  }, []);

  const refreshPreview = useCallback(async (aud: AlertAudience) => {
    setPreviewLoading(true);
    try {
      setPreview(
        await apiSend<AudiencePreview>(
          "/api/v1/industrial/emergency-alerts/audience/preview",
          "POST",
          {
            audience: aud,
          },
        ),
      );
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "dashboard") await loadDashboard();
      else if (tab === "active") await loadAlerts("ACTIVE");
      else if (tab === "history") await loadAlerts("HISTORY");
      else if (tab === "templates") await loadTemplates();
      else if (tab === "compose") {
        await Promise.all([loadTemplates(), loadTargets()]);
      } else if (tab === "groups") {
        await Promise.all([loadGroups(), loadTargets()]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to load emergency alerts");
    } finally {
      setLoading(false);
    }
  }, [tab, loadDashboard, loadAlerts, loadTemplates, loadTargets, loadGroups]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab !== "compose") return;
    const handle = window.setTimeout(() => {
      void refreshPreview(buildAudience());
    }, 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, audienceScope, locationIds, departmentIds, groupIds, refreshPreview]);

  function toggleChannel(id: string) {
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function toggleId(list: string[], id: string, setter: (next: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function applyTemplate(t: EmergencyAlertTemplate) {
    setHeadline(t.headline);
    setShortMessage(t.shortMessage);
    setInstructions(t.instructions ?? "");
    setAlertType(t.alertType);
    setSeverity(t.severity);
    setRequiresAck(Boolean(t.requiresAcknowledgment));
    if (Array.isArray(t.channels)) setChannels(t.channels.map(String));
    setTab("compose");
  }

  async function createAndSend(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmSend) {
      setError("Check the confirmation box before sending.");
      return;
    }
    if (
      audienceScope === "TARGETED" &&
      !locationIds.length &&
      !departmentIds.length &&
      !groupIds.length
    ) {
      setError("Select at least one location, department, or group — or choose entire tenant.");
      return;
    }
    setSending(true);
    setError("");
    setNotice("");
    try {
      const draft = await apiSend<EmergencyAlert>("/api/v1/industrial/emergency-alerts", "POST", {
        headline,
        shortMessage,
        instructions: instructions || undefined,
        alertType,
        severity,
        isDrill,
        requiresAcknowledgment: requiresAck,
        channels,
        audience: buildAudience(),
      });
      const sent = await apiSend<EmergencyAlert & { smsNote?: string }>(
        `/api/v1/industrial/emergency-alerts/${encodeURIComponent(draft.id)}/send`,
        "POST",
        { confirmed: true },
      );
      setHeadline("");
      setShortMessage("");
      setInstructions("");
      setConfirmSend(false);
      setIsDrill(true);
      setTab("active");
      if (sent.smsNote) {
        setNotice(friendlySmsNote(sent.smsNote));
      } else {
        setNotice(isDrill ? "Drill alert sent." : "Emergency alert sent.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send emergency alert");
    } finally {
      setSending(false);
    }
  }

  async function allClear(id: string) {
    if (!window.confirm("Issue ALL CLEAR to the original audience?")) return;
    setError("");
    try {
      await apiSend(
        `/api/v1/industrial/emergency-alerts/${encodeURIComponent(id)}/all-clear`,
        "POST",
        {
          message: "All clear. Resume normal operations.",
        },
      );
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to issue all clear");
    }
  }

  function clearTemplateForm() {
    setEditingTemplateId(null);
    setTemplateName("");
    setPreviewTemplateId(null);
    setHeadline("");
    setShortMessage("");
    setInstructions("");
    setAlertType("GENERAL");
    setSeverity("SEVERE");
    setRequiresAck(false);
    setChannels(["SMS", "IN_APP", "MVIX"]);
  }

  function beginEditTemplate(t: EmergencyAlertTemplate) {
    setEditingTemplateId(t.id);
    setPreviewTemplateId(null);
    setTemplateName(t.name);
    setHeadline(t.headline);
    setShortMessage(t.shortMessage);
    setInstructions(t.instructions ?? "");
    setAlertType(t.alertType);
    setSeverity(t.severity);
    setRequiresAck(Boolean(t.requiresAcknowledgment));
    if (Array.isArray(t.channels)) setChannels(t.channels.map(String));
    setTemplateNotice(null);
    setError("");
  }

  function previewSavedTemplate(t: EmergencyAlertTemplate) {
    setPreviewTemplateId(t.id);
    setEditingTemplateId(null);
    setTemplateName(t.name);
    setHeadline(t.headline);
    setShortMessage(t.shortMessage);
    setInstructions(t.instructions ?? "");
    setAlertType(t.alertType);
    setSeverity(t.severity);
    setRequiresAck(Boolean(t.requiresAcknowledgment));
    if (Array.isArray(t.channels)) setChannels(t.channels.map(String));
    setTemplateNotice(null);
    setError("");
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setTemplateNotice(null);
    if (!templateName.trim() || !headline.trim() || !shortMessage.trim()) {
      setError("Name, headline, and short message are required.");
      return;
    }
    setTemplateBusy(true);
    try {
      const payload = {
        name: templateName.trim(),
        headline: headline.trim(),
        shortMessage: shortMessage.trim(),
        instructions: instructions || undefined,
        alertType,
        severity,
        channels,
        requiresAcknowledgment: requiresAck,
      };
      if (editingTemplateId) {
        await apiSend(
          `/api/v1/industrial/emergency-alerts/templates/${encodeURIComponent(editingTemplateId)}`,
          "PATCH",
          payload,
        );
        setTemplateNotice(`Updated “${payload.name}”.`);
      } else {
        await apiSend("/api/v1/industrial/emergency-alerts/templates", "POST", payload);
        setTemplateNotice(`Saved “${payload.name}”.`);
      }
      clearTemplateForm();
      await loadTemplates();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save template");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function deleteTemplate(t: EmergencyAlertTemplate) {
    if (!window.confirm(`Delete template “${t.name}”? This cannot be undone.`)) return;
    setError("");
    setTemplateNotice(null);
    setTemplateBusy(true);
    try {
      await apiSend(
        `/api/v1/industrial/emergency-alerts/templates/${encodeURIComponent(t.id)}`,
        "DELETE",
      );
      if (editingTemplateId === t.id) clearTemplateForm();
      setTemplateNotice(`Deleted “${t.name}”.`);
      await loadTemplates();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete template");
    } finally {
      setTemplateBusy(false);
    }
  }

  function clearGroupForm() {
    setEditingGroupId(null);
    setGroupName("");
    setGroupMode("DYNAMIC");
    setGroupLocationId("");
    setGroupDepartmentId("");
    setGroupMembers([]);
    setMemberSearchQ("");
    setMemberSearchHits([]);
  }

  async function beginEditGroup(g: EmergencyAlertGroup) {
    setEditingGroupId(g.id);
    setGroupName(g.name);
    setGroupMode(g.dynamic || g.groupType === "DYNAMIC" ? "DYNAMIC" : "STATIC");
    setGroupLocationId(g.locationId ?? "");
    setGroupDepartmentId(g.departmentId ?? "");
    setGroupMembers([]);
    setMemberSearchQ("");
    setMemberSearchHits([]);
    setGroupNotice(null);
    setError("");
    if (!(g.dynamic || g.groupType === "DYNAMIC")) {
      try {
        const detail = await apiGet<{
          members?: EmergencyAlertGroupMember[];
        }>(`/api/v1/industrial/emergency-alerts/groups/${encodeURIComponent(g.id)}`);
        setGroupMembers(detail.members ?? []);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Unable to load group members");
      }
    }
  }

  async function searchGroupMembers() {
    const q = memberSearchQ.trim();
    if (!q) {
      setMemberSearchHits([]);
      return;
    }
    setMemberSearchBusy(true);
    setError("");
    try {
      const data = await apiGet<{
        items?: Array<{
          id?: string;
          personnelId?: string;
          displayName?: string | null;
          employeeNumber?: string | null;
          status?: string | null;
        }>;
      }>("/api/v1/industrial/personnel/search", {
        query: { q, limit: "20" },
      });
      const memberIds = new Set(groupMembers.map((m) => m.personnelId));
      setMemberSearchHits(
        (data.items ?? [])
          .map((row) => ({
            id: String(row.id ?? row.personnelId ?? "").trim(),
            displayName: String(row.displayName ?? "Unknown").trim() || "Unknown",
            employeeNumber: row.employeeNumber ?? null,
            status: row.status ?? null,
          }))
          .filter((row) => row.id && !memberIds.has(row.id)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Personnel search failed");
    } finally {
      setMemberSearchBusy(false);
    }
  }

  async function persistStaticMembers(next: EmergencyAlertGroupMember[]) {
    if (!editingGroupId || groupMode !== "STATIC") {
      setGroupMembers(next);
      return;
    }
    setGroupBusy(true);
    setError("");
    try {
      await apiSend(
        `/api/v1/industrial/emergency-alerts/groups/${encodeURIComponent(editingGroupId)}`,
        "PATCH",
        { personnelIds: next.map((m) => m.personnelId) },
      );
      setGroupMembers(next);
      setGroupNotice(`Updated members (${next.length}).`);
      await loadGroups();
      await loadTargets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update group members");
    } finally {
      setGroupBusy(false);
    }
  }

  function addGroupMember(hit: {
    id: string;
    displayName: string;
    employeeNumber?: string | null;
    status?: string | null;
  }) {
    if (groupMembers.some((m) => m.personnelId === hit.id)) return;
    const next = [
      ...groupMembers,
      {
        personnelId: hit.id,
        displayName: hit.displayName,
        employeeNumber: hit.employeeNumber ?? null,
        status: hit.status ?? null,
      },
    ].sort((a, b) => a.displayName.localeCompare(b.displayName));
    setMemberSearchHits((prev) => prev.filter((h) => h.id !== hit.id));
    void persistStaticMembers(next);
  }

  function removeGroupMember(personnelId: string) {
    const next = groupMembers.filter((m) => m.personnelId !== personnelId);
    void persistStaticMembers(next);
  }

  async function saveGroup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGroupNotice(null);
    if (!groupName.trim()) {
      setError("Group name is required.");
      return;
    }
    setGroupBusy(true);
    const payload = {
      name: groupName.trim(),
      locationId: groupLocationId || null,
      departmentId: groupDepartmentId || null,
      ruleJson: {
        locationIds: groupLocationId ? [groupLocationId] : [],
        departmentIds: groupDepartmentId ? [groupDepartmentId] : [],
      },
    };
    try {
      if (editingGroupId) {
        await apiSend(
          `/api/v1/industrial/emergency-alerts/groups/${encodeURIComponent(editingGroupId)}`,
          "PATCH",
          {
            ...payload,
            ...(groupMode === "STATIC"
              ? { personnelIds: groupMembers.map((m) => m.personnelId) }
              : {}),
          },
        );
        setGroupNotice(`Updated “${payload.name}”.`);
      } else {
        await apiSend("/api/v1/industrial/emergency-alerts/groups", "POST", {
          ...payload,
          groupType: groupMode,
          dynamic: groupMode === "DYNAMIC",
          locationId: groupLocationId || undefined,
          departmentId: groupDepartmentId || undefined,
          ...(groupMode === "STATIC"
            ? { personnelIds: groupMembers.map((m) => m.personnelId) }
            : {}),
        });
        setGroupNotice(`Saved “${payload.name}”.`);
      }
      clearGroupForm();
      await loadGroups();
      await loadTargets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save alert group");
    } finally {
      setGroupBusy(false);
    }
  }

  async function setGroupEnabled(g: EmergencyAlertGroup, enabled: boolean) {
    setError("");
    setGroupNotice(null);
    setGroupBusy(true);
    try {
      await apiSend(
        `/api/v1/industrial/emergency-alerts/groups/${encodeURIComponent(g.id)}`,
        "PATCH",
        { enabled },
      );
      setGroupNotice(`${enabled ? "Enabled" : "Disabled"} “${g.name}”.`);
      await loadGroups();
      await loadTargets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update alert group");
    } finally {
      setGroupBusy(false);
    }
  }

  const smsStatusNote = friendlyDashboardSmsNote(dashboard);
  const canManageSmsSignupQr = SMS_SIGNUP_QR_MANAGE_PERMISSIONS.some((code) =>
    (me?.permissions ?? []).includes(code),
  );

  return (
    <section aria-labelledby="emergency-alerts-title" data-walkthrough="emergency-alerts">
      <ModuleWorkspaceHeader
        id="emergency-alerts-title"
        eyebrow="Emergency Management"
        title={moduleName}
        description="Send and manage emergency notifications across SMS, digital signage, and Forge."
        onRefresh={() => void refresh()}
        refreshing={loading}
      />

      <div className="d-flex flex-wrap gap-2 mb-3">
        <button type="button" className="btn btn-danger" onClick={() => setTab("compose")}>
          Send Emergency Alert
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => setTab("history")}
        >
          Alert History
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => setTab("templates")}
        >
          Manage Templates
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => setTab("groups")}
        >
          Alert Groups
        </button>
      </div>

      <ModuleWorkspaceTabs
        tabs={visibleTabs}
        active={tab}
        onChange={(id) => setTab(id as TabId)}
        ariaLabel="Emergency alerts sections"
      />

      {error ? (
        <div className="alert alert-warning" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      ) : null}

      {tab === "dashboard" ? (
        <div className="row g-3 mb-4">
          {[
            { label: "Active alerts", value: dashboard?.activeAlerts ?? "—" },
            { label: "Alerts sent today", value: dashboard?.alertsSentToday ?? "—" },
            {
              label: "SMS delivery rate",
              value:
                dashboard?.smsDeliveryRate == null
                  ? "—"
                  : `${dashboard.smsDeliveryRate.toFixed(1)}%`,
            },
            { label: "Acknowledgments pending", value: dashboard?.acknowledgmentsPending ?? "—" },
          ].map((card) => (
            <div className="col-6 col-md-3" key={card.label}>
              <div className="card border shadow-none h-100">
                <div className="card-body">
                  <div className="text-muted small">{card.label}</div>
                  <div className="fs-3 fw-semibold">{card.value}</div>
                </div>
              </div>
            </div>
          ))}
          {smsStatusNote ? (
            <div className="col-12">
              <p className="text-muted small mb-0">{smsStatusNote}</p>
            </div>
          ) : null}
          <div className="col-12">
            <div className="card border shadow-none">
              <div className="card-header">
                <h6 className="mb-0">Recent alerts</h6>
              </div>
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Headline</th>
                      <th>Status</th>
                      <th>Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.recent ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-muted">
                          No alerts yet.
                        </td>
                      </tr>
                    ) : (
                      dashboard!.recent.map((a) => (
                        <tr key={a.id}>
                          <td>{a.alertNumber}</td>
                          <td>
                            {a.isDrill ? <span className="badge bg-info me-1">DRILL</span> : null}
                            {a.headline}
                          </td>
                          <td>{formatAlertStatus(a.status)}</td>
                          <td>{a.issuedAt ? new Date(a.issuedAt).toLocaleString() : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="col-12">
            <EmergencySmsSignupQrCard canManage={canManageSmsSignupQr} />
          </div>
        </div>
      ) : null}

      {tab === "compose" ? (
        <div className="card border shadow-none mb-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h6 className="mb-0">Emergency Alert Composer</h6>
            {isDrill ? <span className="badge bg-info">DRILL / TEST</span> : null}
          </div>
          <div className="card-body">
            {templates.length > 0 ? (
              <div className="mb-3">
                <label className="form-label" htmlFor="ea-template">
                  Start from template
                </label>
                <select
                  id="ea-template"
                  className="form-select form-select-sm"
                  defaultValue=""
                  onChange={(e) => {
                    const t = templates.find((x) => x.id === e.target.value);
                    if (t) applyTemplate(t);
                  }}
                >
                  <option value="">Select a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <form onSubmit={(e) => void createAndSend(e)}>
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="ea-type">
                    Emergency type
                  </label>
                  <select
                    id="ea-type"
                    className="form-select"
                    value={alertType}
                    onChange={(e) => setAlertType(e.target.value)}
                  >
                    {EMERGENCY_ALERT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="ea-severity">
                    Severity
                  </label>
                  <select
                    id="ea-severity"
                    className="form-select"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                  >
                    {EMERGENCY_ALERT_SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-4 d-flex align-items-end gap-3">
                  <div className="form-check">
                    <input
                      id="ea-drill"
                      className="form-check-input"
                      type="checkbox"
                      checked={isDrill}
                      onChange={(e) => setIsDrill(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="ea-drill">
                      Mark as drill
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      id="ea-ack"
                      className="form-check-input"
                      type="checkbox"
                      checked={requiresAck}
                      onChange={(e) => setRequiresAck(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="ea-ack">
                      Require acknowledgment
                    </label>
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="ea-headline">
                    Headline
                  </label>
                  <input
                    id="ea-headline"
                    className="form-control"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    required
                    maxLength={300}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="ea-short">
                    Short message (SMS / CAP)
                  </label>
                  <textarea
                    id="ea-short"
                    className="form-control"
                    rows={2}
                    value={shortMessage}
                    onChange={(e) => setShortMessage(e.target.value)}
                    required
                    maxLength={500}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="ea-instructions">
                    Instructions
                  </label>
                  <textarea
                    id="ea-instructions"
                    className="form-control"
                    rows={3}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </div>
                <div className="col-12">
                  <div className="fw-semibold small mb-2">Audience</div>
                  <div className="d-flex flex-wrap gap-3 mb-3">
                    <div className="form-check">
                      <input
                        id="ea-aud-tenant"
                        className="form-check-input"
                        type="radio"
                        name="ea-audience"
                        checked={audienceScope === "TENANT"}
                        onChange={() => {
                          setAudienceScope("TENANT");
                          setLocationIds([]);
                          setDepartmentIds([]);
                          setGroupIds([]);
                        }}
                      />
                      <label className="form-check-label" htmlFor="ea-aud-tenant">
                        Entire tenant
                      </label>
                    </div>
                    <div className="form-check">
                      <input
                        id="ea-aud-targeted"
                        className="form-check-input"
                        type="radio"
                        name="ea-audience"
                        checked={audienceScope === "TARGETED"}
                        onChange={() => setAudienceScope("TARGETED")}
                      />
                      <label className="form-check-label" htmlFor="ea-aud-targeted">
                        Locations / departments / groups
                      </label>
                    </div>
                  </div>

                  {audienceScope === "TARGETED" ? (
                    <div className="row g-3 mb-3">
                      <div className="col-md-4">
                        <div
                          className="border rounded p-2"
                          style={{ maxHeight: 180, overflow: "auto" }}
                        >
                          <div className="fw-semibold small mb-2">Locations</div>
                          {(targets?.sites ?? []).length === 0 ? (
                            <p className="text-muted small mb-0">No sites found.</p>
                          ) : (
                            targets!.sites.map((s) => (
                              <div className="form-check" key={s.id}>
                                <input
                                  id={`ea-site-${s.id}`}
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={locationIds.includes(s.id)}
                                  onChange={() => toggleId(locationIds, s.id, setLocationIds)}
                                />
                                <label className="form-check-label" htmlFor={`ea-site-${s.id}`}>
                                  {s.name}
                                </label>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div
                          className="border rounded p-2"
                          style={{ maxHeight: 180, overflow: "auto" }}
                        >
                          <div className="fw-semibold small mb-2">Departments</div>
                          {(targets?.departments ?? [])
                            .filter(
                              (d) =>
                                !locationIds.length || !d.siteId || locationIds.includes(d.siteId),
                            )
                            .map((d) => (
                              <div className="form-check" key={d.id}>
                                <input
                                  id={`ea-dept-${d.id}`}
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={departmentIds.includes(d.id)}
                                  onChange={() => toggleId(departmentIds, d.id, setDepartmentIds)}
                                />
                                <label className="form-check-label" htmlFor={`ea-dept-${d.id}`}>
                                  {d.name}
                                </label>
                              </div>
                            ))}
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div
                          className="border rounded p-2"
                          style={{ maxHeight: 180, overflow: "auto" }}
                        >
                          <div className="fw-semibold small mb-2">Alert groups</div>
                          {(targets?.groups ?? []).length === 0 ? (
                            <p className="text-muted small mb-0">
                              No groups yet. Create one under Groups.
                            </p>
                          ) : (
                            targets!.groups.map((g) => (
                              <div className="form-check" key={g.id}>
                                <input
                                  id={`ea-grp-${g.id}`}
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={groupIds.includes(g.id)}
                                  onChange={() => toggleId(groupIds, g.id, setGroupIds)}
                                />
                                <label className="form-check-label" htmlFor={`ea-grp-${g.id}`}>
                                  {g.name}
                                  {g.dynamic ? (
                                    <span className="badge bg-secondary ms-1">dynamic</span>
                                  ) : null}
                                </label>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="border rounded p-3 bg-light mb-2">
                    <div className="fw-semibold small mb-2">
                      Recipients {previewLoading ? "(updating…)" : ""}
                    </div>
                    {preview ? (
                      <div className="row g-2 small">
                        <div className="col-6 col-md-3">Personnel: {preview.totalPersonnel}</div>
                        <div className="col-6 col-md-3">SMS eligible: {preview.smsEligible}</div>
                        <div className="col-6 col-md-3">
                          Unique SMS #: {preview.uniqueSmsNumbers}
                        </div>
                        <div className="col-6 col-md-3">Forge users: {preview.forgeUsers}</div>
                        <div className="col-6 col-md-3">Excluded: {preview.excluded}</div>
                        <div className="col-6 col-md-3">
                          Mvix locations: {preview.mvixLocations}
                        </div>
                        {preview.exclusions.length ? (
                          <div className="col-12 text-muted">
                            Exclusions:{" "}
                            {preview.exclusions.map((x) => `${x.reason} (${x.count})`).join(", ")}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-muted small mb-0">Recipient preview unavailable.</p>
                    )}
                  </div>
                </div>
                <div className="col-12">
                  <div className="fw-semibold small mb-2">Channels</div>
                  <div className="d-flex flex-wrap gap-3">
                    {EMERGENCY_ALERT_CHANNELS.map((ch) => (
                      <div className="form-check" key={ch.id}>
                        <input
                          id={`ea-ch-${ch.id}`}
                          className="form-check-input"
                          type="checkbox"
                          checked={channels.includes(ch.id)}
                          onChange={() => toggleChannel(ch.id)}
                        />
                        <label className="form-check-label" htmlFor={`ea-ch-${ch.id}`}>
                          {ch.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-muted small mt-2 mb-0">
                    Audience is resolved from personnel records
                    {dashboard?.smsProviderReady && dashboard?.smsEnabled
                      ? ". SMS is enabled for this organization."
                      : ". Text messaging is not enabled — in-app and display channels still deliver when selected."}
                  </p>
                </div>
                <div className="col-12">
                  <div className="form-check mb-3">
                    <input
                      id="ea-confirm"
                      className="form-check-input"
                      type="checkbox"
                      checked={confirmSend}
                      onChange={(e) => setConfirmSend(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="ea-confirm">
                      I have reviewed this alert and confirm sending
                      {isDrill ? " as a drill" : " as a live emergency alert"}.
                    </label>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <button type="submit" className="btn btn-danger" disabled={sending}>
                      {sending ? "Sending…" : isDrill ? "Send drill alert" : "Send alert"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        if (!headline || !shortMessage) {
                          setError("Headline and short message are required to save a template.");
                          return;
                        }
                        void (async () => {
                          setError("");
                          try {
                            await apiSend("/api/v1/industrial/emergency-alerts/templates", "POST", {
                              name: templateName || headline,
                              headline,
                              shortMessage,
                              instructions: instructions || undefined,
                              alertType,
                              severity,
                              channels,
                              requiresAcknowledgment: requiresAck,
                            });
                            setTemplateName("");
                            setTab("templates");
                          } catch (err) {
                            setError(
                              err instanceof ApiError ? err.message : "Unable to save template",
                            );
                          }
                        })();
                      }}
                    >
                      Save as template
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {tab === "active" || tab === "history" ? (
        <div className="card border shadow-none">
          <div className="card-header">
            <h6 className="mb-0">{tab === "active" ? "Active alerts" : "Alert history"}</h6>
          </div>
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Headline</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Issued</th>
                  {tab === "active" ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={tab === "active" ? 6 : 5} className="text-muted">
                      No alerts.
                    </td>
                  </tr>
                ) : (
                  alerts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.alertNumber}</td>
                      <td>
                        {a.isDrill ? <span className="badge bg-info me-1">DRILL</span> : null}
                        {a.headline}
                      </td>
                      <td>{a.severity}</td>
                      <td>{formatAlertStatus(a.status)}</td>
                      <td>{a.issuedAt ? new Date(a.issuedAt).toLocaleString() : "—"}</td>
                      {tab === "active" ? (
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success"
                            onClick={() => void allClear(a.id)}
                          >
                            All Clear
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "templates" ? (
        <div className="row g-3">
          <div className="col-lg-5">
            <div className="card border shadow-none">
              <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                <h6 className="mb-0">{editingTemplateId ? "Edit template" : "New template"}</h6>
                {editingTemplateId ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => clearTemplateForm()}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              <div className="card-body">
                {templateNotice ? (
                  <div className="alert alert-success py-2" role="status">
                    {templateNotice}
                  </div>
                ) : null}
                <form onSubmit={(e) => void saveTemplate(e)}>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="ea-tpl-name">
                      Name
                    </label>
                    <input
                      id="ea-tpl-name"
                      className="form-control form-control-sm"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="row g-2 mb-3">
                    <div className="col-6">
                      <label className="form-label" htmlFor="ea-tpl-type">
                        Type
                      </label>
                      <select
                        id="ea-tpl-type"
                        className="form-select form-select-sm"
                        value={alertType}
                        onChange={(e) => setAlertType(e.target.value)}
                      >
                        {EMERGENCY_ALERT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6">
                      <label className="form-label" htmlFor="ea-tpl-severity">
                        Severity
                      </label>
                      <select
                        id="ea-tpl-severity"
                        className="form-select form-select-sm"
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value)}
                      >
                        {EMERGENCY_ALERT_SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="ea-tpl-headline">
                      Headline
                    </label>
                    <input
                      id="ea-tpl-headline"
                      className="form-control form-control-sm"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="ea-tpl-short">
                      Short message
                    </label>
                    <textarea
                      id="ea-tpl-short"
                      className="form-control form-control-sm"
                      rows={2}
                      value={shortMessage}
                      onChange={(e) => setShortMessage(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="ea-tpl-instructions">
                      Instructions
                    </label>
                    <textarea
                      id="ea-tpl-instructions"
                      className="form-control form-control-sm"
                      rows={2}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                    />
                  </div>
                  <div className="mb-3">
                    <div className="form-label">Channels</div>
                    <div className="d-flex flex-wrap gap-3">
                      {EMERGENCY_ALERT_CHANNELS.map((ch) => (
                        <label
                          key={ch.id}
                          className="form-check mb-0"
                          htmlFor={`ea-tpl-ch-${ch.id}`}
                        >
                          <input
                            id={`ea-tpl-ch-${ch.id}`}
                            type="checkbox"
                            className="form-check-input"
                            checked={channels.includes(ch.id)}
                            onChange={() =>
                              setChannels((prev) =>
                                prev.includes(ch.id)
                                  ? prev.filter((x) => x !== ch.id)
                                  : [...prev, ch.id],
                              )
                            }
                          />
                          <span className="form-check-label">{ch.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="form-check mb-3">
                    <input
                      id="ea-tpl-ack"
                      type="checkbox"
                      className="form-check-input"
                      checked={requiresAck}
                      onChange={(e) => setRequiresAck(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="ea-tpl-ack">
                      Requires acknowledgment
                    </label>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={templateBusy}>
                    {templateBusy
                      ? "Saving…"
                      : editingTemplateId
                        ? "Update template"
                        : "Save template"}
                  </button>
                </form>
              </div>
            </div>
            <div className="card border shadow-none mt-3">
              <div className="card-body">
                {previewTemplateId ? (
                  <p className="small text-muted mb-3">
                    Previewing saved template
                    {templateName.trim() ? ` “${templateName.trim()}”` : ""}. Edit fields above or
                    choose another template.
                  </p>
                ) : null}
                <EmergencyAlertMessagePreview
                  alertType={alertType}
                  severity={severity}
                  headline={headline}
                  shortMessage={shortMessage}
                  instructions={instructions}
                  channels={channels}
                />
              </div>
            </div>
          </div>
          <div className="col-lg-7">
            <div className="card border shadow-none">
              <div className="card-header">
                <h6 className="mb-0">Templates</h6>
              </div>
              <ul className="list-group list-group-flush">
                {templates.length === 0 ? (
                  <li className="list-group-item text-muted">No templates yet.</li>
                ) : (
                  templates.map((t) => (
                    <li
                      key={t.id}
                      className={`list-group-item d-flex justify-content-between align-items-start gap-2 ${
                        previewTemplateId === t.id || editingTemplateId === t.id ? "bg-light" : ""
                      }`}
                    >
                      <div>
                        <div className="fw-semibold">{t.name}</div>
                        <div className="small text-muted">
                          {t.alertType} · {t.severity} · {t.headline}
                        </div>
                      </div>
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => previewSavedTemplate(t)}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={() => applyTemplate(t)}
                        >
                          Use
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={templateBusy}
                          onClick={() => beginEditTemplate(t)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          disabled={templateBusy}
                          onClick={() => void deleteTemplate(t)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "groups" ? (
        <div className="row g-3">
          <div className="col-lg-5">
            <div className="card border shadow-none">
              <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                <h6 className="mb-0">
                  {editingGroupId ? "Edit alert group" : "Create alert group"}
                </h6>
                {editingGroupId ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => clearGroupForm()}
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>
              <div className="card-body">
                {groupNotice ? (
                  <div className="alert alert-success py-2" role="status">
                    {groupNotice}
                  </div>
                ) : null}
                <form onSubmit={(e) => void saveGroup(e)}>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="ea-group-name">
                      Name
                    </label>
                    <input
                      id="ea-group-name"
                      className="form-control form-control-sm"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="ea-group-mode">
                      Type
                    </label>
                    <select
                      id="ea-group-mode"
                      className="form-select form-select-sm"
                      value={groupMode}
                      onChange={(e) => {
                        const next = e.target.value as "STATIC" | "DYNAMIC";
                        setGroupMode(next);
                        if (next === "DYNAMIC") {
                          setGroupMembers([]);
                          setMemberSearchHits([]);
                        }
                      }}
                      disabled={Boolean(editingGroupId)}
                    >
                      <option value="DYNAMIC">Dynamic (rules)</option>
                      <option value="STATIC">Static (manual members later)</option>
                    </select>
                    {editingGroupId ? (
                      <div className="form-text">Group type cannot be changed after creation.</div>
                    ) : null}
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="ea-group-loc">
                      Location rule
                    </label>
                    <select
                      id="ea-group-loc"
                      className="form-select form-select-sm"
                      value={groupLocationId}
                      onChange={(e) => setGroupLocationId(e.target.value)}
                    >
                      <option value="">Any / none</option>
                      {(targets?.sites ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="ea-group-dept">
                      Department rule
                    </label>
                    <select
                      id="ea-group-dept"
                      className="form-select form-select-sm"
                      value={groupDepartmentId}
                      onChange={(e) => setGroupDepartmentId(e.target.value)}
                    >
                      <option value="">Any / none</option>
                      {(targets?.departments ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {groupMode === "STATIC" ? (
                    <div className="mb-3">
                      <div className="form-label">Members ({groupMembers.length})</div>
                      <div className="input-group input-group-sm mb-2">
                        <input
                          id="ea-group-member-search"
                          className="form-control"
                          placeholder="Search personnel by name or employee #"
                          value={memberSearchQ}
                          onChange={(e) => setMemberSearchQ(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void searchGroupMembers();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          disabled={memberSearchBusy || groupBusy}
                          onClick={() => void searchGroupMembers()}
                        >
                          {memberSearchBusy ? "Searching…" : "Search"}
                        </button>
                      </div>
                      {memberSearchHits.length > 0 ? (
                        <ul className="list-group list-group-flush border rounded mb-2">
                          {memberSearchHits.map((hit) => (
                            <li
                              key={hit.id}
                              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 px-2"
                            >
                              <div className="small">
                                <div className="fw-semibold">{hit.displayName}</div>
                                <div className="text-muted">
                                  {[hit.employeeNumber, hit.status].filter(Boolean).join(" · ") ||
                                    "Personnel"}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                disabled={groupBusy}
                                onClick={() => addGroupMember(hit)}
                              >
                                Add
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {groupMembers.length === 0 ? (
                        <p className="small text-muted mb-0">
                          No members yet. Search and add personnel to this static group.
                          {editingGroupId
                            ? " Changes save as soon as you add or remove someone."
                            : " Members are saved when you create the group."}
                        </p>
                      ) : (
                        <ul className="list-group list-group-flush border rounded">
                          {groupMembers.map((m) => (
                            <li
                              key={m.personnelId}
                              className="list-group-item d-flex justify-content-between align-items-center py-2 px-2"
                            >
                              <div className="small">
                                <div className="fw-semibold">{m.displayName}</div>
                                <div className="text-muted">
                                  {[m.employeeNumber, m.phone, m.status]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                disabled={groupBusy}
                                onClick={() => removeGroupMember(m.personnelId)}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                  <button type="submit" className="btn btn-primary btn-sm" disabled={groupBusy}>
                    {groupBusy ? "Saving…" : editingGroupId ? "Update group" : "Save group"}
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div className="col-lg-7">
            <div className="card border shadow-none">
              <div className="card-header">
                <h6 className="mb-0">Groups</h6>
              </div>
              <ul className="list-group list-group-flush">
                {groups.length === 0 ? (
                  <li className="list-group-item text-muted">No alert groups yet.</li>
                ) : (
                  groups.map((g) => {
                    const locationName =
                      targets?.sites.find((s) => s.id === g.locationId)?.name ?? null;
                    const departmentName =
                      targets?.departments.find((d) => d.id === g.departmentId)?.name ?? null;
                    const ruleBits = [locationName, departmentName].filter(Boolean);
                    return (
                      <li
                        key={g.id}
                        className={`list-group-item d-flex justify-content-between align-items-start gap-2 ${
                          editingGroupId === g.id ? "bg-light" : ""
                        }`}
                      >
                        <div>
                          <div className="fw-semibold">
                            {g.name} <span className="badge bg-secondary">{g.groupType}</span>
                            {!g.enabled ? (
                              <span className="badge bg-warning ms-1">disabled</span>
                            ) : null}
                          </div>
                          <div className="small text-muted">
                            {g.dynamic
                              ? ruleBits.length
                                ? `Rules: ${ruleBits.join(" · ")}`
                                : "Resolves members at send time from rules"
                              : `${g.memberCount} static member(s)`}
                          </div>
                        </div>
                        <div className="btn-group btn-group-sm">
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            disabled={groupBusy}
                            onClick={() => void beginEditGroup(g)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            disabled={groupBusy}
                            onClick={() => void setGroupEnabled(g, !g.enabled)}
                          >
                            {g.enabled ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

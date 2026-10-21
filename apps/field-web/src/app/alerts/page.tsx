"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@forge/web-kit";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { useUnreadNotificationCount } from "@/hooks/use-my-work";
import { emergencyApi } from "@/lib/emergency-api";
import { isEmergencyFeatureModuleEnabled } from "@/lib/field-modules";
import {
  alertAppliesToLocation,
  isActiveEmergencyAlert,
  type FieldEmergencyAlert,
} from "@/lib/emergency";
import {
  annotateFieldNotificationClusters,
  fieldHrefForNotification,
  fieldNotificationCardTitle,
  fieldNotificationsApi,
  groupFieldNotificationsByPerson,
  initialsFromDisplayName,
  type FieldNotification,
} from "@/lib/notifications-api";

function formatAlertTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export default function AlertsPage() {
  const router = useRouter();
  const unread = useUnreadNotificationCount();
  const org = useFieldOrgOptional();
  const { can, activeModules, opts, moduleEnabled } = useFieldPermissions();
  const [alerts, setAlerts] = useState<FieldEmergencyAlert[]>([]);
  const [notifications, setNotifications] = useState<FieldNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locationId = org?.selection.locationId ?? "";
  const emergencyOn = isEmergencyFeatureModuleEnabled(activeModules, opts);
  const canView = can("field.emergency.view");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [alertRows, noteRows] = await Promise.all([
        emergencyOn && canView && moduleEnabled("EMERGENCY_ALERTS")
          ? emergencyApi.listActiveAlerts().catch(() => [] as FieldEmergencyAlert[])
          : Promise.resolve([] as FieldEmergencyAlert[]),
        fieldNotificationsApi.list(50).catch(() => [] as FieldNotification[]),
      ]);
      setAlerts(alertRows.filter(isActiveEmergencyAlert));
      setNotifications(noteRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load alerts");
      setAlerts([]);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [emergencyOn, canView, moduleEnabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleAlerts = useMemo(
    () => alerts.filter((alert) => alertAppliesToLocation(alert, locationId)),
    [alerts, locationId],
  );

  const unreadNotes = useMemo(
    () => notifications.filter((n) => !n.readAt),
    [notifications],
  );

  const notificationGroups = useMemo(
    () =>
      groupFieldNotificationsByPerson(notifications).map((group) => ({
        ...group,
        items: annotateFieldNotificationClusters(group.items),
      })),
    [notifications],
  );

  async function openNotification(note: FieldNotification) {
    const href = fieldHrefForNotification(note.href);
    if (!note.readAt) {
      setBusy(true);
      try {
        await fieldNotificationsApi.markRead(note.id);
      } catch {
        // Navigation still proceeds; count will refresh later.
      } finally {
        setBusy(false);
      }
    }
    router.push(href);
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await fieldNotificationsApi.markAllRead();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not mark notifications read");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="ff-page-title">Alerts</h1>
      <p className="ff-page-body">
        Active emergency notices and notifications for Forge Safety - Field Version.
      </p>

      {loading ? <LoadingState label="Loading alerts…" /> : null}
      {!loading && error ? (
        <ErrorState title="Alerts unavailable" message={error} onRetry={() => void refresh()} />
      ) : null}

      {!loading && !error && visibleAlerts.length > 0 ? (
        <section className="ff-section" aria-label="Active emergency alerts">
          <h2 className="ff-section-title">Active emergency alerts</h2>
          <div className="ff-task-list">
            {visibleAlerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                className="ff-task-card"
                onClick={() =>
                  router.push(
                    `/more/emergency/?id=${encodeURIComponent(alert.id)}&kind=alert`,
                  )
                }
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
          <button
            type="button"
            className="ff-btn ff-btn-secondary"
            onClick={() => router.push("/more/emergency/")}
          >
            Open Emergency hub
          </button>
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="ff-section" aria-label="Notifications">
          <div className="ff-section-head">
            <h2 className="ff-section-title ff-section-title--inline">Notifications</h2>
            {unreadNotes.length > 0 ? (
              <button
                type="button"
                className="ff-link-btn"
                disabled={busy}
                onClick={() => void markAllRead()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {notifications.length === 0 ? (
            <EmptyState
              title={visibleAlerts.length > 0 ? "No other notifications" : "No alerts right now"}
              message={
                unread > 0
                  ? `${unread} unread on the badge — pull to refresh if the list is empty.`
                  : "When you have notifications, they will appear here with Field deep links."
              }
            />
          ) : (
            <div className="ff-alerts-groups">
              {notificationGroups.map((group) =>
                group.isPerson ? (
                  <div key={group.key} className="ff-alerts-thread" aria-label={`Messages from ${group.label}`}>
                    {group.items.map((note) => {
                      const body = fieldNotificationCardTitle(note, { underPersonHeader: true });
                      const time = formatAlertTime(note.createdAt);
                      return (
                        <div
                          key={note.id}
                          className={[
                            "ff-alerts-msg",
                            note.isClusterStart ? "ff-alerts-msg--cluster-start" : "",
                            note.isClusterEnd ? "ff-alerts-msg--cluster-end" : "",
                            !note.isClusterStart && !note.isClusterEnd
                              ? "ff-alerts-msg--cluster-middle"
                              : "",
                            note.readAt ? "ff-alerts-msg--read" : "ff-alerts-msg--unread",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {note.showSender ? (
                            <span className="ff-alerts-msg-avatar" aria-hidden="true">
                              {initialsFromDisplayName(group.label)}
                            </span>
                          ) : (
                            <span className="ff-alerts-msg-avatar-spacer" aria-hidden="true" />
                          )}
                          <div className="ff-alerts-msg-stack">
                            {note.showSender ? (
                              <div className="ff-alerts-msg-meta">
                                <span className="ff-alerts-msg-sender">{group.label}</span>
                                {time ? <span className="ff-alerts-msg-time">{time}</span> : null}
                              </div>
                            ) : null}
                            <button
                              type="button"
                              className="ff-alerts-bubble"
                              disabled={busy}
                              onClick={() => void openNotification(note)}
                            >
                              <span className="ff-alerts-bubble-body">{body}</span>
                              {!note.showSender && time ? (
                                <span className="ff-alerts-bubble-time">{time}</span>
                              ) : null}
                              {!note.readAt ? (
                                <span className="ff-alerts-bubble-unread">Unread</span>
                              ) : null}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div key={group.key} className="ff-task-list">
                    {group.items.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        className="ff-task-card"
                        disabled={busy}
                        onClick={() => void openNotification(note)}
                      >
                        <div className="ff-task-card-body">
                          <span className="ff-task-kind">
                            {note.readAt ? "Read" : "Unread"}
                            {note.priority ? ` · ${note.priority}` : ""}
                          </span>
                          <span className="ff-task-title">
                            {fieldNotificationCardTitle(note)}
                          </span>
                          <span className="ff-meta">
                            {[note.body, formatAlertTime(note.createdAt)].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}

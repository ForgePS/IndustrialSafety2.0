"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShortcuts } from "@/components/dashboard-shortcuts";
import { EmptyState, ErrorState, LoadingState } from "@/components/field-states";
import { TaskCard } from "@/components/task-card";
import { useFieldOrgOptional } from "@/components/field-org-provider";
import { useFieldPermissions } from "@/components/field-permissions-provider";
import { useUnreadNotificationCount, useMyWork } from "@/hooks/use-my-work";
import type { FieldProfile } from "@/hooks/use-field-profile";
import { firstNameFromDisplay, timeOfDayGreeting } from "@/lib/greeting";
import {
  buildHomeStatusCards,
  HOME_QUICK_ACTIONS,
  todayWorkItems,
} from "@/lib/home-status";
import {
  filterTasksForDivision,
  filterTasksForLocation,
} from "@/lib/my-work";

export function HomeScreen({
  profile,
  tenantName,
}: {
  profile: FieldProfile | null;
  tenantName: string;
}) {
  const router = useRouter();
  const org = useFieldOrgOptional();
  const { permissions, opts, can, featureEnabled, activeModules } = useFieldPermissions();
  const { data: myWork, loading, error, refresh } = useMyWork();
  const unread = useUnreadNotificationCount();
  const [recent, setRecent] = useState<Array<{ token: string; label: string }>>([]);
  const name = firstNameFromDisplay(profile?.preferredName || profile?.displayName);
  const roleLabel = profile?.roles[0]?.roleName ?? "Team Member";

  useEffect(() => {
    void import("@/lib/scan-public").then(({ readRecentScans }) => {
      setRecent(readRecentScans(4));
    });
  }, []);

  const scopedItems = useMemo(() => {
    const items = myWork?.items ?? [];
    return filterTasksForDivision(
      filterTasksForLocation(items, org?.selection.locationId),
      org?.selection.divisionName,
    );
  }, [myWork?.items, org?.selection.divisionName, org?.selection.locationId]);

  const scopedData = useMemo(() => {
    if (!myWork) return null;
    return { ...myWork, items: scopedItems };
  }, [myWork, scopedItems]);

  const statusCards = buildHomeStatusCards(scopedData);
  const todayItems = todayWorkItems(scopedData, 5);

  const orgLine = tenantName?.trim() || "";

  const quickActions = HOME_QUICK_ACTIONS.filter((action) => {
    if (action.id === "scan") return can("field.scan") || featureEnabled("scan");
    if (action.id === "incident") return can("field.incidents.create");
    if (action.id === "observation") return can("field.observations.create");
    if (action.id === "inspection") return can("field.inspections.perform");
    if (action.id === "jsa") return can("field.jsa.execute");
    if (action.id === "supplies") return featureEnabled("more-safety-supplies");
    return true;
  });

  return (
    <>
      <header className="ff-header">
        <div>
          <p className="ff-greeting">
            {timeOfDayGreeting()}, {name}
          </p>
          <p className="ff-meta">
            {roleLabel}
            {orgLine ? ` · ${orgLine}` : ""}
          </p>
        </div>
        <div className="ff-header-actions">
          <button
            type="button"
            className="ff-icon-btn"
            aria-label={unread ? `${unread} unread notifications` : "Notifications"}
            onClick={() => router.push("/alerts/")}
          >
            {unread > 0 ? <span className="ff-badge">{unread > 9 ? "9+" : unread}</span> : null}
            <span className="ff-icon-btn-label">Alerts</span>
          </button>
          <button
            type="button"
            className="ff-icon-btn"
            aria-label="Profile and settings"
            onClick={() => router.push("/me/")}
          >
            <span className="ff-icon-btn-label">Me</span>
          </button>
        </div>
      </header>

      <button
        type="button"
        className="ff-scan-hero"
        onClick={() => router.push("/scan/")}
        aria-label="Scan QR code"
      >
        SCAN QR CODE
      </button>

      <section className="ff-section" aria-labelledby="status-heading">
        <div className="ff-section-head">
          <h2 id="status-heading" className="ff-section-title ff-section-title--inline">
            Status
          </h2>
          <button type="button" className="ff-link-btn" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {loading && !myWork ? <LoadingState label="Loading your work…" /> : null}
        {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
        <div className="ff-status-grid">
          {statusCards.map((card) => (
            <button
              key={card.id}
              type="button"
              className={`ff-status-card${card.tone === "warn" ? " ff-status-card--warn" : ""}`}
              onClick={() => router.push(card.href)}
            >
              <span className="ff-status-card__count">{card.count == null ? "—" : card.count}</span>
              <span className="ff-status-card__label">{card.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="ff-section" aria-labelledby="quick-heading">
        <h2 id="quick-heading" className="ff-section-title">
          Quick Actions
        </h2>
        <div className="ff-action-grid">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="ff-action-tile"
              onClick={() => router.push(action.href)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <section className="ff-section" aria-labelledby="today-heading">
        <div className="ff-section-head">
          <h2 id="today-heading" className="ff-section-title ff-section-title--inline">
            Today
          </h2>
          <button type="button" className="ff-link-btn" onClick={() => router.push("/tasks/")}>
            My Work
          </button>
        </div>
        {todayItems.length === 0 && !loading ? (
          <EmptyState title="You're caught up" message="No assigned work needs attention right now." />
        ) : (
          <div className="ff-task-list">
            {todayItems.map((item) => (
              <TaskCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </section>

      <DashboardShortcuts
        permissions={permissions}
        activeModules={activeModules}
        {...opts}
      />

      {recent.length > 0 ? (
        <section className="ff-section" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="ff-section-title">
            Recent
          </h2>
          <div className="ff-recent-list">
            {recent.map((item) => (
              <button
                key={item.token}
                type="button"
                className="ff-recent-item"
                onClick={() => router.push(`/scan/${encodeURIComponent(item.token)}/`)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

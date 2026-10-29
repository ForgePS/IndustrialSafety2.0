"use client";

import Link from "next/link";
import { useAuth, useFeatureFlags } from "@forge/web-kit";
import { RMS_FEATURE_FLAGS } from "@/lib/constants";
import { DashboardEmptyState } from "../DashboardStates";
import type { DashboardWidgetComponentProps } from "../types";

export function QuickActionsWidget(_props: DashboardWidgetComponentProps) {
  const { me } = useAuth();
  const { flags } = useFeatureFlags(Object.values(RMS_FEATURE_FLAGS));
  if (!me) {
    return (
      <DashboardEmptyState title="Sign in required" description="Sign in to use quick actions." />
    );
  }

  const actions: Array<{ href: string; label: string }> = [];
  if (flags[RMS_FEATURE_FLAGS.manualIntake]) {
    actions.push({ href: "/incidents/new/", label: "Create incident" });
  }
  if (flags[RMS_FEATURE_FLAGS.incidentShell]) {
    actions.push({ href: "/incidents/", label: "Open incidents" });
  }
  if (flags[RMS_FEATURE_FLAGS.officerReview]) {
    actions.push({ href: "/review/", label: "Open review queue" });
  }
  if (flags[RMS_FEATURE_FLAGS.cadEnabled]) {
    actions.push({ href: "/cad/conflicts/", label: "CAD conflicts" });
  }
  if (flags[RMS_FEATURE_FLAGS.tenantConfiguration]) {
    actions.push({ href: "/configuration/", label: "NERIS configuration" });
  }

  if (actions.length === 0) {
    return (
      <DashboardEmptyState
        title="No actions available"
        description="No enabled capabilities expose quick actions for this tenant."
      />
    );
  }

  return (
    <ul className="rms-fx-widget__list">
      {actions.map((action) => (
        <li key={action.href}>
          <Link href={action.href}>{action.label}</Link>
        </li>
      ))}
    </ul>
  );
}

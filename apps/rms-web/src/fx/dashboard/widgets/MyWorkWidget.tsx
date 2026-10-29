"use client";

import Link from "next/link";
import { useAuth, useFeatureFlags } from "@forge/web-kit";
import { RMS_FEATURE_FLAGS } from "@/lib/constants";
import { DashboardEmptyState } from "../DashboardStates";
import type { DashboardWidgetComponentProps } from "../types";

/** Aggregates links to existing queues — no fabricated counts. */
export function MyWorkWidget(_props: DashboardWidgetComponentProps) {
  const { me } = useAuth();
  const { flags } = useFeatureFlags([
    RMS_FEATURE_FLAGS.officerReview,
    RMS_FEATURE_FLAGS.incidentShell,
    RMS_FEATURE_FLAGS.cadEnabled,
  ]);

  if (!me) {
    return (
      <DashboardEmptyState title="Sign in required" description="Sign in to see My Work links." />
    );
  }

  const links: Array<{ href: string; label: string }> = [];
  if (flags[RMS_FEATURE_FLAGS.officerReview])
    links.push({ href: "/review/", label: "Review queue" });
  if (flags[RMS_FEATURE_FLAGS.incidentShell])
    links.push({ href: "/incidents/", label: "Incidents" });
  if (flags[RMS_FEATURE_FLAGS.cadEnabled])
    links.push({ href: "/cad/conflicts/", label: "CAD conflicts" });

  if (links.length === 0) {
    return (
      <DashboardEmptyState
        title="No work queues enabled"
        description="No supported My Work sources are enabled for this tenant."
      />
    );
  }

  return (
    <ul className="rms-fx-widget__list">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href}>{link.label}</Link>
        </li>
      ))}
    </ul>
  );
}

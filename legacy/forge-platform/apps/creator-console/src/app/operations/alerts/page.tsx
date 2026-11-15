"use client";

import { EmptyState, ForgePageHeader } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import styles from "../../page.module.css";

function OperationsAlertsInner() {
  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Operations alerts"
        subtitle="Operational alerts when a platform alerts API is available."
      />

      <EmptyState
        title="Not available"
        description="No alerts endpoint is wired in Creator Console yet. This page will list alerts from a live API when one exists."
      />
    </section>
  );
}

export default function OperationsAlertsPage() {
  return (
    <PlatformPageGate title="Operations alerts" permission="platform.tenant.read">
      <OperationsAlertsInner />
    </PlatformPageGate>
  );
}

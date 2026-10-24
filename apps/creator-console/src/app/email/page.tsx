"use client";

import { ComingLater, ForgePageHeader, ForgeStatusCard, ForgeMetricGrid } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import styles from "../page.module.css";

export default function EmailPage() {
  return (
    <PlatformPageGate title="Email" permission="platform.tenant.read">
      <section className={styles.page}>
        <ForgePageHeader
          title="Email service"
          subtitle="Sending domain and delivery readiness for Forge notifications."
        />
        <ForgeMetricGrid>
          <ForgeStatusCard
            title="Status"
            status="Unavailable"
            detail="No email health endpoint yet"
          />
          <ForgeStatusCard title="Sending domain" status="Unavailable" />
          <ForgeStatusCard title="DKIM" status="Unavailable" />
          <ForgeStatusCard title="Sending access" status="Unavailable" />
        </ForgeMetricGrid>
        <div className={styles.panel}>
          <ComingLater>
            When email configuration is connected, this page will show Ready / Not ready with clear
            next steps — not raw provider flags. Use Advanced → Developer Tools only if you need
            technical detail.
          </ComingLater>
        </div>
      </section>
    </PlatformPageGate>
  );
}

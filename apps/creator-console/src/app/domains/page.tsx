"use client";

import { ComingLater, ForgePageHeader } from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import styles from "../page.module.css";

export default function DomainsPage() {
  return (
    <PlatformPageGate title="Domains" permission="platform.configuration.update">
      <section className={styles.page}>
        <ForgePageHeader
          title="Domains / Web addresses"
          subtitle="Manage customer application web addresses. Advanced CDN details stay hidden by default."
        />
        <div className={styles.panel}>
          <ComingLater>
            Domain provisioning and SSL status will appear here. Meanwhile, set the customer slug
            during Add Customer and manage branding from Configuration → Branding.
          </ComingLater>
        </div>
      </section>
    </PlatformPageGate>
  );
}

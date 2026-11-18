"use client";

import styles from "../app/page.module.css";

export function TenantRequired() {
  return (
    <div className={styles.panel}>
      <p className={styles.lead} style={{ marginBottom: 0 }}>
        No tenant context. Sign in so the session tenant is available, or append{" "}
        <code>?tenantId=…</code> to this URL.
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import styles from "../app/page.module.css";

export function TenantRequired() {
  return (
    <div className={styles.panel}>
      <p className={styles.lead} style={{ marginBottom: 0 }}>
        Select a tenant first via <Link href="/select-tenant">Select tenant</Link>, open a tenant
        from <Link href="/tenants">Tenants</Link>, or append <code>?tenantId=…</code> to this URL.
      </p>
    </div>
  );
}

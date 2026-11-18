"use client";

import Link from "next/link";
import { Suspense } from "react";
import { TenantPageGate } from "@/components/tenant-page-gate";
import { useAuth } from "@/hooks/use-auth";
import styles from "../page.module.css";

function SecurityInner() {
  const { me, signOutAll } = useAuth();

  return (
    <section className={styles.page}>
      <h1>Security</h1>
      <p className={styles.lead}>Session and access controls for this admin console.</p>

      <div className={styles.panel}>
        <h2>Session</h2>
        <dl className={styles.dl}>
          <dt>User</dt>
          <dd className={styles.mono}>{me?.userId ?? "—"}</dd>
          <dt>Tenant</dt>
          <dd className={styles.mono}>{me?.tenantId ?? "—"}</dd>
          <dt>Auth provider</dt>
          <dd>{me?.authProvider ?? "—"}</dd>
          <dt>Platform admin</dt>
          <dd>{me?.isPlatformAdmin ? "Yes" : "No"}</dd>
        </dl>
        <div className={styles.actions} style={{ marginTop: "1rem" }}>
          <button className={styles.buttonDanger} type="button" onClick={() => void signOutAll()}>
            Sign out all sessions
          </button>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Permissions in session</h2>
        {(me?.permissions?.length ?? 0) === 0 ? (
          <p className={styles.muted}>None loaded.</p>
        ) : (
          <ul>
            {me!.permissions.slice(0, 40).map((code) => (
              <li key={code} className={styles.mono}>
                {code}
              </li>
            ))}
            {me!.permissions.length > 40 ? (
              <li className={styles.muted}>…and {me!.permissions.length - 40} more</li>
            ) : null}
          </ul>
        )}
      </div>

      <nav className={styles.linkRow}>
        <Link href="/profile">Profile</Link>
        <Link href="/audit">Audit</Link>
      </nav>
    </section>
  );
}

export default function SecurityPage() {
  return (
    <TenantPageGate title="Security" permission="platform.tenant.read">
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <SecurityInner />
      </Suspense>
    </TenantPageGate>
  );
}

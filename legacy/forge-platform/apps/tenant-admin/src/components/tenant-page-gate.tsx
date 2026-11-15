"use client";

import type { ReactNode } from "react";
import { Can, PermissionDenied } from "@forge/ui";
import { useAuth } from "@/hooks/use-auth";
import styles from "../app/page.module.css";

/**
 * Client-side page gate for Tenant Admin (MK-S12).
 * API RequirePermission remains authoritative; this prevents relying on hidden nav.
 */
export function TenantPageGate({
  title,
  permission,
  anyOf,
  children,
}: {
  title: string;
  permission?: string;
  anyOf?: readonly string[];
  children: ReactNode;
}) {
  const { hasPermission, me, loading } = useAuth();

  const allowed =
    Boolean(me?.isPlatformAdmin) ||
    (permission ? hasPermission(permission) : false) ||
    (anyOf ? anyOf.some((code) => hasPermission(code)) : false);

  if (loading && !me) {
    return (
      <section className={styles.page}>
        <h1>{title}</h1>
        <p className={styles.muted}>Checking permissions…</p>
      </section>
    );
  }

  return (
    <Can
      allowed={allowed}
      fallback={
        <section className={styles.page}>
          <h1>{title}</h1>
          <PermissionDenied
            title="Permission required"
            description={
              anyOf?.length
                ? `Requires one of: ${anyOf.join(", ")}`
                : permission
                  ? `Requires permission: ${permission}`
                  : "You do not have permission to view this page."
            }
          />
        </section>
      }
    >
      {children}
    </Can>
  );
}

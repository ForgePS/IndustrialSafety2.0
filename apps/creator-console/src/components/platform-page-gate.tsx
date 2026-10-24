"use client";

import type { ReactNode } from "react";
import { Can } from "@forge/ui";
import { SignInPanel } from "@/components/sign-in-panel";
import { useAuth } from "@/hooks/use-auth";
import styles from "../app/page.module.css";

/**
 * Client-side page gate for Creator Console (MK-S11).
 * API RequirePermission remains authoritative; this prevents relying on hidden nav.
 */
export function PlatformPageGate({
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
  const { hasPermission, me, loading, error, refresh, loginWithCognito } = useAuth();

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

  if (!me) {
    return (
      <section className={styles.page}>
        <h1>{title}</h1>
        <SignInPanel
          error={error}
          actions={
            <>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void loginWithCognito()}
              >
                Sign in
              </button>
              {error ? (
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={() => void refresh()}
                >
                  Retry
                </button>
              ) : null}
            </>
          }
        />
      </section>
    );
  }

  return (
    <Can
      allowed={allowed}
      fallback={
        <section className={styles.page}>
          <h1>{title}</h1>
          <div className="card creator-sign-in-panel">
            <div className="card-body">
              <h5 className="mb-2">Permission required</h5>
              <p className="text-muted mb-0">
                {anyOf?.length
                  ? `Requires one of: ${anyOf.join(", ")}`
                  : permission
                    ? `Requires permission: ${permission}`
                    : "You do not have permission to view this page."}
              </p>
            </div>
          </div>
        </section>
      }
    >
      {children}
    </Can>
  );
}

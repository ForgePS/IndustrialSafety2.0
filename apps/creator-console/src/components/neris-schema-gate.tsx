"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiGet } from "@/lib/api";
import styles from "../app/page.module.css";

const SCHEMA_BROWSER_FLAG = "rms.neris.schema_browser.enabled";

export function NerisSchemaGate({ title, children }: { title: string; children: ReactNode }) {
  const { hasPermission, me } = useAuth();
  const canRead = hasPermission("platform.neris.schema.read");
  const isPlatformAdmin = Boolean(me?.isPlatformAdmin);
  const [flagEnabled, setFlagEnabled] = useState<boolean | null>(null);
  const [flagError, setFlagError] = useState<string | null>(null);

  const loadFlag = useCallback(async () => {
    if (!me?.tenantId || !canRead) {
      setFlagEnabled(false);
      return;
    }
    if (isPlatformAdmin) {
      setFlagEnabled(true);
      return;
    }
    try {
      const features = await apiGet<Array<{ key: string; value: unknown }>>(
        `/api/v1/tenants/${me.tenantId}/features/effective`,
      );
      const match = features.find((f) => f.key === SCHEMA_BROWSER_FLAG);
      setFlagEnabled(match ? Boolean(match.value) : false);
    } catch (err) {
      setFlagError(err instanceof Error ? err.message : "Failed to resolve feature flag");
      setFlagEnabled(false);
    }
  }, [me?.tenantId, canRead, isPlatformAdmin]);

  useEffect(() => {
    void loadFlag();
  }, [loadFlag]);

  if (!canRead) {
    return (
      <section className={styles.page}>
        <h1>{title}</h1>
        <p className={styles.error}>You do not have permission to browse NERIS schema.</p>
      </section>
    );
  }

  if (flagEnabled === null) {
    return (
      <section className={styles.page}>
        <h1>{title}</h1>
        <p>Checking feature flag…</p>
      </section>
    );
  }

  if (!flagEnabled) {
    return (
      <section className={styles.page}>
        <h1>{title}</h1>
        <p className={styles.error}>
          NERIS schema browser is not enabled for this tenant ({SCHEMA_BROWSER_FLAG}).
          {flagError ? ` ${flagError}` : ""}
        </p>
        <p>
          Platform administrators can enable the flag under Feature flags, or sign in as a creator
          principal.
        </p>
      </section>
    );
  }

  return <>{children}</>;
}

export function NerisNav() {
  const links = [
    { href: "/neris/packages", label: "Packages / imports" },
    { href: "/neris/versions", label: "Versions" },
    { href: "/neris/modules", label: "Modules" },
    { href: "/neris/fields", label: "Fields" },
    { href: "/neris/value-sets", label: "Value sets" },
    { href: "/neris/conditions", label: "Conditions" },
    { href: "/neris/mappings", label: "Mappings" },
    { href: "/neris/validation", label: "Validation" },
  ];
  return (
    <p className={styles.muted}>
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? " · " : null}
          <Link href={link.href}>{link.label}</Link>
        </span>
      ))}
    </p>
  );
}

export function NerisPageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <section className={styles.page}>
          <h1>{title}</h1>
          <p>Loading…</p>
        </section>
      }
    >
      <NerisSchemaGate title={title}>
        <section className={styles.page}>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <p className={styles.muted}>
            Official NERIS codes and mappings are read-only after a schema version is published.
          </p>
          <NerisNav />
          {children}
        </section>
      </NerisSchemaGate>
    </Suspense>
  );
}

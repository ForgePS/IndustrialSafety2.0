"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  ErrorState,
  ForgePageActions,
  ForgePageHeader,
  LoadingState,
  StatusBadge,
} from "@forge/ui";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { humanizeForgeError, onboardingListSessions, type OnboardingSessionView } from "@/lib/api";
import { tenantDetailHref } from "@/hooks/use-tenant-id";
import styles from "../page.module.css";

function OnboardingHomeInner() {
  const [sessions, setSessions] = useState<OnboardingSessionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await onboardingListSessions());
    } catch (err) {
      setError(
        humanizeForgeError(err instanceof Error ? err.message : "Could not load onboarding."),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inProgress = sessions.filter((s) => s.session.status === "IN_PROGRESS");
  const completed = sessions.filter((s) => s.session.status === "COMPLETED");

  return (
    <section className={styles.page}>
      <ForgePageHeader
        title="Onboarding"
        subtitle="Add a company and finish setup in guided steps. Leave anytime — progress is saved."
        actions={
          <ForgePageActions>
            <Link className={styles.button} href="/onboarding/new/">
              + Add company
            </Link>
          </ForgePageActions>
        }
      />

      {loading ? <LoadingState label="Loading onboarding…" /> : null}
      {error ? (
        <ErrorState
          title="Unable to load onboarding"
          description={error}
          action={
            <button type="button" className={styles.buttonSecondary} onClick={() => void load()}>
              Retry
            </button>
          }
        />
      ) : null}

      {!loading && !error && inProgress.length === 0 && completed.length === 0 ? (
        <EmptyState
          title="No companies in onboarding"
          description="Create a company to start the guided setup wizard."
          action={
            <Link className={styles.button} href="/onboarding/new/">
              + Add company
            </Link>
          }
        />
      ) : null}

      {!loading && inProgress.length > 0 ? (
        <div style={{ marginBottom: "1.5rem" }}>
          <h2>In progress</h2>
          <ul className={styles.list}>
            {inProgress.map((row) => {
              const done = row.steps.filter(
                (s) => s.status === "COMPLETED" || s.status === "SKIPPED",
              ).length;
              const total = row.steps.length || 1;
              return (
                <li key={row.session.id}>
                  <Link href={`/onboarding/continue/?sessionId=${row.session.id}`}>
                    Continue setup
                  </Link>
                  {" · "}
                  <StatusBadge tone="warning">Step {row.session.currentStep}</StatusBadge>
                  {" · "}
                  {Math.round((done / total) * 100)}% complete
                  {" · "}
                  <Link href={tenantDetailHref(row.session.tenantId)}>Open company</Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!loading && completed.length > 0 ? (
        <div>
          <h2>Recently activated</h2>
          <ul className={styles.list}>
            {completed.slice(0, 10).map((row) => (
              <li key={row.session.id}>
                <Link href={tenantDetailHref(row.session.tenantId)}>Open company</Link>
                {" · "}
                <StatusBadge tone="success">Active</StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default function OnboardingPage() {
  return (
    <PlatformPageGate title="Onboarding" permission="platform.onboarding.manage">
      <OnboardingHomeInner />
    </PlatformPageGate>
  );
}

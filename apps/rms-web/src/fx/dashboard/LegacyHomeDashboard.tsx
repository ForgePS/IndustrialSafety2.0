"use client";

import Link from "next/link";
import { useAuth, useFeatureFlags } from "@forge/web-kit";
import { FeatureGate } from "@/components/feature-gate";
import { RMS_FEATURE_FLAGS } from "@/lib/constants";
import styles from "../../app/page.module.css";

/** Legacy home presentation — restored when fx.rms.dashboard.enabled is off. */
export function LegacyHomeDashboard() {
  const { me, loading } = useAuth();
  const { flags } = useFeatureFlags(Object.values(RMS_FEATURE_FLAGS));
  const manualEnabled = flags[RMS_FEATURE_FLAGS.manualIntake];

  return (
    <section className={styles.page} data-testid="rms-legacy-dashboard">
      <h1>Records Management</h1>
      <p className={styles.lead}>
        Manual incident intake and officer review for NERIS reporting. This workspace supports
        guided data entry without CAD integration.
      </p>

      {!loading && !me ? (
        <div className={styles.panel}>
          <p>
            <Link href="/login/">Sign in</Link> to begin, then select your department tenant.
          </p>
        </div>
      ) : null}

      <FeatureGate flag="incidentShell" title="RMS home">
        <div className={styles.hero}>
          {manualEnabled ? (
            <div className={styles.heroCard}>
              <h2>Create manual incident</h2>
              <p className={styles.muted}>
                Start a new NERIS incident report with guided sections, autosave, and validation.
              </p>
              <div className={styles.actions}>
                <Link href="/incidents/new/" className={styles.button}>
                  Create manual incident
                </Link>
                <Link href="/incidents/" className={styles.buttonSecondary}>
                  View incidents
                </Link>
              </div>
            </div>
          ) : (
            <div className={styles.panel}>
              <p className={styles.muted}>Manual intake is not enabled for this tenant.</p>
              <Link href="/incidents/">Browse incidents</Link>
            </div>
          )}
        </div>

        <div className={styles.grid2}>
          {flags[RMS_FEATURE_FLAGS.officerReview] ? (
            <div className={styles.panel}>
              <h2>Officer review</h2>
              <p className={styles.muted}>
                Review submitted incidents, add comments, and approve or return.
              </p>
              <Link href="/review/">Open review queue</Link>
            </div>
          ) : null}
          {flags[RMS_FEATURE_FLAGS.tenantConfiguration] ? (
            <div className={styles.panel}>
              <h2>NERIS configuration</h2>
              <p className={styles.muted}>
                Customize labels, help text, field order, and visibility without changing official
                codes.
              </p>
              <Link href="/configuration/">Edit configuration</Link>
            </div>
          ) : null}
        </div>
      </FeatureGate>
    </section>
  );
}

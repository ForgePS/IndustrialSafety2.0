"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PlatformPageGate } from "@/components/platform-page-gate";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import styles from "../../page.module.css";

function ContinueInner() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId") ?? undefined;
  return <OnboardingWizard initialSessionId={sessionId} />;
}

export default function ContinueOnboardingPage() {
  return (
    <PlatformPageGate title="Continue setup" permission="platform.onboarding.manage">
      <Suspense fallback={<p className={styles.muted}>Loading setup…</p>}>
        <ContinueInner />
      </Suspense>
    </PlatformPageGate>
  );
}

"use client";

import { PlatformPageGate } from "@/components/platform-page-gate";
import { OnboardingWizard } from "@/components/onboarding-wizard";

export default function NewOnboardingPage() {
  return (
    <PlatformPageGate title="Add company" permission="platform.onboarding.manage">
      <OnboardingWizard />
    </PlatformPageGate>
  );
}

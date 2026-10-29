/**
 * Onboarding / provisioning domain (FORGE-SAAS MK-S7).
 * Builds on ADR-027 fixed steps with product/template skip overrides.
 */

export const DEFAULT_ONBOARDING_STEPS = [
  { number: 1, key: "CREATE_TENANT", label: "Create company" },
  { number: 2, key: "SELECT_CUSTOMER_TYPE", label: "Select company type" },
  { number: 3, key: "CREATE_PRIMARY_ORGANIZATION", label: "Create primary organization" },
  { number: 4, key: "SELECT_PRODUCTS", label: "Select products" },
  { number: 5, key: "SELECT_MODULES", label: "Select modules" },
  { number: 6, key: "CONFIGURE_SUBSCRIPTION", label: "Configure subscription" },
  { number: 7, key: "CONFIGURE_LOCATIONS", label: "Configure locations" },
  { number: 8, key: "CONFIGURE_ORG_LOOKUPS", label: "Configure organization setup" },
  { number: 9, key: "CONFIGURE_DATA_IMPORT", label: "Import company data" },
  { number: 10, key: "CONFIGURE_DOCUMENTS", label: "Upload company documents" },
  { number: 11, key: "CONFIGURE_BRANDING", label: "Configure branding" },
  { number: 12, key: "CONFIGURE_BUSINESS_SETTINGS", label: "Configure business settings" },
  { number: 13, key: "CREATE_PRIMARY_ADMINISTRATOR", label: "Create primary administrator" },
  { number: 14, key: "SEND_INVITATION", label: "Send invitation" },
  { number: 15, key: "REVIEW_CONFIGURATION", label: "Review configuration" },
  { number: 16, key: "ACTIVATE_TENANT", label: "Activate company" },
] as const;

export type DefaultOnboardingStepKey = (typeof DEFAULT_ONBOARDING_STEPS)[number]["key"];

export type OnboardingStepDefinition = {
  number: number;
  key: string;
  label: string;
};

/** Steps that may never be skipped by product/template overrides. */
export const REQUIRED_ONBOARDING_STEP_KEYS = ["CREATE_TENANT", "ACTIVATE_TENANT"] as const;

export type OnboardingStepOverrides = {
  /** Step keys to mark SKIPPED at session start (must not include required keys). */
  skipStepKeys?: readonly string[];
};

export const ONBOARDING_ACTIVATION_ERROR_CODES = [
  "FAILED_STEP",
  "PRIMARY_ORGANIZATION_MISSING",
  "PRODUCT_MISSING",
  "SUBSCRIPTION_INVALID",
  "ADMIN_INVITATION_MISSING",
  "SECURITY_INVALID",
  "BRANDING_INVALID",
  "FACILITY_MISSING",
] as const;

export type OnboardingActivationErrorCode = (typeof ONBOARDING_ACTIVATION_ERROR_CODES)[number];

/**
 * Resolve ordered onboarding steps for a product/template.
 * Skip overrides remove optional steps and renumber sequentially.
 */
export function resolveOnboardingSteps(
  overrides?: OnboardingStepOverrides | null,
  base: readonly OnboardingStepDefinition[] = DEFAULT_ONBOARDING_STEPS,
): OnboardingStepDefinition[] {
  const skip = new Set(
    (overrides?.skipStepKeys ?? []).filter(
      (key) => !(REQUIRED_ONBOARDING_STEP_KEYS as readonly string[]).includes(key),
    ),
  );
  const kept = base.filter((step) => !skip.has(step.key));
  return kept.map((step, index) => ({
    number: index + 1,
    key: step.key,
    label: step.label,
  }));
}

export function isRequiredOnboardingStepKey(key: string): boolean {
  return (REQUIRED_ONBOARDING_STEP_KEYS as readonly string[]).includes(key);
}

/** Default facility bootstrap for activation when none exist. */
export const DEFAULT_ONBOARDING_FACILITY = {
  facilityKey: "default",
  name: "Primary Facility",
  facilityType: "SITE",
} as const;

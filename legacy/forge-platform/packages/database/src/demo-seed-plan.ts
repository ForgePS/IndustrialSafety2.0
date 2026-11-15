/**
 * Synthetic Forge Industrial Demo seed plan.
 * Full row insertion is applied by the demo.seed.apply worker using this contract.
 */
import {
  DEMO_DIVISIONS,
  DEMO_LOCATIONS,
  DEMO_SEED_TARGETS,
  INDUSTRIAL_DEMO_COMPANY_NAME,
  INDUSTRIAL_DEMO_TENANT_SLUG,
} from "@forge/contracts";

export type DemoSeedPlan = {
  tenantSlug: string;
  companyName: string;
  locations: readonly string[];
  divisions: readonly string[];
  targets: typeof DEMO_SEED_TARGETS;
  syntheticRules: {
    noRealEmployeeData: true;
    noRealMedicalData: true;
    noRealCustomerData: true;
    emailsUseExampleDomain: true;
    phoneNumbersAreFake: true;
  };
};

export function buildIndustrialDemoSeedPlan(): DemoSeedPlan {
  return {
    tenantSlug: INDUSTRIAL_DEMO_TENANT_SLUG,
    companyName: INDUSTRIAL_DEMO_COMPANY_NAME,
    locations: DEMO_LOCATIONS,
    divisions: DEMO_DIVISIONS,
    targets: DEMO_SEED_TARGETS,
    syntheticRules: {
      noRealEmployeeData: true,
      noRealMedicalData: true,
      noRealCustomerData: true,
      emailsUseExampleDomain: true,
      phoneNumbersAreFake: true,
    },
  };
}

/** Deterministic fake email for demo personnel (never a real mailbox). */
export function demoEmail(localPart: string, index: number): string {
  const safe = localPart.toLowerCase().replace(/[^a-z0-9]+/g, ".") || "user";
  return `${safe}.${String(index).padStart(3, "0")}@example.forge-demo.local`;
}

/** Deterministic fake US-format phone that is not a real number (+1 555). */
export function demoPhone(index: number): string {
  const n = 1000 + (index % 8999);
  return `+1555550${String(n).slice(-4)}`;
}

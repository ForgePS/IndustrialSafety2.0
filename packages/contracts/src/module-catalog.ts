/**
 * Canonical Forge platform + module catalog (MODULE-CATALOG-S2).
 *
 * Platforms own modules. Duplicate display names across platforms are OK when
 * implementations differ (e.g. Industrial Personnel vs RMS Personnel) — keys
 * remain unique within (productCode, moduleCode).
 *
 * customerAssignable=false modules are provisioned with the product and must
 * not appear as ordinary customer toggles.
 */

import {
  INDUSTRIAL_MODULE_REGISTRY,
  type IndustrialImplementationStatus,
} from "./industrial.js";
import { z } from "zod";

export type ForgePlatformKey = "INDUSTRIAL" | "RMS" | "ACADEMY" | "CREATOR";

export type ModuleClassification =
  | "CUSTOMER_MODULE"
  | "PLATFORM_CORE"
  | "INTERNAL_TOOL"
  | "SHARED_SERVICE";

export type CatalogImplementationStatus =
  | "READY"
  | "IN_DEVELOPMENT"
  | "MIGRATING"
  | "COMING_SOON"
  | "RETIRED"
  | "UNAVAILABLE";

export type ForgePlatformDefinition = {
  key: ForgePlatformKey;
  productCode: string;
  name: string;
  description: string;
  displayOrder: number;
  customerAssignable: boolean;
  status: "ACTIVE" | "INACTIVE";
};

export type ForgeModuleCatalogEntry = {
  productCode: string;
  platformKey: ForgePlatformKey;
  code: string;
  name: string;
  description?: string;
  category: string;
  classification: ModuleClassification;
  implementationStatus: CatalogImplementationStatus;
  customerAssignable: boolean;
  defaultEnabled: boolean;
  displayOrder: number;
  route?: string;
  dependencies?: readonly string[];
};

export const FORGE_PLATFORMS: readonly ForgePlatformDefinition[] = [
  {
    key: "INDUSTRIAL",
    productCode: "FORGE_INDUSTRIAL",
    name: "Forge Industrial Safety",
    description: "Industrial safety and compliance product",
    displayOrder: 10,
    customerAssignable: true,
    status: "ACTIVE",
  },
  {
    key: "RMS",
    productCode: "FORGE_RMS",
    name: "Forge RMS",
    description: "Records management for fire and emergency services",
    displayOrder: 20,
    customerAssignable: true,
    status: "ACTIVE",
  },
  {
    key: "ACADEMY",
    productCode: "FORGE_ACADEMY",
    name: "Forge Academy",
    description: "Training academy product",
    displayOrder: 30,
    customerAssignable: true,
    status: "ACTIVE",
  },
  {
    key: "CREATOR",
    productCode: "FORGE_CREATOR",
    name: "Forge Creator",
    description: "Internal platform control plane (not a sellable customer product)",
    displayOrder: 90,
    customerAssignable: false,
    status: "ACTIVE",
  },
] as const;

const INDUSTRIAL_CATEGORY_BY_GROUP: Record<string, string> = {
  Dashboard: "Analytics",
  "People & Training": "People & Workforce",
  "Incident & Claims": "Safety Management",
  "Risk & Prevention": "Safety Management",
  "Compliance Programs": "Compliance",
  "Equipment & Operations": "Operations",
  "High-Risk Work": "Compliance",
  "Facility & Operations Safety": "Operations",
  "Emergency Management": "Operations",
  "System Tools": "Tools",
};

function mapIndustrialImplementation(
  status: IndustrialImplementationStatus,
): CatalogImplementationStatus {
  switch (status) {
    case "AVAILABLE":
      return "READY";
    case "LEGACY_ONLY":
      return "UNAVAILABLE";
    case "MIGRATING":
      return "MIGRATING";
    case "COMING_SOON":
      return "COMING_SOON";
    case "DEPRECATED":
      return "RETIRED";
    default:
      return "UNAVAILABLE";
  }
}

function industrialEntries(): ForgeModuleCatalogEntry[] {
  return INDUSTRIAL_MODULE_REGISTRY.map((mod, index) => {
    const isCore = mod.code === "CORE";
    const implementationStatus = mapIndustrialImplementation(mod.implementationStatus);
    return {
      productCode: "FORGE_INDUSTRIAL",
      platformKey: "INDUSTRIAL" as const,
      code: mod.code,
      name: mod.name,
      category: INDUSTRIAL_CATEGORY_BY_GROUP[mod.group] ?? mod.group,
      classification: isCore ? ("PLATFORM_CORE" as const) : ("CUSTOMER_MODULE" as const),
      implementationStatus,
      customerAssignable: !isCore && implementationStatus === "READY",
      defaultEnabled: false,
      displayOrder: (index + 1) * 10,
      route: mod.route,
    };
  });
}

/** AI Narrative is product-scoped SHARED_SERVICE; seeded per product, not Industrial registry. */
const AI_NARRATIVE_SHARED: Omit<
  ForgeModuleCatalogEntry,
  "productCode" | "platformKey" | "displayOrder"
> = {
  code: "AI_NARRATIVE",
  name: "AI Narrative Assistant",
  description: "AI-assisted narrative drafting (product-scoped implementation)",
  category: "Tools",
  classification: "SHARED_SERVICE",
  implementationStatus: "READY",
  customerAssignable: true,
  defaultEnabled: false,
};

const RMS_MODULES: ForgeModuleCatalogEntry[] = [
  {
    productCode: "FORGE_RMS",
    platformKey: "RMS",
    code: "CORE",
    name: "RMS Core",
    category: "Platform",
    classification: "PLATFORM_CORE",
    implementationStatus: "READY",
    customerAssignable: false,
    defaultEnabled: true,
    displayOrder: 10,
  },
  {
    productCode: "FORGE_RMS",
    platformKey: "RMS",
    code: "PERSONNEL",
    name: "Personnel",
    category: "Workforce",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 20,
  },
  {
    productCode: "FORGE_RMS",
    platformKey: "RMS",
    code: "TRAINING",
    name: "Training",
    category: "Workforce",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 30,
  },
  {
    productCode: "FORGE_RMS",
    platformKey: "RMS",
    code: "APPARATUS",
    name: "Apparatus",
    category: "Assets",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 40,
  },
  {
    productCode: "FORGE_RMS",
    platformKey: "RMS",
    code: "INVENTORY",
    name: "Inventory",
    category: "Assets",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 50,
  },
  {
    productCode: "FORGE_RMS",
    platformKey: "RMS",
    code: "DOCUMENTS",
    name: "Documents",
    category: "Tools",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 60,
  },
  {
    productCode: "FORGE_RMS",
    platformKey: "RMS",
    code: "REPORTS",
    name: "Reports",
    category: "Analytics",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 70,
  },
  {
    productCode: "FORGE_RMS",
    platformKey: "RMS",
    code: "NERIS",
    name: "NERIS Reporting",
    category: "Incidents",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 80,
  },
  {
    ...AI_NARRATIVE_SHARED,
    productCode: "FORGE_RMS",
    platformKey: "RMS",
    displayOrder: 90,
  },
];

const ACADEMY_MODULES: ForgeModuleCatalogEntry[] = [
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "CORE",
    name: "Academy Core",
    category: "Platform",
    classification: "PLATFORM_CORE",
    implementationStatus: "READY",
    customerAssignable: false,
    defaultEnabled: true,
    displayOrder: 10,
  },
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "ADMINISTRATION",
    name: "Academy Administration",
    category: "Administration",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 20,
  },
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "STUDENTS",
    name: "Students",
    category: "People",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 30,
  },
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "INSTRUCTORS",
    name: "Instructors",
    category: "People",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 40,
  },
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "COURSES",
    name: "Courses",
    category: "Curriculum",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 50,
  },
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "CLASSES",
    name: "Classes",
    category: "Curriculum",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 60,
  },
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "ENROLLMENT",
    name: "Enrollment",
    category: "Curriculum",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 70,
  },
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "ATTENDANCE",
    name: "Attendance",
    category: "Operations",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 80,
  },
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "CERTIFICATIONS",
    name: "Certifications",
    category: "Operations",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 90,
  },
  {
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    code: "DEPARTMENT_PORTAL",
    name: "Department Portal",
    category: "Portals",
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
    customerAssignable: true,
    defaultEnabled: false,
    displayOrder: 100,
  },
  {
    ...AI_NARRATIVE_SHARED,
    productCode: "FORGE_ACADEMY",
    platformKey: "ACADEMY",
    displayOrder: 110,
  },
];

const CREATOR_MODULES: ForgeModuleCatalogEntry[] = [
  {
    productCode: "FORGE_CREATOR",
    platformKey: "CREATOR",
    code: "CORE",
    name: "Creator Core",
    category: "Platform",
    classification: "PLATFORM_CORE",
    implementationStatus: "READY",
    customerAssignable: false,
    defaultEnabled: true,
    displayOrder: 10,
  },
  {
    productCode: "FORGE_CREATOR",
    platformKey: "CREATOR",
    code: "TENANT_ADMIN",
    name: "Tenant Administration",
    category: "Internal",
    classification: "INTERNAL_TOOL",
    implementationStatus: "READY",
    customerAssignable: false,
    defaultEnabled: true,
    displayOrder: 20,
  },
];

/** Authoritative flat catalog used by Creator UI, seed, and API enrichment. */
export const FORGE_MODULE_CATALOG: readonly ForgeModuleCatalogEntry[] = [
  ...industrialEntries(),
  {
    ...AI_NARRATIVE_SHARED,
    productCode: "FORGE_INDUSTRIAL",
    platformKey: "INDUSTRIAL",
    displayOrder: 9000,
  },
  ...RMS_MODULES,
  ...ACADEMY_MODULES,
  ...CREATOR_MODULES,
];

export function findPlatformByProductCode(
  productCode: string,
): ForgePlatformDefinition | undefined {
  return FORGE_PLATFORMS.find((p) => p.productCode === productCode);
}

export function modulesForProduct(productCode: string): ForgeModuleCatalogEntry[] {
  return FORGE_MODULE_CATALOG.filter((m) => m.productCode === productCode).sort(
    (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
  );
}

export function customerAssignableModules(productCode: string): ForgeModuleCatalogEntry[] {
  return modulesForProduct(productCode).filter(
    (m) =>
      m.customerAssignable &&
      m.classification === "CUSTOMER_MODULE" &&
      m.implementationStatus === "READY",
  );
}

export function catalogAvailabilityLabel(status: CatalogImplementationStatus | string): string {
  switch (status) {
    case "READY":
      return "Ready";
    case "IN_DEVELOPMENT":
      return "In development";
    case "MIGRATING":
      return "Migration in progress";
    case "COMING_SOON":
      return "Coming soon";
    case "RETIRED":
      return "Retired";
    case "UNAVAILABLE":
      return "Not available";
    default:
      return "Not available";
  }
}

export function findCatalogModule(
  productCode: string,
  moduleCode: string,
): ForgeModuleCatalogEntry | undefined {
  return FORGE_MODULE_CATALOG.find(
    (m) => m.productCode === productCode && m.code === moduleCode,
  );
}

/** Seed/template shape for platform_modules rows. */
export function catalogModulesForSeed(productCode: string): Array<{
  code: string;
  name: string;
  isCore: boolean;
  category: string;
  classification: ModuleClassification;
  implementationStatus: CatalogImplementationStatus;
  customerAssignable: boolean;
  displayOrder: number;
  description?: string;
}> {
  return modulesForProduct(productCode).map((m) => ({
    code: m.code,
    name: m.name,
    isCore: m.classification === "PLATFORM_CORE",
    category: m.category,
    classification: m.classification,
    implementationStatus: m.implementationStatus,
    customerAssignable: m.customerAssignable,
    displayOrder: m.displayOrder,
    ...(m.description ? { description: m.description } : {}),
  }));
}

export const CATALOG_RECORD_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

export const MODULE_CLASSIFICATIONS = [
  "CUSTOMER_MODULE",
  "PLATFORM_CORE",
  "INTERNAL_TOOL",
  "SHARED_SERVICE",
] as const;

export const CATALOG_IMPLEMENTATION_STATUSES = [
  "READY",
  "IN_DEVELOPMENT",
  "MIGRATING",
  "COMING_SOON",
  "RETIRED",
  "UNAVAILABLE",
] as const;

export const patchPlatformProductInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional().nullable(),
  status: z.enum(CATALOG_RECORD_STATUSES).optional(),
});

export const createPlatformModuleInputSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Code must be uppercase letters, digits, and underscores"),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  category: z.string().min(1).max(128).default("General"),
  classification: z.enum(MODULE_CLASSIFICATIONS).default("CUSTOMER_MODULE"),
  implementationStatus: z.enum(CATALOG_IMPLEMENTATION_STATUSES).default("READY"),
  customerAssignable: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(9999).default(100),
  isCore: z.boolean().default(false),
  status: z.enum(CATALOG_RECORD_STATUSES).default("ACTIVE"),
});

export const patchPlatformModuleInputSchema = createPlatformModuleInputSchema
  .omit({ code: true })
  .partial();

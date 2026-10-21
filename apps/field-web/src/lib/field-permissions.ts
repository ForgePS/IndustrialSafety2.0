import {
  INDUSTRIAL_PRODUCT_CODE,
  type FieldPermission,
} from "@forge/contracts";

export type FieldAuthOpts = {
  isPlatformAdmin?: boolean;
  activeProducts?: readonly string[];
};

/** Industrial web equivalents for each Field permission. */
const FIELD_PERMISSION_ALIASES: Record<FieldPermission, readonly string[]> = {
  "field.access": ["industrial.access"],
  "field.scan": ["industrial.scan.view", "industrial.qr.scan", "industrial.qr.view"],
  "field.training.view": ["industrial.training.view"],
  "field.training.complete": ["industrial.training.view", "industrial.training.manage"],
  "field.inspections.perform": ["industrial.inspections.view", "industrial.inspections.manage"],
  "field.incidents.create": ["industrial.incidents.view", "industrial.incidents.manage"],
  "field.hazards.create": [
    "industrial.observations.view",
    "industrial.observations.manage",
    "industrial.incidents.view",
  ],
  "field.observations.create": ["industrial.observations.view", "industrial.observations.manage"],
  "field.correctiveActions.view": ["industrial.corrective_actions.view"],
  "field.correctiveActions.complete": [
    "industrial.corrective_actions.manage",
    "industrial.corrective_actions.view",
  ],
  "field.loto.execute": [
    "industrial.loto.view",
    "industrial.loto.manage",
    "industrial.loto.edit",
    "industrial.loto.create",
    "industrial.loto.approve",
  ],
  "field.jsa.execute": ["industrial.jsa.view", "industrial.jsa.manage"],
  "field.permits.view": ["industrial.access"],
  "field.permits.approve": ["industrial.admin"],
  "field.fleet.inspect": ["industrial.fleet.view", "industrial.fleet.manage"],
  "field.sds.view": ["industrial.access"],
  "field.documents.view": ["industrial.legal.documents.read", "industrial.access"],
  "field.emergency.view": ["industrial.access"],
  "field.supervisor.dashboard": ["industrial.admin"],
  "field.sanitation.report": [
    "industrial.sanitation.report",
    "industrial.sanitation.view",
    "industrial.sanitation.manage",
  ],
  "field.sanitation.inspect": [
    "industrial.sanitation.inspect",
    "industrial.sanitation.manage",
    "industrial.sanitation.view",
  ],
  "field.sanitation.clean": [
    "industrial.sanitation.clean",
    "industrial.sanitation.manage",
  ],
};

/** Same gates Industrial API uses to list/view LOTO. */
const LOTO_VIEW_CODES = [
  "field.loto.execute",
  "field.access",
  "industrial.loto.view",
  "industrial.loto.manage",
  "industrial.loto.edit",
  "industrial.loto.create",
  "industrial.loto.approve",
  "industrial.loto.print",
  "industrial.access",
  "industrial.admin",
] as const;

/** Same gates Industrial web uses to issue/verify/close, plus Field execute. */
const LOTO_EXECUTE_CODES = [
  "field.loto.execute",
  "field.access",
  "industrial.loto.manage",
  "industrial.loto.edit",
  "industrial.loto.create",
  "industrial.admin",
] as const;

export function fieldAuthOpts(me: {
  isPlatformAdmin?: boolean;
  activeProducts?: readonly string[];
} | null | undefined): FieldAuthOpts {
  return {
    isPlatformAdmin: Boolean(me?.isPlatformAdmin),
    activeProducts: me?.activeProducts ?? [],
  };
}

function hasCreatorProduct(activeProducts: readonly string[] | undefined): boolean {
  return (activeProducts ?? []).includes("FORGE_CREATOR");
}

function hasPrivilegedFieldRole(opts?: FieldAuthOpts): boolean {
  return Boolean(opts?.isPlatformAdmin) || hasCreatorProduct(opts?.activeProducts);
}

function hasAnyCode(permissions: readonly string[], codes: readonly string[]): boolean {
  const set = new Set(permissions);
  return codes.some((code) => set.has(code));
}

/** Field access: dedicated field.access, or industrial.access during transition. */
export function hasFieldAccess(permissions: readonly string[], opts?: FieldAuthOpts): boolean {
  if (hasPrivilegedFieldRole(opts)) return true;
  const set = new Set(permissions);
  return set.has("field.access") || set.has("industrial.access") || set.has("industrial.admin");
}

export function hasFieldPermission(
  permissions: readonly string[],
  permission: FieldPermission,
  opts?: FieldAuthOpts,
): boolean {
  if (hasPrivilegedFieldRole(opts)) return true;
  const set = new Set(permissions);
  if (set.has("industrial.admin")) return true;
  if (set.has(permission)) return true;
  return (FIELD_PERMISSION_ALIASES[permission] ?? []).some((code) => set.has(code));
}

/** Authoring gates for create/edit (aligned with API LOTO_AUTHOR). */
const LOTO_AUTHOR_CODES = [
  "field.loto.execute",
  "field.access",
  "industrial.loto.manage",
  "industrial.loto.edit",
  "industrial.loto.create",
  "industrial.admin",
] as const;

export function canViewFieldLoto(permissions: readonly string[], opts?: FieldAuthOpts): boolean {
  if (hasPrivilegedFieldRole(opts)) return true;
  return hasAnyCode(permissions, LOTO_VIEW_CODES);
}

export function canExecuteFieldLoto(permissions: readonly string[], opts?: FieldAuthOpts): boolean {
  if (hasPrivilegedFieldRole(opts)) return true;
  return hasAnyCode(permissions, LOTO_EXECUTE_CODES);
}

/** Create or edit LOTO procedures from Field. */
export function canAuthorFieldLoto(permissions: readonly string[], opts?: FieldAuthOpts): boolean {
  if (hasPrivilegedFieldRole(opts)) return true;
  return hasAnyCode(permissions, LOTO_AUTHOR_CODES);
}

/** Same gates Industrial web uses for EHS approve / send-back. */
const LOTO_APPROVE_CODES = [
  "industrial.loto.approve",
  "industrial.loto.manage",
  "industrial.admin",
] as const;

export function canApproveFieldLoto(permissions: readonly string[], opts?: FieldAuthOpts): boolean {
  if (hasPrivilegedFieldRole(opts)) return true;
  return hasAnyCode(permissions, LOTO_APPROVE_CODES);
}

export function hasIndustrialProduct(activeProducts: readonly string[]): boolean {
  return activeProducts.includes(INDUSTRIAL_PRODUCT_CODE);
}

export const DEFAULT_FIELD_HOME_ACTIONS = [
  {
    id: "hazard",
    label: "Report Hazard",
    href: "/report/hazard/",
    permission: "field.hazards.create" as const,
  },
  {
    id: "inspection",
    label: "Inspection",
    href: "/inspection/new/",
    permission: "field.inspections.perform" as const,
  },
  {
    id: "loto",
    label: "LOTO",
    href: "/more/loto/",
    permission: "field.loto.execute" as const,
  },
  {
    id: "training",
    label: "Training",
    href: "/tasks/?filter=training",
    permission: "field.training.view" as const,
  },
] as const;

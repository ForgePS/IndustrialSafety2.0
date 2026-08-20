import { createHash } from "node:crypto";
import { z } from "zod";

export const CONFIG_VERSION_STATES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "SUPERSEDED",
  "ARCHIVED",
] as const;
export type ConfigVersionState = (typeof CONFIG_VERSION_STATES)[number];

/** All Configuration Studio namespaces (one studio module each). */
export const CONFIG_NAMESPACES = [
  "tenant_profile",
  "organization_profile",
  "branding",
  "navigation",
  "terminology",
  "modules",
  "features",
  "dropdowns",
  "custom_fields",
  "forms",
  "workflows",
  "roles",
  "permissions",
  "notification_templates",
  "email_templates",
  "document_templates",
  "certificate_templates",
  "dashboards",
  "reporting",
  "import_config",
  "export_config",
  "security",
  "retention",
  "business_hours",
  "holiday_calendar",
  "facilities",
  "locations",
] as const;
export type ConfigNamespace = (typeof CONFIG_NAMESPACES)[number];

export const CONFIG_NAMESPACE_LABELS: Record<ConfigNamespace, string> = {
  tenant_profile: "Tenant Profile",
  organization_profile: "Organization Profile",
  branding: "Branding",
  navigation: "Navigation Editor",
  terminology: "Terminology Manager",
  modules: "Module Manager",
  features: "Feature Manager",
  dropdowns: "Dropdown Manager",
  custom_fields: "Custom Field Builder",
  forms: "Form Builder",
  workflows: "Workflow Builder",
  roles: "Role Builder",
  permissions: "Permission Manager",
  notification_templates: "Notification Templates",
  email_templates: "Email Templates",
  document_templates: "Document Templates",
  certificate_templates: "Certificate Templates",
  dashboards: "Dashboard Builder",
  reporting: "Reporting Configuration",
  import_config: "Import Configuration",
  export_config: "Export Configuration",
  security: "Security Configuration",
  retention: "Retention Policies",
  business_hours: "Business Hours",
  holiday_calendar: "Holiday Calendar",
  facilities: "Facilities",
  locations: "Locations",
};

/** Namespaces editable by Tenant Admin (delegated). */
export const TENANT_ADMIN_NAMESPACES: readonly ConfigNamespace[] = [
  "tenant_profile",
  "organization_profile",
  "branding",
  "navigation",
  "terminology",
  "dropdowns",
  "notification_templates",
  "email_templates",
  "business_hours",
  "holiday_calendar",
  "facilities",
  "locations",
  "roles",
] as const;

const navItemSchema = z.object({
  href: z.string().min(1).max(200),
  label: z.string().min(1).max(120),
  permission: z.string().max(120).optional(),
  featureFlag: z.string().max(120).optional(),
});

const payloadSchemas: Record<ConfigNamespace, z.ZodType> = {
  tenant_profile: z.object({
    displayName: z.string().min(1).max(200),
    legalName: z.string().max(200).optional(),
    timezone: z.string().max(64).optional(),
    locale: z.string().max(32).optional(),
    contactEmail: z.string().email().optional().or(z.literal("")),
    notes: z.string().max(4000).optional(),
  }),
  organization_profile: z.object({
    organizations: z.array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(200),
        type: z.string().max(64).optional(),
        parentId: z.string().uuid().nullable().optional(),
      }),
    ),
  }),
  branding: z.object({
    productDisplayName: z.string().max(200).optional(),
    appShortName: z.string().max(80).optional(),
    primaryColor: z.string().max(32).optional(),
    secondaryColor: z.string().max(32).optional(),
    accentColor: z.string().max(32).optional(),
    approvedColors: z.array(z.string().max(32)).max(32).optional(),
    logoUrl: z.string().url().optional().or(z.literal("")),
    contactName: z.string().max(200).optional(),
    contactPhone: z.string().max(40).optional(),
    supportEmail: z.string().email().optional().or(z.literal("")),
    reportIdentity: z.string().max(300).optional(),
    documentFooter: z.string().max(2000).optional(),
    emailFromName: z.string().max(120).optional(),
    emailFromAddress: z.string().email().optional().or(z.literal("")),
    customCss: z.string().max(20000).optional(),
  }),
  navigation: z.object({
    groups: z.array(
      z.object({
        label: z.string().min(1).max(80),
        items: z.array(navItemSchema),
      }),
    ),
  }),
  terminology: z.object({
    terms: z.record(z.string().max(200)),
  }),
  modules: z.object({
    modules: z.array(
      z.object({
        code: z.string().min(1).max(64),
        enabled: z.boolean(),
        label: z.string().max(120).optional(),
      }),
    ),
  }),
  features: z.object({
    flags: z.array(
      z.object({
        key: z.string().min(1).max(120),
        value: z.unknown(),
        reason: z.string().max(500).optional(),
      }),
    ),
  }),
  dropdowns: z.object({
    catalogs: z.array(
      z.object({
        key: z.string().min(1).max(120),
        label: z.string().min(1).max(200),
        options: z.array(
          z.object({
            value: z.string().min(1).max(120),
            label: z.string().min(1).max(200),
            sortOrder: z.number().int().optional(),
            disabled: z.boolean().optional(),
          }),
        ),
      }),
    ),
  }),
  custom_fields: z.object({
    fields: z.array(
      z.object({
        key: z.string().min(1).max(120),
        label: z.string().min(1).max(200),
        dataType: z.enum(["string", "number", "boolean", "date", "select", "textarea"]),
        required: z.boolean().optional(),
        optionsKey: z.string().max(120).optional(),
      }),
    ),
  }),
  forms: z.object({
    forms: z.array(
      z.object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        sections: z.array(
          z.object({
            key: z.string().min(1).max(120),
            title: z.string().min(1).max(200),
            fieldKeys: z.array(z.string().min(1).max(120)),
          }),
        ),
      }),
    ),
  }),
  workflows: z.object({
    workflows: z.array(
      z.object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        states: z.array(
          z.object({
            key: z.string().min(1).max(64),
            label: z.string().min(1).max(120),
            terminal: z.boolean().optional(),
          }),
        ),
        transitions: z.array(
          z.object({
            from: z.string().min(1).max(64),
            to: z.string().min(1).max(64),
            action: z.string().min(1).max(64),
            permission: z.string().max(120).optional(),
          }),
        ),
      }),
    ),
  }),
  roles: z.object({
    roles: z.array(
      z.object({
        key: z.string().min(1).max(64),
        name: z.string().min(1).max(120),
        permissionCodes: z.array(z.string().min(1).max(120)),
      }),
    ),
  }),
  permissions: z.object({
    grants: z.array(
      z.object({
        roleKey: z.string().min(1).max(64),
        permissionCodes: z.array(z.string().min(1).max(120)),
      }),
    ),
  }),
  notification_templates: z.object({
    templates: z.array(
      z.object({
        key: z.string().min(1).max(120),
        channel: z.enum(["in_app", "email", "sms"]),
        subject: z.string().max(200).optional(),
        body: z.string().min(1).max(20000),
      }),
    ),
  }),
  email_templates: z.object({
    templates: z.array(
      z.object({
        key: z.string().min(1).max(120),
        subject: z.string().min(1).max(200),
        htmlBody: z.string().min(1).max(50000),
        textBody: z.string().max(20000).optional(),
      }),
    ),
  }),
  document_templates: z.object({
    templates: z.array(
      z.object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        mimeType: z.string().max(120).optional(),
        bodyTemplate: z.string().min(1).max(100000),
      }),
    ),
  }),
  certificate_templates: z.object({
    templates: z.array(
      z.object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        bodyTemplate: z.string().min(1).max(100000),
        validityDays: z.number().int().positive().optional(),
      }),
    ),
  }),
  dashboards: z.object({
    dashboards: z.array(
      z.object({
        key: z.string().min(1).max(120),
        title: z.string().min(1).max(200),
        widgets: z.array(
          z.object({
            type: z.string().min(1).max(64),
            title: z.string().max(200).optional(),
            config: z.record(z.unknown()).optional(),
          }),
        ),
      }),
    ),
  }),
  reporting: z.object({
    reports: z.array(
      z.object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        queryKey: z.string().max(120).optional(),
        columns: z.array(z.string().min(1).max(120)),
        scheduleCron: z.string().max(120).optional(),
      }),
    ),
  }),
  import_config: z.object({
    profiles: z.array(
      z.object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        sourceType: z.enum(["csv", "json", "xml", "api"]),
        fieldMappings: z.array(
          z.object({
            source: z.string().min(1).max(120),
            target: z.string().min(1).max(120),
          }),
        ),
      }),
    ),
  }),
  export_config: z.object({
    profiles: z.array(
      z.object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        format: z.enum(["csv", "json", "pdf"]),
        includeFields: z.array(z.string().min(1).max(120)),
      }),
    ),
  }),
  security: z.object({
    sessionTimeoutMinutes: z.number().int().positive().max(10080).optional(),
    mfaRequired: z.boolean().optional(),
    passwordMinLength: z.number().int().min(8).max(128).optional(),
    ipAllowlist: z.array(z.string().max(64)).optional(),
  }),
  retention: z.object({
    policies: z.array(
      z.object({
        key: z.string().min(1).max(120),
        resourceType: z.string().min(1).max(120),
        retainDays: z.number().int().positive(),
        action: z.enum(["archive", "delete", "anonymize"]),
      }),
    ),
  }),
  business_hours: z.object({
    timezone: z.string().max(64).optional(),
    weekly: z.array(
      z.object({
        day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
        open: z.string().max(8),
        close: z.string().max(8),
        closed: z.boolean().optional(),
      }),
    ),
  }),
  holiday_calendar: z.object({
    holidays: z.array(
      z.object({
        date: z.string().min(8).max(10),
        name: z.string().min(1).max(200),
        recurring: z.boolean().optional(),
      }),
    ),
  }),
  facilities: z.object({
    facilities: z.array(
      z.object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        type: z.string().max(64).optional(),
        address: z.string().max(500).optional(),
        active: z.boolean().optional(),
      }),
    ),
  }),
  locations: z.object({
    locations: z.array(
      z.object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        facilityKey: z.string().max(120).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      }),
    ),
  }),
};

export function isConfigNamespace(value: string): value is ConfigNamespace {
  return (CONFIG_NAMESPACES as readonly string[]).includes(value);
}

export function validateConfigPayload(namespace: ConfigNamespace, payload: unknown) {
  return payloadSchemas[namespace].parse(payload);
}

export function hashConfigPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
}

export function assertTransition(
  from: ConfigVersionState,
  to: ConfigVersionState,
): void {
  const allowed: Record<ConfigVersionState, ConfigVersionState[]> = {
    DRAFT: ["SCHEDULED", "PUBLISHED", "ARCHIVED"],
    SCHEDULED: ["PUBLISHED", "ARCHIVED", "DRAFT"],
    PUBLISHED: ["SUPERSEDED", "ARCHIVED"],
    SUPERSEDED: [],
    ARCHIVED: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid config version transition ${from} -> ${to}`);
  }
}

export function comparePayloads(
  left: unknown,
  right: unknown,
): { path: string; left: unknown; right: unknown }[] {
  const diffs: { path: string; left: unknown; right: unknown }[] = [];
  function walk(a: unknown, b: unknown, path: string) {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
      for (const key of keys) {
        walk(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          path ? `${path}.${key}` : key,
        );
      }
      return;
    }
    diffs.push({ path: path || "$", left: a, right: b });
  }
  walk(left, right, "");
  return diffs;
}

export function resolveEffectiveVersion<T extends {
  state: string;
  effectiveFrom: Date | string | null;
  effectiveTo: Date | string | null;
  publishedAt: Date | string | null;
}>(versions: T[], at: Date = new Date()): T | null {
  const published = versions
    .filter((v) => v.state === "PUBLISHED" || v.state === "SCHEDULED")
    .filter((v) => {
      const from = v.effectiveFrom ? new Date(v.effectiveFrom) : null;
      const to = v.effectiveTo ? new Date(v.effectiveTo) : null;
      if (from && from > at) return false;
      if (to && to <= at) return false;
      if (v.state === "SCHEDULED") {
        const start = from ?? (v.publishedAt ? new Date(v.publishedAt) : null);
        return Boolean(start && start <= at);
      }
      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.publishedAt ?? a.effectiveFrom ?? 0).getTime();
      const bTime = new Date(b.publishedAt ?? b.effectiveFrom ?? 0).getTime();
      return bTime - aTime;
    });
  return published[0] ?? null;
}

export const DEFAULT_PAYLOADS: Record<ConfigNamespace, unknown> = {
  tenant_profile: {
    displayName: "Default Tenant",
    timezone: "America/Chicago",
    locale: "en-US",
  },
  organization_profile: { organizations: [] },
  branding: {
    productDisplayName: "Forge",
    appShortName: "Forge",
    primaryColor: "#14532d",
    secondaryColor: "#14201a",
    accentColor: "#166534",
    approvedColors: ["#14532d", "#166534", "#14201a"],
    reportIdentity: "Forge Reports",
    documentFooter: "Confidential — Forge platform",
    emailFromName: "Forge",
  },
  navigation: {
    groups: [
      {
        label: "Overview",
        items: [{ href: "/", label: "Home" }],
      },
    ],
  },
  terminology: {
    terms: {
      incident: "Incident",
      narrative: "Narrative",
      station: "Station",
      unit: "Unit",
    },
  },
  modules: { modules: [] },
  features: { flags: [] },
  dropdowns: {
    catalogs: [
      {
        key: "personnel_roles",
        label: "Personnel roles",
        options: [
          { value: "officer", label: "Officer", sortOrder: 1 },
          { value: "firefighter", label: "Firefighter", sortOrder: 2 },
        ],
      },
    ],
  },
  custom_fields: { fields: [] },
  forms: { forms: [] },
  workflows: {
    workflows: [
      {
        key: "incident_review",
        name: "Incident review",
        states: [
          { key: "DRAFT", label: "Draft" },
          { key: "READY_FOR_REVIEW", label: "Ready for review" },
          { key: "APPROVED", label: "Approved", terminal: true },
          { key: "FINALIZED", label: "Finalized", terminal: true },
        ],
        transitions: [
          { from: "DRAFT", to: "READY_FOR_REVIEW", action: "submit" },
          { from: "READY_FOR_REVIEW", to: "APPROVED", action: "approve" },
          { from: "APPROVED", to: "FINALIZED", action: "finalize" },
        ],
      },
    ],
  },
  roles: { roles: [] },
  permissions: { grants: [] },
  notification_templates: {
    templates: [
      {
        key: "system_notification",
        channel: "in_app",
        subject: "System notification",
        body: "{{detail}}",
      },
      {
        key: "membership_changed",
        channel: "in_app",
        subject: "Membership update",
        body: "Your membership status is now {{status}}.",
      },
      {
        key: "billing",
        channel: "in_app",
        subject: "Billing update",
        body: "A billing update is available for {{tenantName}}.",
      },
      {
        key: "security",
        channel: "in_app",
        subject: "Security notice",
        body: "{{detail}}",
      },
    ],
  },
  email_templates: {
    templates: [
      {
        key: "welcome",
        subject: "Welcome to Forge",
        htmlBody: "<p>Welcome {{displayName}}. Your tenant is ready.</p>",
        textBody: "Welcome {{displayName}}. Your tenant is ready.",
      },
      {
        key: "verification",
        subject: "Verify your email",
        htmlBody: "<p>Verify your email for {{tenantName}}.</p>",
        textBody: "Verify your email for {{tenantName}}.",
      },
      {
        key: "invitation",
        subject: "You are invited to {{tenantName}}",
        htmlBody: "<p>You have been invited to join {{tenantName}}.</p>",
        textBody: "You have been invited to join {{tenantName}}.",
      },
      {
        key: "membership_changed",
        subject: "Membership update",
        htmlBody: "<p>Your membership status is now {{status}}.</p>",
        textBody: "Your membership status is now {{status}}.",
      },
      {
        key: "billing",
        subject: "Billing update",
        htmlBody: "<p>A billing update is available for {{tenantName}}.</p>",
        textBody: "A billing update is available for {{tenantName}}.",
      },
      {
        key: "security",
        subject: "Security notice",
        htmlBody: "<p>Security notice: {{detail}}</p>",
        textBody: "Security notice: {{detail}}.",
      },
      {
        key: "system_notification",
        subject: "System notification",
        htmlBody: "<p>{{detail}}</p>",
        textBody: "{{detail}}",
      },
    ],
  },
  document_templates: { templates: [] },
  certificate_templates: { templates: [] },
  dashboards: { dashboards: [] },
  reporting: { reports: [] },
  import_config: { profiles: [] },
  export_config: { profiles: [] },
  security: {
    sessionTimeoutMinutes: 480,
    mfaRequired: false,
    passwordMinLength: 12,
  },
  retention: { policies: [] },
  business_hours: {
    timezone: "America/Chicago",
    weekly: [
      { day: "mon", open: "08:00", close: "17:00" },
      { day: "tue", open: "08:00", close: "17:00" },
      { day: "wed", open: "08:00", close: "17:00" },
      { day: "thu", open: "08:00", close: "17:00" },
      { day: "fri", open: "08:00", close: "17:00" },
      { day: "sat", open: "00:00", close: "00:00", closed: true },
      { day: "sun", open: "00:00", close: "00:00", closed: true },
    ],
  },
  holiday_calendar: { holidays: [] },
  facilities: { facilities: [] },
  locations: { locations: [] },
};

export const packageStatus = "ACTIVE" as const;

/** Defaults used when branding.login fields (or legacy flat fields) are absent. */
export const DEFAULT_LOGIN_BRANDING = {
  brandLabel: "Industrial",
  headline: "Welcome to Forge Industrial Safety",
  body: "Sign in is required to continue.",
  statusText: "Unauthenticated",
  buttonLabel: "Sign in",
  logoUrl: "",
} as const;

export type ResolvedLoginBranding = {
  logoUrl: string;
  brandLabel: string;
  headline: string;
  body: string;
  statusText: string;
  buttonLabel: string;
};

type BrandingLike = {
  logoUrl?: string | null;
  loginShortName?: string | null;
  productDisplayName?: string | null;
  login?: {
    logoUrl?: string | null;
    brandLabel?: string | null;
    headline?: string | null;
    body?: string | null;
    statusText?: string | null;
    buttonLabel?: string | null;
  } | null;
};

/**
 * Resolve Sign-in / gate copy from a branding payload.
 * Prefer nested `login.*`; fall back to legacy flat fields when missing.
 */
export function resolveLoginBranding(
  branding: BrandingLike | null | undefined,
): ResolvedLoginBranding {
  const login = branding?.login ?? undefined;
  const product = branding?.productDisplayName?.trim();
  const legacyHeadline = product ? `Welcome to ${product}` : DEFAULT_LOGIN_BRANDING.headline;
  const brandLabel =
    login?.brandLabel?.trim() ||
    branding?.loginShortName?.trim() ||
    DEFAULT_LOGIN_BRANDING.brandLabel;
  const logoUrl =
    login?.logoUrl?.trim() || branding?.logoUrl?.trim() || DEFAULT_LOGIN_BRANDING.logoUrl;
  const statusText =
    login?.statusText !== undefined && login?.statusText !== null
      ? login.statusText.trim()
      : DEFAULT_LOGIN_BRANDING.statusText;
  return {
    logoUrl,
    brandLabel,
    headline: login?.headline?.trim() || legacyHeadline,
    body: login?.body?.trim() || DEFAULT_LOGIN_BRANDING.body,
    statusText,
    buttonLabel: login?.buttonLabel?.trim() || DEFAULT_LOGIN_BRANDING.buttonLabel,
  };
}

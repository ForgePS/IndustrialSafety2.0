import type { ForgeNavigationGroup } from "@forge/design-system";

/**
 * Creator Console end-user IA (CREATOR-UX-S2).
 * Visibility filters are UX only — API auth remains authoritative.
 * Engineering surfaces live under Advanced; default labels avoid AWS jargon.
 */
export const CREATOR_NAV_GROUPS: ForgeNavigationGroup[] = [
  {
    id: "home",
    label: "Home",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        route: "/",
        anyOfPermissions: ["platform.tenant.read", "platform.analytics.read"],
      },
      {
        id: "activity",
        label: "Activity",
        route: "/activity",
        anyOfPermissions: ["platform.analytics.read", "platform.audit.read"],
      },
    ],
  },
  {
    id: "customers",
    label: "Companies",
    items: [
      { id: "customers-list", label: "Companies", route: "/customers", permission: "platform.tenant.read" },
      {
        id: "onboarding",
        label: "Onboarding",
        route: "/onboarding",
        permission: "platform.onboarding.manage",
      },
      {
        id: "setup-center",
        label: "Setup Center",
        route: "/setup-center",
        permission: "platform.tenant.read",
      },
      {
        id: "facilities",
        label: "Locations",
        route: "/facilities",
        permission: "platform.configuration.update",
      },
      { id: "users", label: "Users", route: "/users", permission: "platform.user.invite" },
      {
        id: "invitations",
        label: "Invitations",
        route: "/invitations",
        permission: "platform.invitation.read",
      },
    ],
  },
  {
    id: "products",
    label: "Products & Modules",
    items: [
      {
        id: "products-list",
        label: "Products",
        route: "/products",
        permission: "platform.entitlement.manage",
      },
      {
        id: "modules",
        label: "Module Catalog",
        route: "/modules",
        permission: "platform.entitlement.manage",
      },
      {
        id: "customer-modules",
        label: "Company Modules",
        route: "/customer-modules",
        permission: "platform.entitlement.manage",
      },
      {
        id: "industrial-modules",
        label: "Industrial Modules",
        route: "/industrial-modules",
        permission: "platform.entitlement.manage",
      },
      {
        id: "plans",
        label: "Plans & Pricing",
        route: "/plans",
        permission: "platform.entitlement.manage",
      },
      {
        id: "subscriptions",
        label: "Subscriptions",
        route: "/subscriptions",
        permission: "platform.entitlement.manage",
      },
    ],
  },
  {
    id: "data",
    label: "Data",
    items: [
      {
        id: "migrations",
        label: "Migration Center",
        route: "/migrations",
        anyOfPermissions: ["platform.tenant.read", "import.view"],
      },
      { id: "imports", label: "Imports", route: "/imports", permission: "import.view" },
      {
        id: "exports",
        label: "Exports",
        route: "/exports",
        permission: "tenant.export.create",
      },
      {
        id: "reconciliation",
        label: "Reconciliation",
        route: "/migrations",
        anyOfPermissions: ["platform.tenant.read", "import.view"],
      },
    ],
  },
  {
    id: "support",
    label: "Support",
    items: [
      {
        id: "support-center",
        label: "Customer Support",
        route: "/support",
        permission: "platform.tenant.read",
      },
      {
        id: "access-sessions",
        label: "Access Sessions",
        route: "/support/sessions",
        permission: "platform.tenant.read",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        id: "ops-health",
        label: "System Health",
        route: "/operations/health",
        permission: "platform.tenant.read",
      },
      {
        id: "notifications",
        label: "Notifications",
        route: "/notifications",
      },
      {
        id: "jobs",
        label: "Background Jobs",
        route: "/jobs",
        permission: "platform.jobs.read",
      },
      {
        id: "email",
        label: "Email",
        route: "/email",
        permission: "platform.tenant.read",
      },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      {
        id: "platform-users",
        label: "Platform Users",
        route: "/users",
        permission: "platform.user.invite",
      },
      { id: "roles", label: "Roles", route: "/roles", permission: "platform.role.assign" },
      {
        id: "permissions",
        label: "Permissions",
        route: "/permissions",
        permission: "platform.permission.read",
      },
      { id: "audit", label: "Audit Log", route: "/audit", permission: "platform.audit.read" },
      {
        id: "legal-compliance",
        label: "Legal & Compliance",
        route: "/legal",
        anyOfPermissions: ["platform.audit.read", "platform.feature.manage", "platform.tenant.read"],
      },
    ],
  },
  {
    id: "business",
    label: "Business",
    items: [
      {
        id: "billing",
        label: "Billing",
        route: "/billing",
        anyOfPermissions: ["platform.entitlement.manage", "tenant.billing.read"],
      },
      {
        id: "contracts",
        label: "Invoices",
        route: "/contracts",
        anyOfPermissions: ["platform.entitlement.manage", "tenant.billing.read"],
      },
      {
        id: "renewals",
        label: "Renewals",
        route: "/renewals",
        anyOfPermissions: ["platform.entitlement.manage", "tenant.billing.read"],
      },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      {
        id: "branding",
        label: "Branding",
        route: "/studio/branding",
        permission: "platform.configuration.update",
      },
      {
        id: "domains",
        label: "Domains",
        route: "/domains",
        permission: "platform.configuration.update",
      },
      {
        id: "studio",
        label: "Templates",
        route: "/studio",
        permission: "platform.configuration.update",
      },
      {
        id: "settings",
        label: "Settings",
        route: "/settings",
        permission: "platform.configuration.update",
      },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    items: [
      {
        id: "product-access",
        label: "Product Access",
        route: "/entitlements",
        permission: "platform.entitlement.manage",
      },
      {
        id: "features",
        label: "Feature Flags",
        route: "/features",
        permission: "platform.feature.manage",
      },
      {
        id: "memberships",
        label: "Memberships",
        route: "/memberships",
        permission: "platform.membership.read",
      },
      {
        id: "organizations",
        label: "Organizations",
        route: "/organizations",
        permission: "platform.organization.read",
      },
      { id: "persons", label: "Persons", route: "/persons", permission: "platform.person.read" },
      {
        id: "customer-profile",
        label: "Customer Profile (Studio)",
        route: "/studio/tenant-profile",
        permission: "platform.configuration.update",
      },
      {
        id: "neris",
        label: "NERIS Schema",
        route: "/neris/packages",
        permission: "platform.neris.schema.read",
      },
      { id: "ai", label: "AI Management", route: "/ai" },
      {
        id: "analytics",
        label: "Analytics (raw)",
        route: "/analytics",
        permission: "platform.analytics.read",
      },
      {
        id: "system",
        label: "Developer Tools",
        route: "/system",
        permission: "platform.tenant.read",
      },
    ],
  },
];

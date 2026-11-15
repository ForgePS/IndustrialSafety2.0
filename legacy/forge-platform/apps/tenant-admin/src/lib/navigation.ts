import type { ForgeNavigationGroup } from "@forge/design-system";

/**
 * Tenant Admin navigation (MK-S12).
 * Item `permission` / `anyOfPermissions` filter UX only — API auth is authoritative.
 */
export const TENANT_ADMIN_NAV_GROUPS: ForgeNavigationGroup[] = [
  {
    id: "admin",
    label: "Administration",
    items: [
      {
        id: "overview",
        label: "Overview",
        route: "/",
        anyOfPermissions: ["platform.tenant.read", "tenant.configuration.update"],
      },
      {
        id: "organization",
        label: "Organization",
        route: "/organization",
        anyOfPermissions: ["tenant.configuration.update", "platform.organization.read"],
      },
      {
        id: "facilities",
        label: "Facilities",
        route: "/facilities",
        anyOfPermissions: ["tenant.facilities.read", "tenant.configuration.update"],
      },
      {
        id: "members",
        label: "Members",
        route: "/members",
        permission: "platform.membership.read",
      },
      {
        id: "invitations",
        label: "Invitations",
        route: "/invitations",
        permission: "platform.invitation.read",
      },
      {
        id: "roles",
        label: "Roles",
        route: "/roles",
        permission: "platform.role.assign",
      },
      {
        id: "permissions",
        label: "Permissions",
        route: "/permissions",
        permission: "platform.permission.read",
      },
      {
        id: "products",
        label: "Products",
        route: "/products",
        anyOfPermissions: ["tenant.billing.read", "platform.entitlement.manage"],
      },
      {
        id: "modules",
        label: "Modules",
        route: "/modules",
        anyOfPermissions: ["tenant.billing.read", "platform.entitlement.manage"],
      },
      {
        id: "billing",
        label: "Billing",
        route: "/billing",
        anyOfPermissions: ["tenant.billing.read", "platform.entitlement.manage"],
      },
      {
        id: "branding",
        label: "Branding",
        route: "/branding",
        anyOfPermissions: ["tenant.configuration.update", "platform.configuration.update"],
      },
      {
        id: "security",
        label: "Security",
        route: "/security",
        permission: "platform.tenant.read",
      },
      {
        id: "notifications",
        label: "Notifications",
        route: "/notifications",
        permission: "tenant.notification.read",
      },
      {
        id: "integrations",
        label: "Integrations",
        route: "/integrations",
        permission: "tenant.webhook.read",
      },
      {
        id: "api-access",
        label: "API",
        route: "/api-access",
        permission: "tenant.api_key.read",
      },
      {
        id: "audit",
        label: "Audit",
        route: "/audit",
        permission: "platform.audit.read",
      },
    ],
  },
  {
    id: "imports",
    label: "Import Center",
    items: [
      { id: "import-center", label: "Import Center", route: "/imports", permission: "import.view" },
      { id: "jobs", label: "Jobs", route: "/jobs", permission: "platform.jobs.read" },
      {
        id: "exports",
        label: "Data Export",
        route: "/exports",
        permission: "tenant.export.create",
      },
    ],
  },
  {
    id: "studio",
    label: "Configuration Studio",
    items: [
      {
        id: "studio-home",
        label: "Studio home",
        route: "/studio",
        permission: "tenant.configuration.update",
      },
      {
        id: "studio-tenant",
        label: "Tenant Profile",
        route: "/studio/tenant-profile",
        permission: "tenant.configuration.update",
      },
      {
        id: "studio-org",
        label: "Org Profile",
        route: "/studio/organization-profile",
        permission: "tenant.configuration.update",
      },
      {
        id: "studio-branding",
        label: "Branding (Studio)",
        route: "/studio/branding",
        permission: "tenant.configuration.update",
      },
      {
        id: "studio-navigation",
        label: "Navigation",
        route: "/studio/navigation",
        permission: "tenant.configuration.update",
      },
      {
        id: "studio-facilities",
        label: "Facilities (Studio)",
        route: "/studio/facilities",
        permission: "tenant.configuration.update",
      },
      {
        id: "studio-roles",
        label: "Role Builder",
        route: "/studio/roles",
        permission: "tenant.configuration.update",
      },
    ],
  },
];

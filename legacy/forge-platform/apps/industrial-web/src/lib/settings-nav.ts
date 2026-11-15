/**
 * Industrial Settings sidebar IA (§2-aligned groups).
 */

export type SettingsNavItem = {
  href: string;
  label: string;
  icon: string;
  description: string;
  visible: boolean;
  external?: boolean;
  soon?: boolean;
};

export type SettingsNavGroup = {
  id: string;
  label: string;
  items: SettingsNavItem[];
};

export type SettingsNavVisibility = {
  canUsers: boolean;
  canDropdowns: boolean;
  canTrainingPortal: boolean;
  canModules: boolean;
  canCompliance: boolean;
  canAudit: boolean;
  canConfiguration: boolean;
  canPresentation?: boolean;
};

export function buildSettingsNavGroups(vis: SettingsNavVisibility): SettingsNavGroup[] {
  const groups: SettingsNavGroup[] = [
    {
      id: "home",
      label: "Home",
      items: [
        {
          href: "/settings/",
          label: "Overview",
          icon: "bx-grid-alt",
          description: "Admin home and quick links",
          visible: true,
        },
      ],
    },
    {
      id: "organization",
      label: "Organization",
      items: [
        {
          href: "/settings/company-profile/",
          label: "Company profile",
          icon: "bx-buildings",
          description: "Legal name, timezone, contact",
          visible: vis.canConfiguration,
        },
        {
          href: "/settings/branding/",
          label: "Branding",
          icon: "bx-palette",
          description: "Company logo, colors, identity",
          visible: vis.canConfiguration,
        },
        {
          href: "/settings/presentation/",
          label: "Executive Walkthrough",
          icon: "bx-slideshow",
          description: "Launch presentation and MP4 export",
          visible: Boolean(vis.canPresentation),
        },
        {
          href: "/settings/presentation-logo/",
          label: "Forge Industrial Safety Logo",
          icon: "bx-image",
          description: "Logo shown on the walkthrough opening screen",
          visible: Boolean(vis.canPresentation),
        },
        {
          href: "/admin/walkthrough-studio/",
          label: "Walkthrough Studio",
          icon: "bx-film",
          description: "Presentations, narration, demo, and video exports",
          visible: Boolean(vis.canPresentation),
        },
        {
          href: "/settings/locations/",
          label: "Locations",
          icon: "bx-map",
          description: "Coming soon",
          visible: vis.canConfiguration,
          soon: true,
        },
      ],
    },
    {
      id: "users-access",
      label: "Users & access",
      items: [
        {
          href: "/settings/users/",
          label: "Users",
          icon: "bx-user",
          description: "Invite, roles, password resets",
          visible: vis.canUsers,
        },
        {
          href: "/settings/user-activity/",
          label: "User activity",
          icon: "bx-time-five",
          description: "Login times and Platform activity",
          visible: vis.canUsers,
        },
        {
          href: "/settings/roles/",
          label: "Roles & permissions",
          icon: "bx-shield-quarter",
          description: "Role templates and grants",
          visible: vis.canUsers,
        },
      ],
    },
    {
      id: "modules",
      label: "Modules",
      items: [
        {
          href: "/settings/modules/",
          label: "Enabled modules",
          icon: "bx-toggle-left",
          description: "Turn modules on when ready",
          visible: vis.canModules,
        },
        {
          href: "/settings/workspace/",
          label: "Workspace defaults",
          icon: "bx-layout",
          description: "Default My Workspace layout and policies",
          visible: vis.canModules,
        },
      ],
    },
    {
      id: "forms-fields",
      label: "Forms & fields",
      items: [
        {
          href: "/settings/dropdowns/",
          label: "Dropdown lists",
          icon: "bx-list-ul",
          description: "Sites, departments, positions",
          visible: vis.canDropdowns,
        },
        {
          href: "/settings/body-map/",
          label: "Body map",
          icon: "bx-body",
          description: "Injury hotspot calibration",
          visible: vis.canDropdowns,
        },
        {
          href: "/settings/photo-markup/",
          label: "Photo markup",
          icon: "bx-pencil",
          description: "Annotation tools and report photo defaults",
          visible: vis.canConfiguration || vis.canDropdowns,
        },
      ],
    },
    {
      id: "qr",
      label: "QR & identification",
      items: [
        {
          href: "/settings/training-portal/",
          label: "Training portal QR",
          icon: "bx-qr",
          description: "Employee self-service access",
          visible: vis.canTrainingPortal,
        },
      ],
    },
    {
      id: "integrations",
      label: "Integrations",
      items: [
        {
          href: "/settings/integrations/printer-bridges/",
          label: "Printer Bridges",
          icon: "bx-printer",
          description: "Pair Windows agents and manage shop-floor printers",
          visible: vis.canConfiguration || vis.canModules,
        },
      ],
    },
    {
      id: "compliance-audit",
      label: "Compliance & audit",
      items: [
        {
          href: "/settings/compliance/",
          label: "Compliance",
          icon: "bx-check-shield",
          description: "Legal acknowledgments",
          visible: vis.canCompliance,
        },
        {
          href: "/settings/audit/",
          label: "Audit log",
          icon: "bx-history",
          description: "Who changed what and when",
          visible: vis.canAudit,
        },
      ],
    },
    {
      id: "account",
      label: "Account",
      items: [
        {
          href: "/my-training/",
          label: "My Training",
          icon: "bx-book-reader",
          description: "Assigned courses and transcript",
          visible: true,
          external: true,
        },
        {
          href: "/profile/",
          label: "My profile",
          icon: "bx-id-card",
          description: "Your account details",
          visible: true,
          external: true,
        },
      ],
    },
  ];

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.visible),
    }))
    .filter((group) => group.items.length > 0);
}

export function settingsNavActive(pathname: string, href: string): boolean {
  if (href === "/settings/") return pathname === "/settings/" || pathname === "/settings";
  return pathname.startsWith(href);
}

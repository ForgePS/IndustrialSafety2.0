/**
 * My Forge — personal employee area (not Personnel admin).
 * Links existing Field routes built in earlier remodel phases.
 */
export type MyForgeSection = {
  id: string;
  label: string;
  href: string;
  detail?: string;
  /** Dashboard / feature id for module gating; omit = always available. */
  featureId?: string;
};

export const MY_FORGE_SECTIONS: readonly MyForgeSection[] = [
  {
    id: "profile",
    label: "My Profile",
    href: "/my-forge/?section=profile",
    detail: "Name, roles, company",
  },
  {
    id: "training",
    label: "My Training",
    href: "/training/",
    detail: "Assignments and courses",
    featureId: "more-training",
  },
  {
    id: "certifications",
    label: "My Certifications",
    href: "/more/records/",
    detail: "Training transcript and certs",
    featureId: "more-records",
  },
  {
    id: "tasks",
    label: "My Tasks",
    href: "/tasks/?filter=tasks",
    detail: "Assigned work",
  },
  {
    id: "inspections",
    label: "My Inspections",
    href: "/tasks/?filter=inspections",
    detail: "Inspection assignments",
    featureId: "inspections-hub",
  },
  {
    id: "observations",
    label: "My Observations",
    href: "/report/",
    detail: "Report observation or hazard",
    featureId: "report",
  },
  {
    id: "equipment",
    label: "My Equipment",
    href: "/more/equipment/",
    detail: "Browse equipment by Location",
    featureId: "more-equipment",
  },
  {
    id: "acknowledgments",
    label: "My Acknowledgments",
    href: "/jsa/",
    detail: "JSA and related acknowledgments",
    featureId: "more-jsa",
  },
  {
    id: "schedule",
    label: "My Schedule",
    href: "/calendar/",
    detail: "Calendar agenda",
    featureId: "calendar",
  },
  {
    id: "reminders",
    label: "My Reminders",
    href: "/reminders/",
    detail: "Due and upcoming reminders",
    featureId: "more-reminders",
  },
  {
    id: "notifications",
    label: "My Notifications",
    href: "/alerts/",
    detail: "Alerts inbox",
  },
  {
    id: "settings",
    label: "App Settings",
    href: "/me/",
    detail: "Appearance, pins, sign out",
  },
];

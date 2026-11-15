/** User-facing labels — keep engineering terms out of default Creator UX. */

export function humanCustomerStatus(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "Active";
    case "TRIAL":
      return "Trial";
    case "ONBOARDING":
      return "Onboarding";
    case "MIGRATION":
    case "MIGRATING":
      return "Migration";
    case "SUSPENDED":
      return "Suspended";
    case "INACTIVE":
    case "ARCHIVED":
      return "Inactive";
    default:
      return status?.trim() ? status : "Unknown";
  }
}

export function customerStatusTone(
  status: string | null | undefined,
): "success" | "danger" | "info" | "neutral" | "warning" {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "success";
    case "SUSPENDED":
      return "danger";
    case "TRIAL":
    case "ONBOARDING":
    case "MIGRATION":
    case "MIGRATING":
      return "info";
    default:
      return "neutral";
  }
}

export function productDisplayName(code: string): string {
  switch (code) {
    case "FORGE_INDUSTRIAL":
      return "Forge Industrial Safety";
    case "FORGE_RMS":
      return "Forge RMS";
    case "FORGE_ACADEMY":
      return "Forge Academy";
    default:
      return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function humanMigrationStatus(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "NOT_STARTED":
      return "Not started";
    case "PREPARING":
      return "Preparing";
    case "READY":
      return "Ready";
    case "IMPORTING":
      return "Transferring data";
    case "VALIDATION_REQUIRED":
      return "Needs review";
    case "COMPLETE":
      return "Complete";
    case "FAILED":
      return "Failed";
    case "STATUS_UNAVAILABLE":
      return "Unavailable";
    default:
      return status?.trim() ? status : "Unknown";
  }
}

/** Friendly migration stages for non-developers (advanced detail can show engine terms). */
export const FRIENDLY_MIGRATION_STAGES = [
  { id: "analyze", label: "Analyze existing data" },
  { id: "backup", label: "Secure backup" },
  { id: "transfer", label: "Transfer data" },
  { id: "prepare", label: "Prepare records" },
  { id: "validate", label: "Validate" },
  { id: "test", label: "Test import" },
  { id: "compare", label: "Review differences" },
  { id: "sync", label: "Final sync" },
  { id: "ready", label: "Ready for launch" },
] as const;

export function humanActivityTitle(action: string, resourceType: string, result: string): string {
  const verb = action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  const resource = resourceType.replace(/_/g, " ").toLowerCase();
  const outcome = result.toLowerCase().includes("fail") ? "failed" : "completed";
  return `${verb} ${resource} ${outcome}`.replace(/\s+/g, " ");
}

export function unavailableLabel(): string {
  return "—";
}

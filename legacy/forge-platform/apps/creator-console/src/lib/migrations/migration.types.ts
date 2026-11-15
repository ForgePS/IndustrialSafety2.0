/**
 * Migration Center contracts for Creator Console UI.
 * No migration engine logic — adapters only.
 */

export type MigrationUiStatus =
  | "NOT_STARTED"
  | "PREPARING"
  | "READY"
  | "IMPORTING"
  | "VALIDATION_REQUIRED"
  | "COMPLETE"
  | "FAILED"
  | "STATUS_UNAVAILABLE";

export type MigrationSummary = {
  id: string;
  tenantDisplayName: string;
  tenantId: string;
  source: string;
  destination: string;
  migrationType: string;
  startedAt: string | null;
  status: MigrationUiStatus;
  progressPercent: number | null;
  validationSummary: string;
  issueCount: number;
  updatedAt: string;
  dataSource: "LIVE" | "MOCK" | "NOT_CONNECTED";
};

export type MigrationDetail = MigrationSummary & {
  collections: Array<{ name: string; status: MigrationUiStatus; recordCount: number | null }>;
  documents: Array<{ name: string; status: MigrationUiStatus }>;
  users: { migrated: number | null; pending: number | null; failed: number | null };
  exceptions: Array<{ id: string; message: string; severity: "info" | "warning" | "error" }>;
  logs: Array<{ at: string; level: string; message: string }>;
};

export interface MigrationStatusService {
  listMigrations(): Promise<MigrationSummary[]>;
  getMigration(id: string): Promise<MigrationDetail | null>;
}

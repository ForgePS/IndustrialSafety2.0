import type { MigrationDetail, MigrationStatusService, MigrationSummary } from "./migration.types";

/**
 * Development fixture adapter for Migration Center visuals.
 * Never treat as production data. Gated by app env in the UI layer.
 */
const FIXTURES: MigrationSummary[] = [
  {
    id: "mig_demo_producers_phase2",
    tenantDisplayName: "Producers Rice Mill (fixture)",
    tenantId: "00000000-0000-4000-8000-000000000101",
    source: "Firebase (legacy Industrial)",
    destination: "AWS Aurora (Forge Platform)",
    migrationType: "Industrial tenant cutover",
    startedAt: "2026-08-01T15:00:00.000Z",
    status: "VALIDATION_REQUIRED",
    progressPercent: 72,
    validationSummary: "3 collections require reconciliation review",
    issueCount: 3,
    updatedAt: "2026-08-05T18:30:00.000Z",
    dataSource: "MOCK",
  },
  {
    id: "mig_demo_academy_pilot",
    tenantDisplayName: "Academy Pilot (fixture)",
    tenantId: "00000000-0000-4000-8000-000000000102",
    source: "CSV import package",
    destination: "AWS Aurora (Forge Platform)",
    migrationType: "Academy roster bootstrap",
    startedAt: null,
    status: "NOT_STARTED",
    progressPercent: 0,
    validationSummary: "Not started",
    issueCount: 0,
    updatedAt: "2026-08-04T12:00:00.000Z",
    dataSource: "MOCK",
  },
];

function detailFor(summary: MigrationSummary): MigrationDetail {
  return {
    ...summary,
    collections: [
      { name: "personnel", status: "COMPLETE", recordCount: 128 },
      { name: "incidents", status: "IMPORTING", recordCount: 40 },
      { name: "training", status: "VALIDATION_REQUIRED", recordCount: 12 },
    ],
    documents: [
      { name: "sops", status: "READY" },
      { name: "attachments", status: "NOT_STARTED" },
    ],
    users: { migrated: 18, pending: 4, failed: 1 },
    exceptions: [
      {
        id: "ex_1",
        severity: "warning",
        message: "Duplicate employee number on roster row 44 (fixture)",
      },
      {
        id: "ex_2",
        severity: "error",
        message: "Missing required site code on confined-space permit (fixture)",
      },
    ],
    logs: [
      {
        at: "2026-08-05T18:30:00.000Z",
        level: "INFO",
        message: "Validation batch completed (fixture)",
      },
      {
        at: "2026-08-05T17:10:00.000Z",
        level: "WARN",
        message: "Skipped 2 unsupported legacy form templates (fixture)",
      },
    ],
  };
}

export const mockMigrationStatusService: MigrationStatusService = {
  async listMigrations() {
    return FIXTURES;
  },
  async getMigration(id: string) {
    const summary = FIXTURES.find((m) => m.id === id);
    return summary ? detailFor(summary) : null;
  },
};

/** Resolve the active adapter. Live backend is not wired yet. */
export function getMigrationStatusService(): MigrationStatusService {
  return mockMigrationStatusService;
}

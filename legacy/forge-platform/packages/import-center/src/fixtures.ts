import type {
  ImportDuplicateCandidate,
  ImportJobSummary,
  ImportMappingRow,
  ImportRowError,
} from "./types.js";

export const fixtureCleanCsvJob: ImportJobSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Neutral CSV import",
  status: "READY_FOR_MAPPING",
  productKey: "REFERENCE",
  moduleKey: "CORE",
  recordCategory: "generic_record",
  format: "csv",
  progressPercent: 50,
  createdAt: "2026-07-29T12:00:00.000Z",
  updatedAt: "2026-07-29T12:05:00.000Z",
  file: {
    id: "22222222-2222-4222-8222-222222222222",
    fileName: "people.csv",
    malwareVerdict: "CLEAN",
    quarantineStatus: "NONE",
    scanStatus: "CLEAN",
    uploadStatus: "COMPLETED",
    byteSize: 128,
    contentHash: "abc123def456",
  },
};

export const fixtureQuarantinedJob: ImportJobSummary = {
  ...fixtureCleanCsvJob,
  id: "33333333-3333-4333-8333-333333333333",
  displayName: "Quarantined sample",
  status: "QUARANTINED",
  file: {
    id: "44444444-4444-4444-8444-444444444444",
    fileName: "sample__infected.csv",
    malwareVerdict: "QUARANTINED",
    quarantineStatus: "QUARANTINED",
    scanStatus: "QUARANTINED",
    uploadStatus: "COMPLETED",
    contentHash: "deadbeef",
  },
};

export const fixtureScanFailedJob: ImportJobSummary = {
  ...fixtureCleanCsvJob,
  id: "55555555-5555-4555-8555-555555555555",
  displayName: "Scan failed sample",
  status: "SCAN_FAILED",
  file: {
    id: "66666666-6666-4666-8666-666666666666",
    fileName: "timeout.csv",
    malwareVerdict: "SCAN_TIMEOUT",
    quarantineStatus: "NONE",
    scanStatus: "TIMEOUT",
    uploadStatus: "COMPLETED",
  },
};

export const fixtureProcessingJob: ImportJobSummary = {
  ...fixtureCleanCsvJob,
  id: "77777777-7777-4777-8777-777777777777",
  displayName: "Processing sample",
  status: "PROCESSING",
  progressPercent: 42,
};

export const fixtureMaskedValues = {
  ssn: "***-**-6789",
  email: "j***@example.com",
  password: "********",
  apiKey: "********",
};

export const fixtureNeverReturnable = {
  password: "********",
  accessToken: "********",
};

export const fixtureMappings: ImportMappingRow[] = [
  { sourceColumn: "first_name", targetField: "firstName", isRequired: true, ordinal: 0 },
  { sourceColumn: "ssn", targetField: "ssn", isRequired: false, isSensitive: true, ordinal: 1 },
];

export const fixtureDuplicates: ImportDuplicateCandidate[] = [
  {
    id: "88888888-8888-4888-8888-888888888888",
    jobId: fixtureCleanCsvJob.id,
    confidence: 0.91,
    confidenceBand: "HIGH",
    matchAlgorithm: "exact_email",
    recommendedAction: "MATCH_EXISTING",
    reviewStatus: "PENDING",
    matchFields: { email: "j***@example.com" },
  },
];

export const fixtureErrors: ImportRowError[] = [
  {
    id: "99999999-9999-4999-8999-999999999999",
    jobId: fixtureCleanCsvJob.id,
    ruleCode: "REQUIRED_FIELD",
    fieldPath: "firstName",
    message: "Required field is missing",
    severity: "ERROR",
    disposition: "OPEN",
    retryCount: 0,
  },
];

export const ALL_IMPORT_FIXTURES = {
  cleanCsv: fixtureCleanCsvJob,
  quarantined: fixtureQuarantinedJob,
  scanFailed: fixtureScanFailedJob,
  processing: fixtureProcessingJob,
  masked: fixtureMaskedValues,
  neverReturnable: fixtureNeverReturnable,
  mappings: fixtureMappings,
  duplicates: fixtureDuplicates,
  errors: fixtureErrors,
} as const;

/** Shared types for DM-S2 transformer (no AWS writes). */

export type Disposition =
  "DIRECT" | "TRANSFORM" | "SPLIT" | "MERGE" | "GLOBAL" | "ARCHIVE" | "EXCLUDE_WITH_APPROVAL";

export type ImplementationStatus = "READY" | "PARTIAL" | "MISSING" | "ARCHIVE_ONLY";

export type SourceTargetMapping = {
  sourceCollection: string;
  disposition: Disposition;
  targetService: string;
  targetEntity: string;
  tenantKeyField: string;
  facilityKeyField: string | null;
  implementationStatus: ImplementationStatus;
  notes: string;
};

export type ExtractedRecord = {
  _migration: {
    sourceSystem: string;
    sourceProject?: string;
    database?: string;
    collection: string;
    documentId: string;
    documentPath: string;
    sourceTenantKey: string | null;
    canonicalTenantKey: string | null;
    tenantClassification: string;
    extractedAt?: string;
    extractRunId?: string;
    documentCreateTime?: string | null;
    documentUpdateTime?: string | null;
  };
  data: Record<string, unknown>;
};

export type IdMapEntry = {
  sourceSystem: string;
  sourceCollection: string;
  sourceDocumentPath: string;
  sourceDocumentId: string;
  sourceTenantKey: string | null;
  targetEntity: string;
  targetId: string;
  migrationRunId: string;
};

export type TransformError = {
  severity: "FATAL" | "WARN";
  code: string;
  sourceCollection?: string;
  sourceDocumentPath?: string;
  message: string;
};

export type GateCounts = {
  UNKNOWN_TENANT: number;
  UNKNOWN_TARGET: number;
  DUPLICATE_TARGET_KEYS: number;
  FATAL_TRANSFORM_ERRORS: number;
  REQUIRED_PARENT_MISSING: number;
  CROSS_TENANT_RELATIONSHIPS: number;
};

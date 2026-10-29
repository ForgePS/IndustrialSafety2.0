import type {
  DuplicateAction,
  ImportFormat,
  ProductModuleRef,
  ValidationRuleKind,
} from "./types.js";

export type DetectedFileMeta = {
  format: ImportFormat;
  encoding?: string;
  delimiter?: string;
  headers?: string[];
  sheets?: string[];
  byteSize?: number;
  contentHash?: string;
};

export type TargetFieldSchema = {
  field: string;
  dataType: string;
  required?: boolean;
  dropdownKey?: string;
};

export type TargetSchema = {
  ref: ProductModuleRef;
  fields: TargetFieldSchema[];
};

export type ColumnMapping = {
  sourceColumn: string;
  targetField: string;
  transform?: Record<string, unknown>;
  required?: boolean;
};

export type StagedRow = {
  sourceRowKey: string;
  sourceLine?: number;
  sourceSheet?: string;
  raw: Record<string, unknown>;
  mapped?: Record<string, unknown>;
};

export type ValidationIssue = {
  rule: ValidationRuleKind;
  severity: "ERROR" | "WARNING";
  fieldPath?: string;
  message: string;
  details?: Record<string, unknown>;
};

export type RowValidationResult = {
  sourceRowKey: string;
  issues: ValidationIssue[];
};

export type DuplicateCandidate = {
  sourceRowKey: string;
  matchedEntityId?: string;
  confidence: number;
  recommendedAction: DuplicateAction;
  matchFields?: Record<string, unknown>;
};

export type PreviewSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  sampleRows: StagedRow[];
};

export type ProgressSnapshot = {
  jobId: string;
  stage: string;
  percent: number;
  message?: string;
};

export type ExecuteBatchResult = {
  batchId: string;
  committed: number;
  failed: number;
};

export type RollbackResult = {
  rolledBack: number;
  skipped: number;
  safe: boolean;
};

export interface FileDetector {
  detect(input: {
    bytes: Uint8Array;
    fileName: string;
    contentType?: string;
  }): Promise<DetectedFileMeta>;
}

export interface SchemaLoader {
  load(ref: ProductModuleRef, tenantId: string): Promise<TargetSchema>;
}

export interface ColumnMapper {
  suggest(headers: string[], schema: TargetSchema): Promise<ColumnMapping[]>;
  apply(rows: StagedRow[], mappings: ColumnMapping[]): Promise<StagedRow[]>;
}

export interface Transformer {
  transform(rows: StagedRow[], mappings: ColumnMapping[]): Promise<StagedRow[]>;
}

export interface Validator {
  validate(rows: StagedRow[], schema: TargetSchema): Promise<RowValidationResult[]>;
}

export interface DuplicateDetector {
  detect(rows: StagedRow[], ref: ProductModuleRef, tenantId: string): Promise<DuplicateCandidate[]>;
}

export interface PreviewGenerator {
  generate(input: {
    rows: StagedRow[];
    validations: RowValidationResult[];
    duplicates: DuplicateCandidate[];
  }): Promise<PreviewSummary>;
}

export interface ImportExecutor {
  executeBatch(input: {
    tenantId: string;
    jobId: string;
    batchId: string;
    rows: StagedRow[];
    ref: ProductModuleRef;
  }): Promise<ExecuteBatchResult>;
}

export interface RollbackHandler {
  rollback(input: { tenantId: string; jobId: string; reason?: string }): Promise<RollbackResult>;
}

export interface ProgressReporter {
  report(snapshot: ProgressSnapshot): Promise<void>;
}

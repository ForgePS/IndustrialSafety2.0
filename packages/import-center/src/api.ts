import type {
  ImportDuplicateCandidate,
  ImportJobSummary,
  ImportMappingRow,
  ImportRowError,
  ProtectedDownloadResponse,
} from "./types.js";

export type ApiRequestOptions = {
  ifMatch?: string;
  idempotencyKey?: string;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

export type ImportApiTransport = {
  get: <T>(path: string, options?: ApiRequestOptions) => Promise<T>;
  send: <T>(
    path: string,
    method: "POST" | "PATCH" | "PUT" | "DELETE",
    payload?: unknown,
    options?: ApiRequestOptions,
  ) => Promise<T>;
};

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export function createImportApi(transport: ImportApiTransport) {
  const base = "/api/v1/imports";

  return {
    listJobs(query?: Record<string, string | undefined>) {
      return transport.get<
        | { items: ImportJobSummary[]; page?: number; pageSize?: number; total?: number }
        | ImportJobSummary[]
      >(`${base}/jobs`, query !== undefined ? { query } : {});
    },
    getJob(jobId: string) {
      // Includes file/security fields via upload getJobDetail route.
      return transport.get<ImportJobSummary>(`${base}/${jobId}`);
    },
    getJobSummary(jobId: string) {
      return transport.get<ImportJobSummary>(`${base}/jobs/${jobId}`);
    },
    getUploadStatus(jobId: string) {
      return transport.get<Record<string, unknown>>(`${base}/${jobId}/status`);
    },
    getFileMetadata(jobId: string) {
      return transport.get<Record<string, unknown>>(`${base}/${jobId}/file`);
    },
    initializeUpload(body: Record<string, unknown>, idempotencyKey?: string) {
      return transport.send<Record<string, unknown>>(`${base}/upload`, "POST", body, {
        idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-upload"),
      });
    },
    completeUpload(jobId: string, body?: Record<string, unknown>, idempotencyKey?: string) {
      return transport.send<Record<string, unknown>>(
        `${base}/upload/${jobId}/complete`,
        "POST",
        body ?? {},
        { idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-upload-complete") },
      );
    },
    getUploadParts(jobId: string, body: { partNumbers: number[] }) {
      return transport.send<{ parts: Array<{ uploadUrl: string; partNumber: number }> }>(
        `${base}/upload/${jobId}/parts`,
        "POST",
        body,
      );
    },
    abortUpload(jobId: string, idempotencyKey?: string) {
      return transport.send<Record<string, unknown>>(
        `${base}/upload/${jobId}/abort`,
        "POST",
        {},
        { idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-upload-abort") },
      );
    },
    listScanEvents(jobId: string, fileId: string) {
      return transport.get<Record<string, unknown>>(
        `${base}/jobs/${jobId}/files/${fileId}/scan-events`,
      );
    },
    rescan(jobId: string, fileId: string, body: { reason?: string; idempotencyKey?: string }) {
      return transport.send<Record<string, unknown>>(
        `${base}/jobs/${jobId}/files/${fileId}/rescan`,
        "POST",
        body,
        { idempotencyKey: body.idempotencyKey ?? createIdempotencyKey("import-rescan") },
      );
    },
    listProfiles(query?: Record<string, string | undefined>) {
      return transport.get<{ items: unknown[] } | unknown[]>(
        `${base}/profiles`,
        query !== undefined ? { query } : {},
      );
    },
    listTemplates() {
      return transport.get<unknown[]>(`${base}/templates`);
    },
    listMappings(jobId: string) {
      return transport.get<ImportMappingRow[]>(`${base}/jobs/${jobId}/mappings`);
    },
    suggestMappings(jobId: string) {
      return transport.send<{
        jobId: string;
        templateKey: string;
        detectedHeaders: string[];
        mappings: ImportMappingRow[];
      }>(`${base}/jobs/${jobId}/suggest-mappings`, "POST", {});
    },
    putMappings(jobId: string, mappings: ImportMappingRow[], idempotencyKey?: string) {
      return transport.send(
        `${base}/jobs/${jobId}/mappings`,
        "PUT",
        { mappings },
        { idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-mappings") },
      );
    },
    requestValidation(jobId: string, idempotencyKey?: string) {
      return transport.send(
        `${base}/jobs/${jobId}/request-validation`,
        "POST",
        {},
        { idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-validate") },
      );
    },
    requestPreview(jobId: string, idempotencyKey?: string) {
      return transport.send(
        `${base}/jobs/${jobId}/request-preview`,
        "POST",
        {},
        { idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-preview") },
      );
    },
    listDuplicates(query?: Record<string, string | undefined>) {
      return transport.get<{ items: ImportDuplicateCandidate[] } | ImportDuplicateCandidate[]>(
        `${base}/duplicates`,
        query !== undefined ? { query } : {},
      );
    },
    reviewDuplicate(duplicateId: string, body: Record<string, unknown>, idempotencyKey?: string) {
      return transport.send(`${base}/duplicates/${duplicateId}/review`, "POST", body, {
        idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-dup-review"),
      });
    },
    submitForApproval(jobId: string, idempotencyKey?: string) {
      return transport.send(
        `${base}/jobs/${jobId}/submit-for-approval`,
        "POST",
        {},
        { idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-submit") },
      );
    },
    approve(jobId: string, idempotencyKey?: string) {
      return transport.send(
        `${base}/jobs/${jobId}/approve`,
        "POST",
        {},
        { idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-approve") },
      );
    },
    reject(jobId: string, idempotencyKey?: string) {
      return transport.send(
        `${base}/jobs/${jobId}/reject`,
        "POST",
        {},
        { idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-reject") },
      );
    },
    execute(jobId: string, body?: Record<string, unknown>, idempotencyKey?: string) {
      return transport.send(`${base}/jobs/${jobId}/execute`, "POST", body ?? {}, {
        idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-execute"),
      });
    },
    cancelExecution(jobId: string, body?: Record<string, unknown>, idempotencyKey?: string) {
      return transport.send(`${base}/jobs/${jobId}/cancel-execution`, "POST", body ?? {}, {
        idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-cancel-exec"),
      });
    },
    cancelJob(jobId: string, idempotencyKey?: string) {
      return transport.send(
        `${base}/jobs/${jobId}/cancel`,
        "POST",
        {},
        { idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-cancel") },
      );
    },
    getStatus(jobId: string) {
      return transport.get<Record<string, unknown>>(`${base}/jobs/${jobId}/status`);
    },
    getResults(jobId: string) {
      return transport.get<Record<string, unknown>>(`${base}/jobs/${jobId}/results`);
    },
    listBatches(jobId: string) {
      return transport.get<unknown[]>(`${base}/jobs/${jobId}/batches`);
    },
    listErrors(jobId: string) {
      return transport.get<ImportRowError[]>(`${base}/jobs/${jobId}/errors`);
    },
    retryError(
      jobId: string,
      errorId: string,
      body?: Record<string, unknown>,
      idempotencyKey?: string,
    ) {
      return transport.send(`${base}/jobs/${jobId}/errors/${errorId}/retry`, "POST", body ?? {}, {
        idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-retry"),
      });
    },
    requestRollback(jobId: string, body?: Record<string, unknown>, idempotencyKey?: string) {
      return transport.send(`${base}/jobs/${jobId}/rollback-request`, "POST", body ?? {}, {
        idempotencyKey: idempotencyKey ?? createIdempotencyKey("import-rollback"),
      });
    },
    downloadResults(jobId: string, privileged?: boolean) {
      return transport.send<ProtectedDownloadResponse>(
        `${base}/jobs/${jobId}/results/download`,
        "POST",
        { privileged: Boolean(privileged) },
      );
    },
    downloadErrors(jobId: string, privileged?: boolean) {
      return transport.send<ProtectedDownloadResponse>(
        `${base}/jobs/${jobId}/errors/download`,
        "POST",
        { privileged: Boolean(privileged) },
      );
    },
    downloadSecurityReport(jobId: string) {
      return transport.send<ProtectedDownloadResponse>(
        `${base}/jobs/${jobId}/security-report/download`,
        "POST",
        {},
      );
    },
  };
}

export type ImportApi = ReturnType<typeof createImportApi>;

export type CreateLookupInput = {
  kind: string;
  name: string;
  description?: string;
};

export type CreateLookupResult = {
  id: string;
  name: string;
};

/** Creates missing industrial org lookups (department / position / employment_type). */
export function createLookupViaTransport(
  transport: ImportApiTransport,
  tenantId: string,
): (input: CreateLookupInput) => Promise<CreateLookupResult> {
  return (input) =>
    transport.send<CreateLookupResult>(
      `/api/v1/tenants/${tenantId}/industrial/org-lookups/create-missing`,
      "POST",
      input,
    );
}

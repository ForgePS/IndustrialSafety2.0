import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  RequirePermission,
} from "../auth-context/require-permission.decorator.js";
import { ImportDuplicatesService } from "./import-duplicates.service.js";
import { ImportExecutionService } from "./import-execution.service.js";
import { ImportSecurityService } from "./import-security.service.js";
import { ImportUploadService } from "./import-upload.service.js";
import { ImportsService } from "./imports.service.js";

@Controller("api/v1/imports")
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly uploads: ImportUploadService,
    private readonly duplicates: ImportDuplicatesService,
    private readonly execution: ImportExecutionService,
    private readonly security: ImportSecurityService,
  ) {}

  @Post("upload")
  @RequirePermission("import.upload")
  @Idempotent({ resourceType: "import_upload", required: true })
  async initializeUpload(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.uploads.initializeUpload(principal, body, ids.correlationId, idempotencyKey),
      ids,
    );
  }

  @Post("upload/:jobId/parts")
  @RequirePermission("import.upload")
  async getUploadParts(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.uploads.getPartUrls(principal, jobId, body), getRequestIds(req));
  }

  @Post("upload/:jobId/complete")
  @RequirePermission("import.upload")
  @Idempotent({ resourceType: "import_upload_complete", required: true })
  async completeUpload(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.uploads.completeUpload(principal, jobId, body, ids.correlationId), ids);
  }

  @Post("upload/:jobId/abort")
  @RequirePermission("import.upload")
  @Idempotent({ resourceType: "import_upload_abort", required: true })
  async abortUpload(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.uploads.abortUpload(principal, jobId, ids.correlationId), ids);
  }

  @Get("duplicates")
  @RequirePermission("import.view")
  async listDuplicates(
    @Query() query: Record<string, string>,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const result = await this.duplicates.list(principal, query);
    return ok(result, getRequestIds(req), {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }

  @Get("duplicates/:duplicateId")
  @RequirePermission("import.view")
  async getDuplicate(
    @Param("duplicateId") duplicateId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.duplicates.get(principal, duplicateId), getRequestIds(req));
  }

  @Post("duplicates/:duplicateId/review")
  @RequirePermission("import.preview")
  @Idempotent({ resourceType: "import_duplicate_review", required: true })
  async reviewDuplicate(
    @Param("duplicateId") duplicateId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.duplicates.review(principal, duplicateId, body, ids.correlationId), ids);
  }

  @Post("duplicates/:duplicateId/approve")
  @RequirePermission("import.approve")
  @Idempotent({ resourceType: "import_duplicate_approve", required: true })
  async approveDuplicate(
    @Param("duplicateId") duplicateId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.duplicates.approve(principal, duplicateId, body, ids.correlationId), ids);
  }

  @Post("duplicates/:duplicateId/reject")
  @RequirePermission("import.approve")
  @Idempotent({ resourceType: "import_duplicate_reject", required: true })
  async rejectDuplicate(
    @Param("duplicateId") duplicateId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.duplicates.reject(principal, duplicateId, body, ids.correlationId), ids);
  }

  @Post("zip/validate")
  @RequirePermission("import.validate")
  @Idempotent({ resourceType: "import_zip_validate", required: true })
  async validateZip(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.duplicates.validateZip(principal, body, ids.correlationId), ids);
  }

  @Post("api-sources/validate")
  @RequirePermission("import.profile.manage")
  @Idempotent({ resourceType: "import_api_validate", required: true })
  async validateApiSource(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.duplicates.validateApiSource(principal, body, ids.correlationId), ids);
  }

  @Post("jobs")
  @RequirePermission("import.upload")
  @Idempotent({ resourceType: "import_job", required: true })
  async createJob(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.imports.createJob(principal, body, ids.correlationId, idempotencyKey),
      ids,
    );
  }

  @Get("jobs")
  @RequirePermission("import.view")
  async listJobs(
    @Query() query: Record<string, string>,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const result = await this.imports.listJobs(principal, query);
    return ok(result, getRequestIds(req), {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }

  @Get("jobs/:jobId")
  @RequirePermission("import.view")
  async getJob(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.imports.getJob(principal, jobId), getRequestIds(req));
  }

  @Patch("jobs/:jobId")
  @RequirePermission("import.upload")
  @Idempotent({ resourceType: "import_job" })
  async patchJob(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.imports.patchJob(principal, jobId, body, ids.correlationId), ids);
  }

  @Post("jobs/:jobId/cancel")
  @RequireAnyPermission(["import.upload", "import.approve", "import.execute"])
  @Idempotent({ resourceType: "import_job_cancel", required: true })
  async cancelJob(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    try {
      return ok(
        await this.execution.cancelExecution(principal, jobId, body ?? {}, ids.correlationId),
        ids,
      );
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "IMPORT_INVALID_STATE_TRANSITION") {
        return ok(
          await this.uploads.cancelIncludingUpload(principal, jobId, ids.correlationId),
          ids,
        );
      }
      throw error;
    }
  }

  @Post("jobs/:jobId/request-validation")
  @RequirePermission("import.validate")
  @Idempotent({ resourceType: "import_job_validate", required: true })
  async requestValidation(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.imports.requestValidation(principal, jobId, ids.correlationId), ids);
  }

  @Post("jobs/:jobId/request-preview")
  @RequirePermission("import.preview")
  @Idempotent({ resourceType: "import_job_preview", required: true })
  async requestPreview(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.imports.requestPreview(principal, jobId, ids.correlationId), ids);
  }

  @Post("jobs/:jobId/submit-for-approval")
  @RequirePermission("import.preview")
  @Idempotent({ resourceType: "import_job_submit", required: true })
  async submitForApproval(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.imports.submitForApproval(principal, jobId, ids.correlationId), ids);
  }

  @Post("jobs/:jobId/approve")
  @RequirePermission("import.approve")
  @Idempotent({ resourceType: "import_job_approve", required: true })
  async approveJob(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.imports.approveJob(principal, jobId, ids.correlationId), ids);
  }

  @Post("jobs/:jobId/reject")
  @RequirePermission("import.approve")
  @Idempotent({ resourceType: "import_job_reject", required: true })
  async rejectJob(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.imports.rejectJob(principal, jobId, ids.correlationId), ids);
  }

  @Post("jobs/:jobId/execute")
  @RequirePermission("import.execute")
  @Idempotent({ resourceType: "import_job_execute", required: true })
  async executeJob(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.execution.execute(principal, jobId, body, ids.correlationId, idempotencyKey),
      ids,
    );
  }

  @Post("jobs/:jobId/cancel-execution")
  @RequirePermission("import.execute")
  @Idempotent({ resourceType: "import_job_cancel_execution", required: true })
  async cancelExecution(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.execution.cancelExecution(principal, jobId, body, ids.correlationId), ids);
  }

  @Get("jobs/:jobId/status")
  @RequirePermission("import.view")
  async getExecutionStatus(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.execution.getStatus(principal, jobId), getRequestIds(req));
  }

  @Get("jobs/:jobId/results")
  @RequirePermission("import.view")
  async getExecutionResults(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.execution.getResults(principal, jobId), getRequestIds(req));
  }

  @Get("jobs/:jobId/batches")
  @RequirePermission("import.view")
  async listBatches(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.execution.listBatches(principal, jobId), getRequestIds(req));
  }

  @Get("jobs/:jobId/batches/:batchId")
  @RequirePermission("import.view")
  async getBatch(
    @Param("jobId") jobId: string,
    @Param("batchId") batchId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.execution.getBatch(principal, jobId, batchId), getRequestIds(req));
  }

  @Get("jobs/:jobId/errors")
  @RequirePermission("import.view")
  async listJobErrors(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.execution.listErrors(principal, jobId), getRequestIds(req));
  }

  @Post("jobs/:jobId/errors/:errorId/retry")
  @RequirePermission("import.error.reprocess")
  @Idempotent({ resourceType: "import_row_error_retry", required: true })
  async retryJobError(
    @Param("jobId") jobId: string,
    @Param("errorId") errorId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.execution.retryError(principal, jobId, errorId, body, ids.correlationId),
      ids,
    );
  }

  @Post("jobs/:jobId/rollback-request")
  @RequirePermission("import.rollback")
  @Idempotent({ resourceType: "import_rollback_request", required: true })
  async requestRollback(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.execution.requestRollback(
        principal,
        jobId,
        body,
        ids.correlationId,
        idempotencyKey,
      ),
      ids,
    );
  }

  @Get("jobs/:jobId/files/:fileId/scan-events")
  @RequirePermission("import.view")
  async listScanEvents(
    @Param("jobId") jobId: string,
    @Param("fileId") fileId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.security.listScanEvents(principal, jobId, fileId), getRequestIds(req));
  }

  @Post("jobs/:jobId/files/:fileId/rescan")
  @RequirePermission("import.validate")
  @Idempotent({ resourceType: "import_file_rescan", required: true })
  async rescanFile(
    @Param("jobId") jobId: string,
    @Param("fileId") fileId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.security.requestRescan(principal, jobId, fileId, body, ids.correlationId),
      ids,
    );
  }

  @Post("jobs/:jobId/results/download")
  @RequirePermission("import.view")
  async downloadResults(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.security.createProtectedDownload(
        principal,
        jobId,
        { ...(typeof body === "object" && body ? body : {}), artifactType: "results" },
        ids.correlationId,
      ),
      ids,
    );
  }

  @Post("jobs/:jobId/errors/download")
  @RequirePermission("import.view")
  async downloadErrors(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.security.createProtectedDownload(
        principal,
        jobId,
        { ...(typeof body === "object" && body ? body : {}), artifactType: "errors" },
        ids.correlationId,
      ),
      ids,
    );
  }

  @Post("jobs/:jobId/security-report/download")
  @RequirePermission("import.view")
  async downloadSecurityReport(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.security.createProtectedDownload(
        principal,
        jobId,
        { ...(typeof body === "object" && body ? body : {}), artifactType: "security-report" },
        ids.correlationId,
      ),
      ids,
    );
  }

  @Get("jobs/:jobId/mappings")
  @RequirePermission("import.view")
  async listMappings(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.imports.listMappings(principal, jobId), getRequestIds(req));
  }

  @Post("jobs/:jobId/suggest-mappings")
  @RequirePermission("import.map")
  async suggestMappings(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.imports.suggestMappings(principal, jobId), getRequestIds(req));
  }

  @Put("jobs/:jobId/mappings")
  @RequirePermission("import.map")
  @Idempotent({ resourceType: "import_mappings", required: true })
  async putMappings(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.imports.putMappings(principal, jobId, body, ids.correlationId), ids);
  }

  @Post("jobs/:jobId/rows/stage")
  @RequirePermission("import.upload")
  @Idempotent({ resourceType: "import_rows_stage", required: true })
  async stageRows(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.duplicates.stageRows(principal, jobId, body, ids.correlationId), ids);
  }

  @Post("jobs/:jobId/duplicates/detect")
  @RequirePermission("import.validate")
  @Idempotent({ resourceType: "import_duplicates_detect", required: true })
  async detectDuplicates(
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.duplicates.detect(principal, jobId, body, ids.correlationId), ids);
  }

  @Delete("jobs/:jobId/mappings/:mappingId")
  @RequirePermission("import.map")
  async deleteMapping(
    @Param("jobId") jobId: string,
    @Param("mappingId") mappingId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.imports.deleteMapping(principal, jobId, mappingId, ids.correlationId),
      ids,
    );
  }

  @Post("profiles")
  @RequirePermission("import.profile.manage")
  @Idempotent({ resourceType: "import_profile", required: true })
  async createProfile(
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ids = getRequestIds(req);
    return ok(
      await this.imports.createProfile(principal, body, ids.correlationId, idempotencyKey),
      ids,
    );
  }

  @Get("profiles")
  @RequirePermission("import.view")
  async listProfiles(
    @Query() query: Record<string, string>,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const result = await this.imports.listProfiles(principal, query);
    return ok(result, getRequestIds(req), {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }

  @Get("profiles/:profileId")
  @RequirePermission("import.view")
  async getProfile(
    @Param("profileId") profileId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.imports.getProfile(principal, profileId), getRequestIds(req));
  }

  @Patch("profiles/:profileId")
  @RequirePermission("import.profile.manage")
  @Idempotent({ resourceType: "import_profile" })
  async patchProfile(
    @Param("profileId") profileId: string,
    @Body() body: unknown,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    // S4 enhanced patch (duplicateRules/zip/api metadata + version history)
    if (
      body &&
      typeof body === "object" &&
      ("duplicateRules" in body || "zipMetadata" in body || "apiSourceMetadata" in body)
    ) {
      return ok(
        await this.duplicates.patchProfileS4(principal, profileId, body, ids.correlationId),
        ids,
      );
    }
    return ok(await this.imports.patchProfile(principal, profileId, body, ids.correlationId), ids);
  }

  @Get("profiles/:profileId/versions")
  @RequirePermission("import.view")
  async listProfileVersions(
    @Param("profileId") profileId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.duplicates.listProfileVersions(principal, profileId), getRequestIds(req));
  }

  @Post("profiles/:profileId/archive")
  @RequirePermission("import.profile.manage")
  @Idempotent({ resourceType: "import_profile_archive", required: true })
  async archiveProfile(
    @Param("profileId") profileId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.imports.archiveProfile(principal, profileId, ids.correlationId), ids);
  }

  @Post("profiles/:profileId/restore")
  @RequirePermission("import.profile.manage")
  @Idempotent({ resourceType: "import_profile_restore", required: true })
  async restoreProfile(
    @Param("profileId") profileId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.imports.restoreProfile(principal, profileId, ids.correlationId), ids);
  }

  @Get("templates")
  @RequirePermission("import.view")
  listTemplates(@Query() query: Record<string, string>, @Req() req: RequestWithIds) {
    return ok(this.imports.listTemplates(query), getRequestIds(req));
  }

  @Get("templates/:templateKey")
  @RequirePermission("import.view")
  getTemplate(@Param("templateKey") templateKey: string, @Req() req: RequestWithIds) {
    return ok(this.imports.getTemplate(templateKey), getRequestIds(req));
  }

  // Parametric job routes must stay after static segments (jobs/profiles/templates/upload).
  @Get(":jobId/status")
  @RequirePermission("import.view")
  async getStatus(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.uploads.getStatus(principal, jobId), getRequestIds(req));
  }

  @Get(":jobId/file")
  @RequirePermission("import.view")
  async getFile(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.uploads.getFileMetadata(principal, jobId), getRequestIds(req));
  }

  @Get(":jobId")
  @RequirePermission("import.view")
  async getImportById(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.uploads.getJobDetail(principal, jobId), getRequestIds(req));
  }

  @Post(":jobId/cancel")
  @RequireAnyPermission(["import.upload", "import.approve"])
  @Idempotent({ resourceType: "import_cancel", required: true })
  async cancelImport(
    @Param("jobId") jobId: string,
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const ids = getRequestIds(req);
    return ok(await this.uploads.cancelIncludingUpload(principal, jobId, ids.correlationId), ids);
  }
}

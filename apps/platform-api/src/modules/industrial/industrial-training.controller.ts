import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import type { Response } from "express";
import { ok } from "../../common/api-response.js";
import { Idempotent } from "../../common/idempotent.decorator.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialTrainingService } from "./industrial-training.service.js";
import { IndustrialTrainingAssignmentsService } from "./industrial-training-assignments.service.js";
import { IndustrialTrainingLmsService } from "./industrial-training-lms.service.js";
import { IndustrialTrainingRecordAttachmentsService } from "./industrial-training-record-attachments.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
type ListQuery = Record<string, string | undefined>;

/** Industrial admins + Forge Field learners (view). */
const TRAINING_VIEW = [
  "industrial.access",
  "industrial.training.view",
  "industrial.admin",
  "field.training.view",
  "field.access",
] as const;

/** Authenticated self-service My Training (includes industrial employees). */
const TRAINING_SELF = [
  "industrial.access",
  "industrial.training.view",
  "industrial.admin",
  "field.training.view",
  "field.access",
] as const;

/** Start/answer/retake quizzes (Field complete). */
const TRAINING_COMPLETE = [
  "industrial.access",
  "industrial.training.view",
  "industrial.admin",
  "field.training.complete",
  "field.training.view",
  "field.access",
] as const;

/**
 * FiredUp-style training LMS routes under /api/v1/industrial/training/*.
 * Nested under a dedicated controller so they win over the flat
 * `:module/:id` catch-alls in IndustrialFlatController.
 */
@Controller("api/v1/industrial/training")
export class IndustrialTrainingController {
  constructor(
    private readonly training: IndustrialTrainingService,
    private readonly assignments: IndustrialTrainingAssignmentsService,
    private readonly lms: IndustrialTrainingLmsService,
    private readonly recordAttachments: IndustrialTrainingRecordAttachmentsService,
  ) {}

  private listOk(
    data: { items: unknown[]; page: number; pageSize: number; total?: number },
    req: RequestWithIds,
  ) {
    return ok(data, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.total ?? data.items.length,
    });
  }

  // Records (compat with ops-module-workspace listPath)
  @Get()
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listRoot(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.training.listRecords(principal, query), req);
  }

  @Post()
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createRoot(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createRecord(principal, body as { title?: string }),
      getRequestIds(req),
    );
  }

  @Get("records")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listRecords(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.training.listRecords(principal, query), req);
  }

  @Get("records/course-names")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listRecordCourseNames(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    const names = await this.training.listRecordCourseNames(principal);
    return ok(names, getRequestIds(req), {
      page: 1,
      pageSize: names.length,
      total: names.length,
    });
  }

  @Post("records")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createRecord(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createRecord(
        principal,
        body as {
          title?: string;
          courseCode?: string;
          instructorName?: string;
          notes?: string;
          personnelId?: string;
          employeeNumber?: string;
          completedAt?: string;
          expiresAt?: string;
          result?: string;
          scorePercent?: number | null;
          attemptNumber?: number | null;
        },
      ),
      getRequestIds(req),
    );
  }

  @Patch("records/:recordId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateRecord(
    @Principal() principal: ForgePrincipal,
    @Param("recordId") recordId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.updateRecord(principal, recordId, body as { title?: string }),
      getRequestIds(req),
    );
  }

  @Post("records/:recordId/archive")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_record_archive" })
  async archiveRecord(
    @Principal() principal: ForgePrincipal,
    @Param("recordId") recordId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.archiveRecord(principal, recordId), getRequestIds(req));
  }

  @Post("records/:recordId/attachments/upload-url")
  @RequireAnyPermission(
    [
      "industrial.training.manage",
      "industrial.personnel.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_training_record_attachment" })
  async createRecordAttachmentUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("recordId") recordId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const payload: { filename?: string; mimeType?: string; contentLength?: number } = {};
    if (typeof body.filename === "string") payload.filename = body.filename;
    if (typeof body.mimeType === "string") payload.mimeType = body.mimeType;
    if (body.contentLength != null && Number.isFinite(Number(body.contentLength))) {
      payload.contentLength = Number(body.contentLength);
    }
    return ok(
      await this.recordAttachments.createUploadUrl(principal, recordId, payload),
      getRequestIds(req),
    );
  }

  @Post("records/:recordId/attachments/complete")
  @RequireAnyPermission(
    [
      "industrial.training.manage",
      "industrial.personnel.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  @Idempotent({ resourceType: "industrial_training_record_attachment_complete" })
  async completeRecordAttachmentUpload(
    @Principal() principal: ForgePrincipal,
    @Param("recordId") recordId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const raw =
      typeof body.documentId === "string"
        ? body.documentId
        : typeof body.document_id === "string"
          ? body.document_id
          : body.data &&
              typeof body.data === "object" &&
              !Array.isArray(body.data) &&
              typeof (body.data as Record<string, unknown>).documentId === "string"
            ? String((body.data as Record<string, unknown>).documentId)
            : "";
    return ok(
      await this.recordAttachments.completeUpload(principal, recordId, {
        documentId: raw.trim(),
      }),
      getRequestIds(req),
    );
  }

  @Get("records/:recordId/attachments/:documentId/download-url")
  @RequireAnyPermission(
    [
      ...TRAINING_VIEW,
      "industrial.personnel.view",
      "industrial.personnel.manage",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async recordAttachmentDownloadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("recordId") recordId: string,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.recordAttachments.createDownloadUrl(principal, recordId, documentId),
      getRequestIds(req),
    );
  }

  @Delete("records/:recordId/attachments/:documentId")
  @RequireAnyPermission(
    [
      "industrial.training.manage",
      "industrial.personnel.manage",
      "industrial.admin",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async deleteRecordAttachment(
    @Principal() principal: ForgePrincipal,
    @Param("recordId") recordId: string,
    @Param("documentId") documentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.recordAttachments.deleteAttachment(principal, recordId, documentId),
      getRequestIds(req),
    );
  }

  @Get("sources")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listSources(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    const canManage =
      principal.permissions.has("industrial.training.manage") ||
      principal.permissions.has("industrial.admin") ||
      principal.isPlatformAdmin;
    return this.listOk(
      await this.training.listSources(principal, query, { publishedOnly: !canManage }),
      req,
    );
  }

  @Post("sources")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createSource(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createSource(principal, body as {
        title?: string;
        edition?: string;
        description?: string;
        groupIds?: string[];
      }),
      getRequestIds(req),
    );
  }

  @Get("sources/:sourceId")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getSource(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.getSource(principal, sourceId), getRequestIds(req));
  }

  @Patch("sources/:sourceId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateSource(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.updateSource(principal, sourceId, body as {
        title?: string;
        edition?: string;
        description?: string;
        status?: string;
        groupIds?: string[];
      }),
      getRequestIds(req),
    );
  }

  @Post("sources/:sourceId/archive")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_source" })
  async archiveSource(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.archiveSource(principal, sourceId), getRequestIds(req));
  }

  @Post("sources/:sourceId/restore")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_source_restore" })
  async restoreSource(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.restoreSource(principal, sourceId), getRequestIds(req));
  }

  @Delete("sources/:sourceId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_source_purge" })
  async purgeSource(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.purgeSource(principal, sourceId), getRequestIds(req));
  }

  @Get("sources/:sourceId/folders")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listSourceFolders(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.training.listSourceFolders(principal, sourceId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("sources/:sourceId/folders")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createSourceFolder(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createSourceFolder(principal, sourceId, body as { name?: string }),
      getRequestIds(req),
    );
  }

  @Patch("folders/:folderId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateSourceFolder(
    @Principal() principal: ForgePrincipal,
    @Param("folderId") folderId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.updateSourceFolder(principal, folderId, body as { name?: string }),
      getRequestIds(req),
    );
  }

  @Get("sources/:sourceId/questions")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listQuestions(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.training.listQuestions(principal, sourceId, query);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("sources/:sourceId/questions")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createQuestion(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createQuestion(principal, sourceId, body as { stem?: string }),
      getRequestIds(req),
    );
  }

  @Post("sources/:sourceId/questions/import")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async importQuestions(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.importQuestionBank(
        principal,
        sourceId,
        body as {
          chapters?: Array<{
            title?: string;
            pageRange?: string;
            questions?: Array<{
              stem?: string;
              choices?: string[];
              correctIndex?: number;
              explanation?: string;
              pageRef?: string;
              difficulty?: string;
              status?: string;
            }>;
          }>;
          defaultStatus?: string;
        },
      ),
      getRequestIds(req),
    );
  }

  @Post("sources/:sourceId/questions/import-file")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async importQuestionsFromFile(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.importQuestionsFromFile(
        principal,
        sourceId,
        body as {
          filename?: string;
          contentBase64?: string;
          defaultStatus?: string;
        },
      ),
      getRequestIds(req),
    );
  }

  @Patch("questions/:questionId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateQuestion(
    @Principal() principal: ForgePrincipal,
    @Param("questionId") questionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.updateQuestion(principal, questionId, body as { stem?: string }),
      getRequestIds(req),
    );
  }

  @Delete("questions/:questionId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveQuestion(
    @Principal() principal: ForgePrincipal,
    @Param("questionId") questionId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.archiveQuestion(principal, questionId), getRequestIds(req));
  }

  @Post("quizzes")
  @RequireAnyPermission([...TRAINING_COMPLETE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createQuiz(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createQuiz(principal, body as { sourceId?: string }),
      getRequestIds(req),
    );
  }

  @Get("attempts/in-progress")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listInProgress(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const data = await this.training.listInProgress(principal);
    return ok(data, getRequestIds(req));
  }

  @Get("attempts/:attemptId")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getAttempt(
    @Principal() principal: ForgePrincipal,
    @Param("attemptId") attemptId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.getAttempt(principal, attemptId), getRequestIds(req));
  }

  @Post("attempts/:attemptId/resume")
  @RequireAnyPermission([...TRAINING_COMPLETE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async resumeAttempt(
    @Principal() principal: ForgePrincipal,
    @Param("attemptId") attemptId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.resumeAttempt(principal, attemptId), getRequestIds(req));
  }

  @Get("attempts/:attemptId/next")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async nextQuestion(
    @Principal() principal: ForgePrincipal,
    @Param("attemptId") attemptId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.nextQuestion(principal, attemptId), getRequestIds(req));
  }

  @Post("attempts/:attemptId/answer")
  @RequireAnyPermission([...TRAINING_COMPLETE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async answer(
    @Principal() principal: ForgePrincipal,
    @Param("attemptId") attemptId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.answerQuestion(principal, attemptId, body as { questionId?: string }),
      getRequestIds(req),
    );
  }

  @Post("attempts/:attemptId/bookmark")
  @RequireAnyPermission([...TRAINING_COMPLETE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async bookmark(
    @Principal() principal: ForgePrincipal,
    @Param("attemptId") attemptId: string,
    @Body() body: { questionId?: string },
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.toggleBookmark(principal, attemptId, body.questionId ?? ""),
      getRequestIds(req),
    );
  }

  @Get("attempts/:attemptId/results")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async results(
    @Principal() principal: ForgePrincipal,
    @Param("attemptId") attemptId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.getResults(principal, attemptId), getRequestIds(req));
  }

  @Post("attempts/:attemptId/retake")
  @RequireAnyPermission([...TRAINING_COMPLETE], {
    requiresEntitlement: ENTITLEMENT,
  })
  async retake(
    @Principal() principal: ForgePrincipal,
    @Param("attemptId") attemptId: string,
    @Body() body: { mode?: "wrong" | "bookmarked" | "same" | "new" },
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createRetake(principal, attemptId, body.mode ?? "same"),
      getRequestIds(req),
    );
  }

  @Get("progress")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async progress(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.training.listProgress(principal), getRequestIds(req));
  }

  @Get("materials")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listMaterials(
    @Principal() principal: ForgePrincipal,
    @Query() query: Record<string, string | undefined>,
    @Req() req: RequestWithIds,
  ) {
    const canManage =
      principal.permissions.has("industrial.training.manage") ||
      principal.permissions.has("industrial.admin");
    return this.listOk(
      await this.training.listMaterials(principal, query, { publishedOnly: !canManage }),
      req,
    );
  }

  @Post("materials/upload-url")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_material" })
  async createMaterialUploadUrl(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createMaterialUploadUrl(
        principal,
        body as {
          title?: string;
          description?: string;
          filename?: string;
          mimeType?: string;
          contentLength?: number;
          visibility?: string;
          sourceId?: string | null;
        },
      ),
      getRequestIds(req),
    );
  }

  @Post("materials/:materialId/complete")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_material" })
  async completeMaterialUpload(
    @Principal() principal: ForgePrincipal,
    @Param("materialId") materialId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.completeMaterialUpload(principal, materialId),
      getRequestIds(req),
    );
  }

  @Post("materials/:materialId/reoptimize-video")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_material" })
  async reoptimizeMaterialVideo(
    @Principal() principal: ForgePrincipal,
    @Param("materialId") materialId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.reoptimizeMaterialVideo(principal, materialId),
      getRequestIds(req),
    );
  }

  @Post("materials/:materialId/download-url")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createMaterialDownloadUrl(
    @Principal() principal: ForgePrincipal,
    @Param("materialId") materialId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createMaterialDownloadUrl(principal, materialId),
      getRequestIds(req),
    );
  }

  @Post("materials/:materialId/view-url")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createMaterialViewUrl(
    @Principal() principal: ForgePrincipal,
    @Param("materialId") materialId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createMaterialViewUrl(principal, materialId),
      getRequestIds(req),
    );
  }

  @Get("materials/:materialId/content")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async streamMaterialContent(
    @Principal() principal: ForgePrincipal,
    @Param("materialId") materialId: string,
    @Res() res: Response,
  ) {
    const file = await this.training.getMaterialContent(principal, materialId);
    const safeName = file.filename.replace(/"/g, "").replace(/[^\w.\-() ]+/g, "_").slice(0, 180) || "download";
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `${file.disposition}; filename="${safeName}"`,
    );
    if (file.contentLength) {
      res.setHeader("Content-Length", String(file.contentLength));
    }
    file.body.pipe(res);
  }

  @Post("materials/:materialId/archive")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_material" })
  async archiveMaterial(
    @Principal() principal: ForgePrincipal,
    @Param("materialId") materialId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.training.archiveMaterial(principal, materialId), getRequestIds(req));
  }

  @Patch("materials/:materialId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateMaterial(
    @Principal() principal: ForgePrincipal,
    @Param("materialId") materialId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.updateMaterial(principal, materialId, {
        ...(body.title !== undefined ? { title: String(body.title) } : {}),
        ...(body.description !== undefined
          ? { description: body.description as string | null }
          : {}),
        ...(body.category !== undefined ? { category: String(body.category) } : {}),
        ...(body.visibility !== undefined ? { visibility: String(body.visibility) } : {}),
        ...(body.sourceId !== undefined ? { sourceId: body.sourceId as string | null } : {}),
      }),
      getRequestIds(req),
    );
  }

  @Get("groups")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listGroups(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const data = await this.assignments.listGroups(principal);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("groups")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createGroup(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.assignments.createGroup(principal, body as {
        name?: string;
        description?: string;
        memberUserIds?: string[];
        memberPersonnelIds?: string[];
      }),
      getRequestIds(req),
    );
  }

  @Patch("groups/:groupId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateGroup(
    @Principal() principal: ForgePrincipal,
    @Param("groupId") groupId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.assignments.updateGroup(principal, groupId, body as {
        name?: string;
        description?: string | null;
        memberUserIds?: string[];
        memberPersonnelIds?: string[];
      }),
      getRequestIds(req),
    );
  }

  @Post("groups/:groupId/archive")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveGroup(
    @Principal() principal: ForgePrincipal,
    @Param("groupId") groupId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.assignments.archiveGroup(principal, groupId), getRequestIds(req));
  }

  @Get("assignments")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listAssignments(
    @Principal() principal: ForgePrincipal,
    @Query() query: ListQuery,
    @Req() req: RequestWithIds,
  ) {
    return this.listOk(await this.assignments.listAssignments(principal, query), req);
  }

  @Get("assignments/:assignmentId")
  @RequireAnyPermission([...TRAINING_VIEW], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getAssignment(
    @Principal() principal: ForgePrincipal,
    @Param("assignmentId") assignmentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.assignments.getAssignment(principal, assignmentId), getRequestIds(req));
  }

  @Post("assignments")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_assignment" })
  async createAssignment(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.assignments.createAssignment(principal, body as { title?: string }), getRequestIds(req));
  }

  @Patch("assignments/:assignmentId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateAssignment(
    @Principal() principal: ForgePrincipal,
    @Param("assignmentId") assignmentId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.assignments.updateAssignment(principal, assignmentId, body as {
        title?: string;
      }),
      getRequestIds(req),
    );
  }

  @Post("assignments/:assignmentId/archive")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async archiveAssignment(
    @Principal() principal: ForgePrincipal,
    @Param("assignmentId") assignmentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.assignments.archiveAssignment(principal, assignmentId), getRequestIds(req));
  }

  @Delete("assignments/:assignmentId/assignees/:assigneeId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async removeAssignmentAssignee(
    @Principal() principal: ForgePrincipal,
    @Param("assignmentId") assignmentId: string,
    @Param("assigneeId") assigneeId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.assignments.removeAssignmentAssignee(principal, assignmentId, assigneeId),
      getRequestIds(req),
    );
  }

  @Post("assignments/:assignmentId/qr")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async issueAssignmentQr(
    @Principal() principal: ForgePrincipal,
    @Param("assignmentId") assignmentId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.assignments.issueAssignmentQr(principal, assignmentId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("assignments/:assignmentId/qr/image")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async assignmentQrImage(
    @Principal() principal: ForgePrincipal,
    @Param("assignmentId") assignmentId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.assignments.assignmentQrImage(principal, assignmentId, body ?? {}),
      getRequestIds(req),
    );
  }

  @Post("assignments/:assignmentId/qr/revoke")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async revokeAssignmentQr(
    @Principal() principal: ForgePrincipal,
    @Param("assignmentId") assignmentId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.assignments.revokeAssignmentQr(principal, assignmentId), getRequestIds(req));
  }

  @Get("team-summary")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async teamSummary(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.assignments.getTeamSummary(principal), getRequestIds(req));
  }

  @Get("access-links")
  @RequireAnyPermission(["industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listAccessLinks(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const items = await this.lms.listAccessLinks(principal);
    return ok(items, getRequestIds(req), { page: 1, pageSize: items.length, total: items.length });
  }

  @Get("access-links/portal/qr")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getPortalQrDisplay(
    @Principal() principal: ForgePrincipal,
    @Query("appBaseUrl") appBaseUrlQuery: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const appBaseUrl = String(
      appBaseUrlQuery ?? process.env.FORGE_INDUSTRIAL_APP_URL ?? "",
    ).trim();
    if (!appBaseUrl) throw new Error("appBaseUrl is required");
    return ok(await this.lms.getPortalQrDisplay(principal, appBaseUrl), getRequestIds(req));
  }

  @Post("access-links")
  @RequireAnyPermission(["industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createAccessLink(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.lms.createAccessLink(principal, body as never), getRequestIds(req));
  }

  @Post("access-links/:linkId/qr")
  @RequireAnyPermission(["industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async issueAccessLinkQr(
    @Principal() principal: ForgePrincipal,
    @Param("linkId") linkId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const appBaseUrl = String(body.appBaseUrl ?? process.env.FORGE_INDUSTRIAL_APP_URL ?? "").trim();
    if (!appBaseUrl) throw new Error("appBaseUrl is required");
    return ok(await this.lms.issueAccessLinkQr(principal, linkId, appBaseUrl), getRequestIds(req));
  }

  @Post("access-links/:linkId/qr/revoke")
  @RequireAnyPermission(["industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async revokeAccessLinkQr(
    @Principal() principal: ForgePrincipal,
    @Param("linkId") linkId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.lms.revokeAccessLinkQr(principal, linkId), getRequestIds(req));
  }

  @Get("sources/:sourceId/versions")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listVersions(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Req() req: RequestWithIds,
  ) {
    const items = await this.lms.listVersions(principal, sourceId);
    return ok(items, getRequestIds(req), { page: 1, pageSize: items.length, total: items.length });
  }

  @Post("sources/:sourceId/versions")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createVersion(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.lms.createVersion(principal, sourceId, body as never), getRequestIds(req));
  }

  @Post("versions/:versionId/publish")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async publishVersion(
    @Principal() principal: ForgePrincipal,
    @Param("versionId") versionId: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.lms.publishVersion(principal, versionId), getRequestIds(req));
  }

  @Get("versions/:versionId/sections")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listSections(
    @Principal() principal: ForgePrincipal,
    @Param("versionId") versionId: string,
    @Req() req: RequestWithIds,
  ) {
    const items = await this.lms.listSections(principal, versionId);
    return ok(items, getRequestIds(req), { page: 1, pageSize: items.length, total: items.length });
  }

  @Post("versions/:versionId/sections")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async upsertSection(
    @Principal() principal: ForgePrincipal,
    @Param("versionId") versionId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.lms.upsertSection(principal, versionId, body as never), getRequestIds(req));
  }

  @Post("assignments/:assignmentId/bulk-assign")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async bulkAssign(
    @Principal() principal: ForgePrincipal,
    @Param("assignmentId") assignmentId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.lms.bulkAssignByOrg(principal, assignmentId, {
        ...(body.departmentId ? { departmentId: String(body.departmentId) } : {}),
        ...(body.siteId ? { siteId: String(body.siteId) } : {}),
        ...(body.positionId ? { positionId: String(body.positionId) } : {}),
        ...(body.jobTitle ? { jobTitle: String(body.jobTitle) } : {}),
        ...(body.companyWide === true ? { companyWide: true } : {}),
      }),
      getRequestIds(req),
    );
  }

  @Get("compliance-matrix")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async complianceMatrix(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    return ok(await this.lms.getComplianceMatrix(principal), getRequestIds(req));
  }

  @Get("portal-config")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async getPortalConfig(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const tenantId = principal.tenantId?.trim();
    if (!tenantId) throw new Error("tenant required");
    return ok(await this.lms.getPortalTenantConfig(tenantId), getRequestIds(req));
  }

  @Put("portal-config")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async putPortalConfig(
    @Principal() principal: ForgePrincipal,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.lms.upsertPortalTenantConfig(principal, {
        ...(typeof body.employeeNumberPrefix === "string"
          ? { employeeNumberPrefix: body.employeeNumberPrefix }
          : {}),
        ...(typeof body.portalEnabled === "boolean" ? { portalEnabled: body.portalEnabled } : {}),
        ...(body.employeeNumberHint === null || typeof body.employeeNumberHint === "string"
          ? { employeeNumberHint: body.employeeNumberHint as string | null }
          : {}),
      }),
      getRequestIds(req),
    );
  }

  @Get("sources/:sourceId/paper-quiz")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async paperQuizPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Query("variant") variantRaw: string | undefined,
    @Res() res: Response,
  ) {
    const variant = String(variantRaw ?? "trainee").toLowerCase() === "key" ? "key" : "trainee";
    const file = await this.training.getPaperQuizPrintable(principal, sourceId, variant);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename.replace(/"/g, "")}"`,
    );
    res.send(file.html);
  }

  @Post("sources/:sourceId/paper-results")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_paper_results" })
  async paperResultsForSource(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.assignments.applyPaperResultsForSource(principal, sourceId, body as {
        results?: Array<{ employeeNumber?: string; percent?: number }>;
      }),
      getRequestIds(req),
    );
  }

  @Post("assignments/:assignmentId/paper-results")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  @Idempotent({ resourceType: "industrial_training_paper_results" })
  async paperResultsForAssignment(
    @Principal() principal: ForgePrincipal,
    @Param("assignmentId") assignmentId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.assignments.applyPaperResults(principal, assignmentId, body as {
        results?: Array<{ employeeNumber?: string; percent?: number }>;
      }),
      getRequestIds(req),
    );
  }

  @Get("qc")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async qcDashboard(
    @Principal() principal: ForgePrincipal,
    @Query("sourceId") sourceId: string | undefined,
    @Query("days") daysRaw: string | undefined,
    @Req() req: RequestWithIds,
  ) {
    const daysParsed = daysRaw?.trim() ? Number(daysRaw) : undefined;
    const days =
      daysParsed != null && Number.isFinite(daysParsed) && daysParsed > 0
        ? Math.floor(daysParsed)
        : undefined;
    const options: { sourceId?: string; days?: number } = {};
    if (sourceId?.trim()) options.sourceId = sourceId.trim();
    if (days != null) options.days = days;
    return ok(await this.lms.getQcDashboard(principal, options), getRequestIds(req));
  }

  @Get("me")
  @RequireAnyPermission([...TRAINING_SELF], { requiresEntitlement: ENTITLEMENT })
  async myTraining(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.lms.getMyTraining(principal), getRequestIds(req));
  }

  @Get("me/history")
  @RequireAnyPermission([...TRAINING_SELF], { requiresEntitlement: ENTITLEMENT })
  async myTrainingHistory(
    @Principal() principal: ForgePrincipal,
    @Req() req: RequestWithIds,
  ) {
    return ok(await this.lms.getMyTrainingHistory(principal), getRequestIds(req));
  }

  @Get("me/report")
  @RequireAnyPermission([...TRAINING_SELF], { requiresEntitlement: ENTITLEMENT })
  async myTrainingReport(
    @Principal() principal: ForgePrincipal,
    @Res() res: Response,
  ) {
    const file = await this.lms.getMyTrainingReportPrintable(principal);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename.replace(/"/g, "")}"`,
    );
    res.send(file.html);
  }

  @Get("me/completions/:completionId/printable")
  @RequireAnyPermission([...TRAINING_SELF], { requiresEntitlement: ENTITLEMENT })
  async myCompletionPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("completionId") completionId: string,
    @Res() res: Response,
  ) {
    const file = await this.lms.getMyCompletionPrintable(principal, completionId);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename.replace(/"/g, "")}"`,
    );
    res.send(file.html);
  }

  @Get("me/records/:recordId/printable")
  @RequireAnyPermission([...TRAINING_SELF], { requiresEntitlement: ENTITLEMENT })
  async myTrainingRecordPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("recordId") recordId: string,
    @Res() res: Response,
  ) {
    const file = await this.lms.getMyTrainingRecordPrintable(principal, recordId);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename.replace(/"/g, "")}"`,
    );
    res.send(file.html);
  }

  @Get("personnel/:personnelId/history")
  @RequireAnyPermission(
    [...TRAINING_SELF, "industrial.personnel.view", "industrial.personnel.manage"],
    {
      requiresEntitlement: ENTITLEMENT,
    },
  )
  async personnelTrainingHistory(
    @Principal() principal: ForgePrincipal,
    @Param("personnelId") personnelId: string,
    @Req() req: RequestWithIds,
  ) {
    const tenantId = principal.tenantId?.trim();
    if (!tenantId) throw new Error("tenant required");
    await this.lms.assertCanAccessPersonnelTraining(principal, personnelId);
    return ok(await this.lms.listPersonnelTrainingHistory(tenantId, personnelId), getRequestIds(req));
  }

  @Get("personnel/:personnelId/report")
  @RequireAnyPermission([...TRAINING_SELF], {
    requiresEntitlement: ENTITLEMENT,
  })
  async personnelTrainingReport(
    @Principal() principal: ForgePrincipal,
    @Param("personnelId") personnelId: string,
    @Res() res: Response,
  ) {
    const tenantId = principal.tenantId?.trim();
    if (!tenantId) throw new Error("tenant required");
    await this.lms.assertCanAccessPersonnelTraining(principal, personnelId);
    const file = await this.lms.getPersonnelTrainingReportPrintable(tenantId, personnelId);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename.replace(/"/g, "")}"`,
    );
    res.send(file.html);
  }

  @Get("personnel/:personnelId/completions/:completionId/printable")
  @RequireAnyPermission([...TRAINING_SELF], {
    requiresEntitlement: ENTITLEMENT,
  })
  async personnelCompletionPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("personnelId") personnelId: string,
    @Param("completionId") completionId: string,
    @Res() res: Response,
  ) {
    const tenantId = principal.tenantId?.trim();
    if (!tenantId) throw new Error("tenant required");
    await this.lms.assertCanAccessPersonnelTraining(principal, personnelId);
    const file = await this.lms.getCompletionPrintable(tenantId, personnelId, completionId);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename.replace(/"/g, "")}"`,
    );
    res.send(file.html);
  }

  @Get("personnel/:personnelId/records/:recordId/printable")
  @RequireAnyPermission(
    [
      ...TRAINING_SELF,
      "industrial.personnel.view",
      "industrial.personnel.manage",
    ],
    { requiresEntitlement: ENTITLEMENT },
  )
  async personnelTrainingRecordPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("personnelId") personnelId: string,
    @Param("recordId") recordId: string,
    @Res() res: Response,
  ) {
    const tenantId = principal.tenantId?.trim();
    if (!tenantId) throw new Error("tenant required");
    await this.lms.assertCanAccessPersonnelTraining(principal, personnelId);
    const file = await this.lms.getTrainingRecordPrintable(tenantId, personnelId, recordId);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename.replace(/"/g, "")}"`,
    );
    res.send(file.html);
  }

  @Get("attempts/:attemptId/printable")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async attemptPrintable(
    @Principal() principal: ForgePrincipal,
    @Param("attemptId") attemptId: string,
    @Res() res: Response,
  ) {
    const tenantId = principal.tenantId?.trim();
    if (!tenantId) throw new Error("tenant required");
    const file = await this.lms.getAttemptPrintable(tenantId, attemptId, {
      userId: principal.userId,
      allowAnyInTenant: true,
    });
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${file.filename.replace(/"/g, "")}"`,
    );
    res.send(file.html);
  }
}

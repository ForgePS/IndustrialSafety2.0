import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ok } from "../../common/api-response.js";
import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";
import { Principal } from "../auth-context/principal.decorator.js";
import { RequireAnyPermission } from "../auth-context/require-permission.decorator.js";
import { IndustrialTrainingService } from "./industrial-training.service.js";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };
type ListQuery = Record<string, string | undefined>;

/**
 * FiredUp-style training LMS routes under /api/v1/industrial/training/*.
 * Nested under a dedicated controller so they win over the flat
 * `:module/:id` catch-alls in IndustrialFlatController.
 */
@Controller("api/v1/industrial/training")
export class IndustrialTrainingController {
  constructor(private readonly training: IndustrialTrainingService) {}

  private listOk(
    data: { items: unknown[]; page: number; pageSize: number },
    req: RequestWithIds,
  ) {
    return ok(data, getRequestIds(req), {
      page: data.page,
      pageSize: data.pageSize,
      total: data.items.length,
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
      await this.training.createRecord(principal, body as { title?: string }),
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
      await this.training.createSource(principal, body as { title?: string }),
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
      await this.training.updateSource(principal, sourceId, body as { title?: string }),
      getRequestIds(req),
    );
  }

  @Get("sources/:sourceId/chapters")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listChapters(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Req() req: RequestWithIds,
  ) {
    const data = await this.training.listChapters(principal, sourceId);
    return ok(data, getRequestIds(req), { page: 1, pageSize: data.length, total: data.length });
  }

  @Post("sources/:sourceId/chapters")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async createChapter(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.createChapter(principal, sourceId, body as { title?: string }),
      getRequestIds(req),
    );
  }

  @Post("sources/:sourceId/chapters/reorder")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async reorderChapters(
    @Principal() principal: ForgePrincipal,
    @Param("sourceId") sourceId: string,
    @Body() body: { orderedIds?: string[] },
    @Req() req: RequestWithIds,
  ) {
    const data = await this.training.reorderChapters(principal, sourceId, body.orderedIds ?? []);
    return ok(data, getRequestIds(req));
  }

  @Patch("chapters/:chapterId")
  @RequireAnyPermission(["industrial.training.manage", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async updateChapter(
    @Principal() principal: ForgePrincipal,
    @Param("chapterId") chapterId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.training.updateChapter(principal, chapterId, body as { title?: string }),
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

  @Post("quizzes")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
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
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
    requiresEntitlement: ENTITLEMENT,
  })
  async listInProgress(@Principal() principal: ForgePrincipal, @Req() req: RequestWithIds) {
    const data = await this.training.listInProgress(principal);
    return ok(data, getRequestIds(req));
  }

  @Get("attempts/:attemptId")
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
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
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
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
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
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
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
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
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
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
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
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
  @RequireAnyPermission(["industrial.training.view", "industrial.admin"], {
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
}

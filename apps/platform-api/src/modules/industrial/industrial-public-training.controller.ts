import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";

import { ok } from "../../common/api-response.js";

import { getRequestIds, type RequestWithIds } from "../../common/request-ids.js";

import { Public } from "../auth-context/public.decorator.js";

import { IndustrialPublicTrainingService } from "./industrial-public-training.service.js";

function publicTrainingCredentials(body: Record<string, unknown>) {
  const sessionToken = String(body.sessionToken ?? "").trim();

  const employeeNumber = String(body.employeeNumber ?? "").trim();

  return {
    ...(sessionToken ? { sessionToken } : {}),

    ...(employeeNumber ? { employeeNumber } : {}),
  };
}

@Controller("api/v1/public")
export class IndustrialPublicTrainingController {
  constructor(private readonly publicTraining: IndustrialPublicTrainingService) {}

  @Get("training/:token")
  @Public()
  async getAssignment(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.publicTraining.getAssignmentContextByToken(token), getRequestIds(req));
  }

  @Post("training/:token/verify")
  @Public()
  async verifyAssignee(
    @Param("token") token: string,

    @Body() body: Record<string, unknown>,

    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.verifyAssigneeByToken(token, String(body.employeeNumber ?? "")),

      getRequestIds(req),
    );
  }

  @Post("training/:token/session/resume")
  @Public()
  async resumeSession(
    @Param("token") token: string,

    @Body() body: Record<string, unknown>,

    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.resumeSessionByToken(token, String(body.sessionToken ?? "")),

      getRequestIds(req),
    );
  }

  @Post("training/:token/session/logout")
  @Public()
  async logoutSession(
    @Param("token") token: string,

    @Body() body: Record<string, unknown>,

    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.logoutSessionByToken(token, String(body.sessionToken ?? "")),

      getRequestIds(req),
    );
  }

  @Post("training/:token/quizzes")
  @Public()
  async startQuiz(
    @Param("token") token: string,

    @Body() body: Record<string, unknown>,

    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.startQuizByToken(token, {
        ...publicTrainingCredentials(body),
        ...(body.assignmentId ? { assignmentId: String(body.assignmentId) } : {}),
      }),

      getRequestIds(req),
    );
  }

  @Post("training/:token/attempts/:attemptId/next")
  @Public()
  async nextQuestion(
    @Param("token") token: string,

    @Param("attemptId") attemptId: string,

    @Body() body: Record<string, unknown>,

    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.nextQuestionByToken(
        token,

        publicTrainingCredentials(body),

        attemptId,
      ),

      getRequestIds(req),
    );
  }

  @Post("training/:token/attempts/:attemptId/answer")
  @Public()
  async answer(
    @Param("token") token: string,

    @Param("attemptId") attemptId: string,

    @Body() body: Record<string, unknown>,

    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.answerByToken(
        token,

        publicTrainingCredentials(body),

        attemptId,

        {
          ...(body.questionId != null ? { questionId: String(body.questionId) } : {}),

          ...(body.selectedIndex != null ? { selectedIndex: Number(body.selectedIndex) } : {}),
        },
      ),

      getRequestIds(req),
    );
  }

  @Post("training/:token/attempts/:attemptId/results")
  @Public()
  async results(
    @Param("token") token: string,

    @Param("attemptId") attemptId: string,

    @Body() body: Record<string, unknown>,

    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.resultsByToken(
        token,

        publicTrainingCredentials(body),

        attemptId,
      ),

      getRequestIds(req),
    );
  }

  @Get("training/access/:token")
  @Public()
  async getAccessLink(@Param("token") token: string, @Req() req: RequestWithIds) {
    return ok(await this.publicTraining.getAccessLinkContextByToken(token), getRequestIds(req));
  }

  @Post("training/access/:token/verify")
  @Public()
  async verifyAccessLink(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    const clientBucket = String(req.ip ?? req.headers["x-forwarded-for"] ?? "unknown");
    return ok(
      await this.publicTraining.verifyAccessLinkEmployee(
        token,
        String(body.employeeNumber ?? ""),
        clientBucket,
      ),
      getRequestIds(req),
    );
  }

  @Post("training/access/:token/session/resume")
  @Public()
  async resumeAccessSession(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.resumeAccessLinkSession(token, String(body.sessionToken ?? "")),
      getRequestIds(req),
    );
  }

  @Post("training/access/:token/session/logout")
  @Public()
  async logoutAccessSession(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.logoutAccessLinkSession(token, String(body.sessionToken ?? "")),
      getRequestIds(req),
    );
  }

  @Post("training/access/:token/acknowledge")
  @Public()
  async acknowledgeAccessCourse(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.acknowledgeCourseByAccess(token, String(body.sessionToken ?? ""), {
        assignmentId: String(body.assignmentId ?? ""),
        acknowledgementText: String(body.acknowledgementText ?? ""),
      }),
      getRequestIds(req),
    );
  }

  @Get("training/access/:token/assignments")
  @Public()
  async listAccessAssignments(
    @Param("token") token: string,
    @Query("sessionToken") sessionToken: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.listSessionAssignments(token, sessionToken),
      getRequestIds(req),
    );
  }

  @Get("training/access/:token/history")
  @Public()
  async accessTrainingHistory(
    @Param("token") token: string,
    @Query("sessionToken") sessionToken: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.getAccessTrainingHistory(token, sessionToken),
      getRequestIds(req),
    );
  }

  @Get("training/access/:token/course/:assignmentId")
  @Public()
  async getAccessCourse(
    @Param("token") token: string,
    @Param("assignmentId") assignmentId: string,
    @Query("sessionToken") sessionToken: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.getCoursePlayer(token, sessionToken, assignmentId),
      getRequestIds(req),
    );
  }

  @Post("training/access/:token/progress")
  @Public()
  async saveAccessProgress(
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.saveCourseProgress(
        token,
        String(body.sessionToken ?? ""),
        body as never,
      ),
      getRequestIds(req),
    );
  }

  @Get("training/:token/materials/:materialId/content")
  @Public()
  async streamPublicMaterial(
    @Param("token") token: string,
    @Param("materialId") materialId: string,
    @Query("sessionToken") sessionToken: string,
    @Res() res: Response,
  ) {
    const file = await this.publicTraining.getMaterialContentForLearner(
      token,
      sessionToken,
      materialId,
    );
    const safeName =
      file.filename
        .replace(/"/g, "")
        .replace(/[^\w.\-() ]+/g, "_")
        .slice(0, 180) || "download";
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `${file.disposition}; filename="${safeName}"`);
    if (file.contentLength) {
      res.setHeader("Content-Length", String(file.contentLength));
    }
    file.body.pipe(res);
  }

  @Get("training/access/:token/materials/:materialId/content")
  @Public()
  async streamAccessMaterial(
    @Param("token") token: string,
    @Param("materialId") materialId: string,
    @Query("sessionToken") sessionToken: string,
    @Res() res: Response,
  ) {
    return this.streamPublicMaterial(token, materialId, sessionToken, res);
  }

  @Get("training/:token/materials/:materialId/view-url")
  @Public()
  async getPublicMaterialViewUrl(
    @Param("token") token: string,
    @Param("materialId") materialId: string,
    @Query("sessionToken") sessionToken: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.getMaterialViewUrlForLearner(token, sessionToken, materialId),
      getRequestIds(req),
    );
  }

  @Get("training/access/:token/materials/:materialId/view-url")
  @Public()
  async getAccessMaterialViewUrl(
    @Param("token") token: string,
    @Param("materialId") materialId: string,
    @Query("sessionToken") sessionToken: string,
    @Req() req: RequestWithIds,
  ) {
    return ok(
      await this.publicTraining.getMaterialViewUrlForLearner(token, sessionToken, materialId),
      getRequestIds(req),
    );
  }

  @Get("training/materials/:materialId/office-view")
  @Public()
  async streamOfficeMaterialView(
    @Param("materialId") materialId: string,
    @Query("token") token: string,
    @Res() res: Response,
  ) {
    const file = await this.publicTraining.streamMaterialOfficeView(materialId, token);
    const safeName =
      file.filename
        .replace(/"/g, "")
        .replace(/[^\w.\-() ]+/g, "_")
        .slice(0, 180) || "download";
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    if (file.contentLength) {
      res.setHeader("Content-Length", String(file.contentLength));
    }
    file.body.pipe(res);
  }

  @Get("training/access/:token/report")
  @Public()
  async accessTrainingReport(
    @Param("token") token: string,
    @Query("sessionToken") sessionToken: string,
    @Res() res: Response,
  ) {
    const file = await this.publicTraining.getAccessTrainingReport(token, sessionToken);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${file.filename.replace(/"/g, "")}"`);
    res.send(file.html);
  }

  @Get("training/access/:token/completions/:completionId/printable")
  @Public()
  async accessCompletionPrintable(
    @Param("token") token: string,
    @Param("completionId") completionId: string,
    @Query("sessionToken") sessionToken: string,
    @Res() res: Response,
  ) {
    const file = await this.publicTraining.getAccessCompletionPrintable(
      token,
      sessionToken,
      completionId,
    );
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${file.filename.replace(/"/g, "")}"`);
    res.send(file.html);
  }

  @Get("training/access/:token/attempts/:attemptId/printable")
  @Public()
  async accessAttemptPrintable(
    @Param("token") token: string,
    @Param("attemptId") attemptId: string,
    @Query("sessionToken") sessionToken: string,
    @Res() res: Response,
  ) {
    const file = await this.publicTraining.getAccessAttemptPrintable(
      token,
      sessionToken,
      attemptId,
    );
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${file.filename.replace(/"/g, "")}"`);
    res.send(file.html);
  }
}

import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialTrainingAttempts,
  industrialTrainingChapters,
  industrialTrainingQuestions,
  industrialTrainingQuizzes,
  industrialTrainingRecords,
  industrialTrainingSources,
  industrialTrainingUserStats,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";

type ListQuery = Record<string, string | undefined>;

type AnswerRow = {
  questionId: string;
  selectedIndex: number;
  correct: boolean;
  answeredAt: string;
};

function pageParams(query: ListQuery) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function letterGrade(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

@Injectable()
export class IndustrialTrainingService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  // ─── Completion records (migrated) ───────────────────────────────────────

  async listRecords(principal: ForgePrincipal, query: ListQuery) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conds = [eq(industrialTrainingRecords.tenantId, tenantId), isNull(industrialTrainingRecords.archivedAt)];
      if (query.status) conds.push(eq(industrialTrainingRecords.status, query.status));
      if (query.q?.trim()) {
        const q = `%${query.q.trim().toLowerCase()}%`;
        conds.push(
          sql`(lower(coalesce(${industrialTrainingRecords.title}, '')) like ${q} or lower(coalesce(${industrialTrainingRecords.courseName}, '')) like ${q})`,
        );
      }
      const rows = await tx
        .select()
        .from(industrialTrainingRecords)
        .where(and(...conds))
        .orderBy(desc(industrialTrainingRecords.updatedAt))
        .limit(pageSize)
        .offset(offset);
      const items = rows.map((r) => ({
        id: r.id,
        title: r.title ?? r.courseName ?? "Training record",
        courseCode: (r.sourcePayload as Record<string, unknown>)?.courseCode ?? null,
        instructorName: (r.sourcePayload as Record<string, unknown>)?.instructorName ?? null,
        notes: (r.sourcePayload as Record<string, unknown>)?.notes ?? null,
        courseName: r.courseName,
        status: r.status,
        completedAt: r.completedAt,
        expiresAt: r.expiresAt,
        updatedAt: r.updatedAt,
      }));
      return { items, page, pageSize };
    });
  }

  async createRecord(
    principal: ForgePrincipal,
    body: { title?: string; courseCode?: string; instructorName?: string; notes?: string },
  ) {
    const tenantId = this.tenant(principal);
    const title = String(body.title ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialTrainingRecords)
        .values({
          id: createId(),
          tenantId,
          title,
          courseName: title,
          status: "ACTIVE",
          sourceSystem: "FORGE",
          sourcePayload: {
            courseCode: body.courseCode ?? null,
            instructorName: body.instructorName ?? null,
            notes: body.notes ?? null,
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  // ─── Sources / chapters / questions ──────────────────────────────────────

  async listSources(principal: ForgePrincipal, query: ListQuery, opts?: { publishedOnly?: boolean }) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    const publishedOnly = opts?.publishedOnly === true;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conds = [eq(industrialTrainingSources.tenantId, tenantId), isNull(industrialTrainingSources.archivedAt)];
      if (publishedOnly) conds.push(eq(industrialTrainingSources.status, "PUBLISHED"));
      else if (query.status) conds.push(eq(industrialTrainingSources.status, query.status));
      if (query.q?.trim()) {
        const q = `%${query.q.trim().toLowerCase()}%`;
        conds.push(sql`lower(${industrialTrainingSources.title}) like ${q}`);
      }
      const items = await tx
        .select()
        .from(industrialTrainingSources)
        .where(and(...conds))
        .orderBy(desc(industrialTrainingSources.updatedAt))
        .limit(pageSize)
        .offset(offset);
      return { items, page, pageSize };
    });
  }

  async getSource(principal: ForgePrincipal, sourceId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
          isNull(industrialTrainingSources.archivedAt),
        ),
      });
      if (!row) throw new ForgeError("NOT_FOUND", "Training source not found");
      return row;
    });
  }

  async createSource(
    principal: ForgePrincipal,
    body: { title?: string; edition?: string; description?: string },
  ) {
    const tenantId = this.tenant(principal);
    const title = String(body.title ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(industrialTrainingSources)
        .values({
          id: createId(),
          tenantId,
          title,
          edition: body.edition?.trim() || null,
          description: body.description?.trim() || null,
          status: "DRAFT",
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row;
    });
  }

  async updateSource(
    principal: ForgePrincipal,
    sourceId: string,
    body: {
      title?: string;
      edition?: string;
      description?: string;
      status?: string;
    },
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingSources.findFirst({
        where: and(
          eq(industrialTrainingSources.id, sourceId),
          eq(industrialTrainingSources.tenantId, tenantId),
          isNull(industrialTrainingSources.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Training source not found");
      const status = body.status?.trim().toUpperCase();
      if (status && status !== "DRAFT" && status !== "PUBLISHED") {
        throw new ForgeError("VALIDATION_FAILED", "status must be DRAFT or PUBLISHED");
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingSources)
        .set({
          title: body.title?.trim() || existing.title,
          edition: body.edition !== undefined ? body.edition?.trim() || null : existing.edition,
          description:
            body.description !== undefined ? body.description?.trim() || null : existing.description,
          status: status || existing.status,
          publishedAt: status === "PUBLISHED" ? now : status === "DRAFT" ? null : existing.publishedAt,
          updatedAt: now,
        })
        .where(eq(industrialTrainingSources.id, sourceId))
        .returning();
      return row;
    });
  }

  async listChapters(principal: ForgePrincipal, sourceId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      return tx
        .select()
        .from(industrialTrainingChapters)
        .where(
          and(
            eq(industrialTrainingChapters.tenantId, tenantId),
            eq(industrialTrainingChapters.sourceId, sourceId),
            isNull(industrialTrainingChapters.archivedAt),
          ),
        )
        .orderBy(asc(industrialTrainingChapters.sortOrder), asc(industrialTrainingChapters.createdAt));
    });
  }

  async createChapter(
    principal: ForgePrincipal,
    sourceId: string,
    body: { title?: string; pageRange?: string; sortOrder?: number },
  ) {
    const tenantId = this.tenant(principal);
    const title = String(body.title ?? "").trim();
    if (!title) throw new ForgeError("VALIDATION_FAILED", "title is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      const now = new Date();
      const [row] = await tx
        .insert(industrialTrainingChapters)
        .values({
          id: createId(),
          tenantId,
          sourceId,
          title,
          pageRange: body.pageRange?.trim() || null,
          sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await this.refreshSourceCounts(tx, tenantId, sourceId);
      return row;
    });
  }

  async updateChapter(
    principal: ForgePrincipal,
    chapterId: string,
    body: { title?: string; pageRange?: string; sortOrder?: number; status?: string },
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingChapters.findFirst({
        where: and(
          eq(industrialTrainingChapters.id, chapterId),
          eq(industrialTrainingChapters.tenantId, tenantId),
          isNull(industrialTrainingChapters.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Chapter not found");
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingChapters)
        .set({
          title: body.title?.trim() || existing.title,
          pageRange: body.pageRange !== undefined ? body.pageRange?.trim() || null : existing.pageRange,
          sortOrder:
            body.sortOrder !== undefined && Number.isFinite(body.sortOrder)
              ? Number(body.sortOrder)
              : existing.sortOrder,
          status: body.status?.trim() || existing.status,
          updatedAt: now,
          archivedAt: body.status === "ARCHIVED" ? now : existing.archivedAt,
        })
        .where(eq(industrialTrainingChapters.id, chapterId))
        .returning();
      await this.refreshSourceCounts(tx, tenantId, existing.sourceId);
      return row;
    });
  }

  async reorderChapters(principal: ForgePrincipal, sourceId: string, orderedIds: string[]) {
    const tenantId = this.tenant(principal);
    if (!Array.isArray(orderedIds) || !orderedIds.length) {
      throw new ForgeError("VALIDATION_FAILED", "orderedIds required");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      const now = new Date();
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(industrialTrainingChapters)
          .set({ sortOrder: i, updatedAt: now })
          .where(
            and(
              eq(industrialTrainingChapters.id, orderedIds[i]!),
              eq(industrialTrainingChapters.tenantId, tenantId),
              eq(industrialTrainingChapters.sourceId, sourceId),
            ),
          );
      }
      return tx
        .select()
        .from(industrialTrainingChapters)
        .where(
          and(
            eq(industrialTrainingChapters.tenantId, tenantId),
            eq(industrialTrainingChapters.sourceId, sourceId),
            isNull(industrialTrainingChapters.archivedAt),
          ),
        )
        .orderBy(asc(industrialTrainingChapters.sortOrder), asc(industrialTrainingChapters.createdAt));
    });
  }

  async listQuestions(principal: ForgePrincipal, sourceId: string, query: ListQuery) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      const conds = [
        eq(industrialTrainingQuestions.tenantId, tenantId),
        eq(industrialTrainingQuestions.sourceId, sourceId),
        isNull(industrialTrainingQuestions.archivedAt),
      ];
      if (query.chapterId) conds.push(eq(industrialTrainingQuestions.chapterId, query.chapterId));
      if (query.status) conds.push(eq(industrialTrainingQuestions.status, query.status));
      return tx
        .select()
        .from(industrialTrainingQuestions)
        .where(and(...conds))
        .orderBy(desc(industrialTrainingQuestions.updatedAt));
    });
  }

  async createQuestion(
    principal: ForgePrincipal,
    sourceId: string,
    body: {
      chapterId?: string;
      stem?: string;
      choices?: string[];
      correctIndex?: number;
      explanation?: string;
      pageRef?: string;
      difficulty?: string;
      status?: string;
    },
  ) {
    const tenantId = this.tenant(principal);
    const stem = String(body.stem ?? "").trim();
    const chapterId = String(body.chapterId ?? "").trim();
    const choices = Array.isArray(body.choices) ? body.choices.map((c) => String(c).trim()).filter(Boolean) : [];
    if (!stem) throw new ForgeError("VALIDATION_FAILED", "stem is required");
    if (!chapterId) throw new ForgeError("VALIDATION_FAILED", "chapterId is required");
    if (choices.length < 2) throw new ForgeError("VALIDATION_FAILED", "at least 2 choices required");
    const correctIndex = Number(body.correctIndex ?? 0);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
      throw new ForgeError("VALIDATION_FAILED", "correctIndex out of range");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireSource(tx, tenantId, sourceId);
      const chapter = await tx.query.industrialTrainingChapters.findFirst({
        where: and(
          eq(industrialTrainingChapters.id, chapterId),
          eq(industrialTrainingChapters.sourceId, sourceId),
          eq(industrialTrainingChapters.tenantId, tenantId),
        ),
      });
      if (!chapter) throw new ForgeError("NOT_FOUND", "Chapter not found");
      const now = new Date();
      const [row] = await tx
        .insert(industrialTrainingQuestions)
        .values({
          id: createId(),
          tenantId,
          sourceId,
          chapterId,
          stem,
          choices,
          correctIndex,
          explanation: body.explanation?.trim() || null,
          pageRef: body.pageRef?.trim() || null,
          difficulty: body.difficulty?.trim() || "MEDIUM",
          status: body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await this.refreshSourceCounts(tx, tenantId, sourceId);
      return row;
    });
  }

  async updateQuestion(
    principal: ForgePrincipal,
    questionId: string,
    body: {
      stem?: string;
      choices?: string[];
      correctIndex?: number;
      explanation?: string;
      pageRef?: string;
      difficulty?: string;
      status?: string;
      chapterId?: string;
    },
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.industrialTrainingQuestions.findFirst({
        where: and(
          eq(industrialTrainingQuestions.id, questionId),
          eq(industrialTrainingQuestions.tenantId, tenantId),
          isNull(industrialTrainingQuestions.archivedAt),
        ),
      });
      if (!existing) throw new ForgeError("NOT_FOUND", "Question not found");
      const choices = Array.isArray(body.choices)
        ? body.choices.map((c) => String(c).trim()).filter(Boolean)
        : (existing.choices as string[]);
      const correctIndex =
        body.correctIndex !== undefined ? Number(body.correctIndex) : existing.correctIndex;
      if (choices.length < 2) throw new ForgeError("VALIDATION_FAILED", "at least 2 choices required");
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
        throw new ForgeError("VALIDATION_FAILED", "correctIndex out of range");
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingQuestions)
        .set({
          stem: body.stem?.trim() || existing.stem,
          choices,
          correctIndex,
          explanation:
            body.explanation !== undefined ? body.explanation?.trim() || null : existing.explanation,
          pageRef: body.pageRef !== undefined ? body.pageRef?.trim() || null : existing.pageRef,
          difficulty: body.difficulty?.trim() || existing.difficulty,
          status: body.status?.trim() || existing.status,
          chapterId: body.chapterId?.trim() || existing.chapterId,
          updatedAt: now,
          archivedAt: body.status === "ARCHIVED" ? now : existing.archivedAt,
        })
        .where(eq(industrialTrainingQuestions.id, questionId))
        .returning();
      await this.refreshSourceCounts(tx, tenantId, existing.sourceId);
      return row;
    });
  }

  // ─── Quizzes / attempts ──────────────────────────────────────────────────

  async createQuiz(
    principal: ForgePrincipal,
    body: {
      sourceId?: string;
      chapterIds?: string[];
      mode?: string;
      optionCount?: number;
      feedbackEnabled?: boolean;
      timerSeconds?: number | null;
    },
  ) {
    const tenantId = this.tenant(principal);
    const sourceId = String(body.sourceId ?? "").trim();
    const chapterIds = Array.isArray(body.chapterIds)
      ? body.chapterIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (!sourceId) throw new ForgeError("VALIDATION_FAILED", "sourceId is required");
    if (!chapterIds.length) throw new ForgeError("VALIDATION_FAILED", "chapterIds required");
    const mode = (body.mode ?? "STANDARD").toUpperCase() === "ADAPTIVE" ? "ADAPTIVE" : "STANDARD";
    const optionCount = Math.min(4, Math.max(2, Number(body.optionCount ?? 4) || 4));
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const source = await this.requireSource(tx, tenantId, sourceId);
      if (source.status !== "PUBLISHED") {
        throw new ForgeError("VALIDATION_FAILED", "Source must be published to start a quiz");
      }
      const questions = await tx
        .select()
        .from(industrialTrainingQuestions)
        .where(
          and(
            eq(industrialTrainingQuestions.tenantId, tenantId),
            eq(industrialTrainingQuestions.sourceId, sourceId),
            inArray(industrialTrainingQuestions.chapterId, chapterIds),
            eq(industrialTrainingQuestions.status, "PUBLISHED"),
            isNull(industrialTrainingQuestions.archivedAt),
          ),
        );
      if (!questions.length) {
        throw new ForgeError("VALIDATION_FAILED", "No published questions in selected chapters");
      }
      const now = new Date();
      const [quiz] = await tx
        .insert(industrialTrainingQuizzes)
        .values({
          id: createId(),
          tenantId,
          sourceId,
          createdByUserId: principal.userId,
          mode,
          optionCount,
          feedbackEnabled: body.feedbackEnabled !== false,
          timerSeconds: body.timerSeconds == null ? null : Number(body.timerSeconds),
          chapterIds,
          settings: {},
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const shuffled = [...questions].sort(() => Math.random() - 0.5);
      const questionIds = shuffled.map((q) => q.id);
      const [attempt] = await tx
        .insert(industrialTrainingAttempts)
        .values({
          id: createId(),
          tenantId,
          quizId: quiz!.id,
          userId: principal.userId,
          sourceId,
          status: "IN_PROGRESS",
          questionIds,
          answers: [],
          bookmarks: [],
          currentIndex: 0,
          scoreCorrect: 0,
          scoreTotal: mode === "STANDARD" ? questionIds.length : 0,
          masteryState: { remaining: questionIds, mastered: [] },
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return { quiz, attempt, questionCount: questionIds.length };
    });
  }

  async getAttempt(principal: ForgePrincipal, attemptId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, attempt.quizId),
      });
      return { attempt, quiz };
    });
  }

  async resumeAttempt(principal: ForgePrincipal, attemptId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      if (attempt.status !== "IN_PROGRESS") {
        throw new ForgeError("VALIDATION_FAILED", "Attempt is not in progress");
      }
      const now = new Date();
      const [row] = await tx
        .update(industrialTrainingAttempts)
        .set({ resumedAt: now, updatedAt: now })
        .where(eq(industrialTrainingAttempts.id, attemptId))
        .returning();
      return row;
    });
  }

  async nextQuestion(principal: ForgePrincipal, attemptId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      if (attempt.status !== "IN_PROGRESS") {
        return { done: true, attempt };
      }
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, attempt.quizId),
      });
      if (!quiz) throw new ForgeError("NOT_FOUND", "Quiz not found");

      const questionIds = attempt.questionIds as string[];
      const answers = attempt.answers as AnswerRow[];
      const answered = new Set(answers.map((a) => a.questionId));
      const mastery = (attempt.masteryState ?? {}) as { remaining?: string[]; mastered?: string[] };

      let nextId: string | undefined;
      if (quiz.mode === "ADAPTIVE") {
        const mastered = new Set(mastery.mastered ?? []);
        const pool = (mastery.remaining?.length ? mastery.remaining : questionIds).filter(
          (id) => !mastered.has(id),
        );
        // Prefer never-answered, then previously incorrect
        const unanswered = pool.filter((id) => !answered.has(id));
        const incorrect = answers.filter((a) => !a.correct && !mastered.has(a.questionId)).map((a) => a.questionId);
        nextId = unanswered[0] ?? incorrect[0] ?? pool[0];
        if (!nextId) {
          return { done: true, attempt };
        }
      } else {
        if (attempt.currentIndex >= questionIds.length) {
          return { done: true, attempt };
        }
        nextId = questionIds[attempt.currentIndex];
      }

      const q = await tx.query.industrialTrainingQuestions.findFirst({
        where: eq(industrialTrainingQuestions.id, nextId!),
      });
      if (!q) throw new ForgeError("NOT_FOUND", "Question not found");

      const choices = (q.choices as string[]).slice(0, quiz.optionCount);
      return {
        done: false,
        index: attempt.currentIndex,
        total: questionIds.length,
        feedbackEnabled: quiz.feedbackEnabled,
        mode: quiz.mode,
        question: {
          id: q.id,
          stem: q.stem,
          choices,
          chapterId: q.chapterId,
          pageRef: quiz.feedbackEnabled ? q.pageRef : undefined,
        },
      };
    });
  }

  async answerQuestion(
    principal: ForgePrincipal,
    attemptId: string,
    body: { questionId?: string; selectedIndex?: number },
  ) {
    const tenantId = this.tenant(principal);
    const questionId = String(body.questionId ?? "").trim();
    const selectedIndex = Number(body.selectedIndex);
    if (!questionId) throw new ForgeError("VALIDATION_FAILED", "questionId required");
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      throw new ForgeError("VALIDATION_FAILED", "selectedIndex required");
    }
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      if (attempt.status !== "IN_PROGRESS") {
        throw new ForgeError("VALIDATION_FAILED", "Attempt is not in progress");
      }
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, attempt.quizId),
      });
      if (!quiz) throw new ForgeError("NOT_FOUND", "Quiz not found");
      const q = await tx.query.industrialTrainingQuestions.findFirst({
        where: and(
          eq(industrialTrainingQuestions.id, questionId),
          eq(industrialTrainingQuestions.tenantId, tenantId),
        ),
      });
      if (!q) throw new ForgeError("NOT_FOUND", "Question not found");

      const correct = selectedIndex === q.correctIndex;
      const answers = [...(attempt.answers as AnswerRow[])];
      const existingIdx = answers.findIndex((a) => a.questionId === questionId);
      const row: AnswerRow = {
        questionId,
        selectedIndex,
        correct,
        answeredAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) answers[existingIdx] = row;
      else answers.push(row);

      const mastery = {
        remaining: [...((attempt.masteryState as { remaining?: string[] })?.remaining ?? (attempt.questionIds as string[]))],
        mastered: [...((attempt.masteryState as { mastered?: string[] })?.mastered ?? [])],
      };
      if (correct && !mastery.mastered.includes(questionId)) {
        mastery.mastered.push(questionId);
        mastery.remaining = mastery.remaining.filter((id) => id !== questionId);
      }

      const scoreCorrect = answers.filter((a) => a.correct).length;
      let nextIndex = attempt.currentIndex;
      if (quiz.mode === "STANDARD") nextIndex = attempt.currentIndex + 1;

      const adaptiveDone =
        quiz.mode === "ADAPTIVE" && mastery.mastered.length >= (attempt.questionIds as string[]).length;
      const standardDone = quiz.mode === "STANDARD" && nextIndex >= (attempt.questionIds as string[]).length;
      const done = adaptiveDone || standardDone;

      const now = new Date();
      const [updated] = await tx
        .update(industrialTrainingAttempts)
        .set({
          answers,
          masteryState: mastery,
          currentIndex: nextIndex,
          scoreCorrect,
          scoreTotal:
            quiz.mode === "ADAPTIVE" ? (attempt.questionIds as string[]).length : attempt.scoreTotal,
          status: done ? "COMPLETED" : "IN_PROGRESS",
          completedAt: done ? now : null,
          updatedAt: now,
        })
        .where(eq(industrialTrainingAttempts.id, attemptId))
        .returning();

      if (done) {
        await this.updateStats(tx, tenantId, principal.userId, attempt.sourceId, updated!);
      }

      return {
        correct,
        done,
        explanation: quiz.feedbackEnabled ? q.explanation : undefined,
        pageRef: quiz.feedbackEnabled ? q.pageRef : undefined,
        correctIndex: quiz.feedbackEnabled ? q.correctIndex : undefined,
        attempt: updated,
      };
    });
  }

  async toggleBookmark(principal: ForgePrincipal, attemptId: string, questionId: string) {
    const tenantId = this.tenant(principal);
    const qid = String(questionId ?? "").trim();
    if (!qid) throw new ForgeError("VALIDATION_FAILED", "questionId required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      const bookmarks = new Set(attempt.bookmarks as string[]);
      if (bookmarks.has(qid)) bookmarks.delete(qid);
      else bookmarks.add(qid);
      const [row] = await tx
        .update(industrialTrainingAttempts)
        .set({ bookmarks: [...bookmarks], updatedAt: new Date() })
        .where(eq(industrialTrainingAttempts.id, attemptId))
        .returning();
      return row;
    });
  }

  async getResults(principal: ForgePrincipal, attemptId: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const attempt = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      const answers = attempt.answers as AnswerRow[];
      const questionIds = attempt.questionIds as string[];
      const questions = questionIds.length
        ? await tx
            .select()
            .from(industrialTrainingQuestions)
            .where(inArray(industrialTrainingQuestions.id, questionIds))
        : [];
      const byId = new Map(questions.map((q) => [q.id, q]));
      const byChapter = new Map<string, { chapterId: string; correct: number; total: number }>();
      for (const a of answers) {
        const q = byId.get(a.questionId);
        const chapterId = q?.chapterId ?? "unknown";
        const cur = byChapter.get(chapterId) ?? { chapterId, correct: 0, total: 0 };
        cur.total += 1;
        if (a.correct) cur.correct += 1;
        byChapter.set(chapterId, cur);
      }
      const total = Math.max(attempt.scoreTotal, answers.length, 1);
      const pct = Math.round((attempt.scoreCorrect / total) * 100);
      return {
        attempt,
        scoreCorrect: attempt.scoreCorrect,
        scoreTotal: total,
        percent: pct,
        letterGrade: letterGrade(pct),
        chapterBreakdown: [...byChapter.values()],
        wrongQuestionIds: answers.filter((a) => !a.correct).map((a) => a.questionId),
        bookmarkedQuestionIds: attempt.bookmarks as string[],
      };
    });
  }

  async createRetake(
    principal: ForgePrincipal,
    attemptId: string,
    mode: "wrong" | "bookmarked" | "same" | "new",
  ) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const prior = await this.requireAttempt(tx, tenantId, attemptId, principal.userId);
      const quiz = await tx.query.industrialTrainingQuizzes.findFirst({
        where: eq(industrialTrainingQuizzes.id, prior.quizId),
      });
      if (!quiz) throw new ForgeError("NOT_FOUND", "Quiz not found");
      const answers = prior.answers as AnswerRow[];
      let questionIds = prior.questionIds as string[];
      if (mode === "wrong") {
        questionIds = answers.filter((a) => !a.correct).map((a) => a.questionId);
      } else if (mode === "bookmarked") {
        questionIds = [...(prior.bookmarks as string[])];
      } else if (mode === "new") {
        questionIds = [...questionIds].sort(() => Math.random() - 0.5);
      }
      if (!questionIds.length) {
        throw new ForgeError("VALIDATION_FAILED", "No questions available for retake mode");
      }
      const now = new Date();
      const [attempt] = await tx
        .insert(industrialTrainingAttempts)
        .values({
          id: createId(),
          tenantId,
          quizId: quiz.id,
          userId: principal.userId,
          sourceId: prior.sourceId,
          status: "IN_PROGRESS",
          questionIds,
          answers: [],
          bookmarks: [],
          currentIndex: 0,
          scoreCorrect: 0,
          scoreTotal: questionIds.length,
          masteryState: { remaining: questionIds, mastered: [] },
          startedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return { quiz, attempt };
    });
  }

  async listProgress(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const stats = await tx
        .select()
        .from(industrialTrainingUserStats)
        .where(
          and(
            eq(industrialTrainingUserStats.tenantId, tenantId),
            eq(industrialTrainingUserStats.userId, principal.userId),
          ),
        )
        .orderBy(desc(industrialTrainingUserStats.updatedAt));
      const attempts = await tx
        .select()
        .from(industrialTrainingAttempts)
        .where(
          and(
            eq(industrialTrainingAttempts.tenantId, tenantId),
            eq(industrialTrainingAttempts.userId, principal.userId),
          ),
        )
        .orderBy(desc(industrialTrainingAttempts.updatedAt))
        .limit(20);
      return { stats, recentAttempts: attempts };
    });
  }

  async listInProgress(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(industrialTrainingAttempts)
        .where(
          and(
            eq(industrialTrainingAttempts.tenantId, tenantId),
            eq(industrialTrainingAttempts.userId, principal.userId),
            eq(industrialTrainingAttempts.status, "IN_PROGRESS"),
          ),
        )
        .orderBy(desc(industrialTrainingAttempts.updatedAt));
    });
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requireSource(tx: any, tenantId: string, sourceId: string) {
    const row = await tx.query.industrialTrainingSources.findFirst({
      where: and(
        eq(industrialTrainingSources.id, sourceId),
        eq(industrialTrainingSources.tenantId, tenantId),
        isNull(industrialTrainingSources.archivedAt),
      ),
    });
    if (!row) throw new ForgeError("NOT_FOUND", "Training source not found");
    return row;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requireAttempt(tx: any, tenantId: string, attemptId: string, userId: string) {
    const row = await tx.query.industrialTrainingAttempts.findFirst({
      where: and(
        eq(industrialTrainingAttempts.id, attemptId),
        eq(industrialTrainingAttempts.tenantId, tenantId),
        eq(industrialTrainingAttempts.userId, userId),
      ),
    });
    if (!row) throw new ForgeError("NOT_FOUND", "Attempt not found");
    return row;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async refreshSourceCounts(tx: any, tenantId: string, sourceId: string) {
    const chapters = await tx
      .select({ id: industrialTrainingChapters.id })
      .from(industrialTrainingChapters)
      .where(
        and(
          eq(industrialTrainingChapters.tenantId, tenantId),
          eq(industrialTrainingChapters.sourceId, sourceId),
          isNull(industrialTrainingChapters.archivedAt),
        ),
      );
    const questions = await tx
      .select({ id: industrialTrainingQuestions.id })
      .from(industrialTrainingQuestions)
      .where(
        and(
          eq(industrialTrainingQuestions.tenantId, tenantId),
          eq(industrialTrainingQuestions.sourceId, sourceId),
          isNull(industrialTrainingQuestions.archivedAt),
        ),
      );
    await tx
      .update(industrialTrainingSources)
      .set({
        chapterCount: chapters.length,
        questionCount: questions.length,
        updatedAt: new Date(),
      })
      .where(eq(industrialTrainingSources.id, sourceId));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async updateStats(
    tx: any,
    tenantId: string,
    userId: string,
    sourceId: string,
    attempt: typeof industrialTrainingAttempts.$inferSelect,
  ) {
    const total = Math.max(attempt.scoreTotal, 1);
    const pct = (attempt.scoreCorrect / total) * 100;
    const existing = await tx.query.industrialTrainingUserStats.findFirst({
      where: and(
        eq(industrialTrainingUserStats.tenantId, tenantId),
        eq(industrialTrainingUserStats.userId, userId),
        eq(industrialTrainingUserStats.sourceId, sourceId),
        isNull(industrialTrainingUserStats.chapterId),
      ),
    });
    const now = new Date();
    const answers = attempt.answers as AnswerRow[];
    if (!existing) {
      await tx.insert(industrialTrainingUserStats).values({
        id: createId(),
        tenantId,
        userId,
        sourceId,
        chapterId: null,
        seenCount: answers.length,
        correctCount: attempt.scoreCorrect,
        masteredCount: ((attempt.masteryState as { mastered?: string[] })?.mastered ?? []).length,
        attemptCount: 1,
        avgScore: pct.toFixed(2),
        lastAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }
    const attemptCount = existing.attemptCount + 1;
    const prevAvg = Number(existing.avgScore ?? 0);
    const avgScore = (((prevAvg * existing.attemptCount) + pct) / attemptCount).toFixed(2);
    await tx
      .update(industrialTrainingUserStats)
      .set({
        seenCount: existing.seenCount + answers.length,
        correctCount: existing.correctCount + attempt.scoreCorrect,
        masteredCount: Math.max(
          existing.masteredCount,
          ((attempt.masteryState as { mastered?: string[] })?.mastered ?? []).length,
        ),
        attemptCount,
        avgScore,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(industrialTrainingUserStats.id, existing.id));
  }
}

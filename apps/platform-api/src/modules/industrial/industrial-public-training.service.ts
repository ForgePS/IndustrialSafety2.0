import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialPersonnel,
  industrialTrainingAccessLinks,
  industrialTrainingAssignmentAssignees,
  industrialTrainingAssignments,
  industrialTrainingCourseSections,
  industrialTrainingCourseVersions,
  industrialTrainingMaterials,
  industrialTrainingPortalSessions,
  industrialTrainingSources,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { findPersonnelByEmployeeNumber } from "./employee-number.js";
import { verifyOfficeViewToken } from "./office-view-token.js";
import { IndustrialTrainingAssignmentsService } from "./industrial-training-assignments.service.js";
import { IndustrialTrainingLmsService } from "./industrial-training-lms.service.js";
import { IndustrialTrainingService } from "./industrial-training.service.js";
import { isActivePersonnelStatus } from "./personnel-status.js";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const PORTAL_SESSION_TTL_MS = 60 * 60 * 1000;

export type PublicTrainingLearnerContext = {
  tenantId: string;
  assignmentId: string | null;
  employeeNumber: string;
  personnelId: string | null;
  sessionId: string | null;
  accessLinkId?: string | null;
};

type PublicTrainingCredentials = {
  employeeNumber?: string;
  sessionToken?: string;
};

function mapCourseSectionForPortal(section: {
  id: string;
  title: string;
  sortOrder: number;
  required: boolean;
  contentJson: unknown;
}) {
  let contentBody: string | null = null;
  if (Array.isArray(section.contentJson)) {
    const parts = section.contentJson
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object") {
          const row = block as Record<string, unknown>;
          if (typeof row.text === "string") return row.text;
          if (typeof row.body === "string") return row.body;
          if (typeof row.content === "string") return row.content;
        }
        return null;
      })
      .filter((value): value is string => Boolean(value));
    contentBody = parts.length ? parts.join("\n\n") : null;
  }
  return {
    id: section.id,
    title: section.title,
    contentType: "text",
    contentBody,
    sortOrder: section.sortOrder,
    required: section.required,
  };
}

@Injectable()
export class IndustrialPublicTrainingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly assignments: IndustrialTrainingAssignmentsService,
    private readonly training: IndustrialTrainingService,
    private readonly lms: IndustrialTrainingLmsService,
  ) {}

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private issueSessionToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private async resolveTrainingTenantId(tokenHash: string): Promise<string | null> {
    const rows = [
      ...(await this.db.execute(
        sql`select forge_industrial_training_tenant_for_token(${tokenHash}) as tenant_id`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id;
    return tenantId ? String(tenantId) : null;
  }

  private async resolvePortalSessionTenantId(sessionHash: string): Promise<string | null> {
    const rows = [
      ...(await this.db.execute(
        sql`select forge_industrial_training_tenant_for_portal_session(${sessionHash}) as tenant_id`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id;
    return tenantId ? String(tenantId) : null;
  }

  private async resolveAssignmentByToken(token: string) {
    const raw = String(token ?? "").trim();
    if (raw.length < 16) throw new ForgeError("NOT_FOUND", "Training link not found");
    const tokenHash = this.hashToken(raw);
    const tenantId = await this.resolveTrainingTenantId(tokenHash);
    if (!tenantId) throw new ForgeError("NOT_FOUND", "Training link not found");
    return { raw, tokenHash, tenantId };
  }

  private async resolveTenantBrandingSummary(
    tx: DatabaseTransaction,
    tenantId: string,
  ): Promise<{
    tenantKey: string | null;
    companyName: string | null;
    logoUrl: string | null;
  }> {
    const tenantRows = await tx.execute(sql`
      select tenant_key::text as tenant_key,
        display_name::text as display_name,
        legal_name::text as legal_name
      from tenants
      where id = ${tenantId}::uuid
      limit 1
    `);
    const tenantRow = (
      Array.isArray(tenantRows)
        ? tenantRows[0]
        : (tenantRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
    ) as Record<string, unknown> | undefined;

    const brandingRows = await tx.execute(sql`
      select cv.payload_json as payload
      from config_objects co
      join config_versions cv on cv.id = co.current_published_version_id
      where co.tenant_id = ${tenantId}::uuid
        and co.namespace = 'branding'
        and co.object_key = 'default'
      limit 1
    `);
    const brandingPayloadRaw = (
      Array.isArray(brandingRows)
        ? brandingRows[0]
        : (brandingRows as { rows?: Array<{ payload?: unknown }> }).rows?.[0]
    ) as { payload?: unknown } | undefined;
    const payload =
      brandingPayloadRaw?.payload && typeof brandingPayloadRaw.payload === "object"
        ? (brandingPayloadRaw.payload as Record<string, unknown>)
        : {};

    const tenantKey = String(tenantRow?.tenant_key ?? "").trim() || null;
    const companyName =
      String(
        payload.productDisplayName ?? tenantRow?.display_name ?? tenantRow?.legal_name ?? "",
      ).trim() || null;
    const logoUrl = String(payload.logoUrl ?? payload.logo_url ?? "").trim() || null;
    return { tenantKey, companyName, logoUrl };
  }

  private async buildAssigneeSummary(
    tx: DatabaseTransaction,
    tenantId: string,
    assignment: typeof industrialTrainingAssignments.$inferSelect,
    assignee: NonNullable<
      Awaited<ReturnType<IndustrialTrainingAssignmentsService["findAssigneeByEmployeeNumber"]>>
    >,
    employeeNumber: string,
  ) {
    const personRows = await tx.execute(sql`
      select display_name, first_name, last_name, employee_number
      from industrial_personnel
      where tenant_id = ${tenantId}::uuid
        and lower(trim(employee_number)) = lower(${employeeNumber})
        and archived_at is null
      limit 1
    `);
    const person = (
      Array.isArray(personRows)
        ? personRows[0]
        : (personRows as { rows?: Array<Record<string, unknown>> }).rows?.[0]
    ) as Record<string, unknown> | undefined;
    const displayName =
      String(person?.display_name ?? "").trim() ||
      [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim() ||
      employeeNumber;

    return {
      assignmentId: assignment.id,
      employeeNumber: String(person?.employee_number ?? employeeNumber).trim(),
      displayName,
      status: assignee.status,
      bestPercent: assignee.bestPercent,
      completedAt: assignee.completedAt,
      dueAt: assignment.dueAt,
      passingPercent: assignment.passingPercent,
      title: assignment.title,
      description: assignment.description,
      sourceTitle:
        (
          await tx
            .select({ title: industrialTrainingSources.title })
            .from(industrialTrainingSources)
            .where(eq(industrialTrainingSources.id, assignment.sourceId))
            .limit(1)
        )[0]?.title ?? "Training",
    };
  }

  private async createPortalSession(input: {
    tenantId: string;
    assignmentId?: string | null;
    accessLinkId?: string | null;
    accessTokenHash: string;
    employeeNumber: string;
    personnelId: string | null;
  }) {
    const sessionToken = this.issueSessionToken();
    const sessionTokenHash = this.hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + PORTAL_SESSION_TTL_MS);
    const now = new Date();

    await withTenantTransaction(this.db, input.tenantId, async (tx) => {
      await tx
        .update(industrialTrainingPortalSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(industrialTrainingPortalSessions.tenantId, input.tenantId),
            sql`lower(trim(${industrialTrainingPortalSessions.employeeNumber})) = lower(${input.employeeNumber})`,
            isNull(industrialTrainingPortalSessions.revokedAt),
            input.assignmentId
              ? eq(industrialTrainingPortalSessions.assignmentId, input.assignmentId)
              : input.accessLinkId
                ? eq(industrialTrainingPortalSessions.accessLinkId, input.accessLinkId)
                : sql`true`,
          ),
        );

      await tx.insert(industrialTrainingPortalSessions).values({
        id: createId(),
        tenantId: input.tenantId,
        assignmentId: input.assignmentId ?? null,
        accessLinkId: input.accessLinkId ?? null,
        accessTokenHash: input.accessTokenHash,
        sessionTokenHash,
        personnelId: input.personnelId,
        employeeNumber: input.employeeNumber,
        expiresAt,
        lastSeenAt: now,
      });
    });

    return { sessionToken, expiresAt: expiresAt.toISOString() };
  }

  private async touchPortalSession(tenantId: string, sessionId: string) {
    const expiresAt = new Date(Date.now() + PORTAL_SESSION_TTL_MS);
    const now = new Date();
    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await tx
        .update(industrialTrainingPortalSessions)
        .set({ lastSeenAt: now, expiresAt })
        .where(
          and(
            eq(industrialTrainingPortalSessions.id, sessionId),
            eq(industrialTrainingPortalSessions.tenantId, tenantId),
            isNull(industrialTrainingPortalSessions.revokedAt),
          ),
        );
    });
    return expiresAt.toISOString();
  }

  private async resolvePublicTokenHash(token: string): Promise<string> {
    try {
      return (await this.resolveAccessLinkByToken(token)).tokenHash;
    } catch (e) {
      if (e instanceof ForgeError && e.code === "NOT_FOUND") {
        return (await this.resolveAssignmentByToken(token)).tokenHash;
      }
      throw e;
    }
  }

  private async resolvePublicLearner(
    token: string,
    credentials: PublicTrainingCredentials,
    options?: { touchSession?: boolean; accessTokenHash?: string },
  ): Promise<PublicTrainingLearnerContext> {
    const sessionToken = String(credentials.sessionToken ?? "").trim();
    if (sessionToken) {
      const accessTokenHash =
        options?.accessTokenHash ?? (await this.resolvePublicTokenHash(token));
      const sessionHash = this.hashToken(sessionToken);
      const tenantId = await this.resolvePortalSessionTenantId(sessionHash);
      if (!tenantId) {
        throw new ForgeError("UNAUTHORIZED", "Training session expired or invalid");
      }

      return withTenantTransaction(this.db, tenantId, async (tx) => {
        const [session] = await tx
          .select()
          .from(industrialTrainingPortalSessions)
          .where(
            and(
              eq(industrialTrainingPortalSessions.sessionTokenHash, sessionHash),
              eq(industrialTrainingPortalSessions.tenantId, tenantId),
              eq(industrialTrainingPortalSessions.accessTokenHash, accessTokenHash),
              isNull(industrialTrainingPortalSessions.revokedAt),
              sql`${industrialTrainingPortalSessions.expiresAt} > now()`,
            ),
          )
          .limit(1);
        if (!session) {
          throw new ForgeError("UNAUTHORIZED", "Training session expired or invalid");
        }

        if (options?.touchSession !== false) {
          await tx
            .update(industrialTrainingPortalSessions)
            .set({
              lastSeenAt: new Date(),
              expiresAt: new Date(Date.now() + PORTAL_SESSION_TTL_MS),
            })
            .where(eq(industrialTrainingPortalSessions.id, session.id));
        }

        return {
          tenantId,
          assignmentId: session.assignmentId ?? null,
          employeeNumber: session.employeeNumber.trim(),
          personnelId: session.personnelId ?? null,
          sessionId: session.id,
          accessLinkId: session.accessLinkId ?? null,
        };
      });
    }

    const normalized = String(credentials.employeeNumber ?? "").trim();
    if (!normalized) {
      throw new ForgeError("VALIDATION_FAILED", "sessionToken or employeeNumber is required");
    }

    const { tokenHash, tenantId } = await this.resolveAssignmentByToken(token);
    const assignmentId = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [assignment] = await tx
        .select({ id: industrialTrainingAssignments.id })
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.publicTokenHash, tokenHash),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .limit(1);
      if (!assignment) throw new ForgeError("NOT_FOUND", "Training link not found");
      return assignment.id;
    });

    return {
      tenantId,
      assignmentId,
      employeeNumber: normalized,
      personnelId: null,
      sessionId: null,
    };
  }

  async getAssignmentContextByToken(token: string) {
    const { tokenHash, tenantId } = await this.resolveAssignmentByToken(token);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.publicTokenHash, tokenHash),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
            eq(industrialTrainingAssignments.status, "ACTIVE"),
          ),
        )
        .limit(1);
      if (!assignment) throw new ForgeError("NOT_FOUND", "Training link not found");

      const [source] = await tx
        .select({ id: industrialTrainingSources.id, title: industrialTrainingSources.title })
        .from(industrialTrainingSources)
        .where(eq(industrialTrainingSources.id, assignment.sourceId))
        .limit(1);

      let material: {
        id: string;
        title: string;
        mimeType: string | null;
        category: string | null;
        originalFilename: string | null;
      } | null = null;
      material = await this.resolveAssignmentMaterial(tx, tenantId, assignment);

      const branding = await this.resolveTenantBrandingSummary(tx, tenantId);

      return {
        assignmentId: assignment.id,
        title: assignment.title,
        description: assignment.description,
        sourceTitle: source?.title ?? "Training",
        dueAt: assignment.dueAt,
        passingPercent: assignment.passingPercent,
        quizMode: assignment.quizMode,
        feedbackEnabled: assignment.feedbackEnabled,
        timerSeconds: assignment.timerSeconds,
        material,
        tenantKey: branding.tenantKey,
        companyName: branding.companyName,
        logoUrl: branding.logoUrl,
      };
    });
  }

  async verifyAssigneeByToken(token: string, employeeNumber: string) {
    const { tokenHash, tenantId } = await this.resolveAssignmentByToken(token);
    const normalized = String(employeeNumber ?? "").trim();
    if (!normalized) throw new ForgeError("VALIDATION_FAILED", "employeeNumber is required");

    const verified = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.publicTokenHash, tokenHash),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .limit(1);
      if (!assignment) throw new ForgeError("NOT_FOUND", "Training link not found");

      const assignee = await this.assignments.findAssigneeByEmployeeNumber(
        tenantId,
        assignment.id,
        normalized,
      );
      if (!assignee) {
        throw new ForgeError(
          "FORBIDDEN",
          "Employee number not recognized for this training assignment",
        );
      }

      const summary = await this.buildAssigneeSummary(
        tx,
        tenantId,
        assignment,
        assignee,
        normalized,
      );

      return {
        summary,
        assignmentId: assignment.id,
        personnelId: assignee.personnelId ?? null,
      };
    });

    const session = await this.createPortalSession({
      tenantId,
      assignmentId: verified.assignmentId,
      accessTokenHash: tokenHash,
      employeeNumber: verified.summary.employeeNumber,
      personnelId: verified.personnelId,
    });

    return {
      ...verified.summary,
      sessionToken: session.sessionToken,
      sessionExpiresAt: session.expiresAt,
    };
  }

  async resumeSessionByToken(token: string, sessionToken: string) {
    const learner = await this.resolvePublicLearner(token, { sessionToken });
    if (!learner.assignmentId) {
      throw new ForgeError("UNAUTHORIZED", "Training session expired or invalid");
    }
    const { tokenHash, tenantId } = await this.resolveAssignmentByToken(token);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.id, learner.assignmentId!),
            eq(industrialTrainingAssignments.publicTokenHash, tokenHash),
            eq(industrialTrainingAssignments.tenantId, tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .limit(1);
      if (!assignment) throw new ForgeError("UNAUTHORIZED", "Training session expired or invalid");

      const assignee = await this.assignments.findAssigneeByEmployeeNumber(
        tenantId,
        assignment.id,
        learner.employeeNumber,
      );
      if (!assignee) {
        throw new ForgeError("UNAUTHORIZED", "Training session expired or invalid");
      }

      const summary = await this.buildAssigneeSummary(
        tx,
        tenantId,
        assignment,
        assignee,
        learner.employeeNumber,
      );
      const sessionExpiresAt =
        learner.sessionId != null
          ? await this.touchPortalSession(tenantId, learner.sessionId)
          : null;

      return {
        ...summary,
        sessionToken,
        sessionExpiresAt,
      };
    });
  }

  async logoutSessionByToken(token: string, sessionToken: string) {
    const learner = await this.resolvePublicLearner(
      token,
      { sessionToken },
      { touchSession: false },
    );
    const now = new Date();
    await withTenantTransaction(this.db, learner.tenantId, async (tx) => {
      if (!learner.sessionId) return;
      await tx
        .update(industrialTrainingPortalSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(industrialTrainingPortalSessions.id, learner.sessionId),
            eq(industrialTrainingPortalSessions.tenantId, learner.tenantId),
            isNull(industrialTrainingPortalSessions.revokedAt),
          ),
        );
    });
    return { loggedOut: true };
  }

  async startQuizByToken(
    token: string,
    credentials: PublicTrainingCredentials & { assignmentId?: string },
  ) {
    const learner = await this.resolvePublicLearner(token, credentials);
    const assignmentId = credentials.assignmentId ?? learner.assignmentId;
    if (!assignmentId) {
      throw new ForgeError("VALIDATION_FAILED", "assignmentId is required");
    }
    const created = await this.training.createQuizPublic(
      learner.tenantId,
      learner.employeeNumber,
      assignmentId,
    );
    const next = await this.training.nextQuestionPublic(
      learner.tenantId,
      learner.employeeNumber,
      created.attempt!.id,
    );
    return { ...created, next };
  }

  async nextQuestionByToken(
    token: string,
    credentials: PublicTrainingCredentials,
    attemptId: string,
  ) {
    const learner = await this.resolvePublicLearner(token, credentials);
    return this.training.nextQuestionPublic(learner.tenantId, learner.employeeNumber, attemptId);
  }

  async answerByToken(
    token: string,
    credentials: PublicTrainingCredentials,
    attemptId: string,
    body: { questionId?: string; selectedIndex?: number },
  ) {
    const learner = await this.resolvePublicLearner(token, credentials);
    return this.training.answerQuestionPublic(
      learner.tenantId,
      learner.employeeNumber,
      attemptId,
      body,
    );
  }

  async resultsByToken(token: string, credentials: PublicTrainingCredentials, attemptId: string) {
    const learner = await this.resolvePublicLearner(token, credentials);
    return this.training.getResultsPublic(learner.tenantId, learner.employeeNumber, attemptId);
  }

  private async resolveAccessLinkByToken(token: string) {
    const raw = String(token ?? "").trim();
    if (raw.length < 16) throw new ForgeError("NOT_FOUND", "Training access link not found");
    const tokenHash = this.hashToken(raw);
    const tenantId = await this.lms.resolveAccessLinkTenantId(tokenHash);
    if (!tenantId) throw new ForgeError("NOT_FOUND", "Training access link not found");
    return { raw, tokenHash, tenantId };
  }

  async getAccessLinkContextByToken(token: string) {
    const { tokenHash, tenantId } = await this.resolveAccessLinkByToken(token);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [link] = await tx
        .select()
        .from(industrialTrainingAccessLinks)
        .where(
          and(
            eq(industrialTrainingAccessLinks.publicTokenHash, tokenHash),
            eq(industrialTrainingAccessLinks.tenantId, tenantId),
            isNull(industrialTrainingAccessLinks.archivedAt),
            eq(industrialTrainingAccessLinks.status, "ACTIVE"),
          ),
        )
        .limit(1);
      if (!link) throw new ForgeError("NOT_FOUND", "Training access link not found");
      const branding = await this.resolveTenantBrandingSummary(tx, tenantId);
      const portalConfig = await this.lms.readPortalTenantConfig(tx, tenantId);
      return {
        accessLinkId: link.id,
        linkType: link.linkType,
        title: link.title,
        description: link.description,
        employeeNumberPrefix: portalConfig.employeeNumberPrefix,
        portalEnabled: portalConfig.portalEnabled,
        employeeNumberHint: portalConfig.employeeNumberHint,
        ...branding,
      };
    });
  }

  async verifyAccessLinkEmployee(token: string, employeeNumber: string, clientBucket?: string) {
    const { tokenHash, tenantId } = await this.resolveAccessLinkByToken(token);
    const normalized = String(employeeNumber ?? "").trim();
    if (!normalized) throw new ForgeError("VALIDATION_FAILED", "employeeNumber is required");
    const bucketKey = `identify:${tokenHash.slice(0, 16)}:${clientBucket ?? "unknown"}`;

    try {
      const portal = await withTenantTransaction(this.db, tenantId, async (tx) => {
        const [link] = await tx
          .select()
          .from(industrialTrainingAccessLinks)
          .where(
            and(
              eq(industrialTrainingAccessLinks.publicTokenHash, tokenHash),
              eq(industrialTrainingAccessLinks.tenantId, tenantId),
              isNull(industrialTrainingAccessLinks.archivedAt),
            ),
          )
          .limit(1);
        if (!link) throw new ForgeError("NOT_FOUND", "Training access link not found");

        const portalConfig = await this.lms.readPortalTenantConfig(tx, tenantId);
        if (!portalConfig.portalEnabled) {
          throw new ForgeError(
            "FORBIDDEN",
            "Company training portal is disabled for this organization.",
          );
        }

        const person = (await findPersonnelByEmployeeNumber(tx, tenantId, normalized)) ?? null;

        if (!person || !isActivePersonnelStatus(person.status)) {
          await this.lms.checkRateLimit(tenantId, bucketKey, true);
          throw new ForgeError(
            "FORBIDDEN",
            "Employee number could not be verified. Please check the number and try again.",
          );
        }

        if (link.siteId && link.siteId !== person.siteId) {
          await this.lms.checkRateLimit(tenantId, bucketKey, true);
          throw new ForgeError("FORBIDDEN", "This portal link is not valid for your location.");
        }
        if (link.departmentId && link.departmentId !== person.departmentId) {
          await this.lms.checkRateLimit(tenantId, bucketKey, true);
          throw new ForgeError("FORBIDDEN", "This portal link is not valid for your department.");
        }

        await this.lms.checkRateLimit(tenantId, bucketKey, false);
        const snapshot = await this.lms.personnelSnapshot(tx, tenantId, person.id);
        const assignments = await this.lms.listEmployeeAssignments(
          tenantId,
          person.employeeNumber!.trim(),
        );

        const session = await this.createPortalSession({
          tenantId,
          accessLinkId: link.id,
          accessTokenHash: tokenHash,
          employeeNumber: person.employeeNumber!.trim(),
          personnelId: person.id,
        });

        const summary = this.lms.buildPortalAssignmentSummary(assignments);

        return {
          employeeNumber: person.employeeNumber,
          displayName: person.displayName,
          departmentName: snapshot.departmentName ?? null,
          siteName: snapshot.siteName ?? null,
          jobTitle: person.jobTitle,
          personnelId: person.id,
          assignments,
          summary,
          sessionToken: session.sessionToken,
          sessionExpiresAt: session.expiresAt,
        };
      });
      const withTranscript = await this.attachPortalTranscript(tenantId, portal);
      const { personnelId: _personnelId, ...publicPortal } = withTranscript;
      return publicPortal;
    } catch (e) {
      if (e instanceof ForgeError && e.code === "FORBIDDEN") throw e;
      throw e;
    }
  }

  private async attachPortalTranscript<T extends { personnelId?: string | null }>(
    tenantId: string,
    portal: T,
  ) {
    const personnelId = portal.personnelId?.trim();
    if (!personnelId) {
      return { ...portal, trainingRecords: [] as unknown[] };
    }
    try {
      const history = await this.lms.listPersonnelTrainingHistory(tenantId, personnelId);
      return {
        ...portal,
        trainingRecords: history.trainingRecords ?? [],
      };
    } catch {
      return { ...portal, trainingRecords: [] as unknown[] };
    }
  }

  async logoutAccessLinkSession(token: string, sessionToken: string) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    const now = new Date();
    await withTenantTransaction(this.db, learner.tenantId, async (tx) => {
      if (!learner.sessionId) return;
      await tx
        .update(industrialTrainingPortalSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(industrialTrainingPortalSessions.id, learner.sessionId),
            eq(industrialTrainingPortalSessions.tenantId, learner.tenantId),
            isNull(industrialTrainingPortalSessions.revokedAt),
          ),
        );
    });
    return { loggedOut: true };
  }

  async acknowledgeCourseByAccess(
    token: string,
    sessionToken: string,
    body: { assignmentId: string; acknowledgementText: string },
  ) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    const assignee = await this.assignments.findAssigneeByEmployeeNumber(
      learner.tenantId,
      body.assignmentId,
      learner.employeeNumber,
    );
    if (!assignee) throw new ForgeError("FORBIDDEN", "Assignment not found");
    const progress = await this.lms.getProgress(learner.tenantId, assignee.id);
    const assignment = await withTenantTransaction(this.db, learner.tenantId, async (tx) => {
      const [row] = await tx
        .select({ courseVersionId: industrialTrainingAssignments.courseVersionId })
        .from(industrialTrainingAssignments)
        .where(eq(industrialTrainingAssignments.id, body.assignmentId))
        .limit(1);
      return row;
    });
    return this.lms.recordAcknowledgement({
      tenantId: learner.tenantId,
      employeeNumber: learner.employeeNumber,
      personnelId: learner.personnelId,
      progressId: progress?.id ?? null,
      versionId: assignment?.courseVersionId ?? null,
      acknowledgementText: body.acknowledgementText,
      requestMetadata: { assignmentId: body.assignmentId, accessLink: true },
    });
  }

  async listSessionAssignments(token: string, sessionToken: string) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    return this.lms.listEmployeeAssignments(learner.tenantId, learner.employeeNumber);
  }

  async getCoursePlayer(token: string, sessionToken: string, assignmentId: string) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    return withTenantTransaction(this.db, learner.tenantId, async (tx) => {
      const [assignment] = await tx
        .select()
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.id, assignmentId),
            eq(industrialTrainingAssignments.tenantId, learner.tenantId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .limit(1);
      if (!assignment) throw new ForgeError("NOT_FOUND", "Assignment not found");

      const assignee = await this.assignments.findAssigneeByEmployeeNumber(
        learner.tenantId,
        assignmentId,
        learner.employeeNumber,
      );
      if (!assignee) {
        throw new ForgeError("FORBIDDEN", "This training is not currently assigned to you.");
      }

      let versionId = assignment.courseVersionId;
      if (!versionId) {
        const [version] = await tx
          .select()
          .from(industrialTrainingCourseVersions)
          .where(
            and(
              eq(industrialTrainingCourseVersions.sourceId, assignment.sourceId),
              eq(industrialTrainingCourseVersions.tenantId, learner.tenantId),
              eq(industrialTrainingCourseVersions.status, "PUBLISHED"),
            ),
          )
          .orderBy(desc(industrialTrainingCourseVersions.versionNumber))
          .limit(1);
        versionId = version?.id ?? null;
      }

      const sections = versionId
        ? await tx
            .select()
            .from(industrialTrainingCourseSections)
            .where(
              and(
                eq(industrialTrainingCourseSections.versionId, versionId),
                eq(industrialTrainingCourseSections.tenantId, learner.tenantId),
                isNull(industrialTrainingCourseSections.archivedAt),
              ),
            )
            .orderBy(industrialTrainingCourseSections.sortOrder)
        : [];

      const progress = await this.lms.getProgress(learner.tenantId, assignee.id);
      const material = await this.resolveAssignmentMaterial(tx, learner.tenantId, assignment);

      return {
        assignmentId: assignment.id,
        title: assignment.title,
        passingPercent: assignment.passingPercent,
        dueAt: assignment.dueAt,
        versionId,
        sections: sections.map(mapCourseSectionForPortal),
        progress,
        assigneeStatus: assignee.status,
        bestPercent: assignee.bestPercent,
        material,
      };
    });
  }

  async saveCourseProgress(
    token: string,
    sessionToken: string,
    body: {
      assignmentId: string;
      sectionId?: string;
      sectionsCompleted?: string[];
      percentComplete?: number;
      quizAvailable?: boolean;
    },
  ) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    const assignee = await this.assignments.findAssigneeByEmployeeNumber(
      learner.tenantId,
      body.assignmentId,
      learner.employeeNumber,
    );
    if (!assignee) throw new ForgeError("FORBIDDEN", "Assignment not found");

    const assignment = await withTenantTransaction(this.db, learner.tenantId, async (tx) =>
      tx
        .select({ courseVersionId: industrialTrainingAssignments.courseVersionId })
        .from(industrialTrainingAssignments)
        .where(eq(industrialTrainingAssignments.id, body.assignmentId))
        .limit(1),
    );
    return this.lms.upsertProgress({
      tenantId: learner.tenantId,
      assignmentId: body.assignmentId,
      assigneeId: assignee.id,
      personnelId: learner.personnelId,
      employeeNumber: learner.employeeNumber,
      versionId: assignment[0]?.courseVersionId ?? null,
      sectionId: body.sectionId ?? null,
      sectionsCompleted: body.sectionsCompleted ?? [],
      percentComplete: body.percentComplete ?? 0,
      quizAvailable: Boolean(body.quizAvailable),
    });
  }

  async resumeAccessLinkSession(token: string, sessionToken: string) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    const assignments = await this.lms.listEmployeeAssignments(
      learner.tenantId,
      learner.employeeNumber,
    );
    const snapshot = await withTenantTransaction(this.db, learner.tenantId, async (tx) => {
      if (!learner.personnelId) return {};
      return this.lms.personnelSnapshot(tx, learner.tenantId, learner.personnelId);
    });
    const portal = {
      employeeNumber: learner.employeeNumber,
      displayName: snapshot.displayName ?? learner.employeeNumber,
      departmentName: snapshot.departmentName ?? null,
      siteName: snapshot.siteName ?? null,
      jobTitle: snapshot.jobTitle ?? null,
      personnelId: learner.personnelId,
      assignments,
      summary: this.lms.buildPortalAssignmentSummary(assignments),
      sessionToken,
      sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    const withTranscript = await this.attachPortalTranscript(learner.tenantId, portal);
    const { personnelId: _personnelId, ...publicPortal } = withTranscript;
    return publicPortal;
  }

  async getMaterialContentForLearner(token: string, sessionToken: string, materialId: string) {
    const accessTokenHash = await this.resolvePublicTokenHash(token);
    const learner = await this.resolvePublicLearner(token, { sessionToken }, { accessTokenHash });
    await this.assertLearnerMaterialAccess(learner, materialId);
    return this.training.getMaterialContentByTenant(learner.tenantId, materialId);
  }

  async getMaterialViewUrlForLearner(token: string, sessionToken: string, materialId: string) {
    const accessTokenHash = await this.resolvePublicTokenHash(token);
    const learner = await this.resolvePublicLearner(token, { sessionToken }, { accessTokenHash });
    await this.assertLearnerMaterialAccess(learner, materialId);
    return this.training.createMaterialViewUrlByTenant(learner.tenantId, materialId);
  }

  async streamMaterialOfficeView(materialId: string, officeToken: string) {
    const verified = verifyOfficeViewToken(officeToken, materialId);
    if (!verified) {
      throw new ForgeError("UNAUTHORIZED", "Office view link expired or invalid");
    }
    return this.training.getMaterialContentByTenant(verified.tenantId, materialId);
  }

  private async assertLearnerMaterialAccess(
    learner: PublicTrainingLearnerContext,
    materialId: string,
  ) {
    await withTenantTransaction(this.db, learner.tenantId, async (tx) => {
      const [material] = await tx
        .select({
          id: industrialTrainingMaterials.id,
          sourceId: industrialTrainingMaterials.sourceId,
        })
        .from(industrialTrainingMaterials)
        .where(
          and(
            eq(industrialTrainingMaterials.id, materialId),
            eq(industrialTrainingMaterials.tenantId, learner.tenantId),
            isNull(industrialTrainingMaterials.archivedAt),
            eq(industrialTrainingMaterials.status, "ACTIVE"),
            eq(industrialTrainingMaterials.visibility, "PUBLISHED"),
          ),
        )
        .limit(1);
      if (!material) throw new ForgeError("NOT_FOUND", "Training material not found");

      const assignments = await tx
        .select({
          assignmentId: industrialTrainingAssignments.id,
          materialId: industrialTrainingAssignments.materialId,
          sourceId: industrialTrainingAssignments.sourceId,
        })
        .from(industrialTrainingAssignmentAssignees)
        .innerJoin(
          industrialTrainingAssignments,
          eq(industrialTrainingAssignmentAssignees.assignmentId, industrialTrainingAssignments.id),
        )
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.tenantId, learner.tenantId),
            sql`lower(trim(${industrialTrainingAssignmentAssignees.employeeNumber})) = lower(${learner.employeeNumber})`,
            isNull(industrialTrainingAssignments.archivedAt),
            eq(industrialTrainingAssignments.status, "ACTIVE"),
          ),
        );

      const allowed = assignments.some(
        (row) =>
          row.materialId === materialId ||
          (material.sourceId && row.sourceId === material.sourceId),
      );
      if (!allowed) {
        throw new ForgeError("FORBIDDEN", "Material not available for your training");
      }
    });
  }

  private async resolveAssignmentMaterial(
    tx: DatabaseTransaction,
    tenantId: string,
    assignment: typeof industrialTrainingAssignments.$inferSelect,
  ) {
    const materialSelect = {
      id: industrialTrainingMaterials.id,
      title: industrialTrainingMaterials.title,
      mimeType: industrialTrainingMaterials.mimeType,
      category: industrialTrainingMaterials.category,
      originalFilename: industrialTrainingMaterials.originalFilename,
    };

    // Serve the assignment's pinned material. Uploading a newer file for the course must not replace it.
    if (assignment.materialId) {
      const [linked] = await tx
        .select(materialSelect)
        .from(industrialTrainingMaterials)
        .where(
          and(
            eq(industrialTrainingMaterials.id, assignment.materialId),
            eq(industrialTrainingMaterials.tenantId, tenantId),
            isNull(industrialTrainingMaterials.archivedAt),
            eq(industrialTrainingMaterials.status, "ACTIVE"),
            eq(industrialTrainingMaterials.visibility, "PUBLISHED"),
          ),
        )
        .limit(1);
      if (linked) return linked;
    }

    // Unpinned assignments fall back to the earliest published material (stable; new uploads do not override).
    const [bySource] = await tx
      .select(materialSelect)
      .from(industrialTrainingMaterials)
      .where(
        and(
          eq(industrialTrainingMaterials.sourceId, assignment.sourceId),
          eq(industrialTrainingMaterials.tenantId, tenantId),
          isNull(industrialTrainingMaterials.archivedAt),
          eq(industrialTrainingMaterials.status, "ACTIVE"),
          eq(industrialTrainingMaterials.visibility, "PUBLISHED"),
        ),
      )
      .orderBy(asc(industrialTrainingMaterials.createdAt))
      .limit(1);
    return bySource ?? null;
  }

  private async resolvePublicAccessLearner(token: string, sessionToken: string) {
    const { tokenHash } = await this.resolveAccessLinkByToken(token);
    return this.resolvePublicLearner(token, { sessionToken }, { accessTokenHash: tokenHash });
  }

  async getAccessTrainingReport(token: string, sessionToken: string) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    if (!learner.personnelId) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Training report is not available for this session",
      );
    }
    return this.lms.getPersonnelTrainingReportPrintable(learner.tenantId, learner.personnelId);
  }

  async getAccessTrainingHistory(token: string, sessionToken: string) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    if (!learner.personnelId) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Training history is not available for this session",
      );
    }
    return this.lms.listPersonnelTrainingHistory(learner.tenantId, learner.personnelId);
  }

  async getAccessCompletionPrintable(token: string, sessionToken: string, completionId: string) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    if (!learner.personnelId) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Completion print is not available for this session",
      );
    }
    return this.lms.getCompletionPrintable(learner.tenantId, learner.personnelId, completionId);
  }

  async getAccessAttemptPrintable(token: string, sessionToken: string, attemptId: string) {
    const learner = await this.resolvePublicAccessLearner(token, sessionToken);
    return this.lms.getAttemptPrintable(learner.tenantId, attemptId, {
      personnelId: learner.personnelId,
      employeeNumber: learner.employeeNumber,
    });
  }
}

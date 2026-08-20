import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  userInvitations,
  users,
  userTenantAccess,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { CognitoAdminService } from "../cognito/cognito-admin.service.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

type ExpectedVersion = number | "*";

const inviteSchema = z.object({
  email: z.string().email().max(320),
  personId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  roleCodes: z.array(z.string().min(1).max(64)).max(20).optional(),
  expiresInHours: z.number().int().min(1).max(720).default(168),
});

const patchUserSchema = z.object({
  username: z.string().min(1).max(100).optional().nullable(),
  primaryEmail: z.string().email().max(320).optional(),
  personId: z.string().uuid().optional().nullable(),
});

const acceptSchema = z.object({
  token: z.string().min(16).max(512),
  username: z.string().min(1).max(100).optional(),
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly invitations: InvitationsService,
    private readonly cognito: CognitoAdminService,
  ) {}

  /**
   * Legacy Creator Users endpoint.
   * Delegates to the authoritative invitation + Cognito email path (ADR-020).
   * Does not return a plaintext invite token — delivery is via Cognito email.
   */
  async invite(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = inviteSchema.parse(input);
    const invitation = await this.invitations.create(
      {
        tenantId,
        email: data.email,
        ...(data.firstName ? { firstName: data.firstName } : {}),
        ...(data.lastName ? { lastName: data.lastName } : {}),
        roleCodes: data.roleCodes ?? [],
        expiresInHours: data.expiresInHours,
        send: true,
      },
      principal,
    );

    return {
      invitationId: invitation.id,
      membershipId: invitation.membershipId,
      email: data.email.toLowerCase(),
      expiresAt: invitation.expiresAt,
      status: invitation.status,
      delivery: "COGNITO_EMAIL" as const,
      token: null,
    };
  }

  async acceptInvitation(input: unknown, ids: { correlationId: string; requestId: string }) {
    const data = acceptSchema.parse(input);
    const tokenHash = hashToken(data.token);

    const invitation = await this.db.query.userInvitations.findFirst({
      where: eq(userInvitations.invitationTokenHash, tokenHash),
    });
    if (!invitation || invitation.status !== "PENDING") {
      throw new ForgeError("NOT_FOUND", "Invitation not found or already used");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new ForgeError("BAD_REQUEST", "Invitation has expired");
    }

    return withTenantTransaction(this.db, invitation.tenantId, async (tx) => {
      const now = new Date();
      const existingUser = await tx.query.users.findFirst({
        where: and(
          eq(users.tenantId, invitation.tenantId),
          eq(users.primaryEmail, invitation.email),
        ),
      });
      let user;
      if (!existingUser) {
        const userId = createId();
        const [created] = await tx
          .insert(users)
          .values({
            id: userId,
            tenantId: invitation.tenantId,
            personId: invitation.personId,
            primaryEmail: invitation.email,
            username: data.username,
            status: "ACTIVE",
            invitedAt: invitation.createdAt,
            activatedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!created) {
          throw new ForgeError("INTERNAL_ERROR", "Failed to create user from invitation");
        }
        user = created;
        await tx.insert(userTenantAccess).values({
          id: createId(),
          tenantId: invitation.tenantId,
          userId,
          status: "ACTIVE",
          isDefaultTenant: true,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        const [updated] = await tx
          .update(users)
          .set({
            status: "ACTIVE",
            username: data.username ?? existingUser.username,
            personId: invitation.personId ?? existingUser.personId,
            activatedAt: now,
            updatedAt: now,
          })
          .where(eq(users.id, existingUser.id))
          .returning();
        if (!updated) {
          throw new ForgeError("INTERNAL_ERROR", "Failed to activate invited user");
        }
        user = updated;
      }

      await tx
        .update(userInvitations)
        .set({
          status: "ACCEPTED",
          acceptedAt: now,
          acceptedByUserId: user.id,
        })
        .where(eq(userInvitations.id, invitation.id));

      await this.outbox.write(tx, {
        tenantId: invitation.tenantId,
        aggregateType: "user",
        aggregateId: user.id,
        eventType: DOMAIN_EVENT_TYPES.USER_ACTIVATED,
        payload: { userId: user.id, tenantId: invitation.tenantId },
        correlationId: ids.correlationId,
        actorUserId: user.id,
      });

      return {
        userId: user.id,
        tenantId: invitation.tenantId,
        email: user.primaryEmail,
        status: user.status,
      };
    });
  }

  async list(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.users.findMany({
        where: eq(users.tenantId, tenantId),
        orderBy: (t, { asc }) => [asc(t.primaryEmail)],
      });
    });
  }

  async get(tenantId: string, userId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.tenantId, tenantId)),
      });
      if (!row) {
        throw new ForgeError("NOT_FOUND", "User not found");
      }
      return row;
    });
  }

  async patch(
    tenantId: string,
    userId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = patchUserSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const before = await tx.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.tenantId, tenantId)),
      });
      if (!before) {
        throw new ForgeError("NOT_FOUND", "User not found");
      }
      const version = before.recordVersion;
      if (expectedVersion !== "*" && version !== expectedVersion) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "user",
          resourceId: userId,
          expectedVersion,
          actualVersion: version,
        });
      }
      const [updated] = await tx
        .update(users)
        .set({ ...data, recordVersion: version + 1, updatedAt: new Date() })
        .where(and(eq(users.id, userId), eq(users.recordVersion, version)))
        .returning();
      if (!updated) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "user",
          resourceId: userId,
          expectedVersion,
          actualVersion: null,
        });
      }
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "user.update",
        resourceType: "user",
        resourceId: userId,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        before,
        after: updated,
      });
      return updated;
    }, principal.userId);
  }

  async disable(
    tenantId: string,
    userId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const before = await tx.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.tenantId, tenantId)),
      });
      if (!before) {
        throw new ForgeError("NOT_FOUND", "User not found");
      }
      const version = before.recordVersion;
      if (expectedVersion !== "*" && version !== expectedVersion) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "user",
          resourceId: userId,
          expectedVersion,
          actualVersion: version,
        });
      }
      const now = new Date();
      const [updated] = await tx
        .update(users)
        .set({
          status: "DISABLED",
          disabledAt: now,
          updatedAt: now,
          recordVersion: version + 1,
          // Force-invalidate existing sessions when the account is disabled.
          sessionVersion: before.sessionVersion + 1,
          sessionsRevokedAt: now,
        })
        .where(and(eq(users.id, userId), eq(users.recordVersion, version)))
        .returning();
      if (!updated) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "user",
          resourceId: userId,
          expectedVersion,
          actualVersion: null,
        });
      }
      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "user",
        aggregateId: userId,
        eventType: DOMAIN_EVENT_TYPES.USER_DISABLED,
        payload: { userId, tenantId },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });
      return updated;
    }, principal.userId);
  }

  /**
   * Sends a Cognito password-reset email (or resends the invitation if the
   * user has not completed first-time password setup). Does not return a
   * temporary password to the caller.
   */
  async sendPasswordReset(tenantId: string, userId: string, principal: ForgePrincipal) {
    const user = await this.get(tenantId, userId);
    if (user.status === "DISABLED") {
      throw new ForgeError("CONFLICT", "Cannot reset password for a disabled account");
    }
    const email = user.primaryEmail?.trim();
    if (!email) {
      throw new ForgeError("BAD_REQUEST", "This user has no email address to send a reset to");
    }

    const cognitoUsername = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const invitation = await tx.query.userInvitations.findFirst({
        where: and(eq(userInvitations.tenantId, tenantId), eq(userInvitations.email, email)),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
      return invitation?.cognitoUsername ?? email;
    });

    const result = await this.cognito.resetPassword(cognitoUsername);

    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "user.password_reset.requested",
          resourceType: "user",
          resourceId: userId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { method: result.method, email },
        });
      },
      principal.userId,
    );

    return {
      userId,
      email,
      method: result.method,
      delivered: result.method !== "simulated",
    };
  }

  async enable(
    tenantId: string,
    userId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const before = await tx.query.users.findFirst({
        where: and(eq(users.id, userId), eq(users.tenantId, tenantId)),
      });
      if (!before) {
        throw new ForgeError("NOT_FOUND", "User not found");
      }
      const version = before.recordVersion;
      if (expectedVersion !== "*" && version !== expectedVersion) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "user",
          resourceId: userId,
          expectedVersion,
          actualVersion: version,
        });
      }
      const [updated] = await tx
        .update(users)
        .set({
          status: "ACTIVE",
          disabledAt: null,
          recordVersion: version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, userId), eq(users.recordVersion, version)))
        .returning();
      if (!updated) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "user",
          resourceId: userId,
          expectedVersion,
          actualVersion: null,
        });
      }
      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "user",
        aggregateId: userId,
        eventType: DOMAIN_EVENT_TYPES.USER_ACTIVATED,
        payload: { userId, tenantId },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });
      return updated;
    }, principal.userId);
  }
}

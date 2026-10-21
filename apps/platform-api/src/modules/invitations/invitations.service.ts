import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  acceptInvitationInputSchema,
  createInvitationInputSchema,
  emailsMatchForInvitationAccept,
  ACTIVE_INVITATION_STORAGE_STATUSES,
  INVITATION_RESEND_EXTEND_HOURS,
  isTerminalInvitationStatus,
  TERMINAL_INVITATION_STATUSES,
  type InvitationStatus,
} from "@forge/contracts";
import {
  authenticationIdentities,
  createId,
  facilities,
  lookupInvitation,
  userInvitations,
  users,
  userTenantMemberships,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { MembershipsService } from "../memberships/memberships.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { CognitoAdminService } from "../cognito/cognito-admin.service.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isTerminal(status: string): boolean {
  return isTerminalInvitationStatus(status);
}

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly cognito: CognitoAdminService,
    private readonly memberships: MembershipsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async list(tenantId: string, filters: { status?: string | undefined; email?: string | undefined }) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conditions = [eq(userInvitations.tenantId, tenantId)];
      if (filters.status) {
        conditions.push(eq(userInvitations.status, filters.status));
      }
      if (filters.email) {
        conditions.push(eq(userInvitations.email, filters.email.toLowerCase()));
      }
      return tx.query.userInvitations.findMany({
        where: and(...conditions),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    });
  }

  async get(tenantId: string, invitationId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) =>
      this.requireInvitation(tx, tenantId, invitationId),
    );
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(input: unknown, principal: ForgePrincipal) {
    const data = createInvitationInputSchema.parse(input);
    const tenantId = data.tenantId;

    if (!principal.isPlatformAdmin && principal.tenantId !== tenantId) {
      throw new ForgeError("FORBIDDEN", "Cannot invite users into another tenant");
    }

    const email = data.email.toLowerCase();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.expiresInHours * 3600_000);
    const invitationId = createId();

    // Cognito provisioning happens outside the DB transaction so a Cognito
    // failure does not leave a half-written invitation, and a DB failure can
    // still roll the Cognito user back via deleteUser.
    let provisioned:
      | Awaited<ReturnType<CognitoAdminService["createOrGetUser"]>>
      | null = null;
    if (data.send) {
      try {
        provisioned = await this.cognito.createOrGetUser({
          email,
          firstName: data.firstName,
          lastName: data.lastName,
        });
        // Existing Cognito users do not get a welcome email on create — resend it.
        if (provisioned && !provisioned.created) {
          await this.cognito.resendInvitation(provisioned.username);
        }
      } catch (error) {
        throw error instanceof ForgeError
          ? error
          : new ForgeError("INTERNAL_ERROR", "Failed to provision the Cognito user");
      }
    }

    try {
      const result = await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          const duplicate = await tx.query.userInvitations.findFirst({
            where: and(
              eq(userInvitations.tenantId, tenantId),
              eq(userInvitations.email, email),
              inArray(userInvitations.status, [...ACTIVE_INVITATION_STORAGE_STATUSES]),
            ),
          });
          if (duplicate) {
            throw new ForgeError(
              "CONFLICT",
              "An active invitation already exists for this email in the tenant",
            );
          }

          let user = await tx.query.users.findFirst({
            where: and(eq(users.tenantId, tenantId), eq(users.primaryEmail, email)),
          });
          if (!user) {
            const userId = createId();
            const [created] = await tx
              .insert(users)
              .values({
                id: userId,
                tenantId,
                primaryEmail: email,
                status: "INVITED",
                invitedAt: now,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!created) {
              throw new ForgeError("INTERNAL_ERROR", "Failed to create invited user");
            }
            user = created;
          }

          const existingMembership = await tx.query.userTenantMemberships.findFirst({
            where: and(
              eq(userTenantMemberships.tenantId, tenantId),
              eq(userTenantMemberships.userId, user.id),
            ),
          });
          if (existingMembership && existingMembership.status !== "REVOKED") {
            throw new ForgeError(
              "CONFLICT",
              "User already has a membership in this tenant",
            );
          }

          const membershipId = createId();
          await tx.insert(userTenantMemberships).values({
            id: membershipId,
            tenantId,
            userId: user.id,
            status: "PENDING",
            isDefaultTenant: true,
            facilityIdsJson: data.facilityIds,
            createdByUserId: principal.userId,
            updatedByUserId: principal.userId,
            createdAt: now,
            updatedAt: now,
          });

          if (data.facilityIds.length > 0) {
            await this.assertFacilitiesInTenant(tx, tenantId, data.facilityIds);
          }

          await this.memberships.applyRoles(tx, {
            tenantId,
            membershipId,
            principal,
            roles: data.roleCodes.map((roleCode) => ({ roleCode, organizationId: null })),
            activate: false,
          });
          await this.memberships.applyProductsAndModules(tx, {
            tenantId,
            membershipId,
            principal,
            productCodes: data.productCodes,
            moduleCodes: data.moduleCodes,
          });
          await this.memberships.recordHistory(tx, {
            tenantId,
            membershipId,
            action: "membership.create",
            fromStatus: null,
            toStatus: "PENDING",
            principal,
            metadata: { invitationId, facilityIds: data.facilityIds },
          });

          const status: InvitationStatus = data.send ? "SENT" : "DRAFT";
          await tx.insert(userInvitations).values({
            id: invitationId,
            tenantId,
            email,
            organizationId: data.organizationId,
            firstName: data.firstName,
            lastName: data.lastName,
            invitationTokenHash: tokenHash,
            expiresAt,
            status,
            roleCodesJson: data.roleCodes,
            productCodesJson: data.productCodes,
            moduleCodesJson: data.moduleCodes,
            facilityIdsJson: data.facilityIds,
            cognitoUsername: provisioned?.username ?? null,
            cognitoSubject: provisioned?.subject ?? null,
            membershipId,
            invitedByUserId: principal.userId,
            sentAt: data.send ? now : null,
            createdAt: now,
            updatedAt: now,
          });

          await tx
            .update(userTenantMemberships)
            .set({ invitationId, updatedAt: now })
            .where(eq(userTenantMemberships.id, membershipId));

          await this.outbox.write(tx, {
            tenantId,
            aggregateType: "user_invitation",
            aggregateId: invitationId,
            eventType: DOMAIN_EVENT_TYPES.USER_INVITATION_CREATED,
            payload: {
              invitationId,
              tenantId,
              email,
              status,
              membershipId,
              userId: user.id,
            },
            correlationId: principal.correlationId,
            actorUserId: principal.userId,
          });
          if (data.send) {
            await this.outbox.write(tx, {
              tenantId,
              aggregateType: "user_invitation",
              aggregateId: invitationId,
              eventType: DOMAIN_EVENT_TYPES.USER_INVITATION_SENT,
              payload: { invitationId, tenantId, email },
              correlationId: principal.correlationId,
              actorUserId: principal.userId,
            });
          }

          await this.audit.writeInTransaction(tx, {
            tenantId,
            actorUserId: principal.userId,
            actorPersonId: principal.personId,
            actorType: "USER",
            action: data.send ? "invitation.send" : "invitation.create",
            resourceType: "user_invitation",
            resourceId: invitationId,
            result: "SUCCESS",
            riskLevel: "HIGH",
            correlationId: principal.correlationId,
            requestId: principal.requestId,
            after: {
              invitationId,
              email,
              status,
              membershipId,
              expiresAt,
              roleCodes: data.roleCodes,
            },
          });

          const invitation = await this.requireInvitation(tx, tenantId, invitationId);
          return {
            ...sanitizeInvitation(invitation),
            userId: user.id,
            membershipId,
            // Plaintext token is returned once so the Creator Console (and
            // local/dev flows with delivery suppressed) can complete acceptance.
            token,
            temporaryPassword: provisioned?.temporaryPassword,
          };
        },
        principal.userId,
      );

      return result;
    } catch (error) {
      if (provisioned?.created) {
        await this.cognito.deleteUser(provisioned.username).catch(() => undefined);
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Resend / revoke
  // -------------------------------------------------------------------------

  async resend(tenantId: string, invitationId: string, principal: ForgePrincipal) {
    const invitation = await this.get(tenantId, invitationId);
    if (isTerminal(invitation.status)) {
      throw new ForgeError("CONFLICT", `Cannot resend a ${invitation.status} invitation`);
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await this.markExpired(tenantId, invitationId, principal);
      throw new ForgeError("BAD_REQUEST", "Invitation has expired");
    }

    if (!invitation.cognitoUsername) {
      const provisioned = await this.cognito.createOrGetUser({
        email: invitation.email,
        firstName: invitation.firstName ?? undefined,
        lastName: invitation.lastName ?? undefined,
      });
      await withTenantTransaction(
        this.db,
        tenantId,
        async (tx) => {
          await tx
            .update(userInvitations)
            .set({
              cognitoUsername: provisioned.username,
              cognitoSubject: provisioned.subject,
              updatedAt: new Date(),
            })
            .where(eq(userInvitations.id, invitationId));
        },
        principal.userId,
      );
      // createOrGetUser only emails newly created users — resend for existing ones.
      if (!provisioned.created) {
        await this.cognito.resendInvitation(provisioned.username);
      }
    } else {
      await this.cognito.resendInvitation(invitation.cognitoUsername);
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + INVITATION_RESEND_EXTEND_HOURS * 3600_000,
    );

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [updated] = await tx
          .update(userInvitations)
          .set({
            invitationTokenHash: tokenHash,
            status: "SENT",
            sentAt: invitation.sentAt ?? now,
            expiresAt,
            resendCount: invitation.resendCount + 1,
            lastResentAt: now,
            updatedAt: now,
            recordVersion: invitation.recordVersion + 1,
          })
          .where(eq(userInvitations.id, invitationId))
          .returning();
        if (!updated) {
          throw new ForgeError("NOT_FOUND", "Invitation not found");
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "user_invitation",
          aggregateId: invitationId,
          eventType: DOMAIN_EVENT_TYPES.USER_INVITATION_SENT,
          payload: { invitationId, tenantId, email: invitation.email, resent: true },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "invitation.resend",
          resourceType: "user_invitation",
          resourceId: invitationId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { resendCount: updated.resendCount, expiresAt },
        });

        return { ...sanitizeInvitation(updated), token };
      },
      principal.userId,
    );
  }

  async revoke(
    tenantId: string,
    invitationId: string,
    reason: string,
    principal: ForgePrincipal,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const invitation = await this.requireInvitation(tx, tenantId, invitationId);
        if (isTerminal(invitation.status)) {
          throw new ForgeError("CONFLICT", `Cannot revoke a ${invitation.status} invitation`);
        }
        const now = new Date();
        const [updated] = await tx
          .update(userInvitations)
          .set({
            status: "REVOKED",
            revokedAt: now,
            revokedByUserId: principal.userId,
            failureReason: reason,
            updatedAt: now,
            recordVersion: invitation.recordVersion + 1,
          })
          .where(eq(userInvitations.id, invitationId))
          .returning();
        if (!updated) {
          throw new ForgeError("NOT_FOUND", "Invitation not found");
        }

        if (invitation.membershipId) {
          await tx
            .update(userTenantMemberships)
            .set({
              status: "REVOKED",
              revokedAt: now,
              suspensionReason: reason,
              updatedAt: now,
            })
            .where(eq(userTenantMemberships.id, invitation.membershipId));
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "user_invitation",
          aggregateId: invitationId,
          eventType: DOMAIN_EVENT_TYPES.USER_INVITATION_REVOKED,
          payload: { invitationId, tenantId, email: invitation.email },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "invitation.revoke",
          resourceType: "user_invitation",
          resourceId: invitationId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          metadata: { reason },
        });

        return sanitizeInvitation(updated);
      },
      principal.userId,
    );
  }

  // -------------------------------------------------------------------------
  // Accept
  // -------------------------------------------------------------------------

  async accept(input: unknown, ids: { correlationId: string; requestId: string }) {
    const data = acceptInvitationInputSchema.parse(input);
    const tokenHash = hashToken(data.token);

    const resolved = await lookupInvitation(this.db, tokenHash);
    if (!resolved) {
      throw new ForgeError("NOT_FOUND", "Invitation not found or already used");
    }
    if (isTerminal(resolved.status)) {
      throw new ForgeError("CONFLICT", `Invitation is ${resolved.status}`);
    }
    if (resolved.expiresAt.getTime() < Date.now()) {
      await withTenantTransaction(this.db, resolved.tenantId, async (tx) => {
        await tx
          .update(userInvitations)
          .set({ status: "EXPIRED", updatedAt: new Date() })
          .where(eq(userInvitations.id, resolved.invitationId));
      });
      throw new ForgeError("BAD_REQUEST", "Invitation has expired");
    }

    return withTenantTransaction(this.db, resolved.tenantId, async (tx) => {
      const invitation = await this.requireInvitation(
        tx,
        resolved.tenantId,
        resolved.invitationId,
      );
      if (data.email && !emailsMatchForInvitationAccept(invitation.email, data.email)) {
        throw new ForgeError(
          "FORBIDDEN",
          "Accepting email does not match the invitation email",
        );
      }
      // Re-check under the tenant transaction in case of a concurrent accept.
      if (invitation.status === "ACCEPTED") {
        throw new ForgeError("CONFLICT", "Invitation has already been accepted");
      }
      if (isTerminal(invitation.status)) {
        throw new ForgeError("CONFLICT", `Invitation is ${invitation.status}`);
      }

      const now = new Date();
      const email = invitation.email.toLowerCase();
      let user = await tx.query.users.findFirst({
        where: and(eq(users.tenantId, invitation.tenantId), eq(users.primaryEmail, email)),
      });

      if (!user) {
        const userId = createId();
        const [created] = await tx
          .insert(users)
          .values({
            id: userId,
            tenantId: invitation.tenantId,
            personId: invitation.personId,
            primaryEmail: email,
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
      } else if (user.status !== "ACTIVE") {
        const [updated] = await tx
          .update(users)
          .set({
            status: "ACTIVE",
            personId: invitation.personId ?? user.personId,
            activatedAt: now,
            updatedAt: now,
          })
          .where(eq(users.id, user.id))
          .returning();
        if (!updated) {
          throw new ForgeError("INTERNAL_ERROR", "Failed to activate invited user");
        }
        user = updated;
      }

      const cognitoSubject = data.cognitoSubject ?? invitation.cognitoSubject;
      if (cognitoSubject) {
        const existingIdentity = await tx.query.authenticationIdentities.findFirst({
          where: and(
            eq(authenticationIdentities.provider, "COGNITO"),
            eq(authenticationIdentities.providerSubject, cognitoSubject),
          ),
        });
        if (existingIdentity && existingIdentity.userId !== user.id) {
          throw new ForgeError(
            "CONFLICT",
            "Cognito identity is already linked to a different user",
          );
        }
        if (!existingIdentity) {
          await tx.insert(authenticationIdentities).values({
            id: createId(),
            tenantId: invitation.tenantId,
            userId: user.id,
            provider: "COGNITO",
            providerSubject: cognitoSubject,
            emailAtLinkTime: email,
            createdAt: now,
            lastAuthenticatedAt: now,
          });
        } else {
          await tx
            .update(authenticationIdentities)
            .set({ lastAuthenticatedAt: now })
            .where(eq(authenticationIdentities.id, existingIdentity.id));
        }
      }

      const systemPrincipal: ForgePrincipal = {
        authenticationIdentityId: `invitation:${invitation.id}`,
        userId: user.id,
        personId: user.personId,
        tenantId: invitation.tenantId,
        organizationIds: invitation.organizationId ? [invitation.organizationId] : [],
        permissions: new Set(),
        activeProducts: new Set(),
        activeModules: new Set(),
        correlationId: ids.correlationId,
        requestId: ids.requestId,
        authProvider: "COGNITO",
        isPlatformAdmin: false,
      };

      if (invitation.membershipId) {
        const facilityIds = Array.isArray(invitation.facilityIdsJson)
          ? (invitation.facilityIdsJson as string[])
          : [];
        if (facilityIds.length > 0) {
          await tx
            .update(userTenantMemberships)
            .set({ facilityIdsJson: facilityIds, updatedAt: now })
            .where(eq(userTenantMemberships.id, invitation.membershipId));
        }
        await this.memberships.activateInTransaction(tx, {
          tenantId: invitation.tenantId,
          membershipId: invitation.membershipId,
          userId: user.id,
          principal: systemPrincipal,
        });
      }

      const [accepted] = await tx
        .update(userInvitations)
        .set({
          status: "ACCEPTED",
          acceptedAt: now,
          acceptedByUserId: user.id,
          cognitoSubject: cognitoSubject ?? invitation.cognitoSubject,
          updatedAt: now,
          recordVersion: invitation.recordVersion + 1,
        })
        .where(
          and(
            eq(userInvitations.id, invitation.id),
            notInArray(userInvitations.status, [...TERMINAL_INVITATION_STATUSES]),
          ),
        )
        .returning();
      if (!accepted) {
        throw new ForgeError("CONFLICT", "Invitation has already been accepted");
      }

      await this.outbox.write(tx, {
        tenantId: invitation.tenantId,
        aggregateType: "user_invitation",
        aggregateId: invitation.id,
        eventType: DOMAIN_EVENT_TYPES.USER_INVITATION_ACCEPTED,
        payload: {
          invitationId: invitation.id,
          tenantId: invitation.tenantId,
          userId: user.id,
          membershipId: invitation.membershipId,
        },
        correlationId: ids.correlationId,
        actorUserId: user.id,
      });
      await this.outbox.write(tx, {
        tenantId: invitation.tenantId,
        aggregateType: "user",
        aggregateId: user.id,
        eventType: DOMAIN_EVENT_TYPES.USER_ACTIVATED,
        payload: { userId: user.id, tenantId: invitation.tenantId },
        correlationId: ids.correlationId,
        actorUserId: user.id,
      });
      await this.audit.writeInTransaction(tx, {
        tenantId: invitation.tenantId,
        actorUserId: user.id,
        actorPersonId: user.personId,
        actorType: "USER",
        action: "invitation.accept",
        resourceType: "user_invitation",
        resourceId: invitation.id,
        result: "SUCCESS",
        riskLevel: "HIGH",
        correlationId: ids.correlationId,
        requestId: ids.requestId,
        after: {
          userId: user.id,
          membershipId: invitation.membershipId,
          cognitoLinked: Boolean(cognitoSubject),
        },
      });

      return {
        userId: user.id,
        tenantId: invitation.tenantId,
        membershipId: invitation.membershipId,
        email: user.primaryEmail,
        status: user.status,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async markExpired(
    tenantId: string,
    invitationId: string,
    principal: ForgePrincipal,
  ): Promise<void> {
    await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        await tx
          .update(userInvitations)
          .set({ status: "EXPIRED", updatedAt: new Date() })
          .where(eq(userInvitations.id, invitationId));
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "user_invitation",
          aggregateId: invitationId,
          eventType: DOMAIN_EVENT_TYPES.USER_INVITATION_EXPIRED,
          payload: { invitationId, tenantId },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
      },
      principal.userId,
    );
  }

  private async requireInvitation(
    tx: DatabaseTransaction,
    tenantId: string,
    invitationId: string,
  ) {
    const row = await tx.query.userInvitations.findFirst({
      where: and(eq(userInvitations.id, invitationId), eq(userInvitations.tenantId, tenantId)),
    });
    if (!row) {
      throw new ForgeError("NOT_FOUND", "Invitation not found");
    }
    return row;
  }

  private async assertFacilitiesInTenant(
    tx: DatabaseTransaction,
    tenantId: string,
    facilityIds: readonly string[],
  ): Promise<void> {
    const unique = [...new Set(facilityIds)];
    if (unique.length === 0) return;
    const rows = await tx
      .select({ id: facilities.id })
      .from(facilities)
      .where(and(eq(facilities.tenantId, tenantId), inArray(facilities.id, unique)));
    if (rows.length !== unique.length) {
      throw new ForgeError(
        "BAD_REQUEST",
        "One or more facilityIds do not belong to this tenant",
      );
    }
  }
}

/** Strips hash and Cognito credential material from API responses. */
function sanitizeInvitation<T extends Record<string, unknown>>(invitation: T) {
  const {
    invitationTokenHash: _hash,
    ...rest
  } = invitation as T & { invitationTokenHash?: string };
  return rest;
}

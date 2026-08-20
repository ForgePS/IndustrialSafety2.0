import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialPersonnel,
  membershipRoleAssignments,
  persons,
  roles,
  users,
  userTenantMemberships,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import {
  buildAuthProfileDisplayName,
  canEditAuthProfile,
  dateOnly,
  type AuthProfile,
  type AuthProfileRole,
} from "./auth-profile.js";

type ExpectedVersion = number | "*";

/** Match industrial-web personnel signature capture limits. */
const MAX_SIGNATURE_DATA_URL_LENGTH = 200_000;

const signatureUrlSchema = z
  .union([
    z.literal(""),
    z.null(),
    z
      .string()
      .max(MAX_SIGNATURE_DATA_URL_LENGTH)
      .refine(
        (value) => {
          const trimmed = value.trim();
          if (trimmed === "") return true;
          if (/^https?:\/\//i.test(trimmed)) return trimmed.length <= 2_000;
          return trimmed.startsWith("data:image/");
        },
        { message: "Signature must be an image data URL or http(s) URL" },
      ),
  ])
  .optional();

const patchProfileSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional().nullable(),
  suffix: z.string().max(40).optional().nullable(),
  preferredName: z.string().max(100).optional().nullable(),
  email: z
    .union([z.string().email().max(320), z.literal("")])
    .optional()
    .nullable(),
  phone: z.string().max(40).optional().nullable(),
  dateOfBirth: z
    .union([
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/),
      z.literal(""),
    ])
    .optional()
    .nullable(),
  username: z.string().min(1).max(100).optional().nullable(),
  /** When set, updates the linked industrial personnel signature on file. */
  signatureUrl: signatureUrlSchema,
});

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function generateForgePersonNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `FP-${stamp}-${rand}`;
}

@Injectable()
export class AuthProfileService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async get(principal: ForgePrincipal): Promise<AuthProfile> {
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const user = await tx.query.users.findFirst({
        where: eq(users.id, principal.userId),
      });
      const person =
        user?.personId ?? principal.personId
          ? await tx.query.persons.findFirst({
              where: and(
                eq(persons.id, (user?.personId ?? principal.personId)!),
                eq(persons.tenantId, principal.tenantId),
              ),
            })
          : null;
      const personnel = await this.findPersonnel(
        tx,
        principal.tenantId,
        principal.userId,
        user?.primaryEmail ?? null,
      );
      const roleList = await this.loadRoles(tx, principal.tenantId, principal.userId);
      return this.toProfile(
        principal,
        user ?? null,
        person ?? null,
        personnel?.id ?? null,
        personnel?.signatureUrl ?? null,
        roleList,
      );
    }, principal.userId);
  }

  async patch(
    principal: ForgePrincipal,
    input: unknown,
    expectedVersion: ExpectedVersion,
  ): Promise<AuthProfile> {
    if (!canEditAuthProfile(principal, principal.userId)) {
      throw new ForgeError("FORBIDDEN", "You do not have permission to edit this profile");
    }
    const data = patchProfileSchema.parse(input);
    return withTenantTransaction(this.db, principal.tenantId, async (tx) => {
      const user = await tx.query.users.findFirst({
        where: eq(users.id, principal.userId),
      });
      if (!user) {
        throw new ForgeError("NOT_FOUND", "User not found on this tenant");
      }

      const now = new Date();
      const firstName = data.firstName.trim();
      const lastName = data.lastName.trim();
      const middleName = blankToNull(data.middleName);
      const suffix = blankToNull(data.suffix);
      const preferredName = blankToNull(data.preferredName);
      const email = blankToNull(data.email);
      const phone = blankToNull(data.phone);
      const dateOfBirth = blankToNull(data.dateOfBirth);
      const displayName = buildAuthProfileDisplayName({
        firstName,
        lastName,
        middleName,
        suffix,
        preferredName,
      });

      let personId = user.personId;
      let person = personId
        ? await tx.query.persons.findFirst({
            where: and(eq(persons.id, personId), eq(persons.tenantId, principal.tenantId)),
          })
        : null;

      if (person) {
        const version = person.recordVersion;
        if (expectedVersion !== "*" && version !== expectedVersion) {
          throw concurrencyConflict({
            tenantId: principal.tenantId,
            resourceType: "person",
            resourceId: person.id,
            expectedVersion,
            actualVersion: version,
          });
        }
        const [updated] = await tx
          .update(persons)
          .set({
            firstName,
            lastName,
            middleName,
            suffix,
            preferredName,
            email,
            phone,
            dateOfBirth,
            displayName,
            recordVersion: version + 1,
            updatedAt: now,
          })
          .where(and(eq(persons.id, person.id), eq(persons.recordVersion, version)))
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId: principal.tenantId,
            resourceType: "person",
            resourceId: person.id,
            expectedVersion,
            actualVersion: null,
          });
        }
        person = updated;
      } else {
        personId = createId();
        const [created] = await tx
          .insert(persons)
          .values({
            id: personId,
            tenantId: principal.tenantId,
            forgePersonNumber: generateForgePersonNumber(),
            firstName,
            lastName,
            middleName,
            suffix,
            preferredName,
            email: email ?? user.primaryEmail,
            phone,
            dateOfBirth,
            displayName,
            recordSource: "MANUAL",
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!created) {
          throw new ForgeError("INTERNAL_ERROR", "Failed to create person profile");
        }
        person = created;
        await tx
          .update(users)
          .set({ personId, updatedAt: now })
          .where(eq(users.id, user.id));
      }

      if (data.username !== undefined) {
        await tx
          .update(users)
          .set({ username: blankToNull(data.username), updatedAt: now })
          .where(eq(users.id, user.id));
      }

      const personnel = await this.findPersonnel(
        tx,
        principal.tenantId,
        principal.userId,
        user.primaryEmail,
      );
      const personnelId = personnel?.id ?? null;
      const nextSignatureUrl =
        data.signatureUrl !== undefined
          ? blankToNull(typeof data.signatureUrl === "string" ? data.signatureUrl : null)
          : (personnel?.signatureUrl ?? null);
      if (data.signatureUrl !== undefined && !personnelId) {
        throw new ForgeError(
          "BAD_REQUEST",
          "A linked personnel record is required before saving a profile signature",
        );
      }
      if (personnelId) {
        await tx
          .update(industrialPersonnel)
          .set({
            firstName,
            lastName,
            middleName,
            suffix,
            preferredName,
            email: email ?? user.primaryEmail,
            phone,
            displayName,
            ...(data.signatureUrl !== undefined ? { signatureUrl: nextSignatureUrl } : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, principal.tenantId),
            ),
          );
      }

      const refreshedUser = await tx.query.users.findFirst({
        where: eq(users.id, principal.userId),
      });
      await this.audit.writeInTransaction(tx, {
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorPersonId: person.id,
        actorType: "USER",
        action: "auth.profile.update",
        resourceType: "person",
        resourceId: person.id,
        result: "SUCCESS",
        riskLevel: "LOW",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: { personId: person.id, userId: principal.userId },
      });
      const roleList = await this.loadRoles(tx, principal.tenantId, principal.userId);
      return this.toProfile(
        principal,
        refreshedUser ?? user,
        person,
        personnelId,
        nextSignatureUrl,
        roleList,
      );
    }, principal.userId);
  }

  private async findPersonnel(
    tx: DatabaseTransaction,
    tenantId: string,
    userId: string,
    email: string | null,
  ): Promise<{ id: string; signatureUrl: string | null } | null> {
    const emailMatch =
      email && email.trim() !== "" ? ilike(industrialPersonnel.email, email.trim()) : undefined;
    const [row] = await tx
      .select({
        id: industrialPersonnel.id,
        signatureUrl: industrialPersonnel.signatureUrl,
        sourcePayload: industrialPersonnel.sourcePayload,
      })
      .from(industrialPersonnel)
      .where(
        and(
          eq(industrialPersonnel.tenantId, tenantId),
          isNull(industrialPersonnel.archivedAt),
          emailMatch
            ? or(eq(industrialPersonnel.userAuthId, userId), emailMatch)
            : eq(industrialPersonnel.userAuthId, userId),
        ),
      )
      .limit(1);
    if (!row) return null;
    const fromColumn =
      typeof row.signatureUrl === "string" && row.signatureUrl.trim() !== ""
        ? row.signatureUrl.trim()
        : null;
    let fromPayload: string | null = null;
    const payload = row.sourcePayload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const raw = (payload as Record<string, unknown>).signatureUrl;
      if (typeof raw === "string" && raw.trim() !== "") fromPayload = raw.trim();
    }
    return { id: row.id, signatureUrl: fromColumn ?? fromPayload };
  }

  private async loadRoles(
    tx: DatabaseTransaction,
    tenantId: string,
    userId: string,
  ): Promise<AuthProfileRole[]> {
    const membership = await tx.query.userTenantMemberships.findFirst({
      where: and(
        eq(userTenantMemberships.tenantId, tenantId),
        eq(userTenantMemberships.userId, userId),
      ),
    });
    if (!membership) return [];
    const rows = await tx
      .select({
        roleCode: roles.code,
        roleName: roles.name,
      })
      .from(membershipRoleAssignments)
      .innerJoin(roles, eq(roles.id, membershipRoleAssignments.roleId))
      .where(
        and(
          eq(membershipRoleAssignments.tenantId, tenantId),
          eq(membershipRoleAssignments.membershipId, membership.id),
          inArray(membershipRoleAssignments.status, ["ACTIVE", "PENDING"]),
        ),
      )
      .orderBy(roles.name);
    return rows;
  }

  private toProfile(
    principal: ForgePrincipal,
    user: {
      id: string;
      username: string | null;
      primaryEmail: string;
      status: string;
      lastLoginAt: Date | null;
      personId: string | null;
    } | null,
    person: {
      id: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
      suffix: string | null;
      preferredName: string | null;
      displayName: string;
      email: string | null;
      phone: string | null;
      dateOfBirth: unknown;
      recordVersion: number;
    } | null,
    personnelId: string | null,
    signatureUrl: string | null,
    roleList: AuthProfileRole[],
  ): AuthProfile {
    const userId = user?.id ?? principal.userId;
    return {
      userId,
      tenantId: principal.tenantId,
      username: user?.username ?? null,
      accountEmail: user?.primaryEmail ?? "",
      status: user?.status ?? "ACTIVE",
      lastLoginAt: user?.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      personId: person?.id ?? user?.personId ?? principal.personId,
      personnelId,
      signatureUrl,
      firstName: person?.firstName ?? "",
      middleName: person?.middleName ?? null,
      lastName: person?.lastName ?? "",
      suffix: person?.suffix ?? null,
      preferredName: person?.preferredName ?? null,
      displayName:
        person?.displayName ??
        buildAuthProfileDisplayName({
          firstName: person?.firstName ?? "",
          lastName: person?.lastName ?? "",
        }),
      email: person?.email ?? user?.primaryEmail ?? null,
      phone: person?.phone ?? null,
      dateOfBirth: dateOnly(person?.dateOfBirth ?? null),
      recordVersion: person?.recordVersion ?? 1,
      roles: roleList,
      isPlatformAdmin: principal.isPlatformAdmin,
      canEdit: Boolean(user) && canEditAuthProfile(principal, userId),
    };
  }
}

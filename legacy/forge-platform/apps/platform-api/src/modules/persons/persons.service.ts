import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { maskSensitiveValue } from "@forge/audit";
import { createPersonInputSchema, type CreatePersonInput } from "@forge/contracts";
import {
  createId,
  personDuplicateCandidates,
  personMergeHistory,
  personSensitiveData,
  persons,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { concurrencyConflict } from "../../common/concurrency.js";
import { SensitiveDataService } from "../../common/sensitive-data.service.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

type ExpectedVersion = number | "*";

const patchSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  middleName: z.string().max(100).optional().nullable(),
  lastName: z.string().min(1).max(100).optional(),
  suffix: z.string().max(40).optional().nullable(),
  preferredName: z.string().max(100).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
});

const mergeSchema = z.object({
  sourcePersonId: z.string().uuid(),
  targetPersonId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
});

const sensitiveSchema = z.object({
  dataType: z.string().min(1).max(64),
  value: z.string().min(1).max(500),
});

function buildDisplayName(input: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  preferredName?: string | null;
}): string {
  if (input.preferredName?.trim()) {
    return input.preferredName.trim();
  }
  const parts = [input.firstName, input.middleName, input.lastName].filter((p): p is string =>
    Boolean(p && String(p).trim()),
  );
  const base = parts.join(" ");
  return input.suffix ? `${base} ${input.suffix}` : base;
}

function generateForgePersonNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `FP-${stamp}-${rand}`;
}

@Injectable()
export class PersonsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly sensitive: SensitiveDataService,
  ) {}

  async create(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createPersonInputSchema.parse(input) as CreatePersonInput;
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const id = createId();
        const forgePersonNumber = generateForgePersonNumber();
        const displayName = buildDisplayName({
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName ?? null,
          suffix: data.suffix ?? null,
          preferredName: data.preferredName ?? null,
        });
        const now = new Date();
        const [row] = await tx
          .insert(persons)
          .values({
            id,
            tenantId,
            forgePersonNumber,
            firstName: data.firstName,
            middleName: data.middleName,
            lastName: data.lastName,
            suffix: data.suffix,
            preferredName: data.preferredName,
            displayName,
            email: data.email,
            phone: data.phone,
            dateOfBirth: data.dateOfBirth,
            recordSource: data.recordSource ?? "MANUAL",
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) {
          throw new ForgeError("INTERNAL_ERROR", "Failed to create person");
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "person",
          aggregateId: id,
          eventType: DOMAIN_EVENT_TYPES.PERSON_CREATED,
          payload: {
            personId: id,
            tenantId,
            forgePersonNumber,
            displayName,
          },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "person.create",
          resourceType: "person",
          resourceId: id,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: row,
        });
        return row;
      },
      principal.userId,
    );
  }

  async list(tenantId: string, search?: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      if (search?.trim()) {
        const q = `%${search.trim()}%`;
        return tx.query.persons.findMany({
          where: and(
            eq(persons.tenantId, tenantId),
            or(
              ilike(persons.displayName, q),
              ilike(persons.firstName, q),
              ilike(persons.lastName, q),
              ilike(persons.email, q),
              ilike(persons.forgePersonNumber, q),
            ),
          ),
          limit: 100,
        });
      }
      return tx.query.persons.findMany({
        where: eq(persons.tenantId, tenantId),
        limit: 100,
        orderBy: (t, { asc }) => [asc(t.lastName), asc(t.firstName)],
      });
    });
  }

  async get(tenantId: string, personId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await tx.query.persons.findFirst({
        where: and(eq(persons.id, personId), eq(persons.tenantId, tenantId)),
      });
      if (!row) {
        throw new ForgeError("NOT_FOUND", "Person not found");
      }
      return row;
    });
  }

  async patch(
    tenantId: string,
    personId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = patchSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.persons.findFirst({
          where: and(eq(persons.id, personId), eq(persons.tenantId, tenantId)),
        });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Person not found");
        }
        const version = before.recordVersion;
        if (expectedVersion !== "*" && version !== expectedVersion) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "person",
            resourceId: personId,
            expectedVersion,
            actualVersion: version,
          });
        }
        const displayName = buildDisplayName({
          firstName: data.firstName ?? before.firstName,
          lastName: data.lastName ?? before.lastName,
          middleName: data.middleName !== undefined ? data.middleName : before.middleName,
          suffix: data.suffix !== undefined ? data.suffix : before.suffix,
          preferredName:
            data.preferredName !== undefined ? data.preferredName : before.preferredName,
        });
        const [updated] = await tx
          .update(persons)
          .set({ ...data, displayName, recordVersion: version + 1, updatedAt: new Date() })
          .where(and(eq(persons.id, personId), eq(persons.recordVersion, version)))
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "person",
            resourceId: personId,
            expectedVersion,
            actualVersion: null,
          });
        }

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "person",
          aggregateId: personId,
          eventType: DOMAIN_EVENT_TYPES.PERSON_UPDATED,
          payload: { personId, tenantId },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "person.update",
          resourceType: "person",
          resourceId: personId,
          result: "SUCCESS",
          riskLevel: "LOW",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          before,
          after: updated,
        });
        return updated;
      },
      principal.userId,
    );
  }

  async archive(
    tenantId: string,
    personId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await tx.query.persons.findFirst({
          where: and(eq(persons.id, personId), eq(persons.tenantId, tenantId)),
        });
        if (!before) {
          throw new ForgeError("NOT_FOUND", "Person not found");
        }
        const version = before.recordVersion;
        if (expectedVersion !== "*" && version !== expectedVersion) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "person",
            resourceId: personId,
            expectedVersion,
            actualVersion: version,
          });
        }
        const now = new Date();
        const [updated] = await tx
          .update(persons)
          .set({
            status: "ARCHIVED",
            archivedAt: now,
            recordVersion: version + 1,
            updatedAt: now,
          })
          .where(and(eq(persons.id, personId), eq(persons.recordVersion, version)))
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "person",
            resourceId: personId,
            expectedVersion,
            actualVersion: null,
          });
        }
        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "person",
          aggregateId: personId,
          eventType: DOMAIN_EVENT_TYPES.PERSON_ARCHIVED,
          payload: { personId, tenantId },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        return updated;
      },
      principal.userId,
    );
  }

  async listDuplicateCandidates(tenantId: string, personId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.personDuplicateCandidates.findMany({
        where: and(
          eq(personDuplicateCandidates.tenantId, tenantId),
          or(
            eq(personDuplicateCandidates.personAId, personId),
            eq(personDuplicateCandidates.personBId, personId),
          ),
        ),
      });
    });
  }

  async merge(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = mergeSchema.parse(input);
    if (data.sourcePersonId === data.targetPersonId) {
      throw new ForgeError("BAD_REQUEST", "Source and target person must differ");
    }
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const source = await tx.query.persons.findFirst({
          where: and(eq(persons.id, data.sourcePersonId), eq(persons.tenantId, tenantId)),
        });
        const target = await tx.query.persons.findFirst({
          where: and(eq(persons.id, data.targetPersonId), eq(persons.tenantId, tenantId)),
        });
        if (!source || !target) {
          throw new ForgeError("NOT_FOUND", "Source or target person not found");
        }
        const now = new Date();
        await tx
          .update(persons)
          .set({
            status: "MERGED",
            mergedIntoPersonId: target.id,
            archivedAt: now,
            updatedAt: now,
          })
          .where(eq(persons.id, source.id));

        const historyId = createId();
        await tx.insert(personMergeHistory).values({
          id: historyId,
          tenantId,
          sourcePersonId: source.id,
          targetPersonId: target.id,
          reason: data.reason,
          fieldResolutionJson: {},
          mergedByUserId: principal.userId,
          mergedAt: now,
        });

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "person",
          aggregateId: target.id,
          eventType: DOMAIN_EVENT_TYPES.PERSON_MERGED,
          payload: {
            sourcePersonId: source.id,
            targetPersonId: target.id,
            tenantId,
          },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "person.merge",
          resourceType: "person",
          resourceId: target.id,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          metadata: { sourcePersonId: source.id, targetPersonId: target.id },
        });
        return { historyId, sourcePersonId: source.id, targetPersonId: target.id };
      },
      principal.userId,
    );
  }

  async putSensitiveIdentifier(
    tenantId: string,
    personId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = sensitiveSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const person = await tx.query.persons.findFirst({
          where: and(eq(persons.id, personId), eq(persons.tenantId, tenantId)),
        });
        if (!person) {
          throw new ForgeError("NOT_FOUND", "Person not found");
        }
        const encrypted = await this.sensitive.encrypt(data.value, {
          tenantId,
          personId,
          dataType: data.dataType,
        });
        const fingerprint = this.sensitive.fingerprint(data.value, data.dataType);
        const id = createId();
        await tx
          .insert(personSensitiveData)
          .values({
            id,
            tenantId,
            personId,
            dataType: data.dataType,
            encryptedValue: JSON.stringify(encrypted),
            valueFingerprint: fingerprint,
            keyVersion: encrypted.keyVersion,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [personSensitiveData.personId, personSensitiveData.dataType],
            set: {
              encryptedValue: JSON.stringify(encrypted),
              valueFingerprint: fingerprint,
              keyVersion: encrypted.keyVersion,
              updatedAt: new Date(),
            },
          });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "person.sensitive_identifier.write",
          resourceType: "person_sensitive_data",
          resourceId: personId,
          result: "SUCCESS",
          riskLevel: "CRITICAL",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          metadata: {
            dataType: data.dataType,
            masked: maskSensitiveValue(data.dataType, data.value),
          },
        });

        return {
          personId,
          dataType: data.dataType,
          maskedValue: maskSensitiveValue(data.dataType, data.value),
          keyVersion: encrypted.keyVersion,
        };
      },
      principal.userId,
    );
  }

  async getSensitiveIdentifier(
    tenantId: string,
    personId: string,
    dataType: string,
    principal: ForgePrincipal,
    reveal: boolean,
    reason?: string,
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const row = await tx.query.personSensitiveData.findFirst({
          where: and(
            eq(personSensitiveData.tenantId, tenantId),
            eq(personSensitiveData.personId, personId),
            eq(personSensitiveData.dataType, dataType),
          ),
        });
        if (!row) {
          throw new ForgeError("NOT_FOUND", "Sensitive identifier not found");
        }

        const payload = JSON.parse(row.encryptedValue) as {
          ciphertext: string;
          keyVersion: string;
          algorithm: "AES-256-GCM" | "AWS-KMS";
        };
        const plaintext = await this.sensitive.decrypt(payload, {
          tenantId,
          personId,
          dataType,
        });

        await tx
          .update(personSensitiveData)
          .set({ lastAccessedAt: new Date() })
          .where(eq(personSensitiveData.id, row.id));

        const canReveal =
          reveal &&
          principal.permissions.has("platform.sensitive_data.read") &&
          Boolean(reason?.trim());

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: canReveal
            ? "person.sensitive_identifier.reveal"
            : "person.sensitive_identifier.read",
          resourceType: "person_sensitive_data",
          resourceId: personId,
          result: "SUCCESS",
          riskLevel: "CRITICAL",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          metadata: { dataType, reason: reason ?? null, revealed: canReveal },
        });

        return {
          personId,
          dataType,
          maskedValue: maskSensitiveValue(dataType, plaintext),
          value: canReveal ? plaintext : undefined,
          keyVersion: row.keyVersion,
        };
      },
      principal.userId,
    );
  }
}

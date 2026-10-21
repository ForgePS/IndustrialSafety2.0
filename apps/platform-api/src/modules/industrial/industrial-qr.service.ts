import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialPersonnelSmsConsents,
  industrialQrLinkAuditEvents,
  industrialQrLinkScanEvents,
  qrLinks,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { EMERGENCY_SMS_SIGNUP_QR_TARGET } from "@forge/contracts";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { qrCodePngBuffer } from "./qr-svg.js";
import {
  openPortalToken,
  readSealedPortalToken,
  withoutSealedPortalToken,
  withSealedPortalToken,
} from "./portal-token-crypto.js";
import { defaultQrActionConfigFlags } from "./qr-action-config.js";
import {
  assertQrLinkStatus,
  generateDisplayCode,
  generatePublicToken,
  hashPublicToken,
  isValidPublicToken,
  normalizeQrAccessMode,
  parseOptionalUuid,
  publicTokenHint,
  resolveQrAccessModeForTarget,
  type QrAuditEventType,
} from "./qr-token.js";

type ListQuery = Record<string, string | undefined>;
type DbTx = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

function pageParams(query: ListQuery) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function assertId(id: string): string {
  const parsed = parseOptionalUuid(id);
  if (!parsed) throw new ForgeError("VALIDATION_FAILED", "Invalid QR link id");
  return parsed;
}

function mapQrLink(row: typeof qrLinks.$inferSelect, extras?: { publicToken?: string }) {
  const actionConfig = (row.actionConfig ?? {}) as Record<string, unknown>;
  const sealed = readSealedPortalToken(row.metadata);
  const fromSeal =
    sealed && row.tenantId ? openPortalToken(row.tenantId, sealed) : null;
  // Prefer explicit token, then sealed plaintext that still matches the stored hash.
  let publicToken = extras?.publicToken ?? undefined;
  if (!publicToken && fromSeal && row.tokenHash && hashPublicToken(fromSeal) === row.tokenHash) {
    publicToken = fromSeal;
  }
  return {
    id: row.id,
    name: row.label ?? row.displayCode ?? "QR link",
    label: row.label,
    displayCode: row.displayCode,
    description: row.description,
    status: row.status,
    qrType: row.accessMode,
    accessMode: row.accessMode,
    targetType: row.targetType,
    targetId: row.targetId,
    siteId: row.siteId,
    departmentId: row.departmentId,
    replacementQrId: row.replacementQrId,
    scanCount: row.scanCount,
    lastScannedAt: row.lastScannedAt,
    activatedAt: row.activatedAt,
    deactivatedAt: row.deactivatedAt,
    tokenIssuedAt: row.tokenIssuedAt,
    publicTokenHint: publicTokenHint(row.tokenHash),
    publicToken,
    ...(publicToken ? { token: publicToken } : {}),
    actionConfig,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class IndustrialQrService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  private industrialAppBaseUrl(override?: string | null): string {
    const raw =
      (typeof override === "string" && override.trim()) ||
      process.env.FORGE_INDUSTRIAL_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://producersrice.forgeindustrialsafety.com";
    let normalized = raw.trim().replace(/\/+$/, "");
    try {
      normalized = new URL(normalized).origin;
    } catch {
      // keep trimmed string when override is not a full URL
    }
    if (!/^https?:\/\//i.test(normalized)) {
      throw new ForgeError(
        "VALIDATION_FAILED",
        "Industrial app URL must start with http:// or https://.",
      );
    }
    return normalized;
  }

  private scanPublicUrl(token: string, appBaseUrl?: string | null): string {
    return `${this.industrialAppBaseUrl(appBaseUrl)}/scan/${encodeURIComponent(token)}`;
  }

  private async appendAudit(
    tx: DbTx,
    tenantId: string,
    qrLinkId: string | null,
    eventType: QrAuditEventType,
    actorUserId: string | null,
    details: Record<string, unknown> = {},
  ) {
    const now = new Date();
    await tx.insert(industrialQrLinkAuditEvents).values({
      id: createId(),
      tenantId,
      qrLinkId,
      eventType,
      eventAt: now,
      actorUserId,
      details,
      sourceSystem: "FORGE",
      createdAt: now,
      updatedAt: now,
    });
  }

  private async getRow(tx: DbTx, tenantId: string, id: string) {
    const [row] = await tx
      .select()
      .from(qrLinks)
      .where(
        and(eq(qrLinks.id, id), eq(qrLinks.tenantId, tenantId), isNull(qrLinks.archivedAt)),
      )
      .limit(1);
    if (!row) throw new ForgeError("NOT_FOUND", "QR link not found");
    return row;
  }

  async listQrLinks(principal: ForgePrincipal, query: ListQuery = {}) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conds = [eq(qrLinks.tenantId, tenantId), isNull(qrLinks.archivedAt)];
      if (query.status) conds.push(eq(qrLinks.status, assertQrLinkStatus(query.status)));
      if (query.targetType) conds.push(eq(qrLinks.targetType, query.targetType.trim()));
      if (query.q?.trim()) {
        const q = `%${query.q.trim().toLowerCase()}%`;
        conds.push(
          sql`(lower(coalesce(${qrLinks.label}, '')) like ${q} or lower(coalesce(${qrLinks.displayCode}, '')) like ${q})`,
        );
      }
      const rows = await tx
        .select()
        .from(qrLinks)
        .where(and(...conds))
        .orderBy(desc(qrLinks.updatedAt))
        .limit(pageSize)
        .offset(offset);
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(qrLinks)
        .where(and(...conds));
      return {
        items: rows.map((row) => mapQrLink(row)),
        page,
        pageSize,
        total: countRow?.count ?? rows.length,
      };
    });
  }

  async getQrLink(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await this.getRow(tx, tenantId, recordId);
      return mapQrLink(row);
    });
  }

  async createQrLink(principal: ForgePrincipal, body: Record<string, unknown> = {}) {
    const tenantId = this.tenant(principal);
    const label = String(body.name ?? body.label ?? "").trim();
    if (!label) throw new ForgeError("VALIDATION_FAILED", "name is required");

    const target = (body.target ?? {}) as Record<string, unknown>;
    const targetType = String(target.targetType ?? body.targetType ?? "").trim() || null;
    const targetId = parseOptionalUuid(target.targetId ?? body.targetId);
    const accessMode = resolveQrAccessModeForTarget(
      targetType,
      String(body.qrType ?? body.accessMode ?? target.resolutionMode ?? ""),
    );
    const isLoto = String(targetType ?? "").toUpperCase() === "LOTO_PROCEDURE";
    const isVehicle = String(targetType ?? "").toUpperCase() === "VEHICLE";
    const actionConfig: Record<string, unknown> = {
      ...defaultQrActionConfigFlags(),
      ...(typeof body.actionConfig === "object" && body.actionConfig
        ? (body.actionConfig as Record<string, unknown>)
        : {}),
      resolutionMode:
        typeof target.resolutionMode === "string" ? target.resolutionMode : undefined,
      isPublic: body.isPublic === true || isLoto || isVehicle,
    };
    if (isLoto) {
      actionConfig.viewLoto = true;
      actionConfig.reportIssue = true;
      if (targetId) actionConfig.lotoProcedureId = targetId;
    }
    if (isVehicle) {
      actionConfig.reportIssue = true;
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(qrLinks)
        .values({
          id: createId(),
          tenantId,
          label,
          displayCode:
            String(body.displayCode ?? "").trim() ||
            generateDisplayCode(),
          description: String(body.description ?? "").trim() || null,
          status: "ACTIVE",
          accessMode,
          actionConfig,
          targetType,
          targetId,
          siteId: parseOptionalUuid(body.siteId),
          departmentId: parseOptionalUuid(body.departmentId),
          createdByUserId: principal.userId ?? null,
          activatedAt: now,
          metadata:
            typeof body.metadata === "object" && body.metadata
              ? (body.metadata as Record<string, unknown>)
              : {},
          sourceSystem: "FORGE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await this.appendAudit(tx, tenantId, row!.id, "CREATED", principal.userId ?? null, {
        label,
        targetType,
        targetId,
      });

      let publicToken: string | undefined;
      const shouldIssue =
        body.isPublic === true || body.issueToken === true || isLoto || isVehicle;
      if (shouldIssue) {
        const issued = await this.issueTokenTx(
          tx,
          tenantId,
          row!,
          principal.userId ?? null,
          typeof body.appBaseUrl === "string" ? body.appBaseUrl : null,
        );
        publicToken = issued.publicToken;
        return { ...mapQrLink(issued.row, { publicToken }), url: issued.url };
      }

      return mapQrLink(row!);
    });
  }

  async updateQrLink(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown> = {},
  ) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.getRow(tx, tenantId, recordId);
      const patch: Partial<typeof qrLinks.$inferInsert> = { updatedAt: new Date() };
      let accessModeChanged = false;
      let actionConfigChanged = false;
      let assigned = false;
      if (body.name !== undefined || body.label !== undefined) {
        const label = String(body.name ?? body.label ?? "").trim();
        if (!label) throw new ForgeError("VALIDATION_FAILED", "name is required");
        patch.label = label;
      }
      if (body.description !== undefined) {
        patch.description = String(body.description ?? "").trim() || null;
      }
      if (body.targetType !== undefined) {
        patch.targetType = String(body.targetType ?? "").trim() || null;
        assigned = true;
      }
      if (body.targetId !== undefined) {
        patch.targetId = parseOptionalUuid(body.targetId);
        assigned = true;
      }
      if (body.siteId !== undefined) patch.siteId = parseOptionalUuid(body.siteId);
      if (body.departmentId !== undefined) {
        patch.departmentId = parseOptionalUuid(body.departmentId);
      }
      if (body.accessMode !== undefined || body.qrType !== undefined) {
        const nextTargetType =
          body.targetType !== undefined
            ? String(body.targetType ?? "").trim() || null
            : existing.targetType;
        patch.accessMode = resolveQrAccessModeForTarget(
          nextTargetType,
          String(body.accessMode ?? body.qrType ?? ""),
        );
        accessModeChanged = patch.accessMode !== existing.accessMode;
      } else if (body.targetType !== undefined) {
        // Retargeting onto LOTO / fleet must promote to public even if accessMode wasn't sent.
        const forced = resolveQrAccessModeForTarget(patch.targetType ?? existing.targetType, existing.accessMode);
        if (forced !== existing.accessMode) {
          patch.accessMode = forced;
          accessModeChanged = true;
        }
      }
      if (body.actionConfig !== undefined && typeof body.actionConfig === "object") {
        patch.actionConfig = body.actionConfig as Record<string, unknown>;
        actionConfigChanged = true;
      }
      if (body.metadata !== undefined && typeof body.metadata === "object") {
        patch.metadata = body.metadata as Record<string, unknown>;
      }

      const [row] = await tx
        .update(qrLinks)
        .set(patch)
        .where(and(eq(qrLinks.id, recordId), eq(qrLinks.tenantId, tenantId)))
        .returning();
      await this.appendAudit(tx, tenantId, recordId, "UPDATED", principal.userId ?? null, patch);
      if (accessModeChanged) {
        await this.appendAudit(
          tx,
          tenantId,
          recordId,
          "ACCESS_MODE_CHANGED",
          principal.userId ?? null,
          { before: existing.accessMode, after: patch.accessMode },
        );
      }
      if (actionConfigChanged) {
        await this.appendAudit(
          tx,
          tenantId,
          recordId,
          "ACTION_CONFIGURATION_CHANGED",
          principal.userId ?? null,
          { actionConfig: patch.actionConfig },
        );
      }
      if (assigned) {
        await this.appendAudit(tx, tenantId, recordId, "ASSIGNED", principal.userId ?? null, {
          targetType: patch.targetType ?? existing.targetType,
          targetId: patch.targetId ?? existing.targetId,
        });
      }
      return mapQrLink(row!);
    });
  }

  private async issueTokenTx(
    tx: DbTx,
    tenantId: string,
    existing: typeof qrLinks.$inferSelect,
    actorUserId: string | null,
    appBaseUrl?: string | null,
  ) {
    if (existing.status !== "ACTIVE") {
      throw new ForgeError("VALIDATION_FAILED", "Only ACTIVE QR links can receive a public token.");
    }
    // Reuse the sealed plaintext token when present so reprint / PUBLIC upgrades do not
    // rotate the hash and invalidate stickers already in the field.
    const sealed = readSealedPortalToken(existing.metadata);
    if (sealed) {
      const existingToken = openPortalToken(tenantId, sealed);
      if (
        existingToken &&
        isValidPublicToken(existingToken) &&
        existing.tokenHash &&
        hashPublicToken(existingToken) === existing.tokenHash
      ) {
        return {
          row: existing,
          publicToken: existingToken,
          url: this.scanPublicUrl(existingToken, appBaseUrl),
        };
      }
    }
    // A stored hash without recoverable plaintext means stickers already exist.
    // Never silently rotate — that would make printed QR codes 404.
    if (existing.tokenHash) {
      throw new ForgeError(
        "CONFLICT",
        "This QR link already has a public token that cannot be recovered for reprint. Revoke the token, then issue a new one and reprint stickers.",
      );
    }

    const publicToken = generatePublicToken();
    const tokenHash = hashPublicToken(publicToken);
    const now = new Date();
    const metadata = withSealedPortalToken(existing.metadata, tenantId, publicToken);
    const [row] = await tx
      .update(qrLinks)
      .set({
        tokenHash,
        tokenIssuedAt: now,
        metadata,
        updatedAt: now,
      })
      .where(and(eq(qrLinks.id, existing.id), eq(qrLinks.tenantId, tenantId)))
      .returning();
    await this.appendAudit(tx, tenantId, existing.id, "TOKEN_ISSUED", actorUserId, {
      tokenHint: publicTokenHint(tokenHash),
    });
    return {
      row: row!,
      publicToken,
      url: this.scanPublicUrl(publicToken, appBaseUrl),
    };
  }

  async issueToken(principal: ForgePrincipal, id: string, body: Record<string, unknown> = {}) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.getRow(tx, tenantId, recordId);
      const issued = await this.issueTokenTx(
        tx,
        tenantId,
        existing,
        principal.userId ?? null,
        typeof body.appBaseUrl === "string" ? body.appBaseUrl : null,
      );
      return {
        ...mapQrLink(issued.row, { publicToken: issued.publicToken }),
        token: issued.publicToken,
        url: issued.url,
      };
    });
  }

  async revokeToken(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.getRow(tx, tenantId, recordId);
      const now = new Date();
      const [row] = await tx
        .update(qrLinks)
        .set({
          tokenHash: null,
          tokenIssuedAt: null,
          metadata: withoutSealedPortalToken(existing.metadata ?? {}),
          updatedAt: now,
        })
        .where(and(eq(qrLinks.id, recordId), eq(qrLinks.tenantId, tenantId)))
        .returning();
      await this.appendAudit(tx, tenantId, recordId, "TOKEN_REVOKED", principal.userId ?? null);
      return mapQrLink(row!);
    });
  }

  async replaceQrLink(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown> = {},
  ) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.getRow(tx, tenantId, recordId);
      const now = new Date();
      const [replacement] = await tx
        .insert(qrLinks)
        .values({
          id: createId(),
          tenantId,
          label: existing.label,
          displayCode: generateDisplayCode(),
          description: existing.description,
          status: "ACTIVE",
          accessMode: existing.accessMode,
          actionConfig: existing.actionConfig,
          targetType: existing.targetType,
          targetId: existing.targetId,
          siteId: existing.siteId,
          departmentId: existing.departmentId,
          createdByUserId: principal.userId ?? null,
          activatedAt: now,
          metadata: existing.metadata,
          sourceSystem: "FORGE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx
        .update(qrLinks)
        .set({
          status: "REPLACED",
          replacementQrId: replacement!.id,
          tokenHash: null,
          tokenIssuedAt: null,
          deactivatedAt: now,
          updatedAt: now,
        })
        .where(and(eq(qrLinks.id, recordId), eq(qrLinks.tenantId, tenantId)));

      await this.appendAudit(tx, tenantId, recordId, "REPLACED", principal.userId ?? null, {
        replacementQrId: replacement!.id,
      });
      await this.appendAudit(tx, tenantId, replacement!.id, "CREATED", principal.userId ?? null, {
        replacedFromQrId: recordId,
      });

      let publicToken: string | undefined;
      let url: string | undefined;
      if (body.issueToken !== false) {
        const issued = await this.issueTokenTx(
          tx,
          tenantId,
          replacement!,
          principal.userId ?? null,
          typeof body.appBaseUrl === "string" ? body.appBaseUrl : null,
        );
        publicToken = issued.publicToken;
        url = issued.url;
      }

      return {
        previous: { id: recordId, status: "REPLACED", replacementQrId: replacement!.id },
        replacement: mapQrLink(replacement!, publicToken ? { publicToken } : undefined),
        token: publicToken,
        url,
      };
    });
  }

  async deactivate(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.getRow(tx, tenantId, recordId);
      const now = new Date();
      const [row] = await tx
        .update(qrLinks)
        .set({
          status: "INACTIVE",
          deactivatedAt: now,
          tokenHash: null,
          tokenIssuedAt: null,
          updatedAt: now,
        })
        .where(and(eq(qrLinks.id, recordId), eq(qrLinks.tenantId, tenantId)))
        .returning();
      await this.appendAudit(tx, tenantId, recordId, "DEACTIVATED", principal.userId ?? null);
      return mapQrLink(row!);
    });
  }

  async reactivate(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await this.getRow(tx, tenantId, recordId);
      if (existing.status === "REPLACED") {
        throw new ForgeError("VALIDATION_FAILED", "Replaced QR links cannot be reactivated.");
      }
      const now = new Date();
      const [row] = await tx
        .update(qrLinks)
        .set({
          status: "ACTIVE",
          activatedAt: existing.activatedAt ?? now,
          deactivatedAt: null,
          updatedAt: now,
        })
        .where(and(eq(qrLinks.id, recordId), eq(qrLinks.tenantId, tenantId)))
        .returning();
      await this.appendAudit(tx, tenantId, recordId, "REACTIVATED", principal.userId ?? null);
      return mapQrLink(row!);
    });
  }

  async recordScanEvent(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown> = {},
  ) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const link = await this.getRow(tx, tenantId, recordId);
      const now = new Date();
      const [event] = await tx
        .insert(industrialQrLinkScanEvents)
        .values({
          id: createId(),
          tenantId,
          qrLinkId: recordId,
          versionId: link.currentVersionId,
          scannedAt: now,
          action: String(body.action ?? "SCAN").trim() || "SCAN",
          result: String(body.result ?? "OK").trim() || "OK",
          responseStatus:
            typeof body.responseStatus === "number" ? body.responseStatus : 200,
          anonymous: false,
          personnelId: parseOptionalUuid(body.personnelId),
          userId: principal.userId ?? parseOptionalUuid(body.userId),
          siteId: parseOptionalUuid(body.siteId ?? link.siteId),
          correlationId:
            typeof body.correlationId === "string" ? body.correlationId.trim() : null,
          metadata:
            typeof body.metadata === "object" && body.metadata
              ? (body.metadata as Record<string, unknown>)
              : {},
          sourceSystem: "FORGE",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx
        .update(qrLinks)
        .set({
          lastScannedAt: now,
          scanCount: sql`${qrLinks.scanCount} + 1`,
          updatedAt: now,
        })
        .where(and(eq(qrLinks.id, recordId), eq(qrLinks.tenantId, tenantId)));

      await this.appendAudit(tx, tenantId, recordId, "SCAN_RECORDED", principal.userId ?? null, {
        scanEventId: event!.id,
        action: event!.action,
      });

      return event;
    });
  }

  async listScanEvents(principal: ForgePrincipal, id: string, query: ListQuery = {}) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    const { page, pageSize, offset } = pageParams(query);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.getRow(tx, tenantId, recordId);
      const rows = await tx
        .select()
        .from(industrialQrLinkScanEvents)
        .where(
          and(
            eq(industrialQrLinkScanEvents.tenantId, tenantId),
            eq(industrialQrLinkScanEvents.qrLinkId, recordId),
            isNull(industrialQrLinkScanEvents.archivedAt),
          ),
        )
        .orderBy(desc(industrialQrLinkScanEvents.scannedAt))
        .limit(pageSize)
        .offset(offset);
      return { items: rows, page, pageSize, total: rows.length };
    });
  }

  async listAuditEvents(principal: ForgePrincipal, id: string, query: ListQuery = {}) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    const { page, pageSize, offset } = pageParams(query);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.getRow(tx, tenantId, recordId);
      const rows = await tx
        .select()
        .from(industrialQrLinkAuditEvents)
        .where(
          and(
            eq(industrialQrLinkAuditEvents.tenantId, tenantId),
            eq(industrialQrLinkAuditEvents.qrLinkId, recordId),
            isNull(industrialQrLinkAuditEvents.archivedAt),
          ),
        )
        .orderBy(desc(industrialQrLinkAuditEvents.eventAt))
        .limit(pageSize)
        .offset(offset);
      return { items: rows, page, pageSize, total: rows.length };
    });
  }

  async qrImage(principal: ForgePrincipal, id: string, body: Record<string, unknown> = {}) {
    const tenantId = this.tenant(principal);
    const recordId = assertId(id);
    const token = String(body.token ?? "").trim();
    if (!isValidPublicToken(token)) {
      throw new ForgeError("VALIDATION_FAILED", "Provide the QR token from issue.");
    }
    const tokenHash = hashPublicToken(token);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(qrLinks)
        .where(
          and(
            eq(qrLinks.id, recordId),
            eq(qrLinks.tenantId, tenantId),
            eq(qrLinks.tokenHash, tokenHash),
            isNull(qrLinks.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "QR token is invalid for this link.");
      const url = this.scanPublicUrl(
        token,
        typeof body.appBaseUrl === "string" ? body.appBaseUrl : null,
      );
      const qrPng = await qrCodePngBuffer(url, 320);
      // Persist sealed token so printables can re-embed the same scan QR.
      if (!readSealedPortalToken(row.metadata)) {
        await tx
          .update(qrLinks)
          .set({
            metadata: withSealedPortalToken(row.metadata, tenantId, token),
            updatedAt: new Date(),
          })
          .where(and(eq(qrLinks.id, row.id), eq(qrLinks.tenantId, tenantId)));
      }
      return {
        contentType: "image/png",
        dataBase64: qrPng.toString("base64"),
        url,
        label: row.label ?? row.displayCode ?? "QR link",
      };
    });
  }

  /**
   * Resolve (or create) the ACTIVE LOTO_PROCEDURE QR link and return a PNG data URL
   * for the same public scan URL used on stickers.
   */
  async resolveLotoProcedureQrPng(
    principal: ForgePrincipal,
    procedureId: string,
    options: { appBaseUrl?: string | null; label?: string } = {},
  ): Promise<{ dataUrl: string; url: string; qrLinkId: string } | null> {
    const tenantId = this.tenant(principal);
    const targetId = assertId(procedureId);
    const appBaseUrl = options.appBaseUrl ?? null;
    const label = String(options.label ?? "").trim() || "LOTO procedure";

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(qrLinks)
        .where(
          and(
            eq(qrLinks.tenantId, tenantId),
            eq(qrLinks.targetType, "LOTO_PROCEDURE"),
            eq(qrLinks.targetId, targetId),
            eq(qrLinks.status, "ACTIVE"),
            isNull(qrLinks.archivedAt),
          ),
        )
        .orderBy(desc(qrLinks.updatedAt))
        .limit(1);

      let row = existing;
      let publicToken: string | null = null;

      if (row) {
        const sealed = readSealedPortalToken(row.metadata);
        if (sealed) publicToken = openPortalToken(tenantId, sealed);
        if (!publicToken && !row.tokenHash) {
          const issued = await this.issueTokenTx(
            tx,
            tenantId,
            row,
            principal.userId ?? null,
            appBaseUrl,
          );
          row = issued.row;
          publicToken = issued.publicToken;
        }
      } else {
        const now = new Date();
        const [created] = await tx
          .insert(qrLinks)
          .values({
            id: createId(),
            tenantId,
            label: `${label} LOTO QR`,
            displayCode: generateDisplayCode(),
            status: "ACTIVE",
            // LOTO procedure stickers are public: view procedure + report a problem
            // without sign-in or employee-number verification.
            accessMode: "PUBLIC_ACTION",
            actionConfig: {
              ...defaultQrActionConfigFlags(),
              viewLoto: true,
              reportIssue: true,
              lotoProcedureId: targetId,
            },
            targetType: "LOTO_PROCEDURE",
            targetId,
            activatedAt: now,
            metadata: {},
            sourceSystem: "FORGE",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        row = created!;
        await this.appendAudit(tx, tenantId, row.id, "CREATED", principal.userId ?? null, {
          targetType: "LOTO_PROCEDURE",
          targetId,
          via: "loto-printable",
        });
        const issued = await this.issueTokenTx(
          tx,
          tenantId,
          row,
          principal.userId ?? null,
          appBaseUrl,
        );
        row = issued.row;
        publicToken = issued.publicToken;
      }

      // Upgrade legacy LOTO stickers that were created as employee-gated.
      if (row) {
        const mode = normalizeQrAccessMode(row.accessMode);
        const needsPublicUpgrade =
          mode !== "PUBLIC_ACTION" &&
          mode !== "PUBLIC_READ" &&
          mode !== "PUBLIC_LIMITED" &&
          mode !== "PUBLIC_FORM_ONLY";
        if (needsPublicUpgrade) {
          const now = new Date();
          const nextConfig = {
            ...defaultQrActionConfigFlags(),
            ...(typeof row.actionConfig === "object" && row.actionConfig && !Array.isArray(row.actionConfig)
              ? (row.actionConfig as Record<string, unknown>)
              : {}),
            viewLoto: true,
            reportIssue: true,
            lotoProcedureId: targetId,
          };
          const [updated] = await tx
            .update(qrLinks)
            .set({
              accessMode: "PUBLIC_ACTION",
              actionConfig: nextConfig,
              updatedAt: now,
            })
            .where(and(eq(qrLinks.id, row.id), eq(qrLinks.tenantId, tenantId)))
            .returning();
          if (updated) {
            row = updated;
            await this.appendAudit(tx, tenantId, row.id, "ACCESS_MODE_CHANGED", principal.userId ?? null, {
              before: mode,
              after: "PUBLIC_ACTION",
              via: "loto-public-upgrade",
            });
          }
        }
      }

      if (!publicToken) {
        // Token exists but was issued before sealing — cannot recover plaintext.
        return null;
      }

      const url = this.scanPublicUrl(publicToken, appBaseUrl);
      const qrPng = await qrCodePngBuffer(url, 280);
      return {
        dataUrl: `data:image/png;base64,${qrPng.toString("base64")}`,
        url,
        qrLinkId: row.id,
      };
    });
  }

  /**
   * The tenant-wide Emergency SMS Alerts signup QR. Returns null when none exists
   * and `create` is false; otherwise finds or creates the single ACTIVE link.
   */
  async resolveEmergencySmsSignupQr(
    principal: ForgePrincipal,
    options: { appBaseUrl?: string | null; create?: boolean } = {},
  ) {
    const tenantId = this.tenant(principal);
    const appBaseUrl = options.appBaseUrl ?? null;
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(qrLinks)
        .where(
          and(
            eq(qrLinks.tenantId, tenantId),
            eq(qrLinks.targetType, EMERGENCY_SMS_SIGNUP_QR_TARGET),
            eq(qrLinks.status, "ACTIVE"),
            isNull(qrLinks.archivedAt),
          ),
        )
        .orderBy(desc(qrLinks.updatedAt))
        .limit(1);

      let row = existing;
      if (!row) {
        if (!options.create) return null;
        const now = new Date();
        const [created] = await tx
          .insert(qrLinks)
          .values({
            id: createId(),
            tenantId,
            label: "Emergency SMS Alerts signup",
            displayCode: generateDisplayCode(),
            description: "Employees scan to sign up for Emergency SMS Alerts.",
            status: "ACTIVE",
            accessMode: "PUBLIC_FORM_ONLY",
            actionConfig: { ...defaultQrActionConfigFlags(), isPublic: true },
            targetType: EMERGENCY_SMS_SIGNUP_QR_TARGET,
            createdByUserId: principal.userId ?? null,
            activatedAt: now,
            metadata: {},
            sourceSystem: "FORGE",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        row = created!;
        await this.appendAudit(tx, tenantId, row.id, "CREATED", principal.userId ?? null, {
          targetType: EMERGENCY_SMS_SIGNUP_QR_TARGET,
          via: "emergency-alerts",
        });
      }

      let publicToken: string | null = null;
      const sealed = readSealedPortalToken(row.metadata);
      const opened = sealed ? openPortalToken(tenantId, sealed) : null;
      if (opened && row.tokenHash && hashPublicToken(opened) === row.tokenHash) {
        publicToken = opened;
      }
      if (!publicToken && !row.tokenHash) {
        const issued = await this.issueTokenTx(tx, tenantId, row, principal.userId ?? null, appBaseUrl);
        row = issued.row;
        publicToken = issued.publicToken;
      }

      const [signups] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialPersonnelSmsConsents)
        .where(
          and(
            eq(industrialPersonnelSmsConsents.tenantId, tenantId),
            eq(industrialPersonnelSmsConsents.qrLinkId, row.id),
          ),
        );

      const base = {
        qrLinkId: row.id,
        label: row.label ?? "Emergency SMS Alerts signup",
        displayCode: row.displayCode,
        scanCount: row.scanCount ?? 0,
        lastScannedAt: row.lastScannedAt ? row.lastScannedAt.toISOString() : null,
        signupCount: signups?.count ?? 0,
      };
      if (!publicToken) {
        // Hash without recoverable plaintext: admin must revoke + reissue from QR Links.
        return { ...base, url: null, dataUrl: null, needsReissue: true };
      }
      const url = this.scanPublicUrl(publicToken, appBaseUrl);
      const qrPng = await qrCodePngBuffer(url, 480);
      return {
        ...base,
        url,
        dataUrl: `data:image/png;base64,${qrPng.toString("base64")}`,
        needsReissue: false,
      };
    });
  }

  private async resolveTenantId(tokenHash: string): Promise<string | null> {
    const rows = [
      ...(await this.db.execute(
        sql`select forge_industrial_qr_link_tenant_for_token(${tokenHash}) as tenant_id`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id;
    return tenantId ? String(tenantId) : null;
  }

  async resolveByPublicToken(token: string) {
    const raw = String(token ?? "").trim();
    if (!isValidPublicToken(raw)) throw new ForgeError("NOT_FOUND", "QR link not found");
    const tokenHash = hashPublicToken(raw);
    const tenantId = await this.resolveTenantId(tokenHash);
    if (!tenantId) throw new ForgeError("NOT_FOUND", "QR link not found");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(qrLinks)
        .where(
          and(
            eq(qrLinks.tenantId, tenantId),
            eq(qrLinks.tokenHash, tokenHash),
            eq(qrLinks.status, "ACTIVE"),
            isNull(qrLinks.archivedAt),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "QR link not found");
      return {
        tenantId,
        link: mapQrLink(row),
      };
    });
  }

  async analyticsSummary(principal: ForgePrincipal, query: ListQuery = {}) {
    const tenantId = this.tenant(principal);
    const rangeDays = Math.min(365, Math.max(1, Number(query.rangeDays || 90) || 90));
    const now = new Date();
    const start = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const countLinks = async (status?: string) => {
        const conditions = [eq(qrLinks.tenantId, tenantId), isNull(qrLinks.archivedAt)];
        if (status) conditions.push(eq(qrLinks.status, status));
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(qrLinks)
          .where(and(...conditions));
        return Number(row?.count ?? 0);
      };

      const countScanActions = async (actions: string[], since: Date) => {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialQrLinkScanEvents)
          .where(
            and(
              eq(industrialQrLinkScanEvents.tenantId, tenantId),
              isNull(industrialQrLinkScanEvents.archivedAt),
              gte(industrialQrLinkScanEvents.scannedAt, since),
              sql`upper(coalesce(${industrialQrLinkScanEvents.action}, '')) in (${sql.join(
                actions.map((a) => sql`${a}`),
                sql`, `,
              )})`,
            ),
          );
        return Number(row?.count ?? 0);
      };

      const [scansTodayRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialQrLinkScanEvents)
        .where(
          and(
            eq(industrialQrLinkScanEvents.tenantId, tenantId),
            isNull(industrialQrLinkScanEvents.archivedAt),
            gte(industrialQrLinkScanEvents.scannedAt, dayStart),
          ),
        );
      const [scansRangeRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialQrLinkScanEvents)
        .where(
          and(
            eq(industrialQrLinkScanEvents.tenantId, tenantId),
            isNull(industrialQrLinkScanEvents.archivedAt),
            gte(industrialQrLinkScanEvents.scannedAt, start),
          ),
        );

      return {
        activeQrCodes: await countLinks("ACTIVE"),
        totalQrCodes: await countLinks(),
        scansToday: Number(scansTodayRow?.count ?? 0),
        scansInRange: Number(scansRangeRow?.count ?? 0),
        inspectionsStarted: await countScanActions(
          ["INSPECTION_STARTED", "START_INSPECTION", "INSPECTION"],
          start,
        ),
        inspectionsCompleted: await countScanActions(
          ["INSPECTION_COMPLETED", "COMPLETE_INSPECTION"],
          start,
        ),
        issuesReported: await countScanActions(["ISSUE_REPORTED", "REPORT_ISSUE"], start),
        correctiveActionsCreated: await countScanActions(
          ["CORRECTIVE_ACTION_CREATED", "ISSUE_REPORTED"],
          start,
        ),
        trainingOpened: await countScanActions(["TRAINING_OPENED", "OPEN_TRAINING"], start),
        outOfServiceEvents: await countScanActions(
          ["ASSET_MARKED_OUT_OF_SERVICE", "OUT_OF_SERVICE", "MARK_OUT_OF_SERVICE"],
          start,
        ),
        rangeDays,
      };
    });
  }
}

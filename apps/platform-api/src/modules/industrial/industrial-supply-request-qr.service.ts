import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  createId,
  industrialPersonnel,
  industrialSites,
  industrialSupplyCategories,
  industrialSupplyItems,
  industrialSupplyItemVariants,
  industrialSupplyLocationInventory,
  industrialSupplyLocations,
  industrialSupplyRequestEvents,
  industrialSupplyRequestItems,
  industrialSupplyRequests,
  qrLinks,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { employeeNumberWhereClause, pickPreferredPersonnelMatch } from "./employee-number.js";
import { isActivePersonnelStatus } from "./personnel-status.js";
import {
  openPortalToken,
  withSealedPortalToken,
  withoutSealedPortalToken,
  readSealedPortalToken,
} from "./portal-token-crypto.js";
import {
  generateDisplayCode,
  generatePublicToken,
  hashPublicToken,
  isValidPublicToken,
  publicTokenHint,
} from "./qr-token.js";
import { qrCodePngBuffer } from "./qr-svg.js";

type ListQuery = Record<string, string | undefined>;
type DbTx = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

const publicPostBuckets = new Map<string, { count: number; resetAt: number }>();

function assertPublicRateLimit(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const existing = publicPostBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    publicPostBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (existing.count >= limit) {
    throw new ForgeError("RATE_LIMITED", "Too many requests. Please wait and try again.");
  }
  existing.count += 1;
}

export const SUPPLY_REQUEST_STATION_TARGET = "SUPPLY_REQUEST_STATION";

export type SupplyRequestStationConfig = {
  allowAnonymous: boolean;
  requireEmployeeId: boolean;
  allowContractors: boolean;
  allowCustomItems: boolean;
  allowUrgent: boolean;
  allowAttachments: boolean;
  allowNotes: boolean;
  catalogMode: "ALL_SITE" | "CATEGORIES" | "ITEMS" | "LOCATION_ONLY";
  categoryIds: string[];
  itemIds: string[];
  inventoryVisibility: "HIDDEN" | "AVAILABILITY" | "EXACT";
  allowOutOfStockRequests: boolean;
  notifyUserIds: string[];
  primaryRecipientUserId: string | null;
};

const DEFAULT_STATION_CONFIG: SupplyRequestStationConfig = {
  allowAnonymous: false,
  requireEmployeeId: true,
  allowContractors: false,
  allowCustomItems: false,
  allowUrgent: true,
  allowAttachments: false,
  allowNotes: true,
  catalogMode: "ALL_SITE",
  categoryIds: [],
  itemIds: [],
  inventoryVisibility: "AVAILABILITY",
  allowOutOfStockRequests: true,
  notifyUserIds: [],
  primaryRecipientUserId: null,
};

function pageParams(query: ListQuery) {
  const page = Math.max(1, Number(query.page || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 25) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asOptionalString(value: unknown): string | null {
  const s = asString(value);
  return s || null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function parseStationConfig(raw: unknown): SupplyRequestStationConfig {
  const cfg = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const station =
    cfg.supplyRequestStation && typeof cfg.supplyRequestStation === "object"
      ? (cfg.supplyRequestStation as Record<string, unknown>)
      : cfg;
  return {
    allowAnonymous: asBool(station.allowAnonymous, DEFAULT_STATION_CONFIG.allowAnonymous),
    requireEmployeeId: asBool(station.requireEmployeeId, DEFAULT_STATION_CONFIG.requireEmployeeId),
    allowContractors: asBool(station.allowContractors, DEFAULT_STATION_CONFIG.allowContractors),
    allowCustomItems: asBool(station.allowCustomItems, DEFAULT_STATION_CONFIG.allowCustomItems),
    allowUrgent: asBool(station.allowUrgent, DEFAULT_STATION_CONFIG.allowUrgent),
    allowAttachments: asBool(station.allowAttachments, DEFAULT_STATION_CONFIG.allowAttachments),
    allowNotes: asBool(station.allowNotes, DEFAULT_STATION_CONFIG.allowNotes),
    catalogMode: (["ALL_SITE", "CATEGORIES", "ITEMS", "LOCATION_ONLY"].includes(
      String(station.catalogMode ?? ""),
    )
      ? String(station.catalogMode)
      : DEFAULT_STATION_CONFIG.catalogMode) as SupplyRequestStationConfig["catalogMode"],
    categoryIds: Array.isArray(station.categoryIds)
      ? station.categoryIds.map((v) => String(v)).filter(Boolean)
      : [],
    itemIds: Array.isArray(station.itemIds)
      ? station.itemIds.map((v) => String(v)).filter(Boolean)
      : [],
    inventoryVisibility: (["HIDDEN", "AVAILABILITY", "EXACT"].includes(
      String(station.inventoryVisibility ?? ""),
    )
      ? String(station.inventoryVisibility)
      : DEFAULT_STATION_CONFIG.inventoryVisibility) as SupplyRequestStationConfig["inventoryVisibility"],
    allowOutOfStockRequests: asBool(
      station.allowOutOfStockRequests,
      DEFAULT_STATION_CONFIG.allowOutOfStockRequests,
    ),
    notifyUserIds: Array.isArray(station.notifyUserIds)
      ? station.notifyUserIds.map((v) => String(v)).filter(Boolean)
      : [],
    primaryRecipientUserId: asOptionalString(station.primaryRecipientUserId),
  };
}

function industrialAppBaseUrl(override?: string | null): string {
  const raw =
    (typeof override === "string" && override.trim()) ||
    process.env.FORGE_INDUSTRIAL_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://producersrice.forgeindustrialsafety.com";
  let normalized = raw.trim().replace(/\/+$/, "");
  try {
    normalized = new URL(normalized).origin;
  } catch {
    /* keep */
  }
  return normalized;
}

@Injectable()
export class IndustrialSupplyRequestQrService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  private requestPortalUrl(token: string, appBaseUrl?: string | null): string {
    return `${industrialAppBaseUrl(appBaseUrl)}/safety-supplies/request/q/${encodeURIComponent(token)}`;
  }

  private mapStation(
    row: typeof qrLinks.$inferSelect,
    extras?: { publicToken?: string; requestCount?: number },
  ) {
    const actionConfig = (row.actionConfig ?? {}) as Record<string, unknown>;
    const config = parseStationConfig(actionConfig);
    const sealed = readSealedPortalToken((row.metadata ?? {}) as Record<string, unknown>);
    const token =
      extras?.publicToken ?? (sealed ? openPortalToken(row.tenantId, sealed) : null) ?? undefined;
    return {
      id: row.id,
      name: row.label ?? row.displayCode ?? "Supply request QR",
      description: row.description,
      status: row.status,
      siteId: row.siteId,
      departmentId: row.departmentId,
      locationId: row.targetId,
      targetType: row.targetType,
      scanCount: row.scanCount,
      requestCount: extras?.requestCount ?? 0,
      lastScannedAt: row.lastScannedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      publicTokenHint: publicTokenHint(row.tokenHash),
      publicToken: token,
      publicUrl: token ? this.requestPortalUrl(token) : null,
      config,
      actionConfig,
      metadata: withoutSealedPortalToken((row.metadata ?? {}) as Record<string, unknown>),
    };
  }

  async listStations(principal: ForgePrincipal, query: ListQuery = {}) {
    const tenantId = this.tenant(principal);
    const { page, pageSize, offset } = pageParams(query);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const filters = [
          eq(qrLinks.tenantId, tenantId),
          eq(qrLinks.targetType, SUPPLY_REQUEST_STATION_TARGET),
          isNull(qrLinks.archivedAt),
        ];
        if (query.status) filters.push(eq(qrLinks.status, query.status.trim()));
        if (query.siteId) filters.push(eq(qrLinks.siteId, query.siteId.trim()));
        const where = and(...filters);
        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(qrLinks)
          .where(where);
        const rows = await tx
          .select()
          .from(qrLinks)
          .where(where)
          .orderBy(desc(qrLinks.updatedAt))
          .limit(pageSize)
          .offset(offset);

        const ids = rows.map((r) => r.id);
        const requestCounts = new Map<string, number>();
        if (ids.length > 0) {
          const counts = await tx
            .select({
              qrLinkId: industrialSupplyRequests.qrLinkId,
              count: sql<number>`count(*)::int`,
            })
            .from(industrialSupplyRequests)
            .where(
              and(
                eq(industrialSupplyRequests.tenantId, tenantId),
                isNull(industrialSupplyRequests.archivedAt),
                inArray(industrialSupplyRequests.qrLinkId, ids),
              ),
            )
            .groupBy(industrialSupplyRequests.qrLinkId);
          for (const row of counts) {
            if (row.qrLinkId) requestCounts.set(row.qrLinkId, row.count);
          }
        }

        return {
          items: rows.map((row) =>
            this.mapStation(row, { requestCount: requestCounts.get(row.id) ?? 0 }),
          ),
          page,
          pageSize,
          total: countRow?.count ?? 0,
        };
      },
      principal.userId,
    );
  }

  async createStation(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name || body.label);
    const siteId = asOptionalString(body.siteId);
    if (!name) throw new ForgeError("VALIDATION_FAILED", "QR name is required");
    if (!siteId) throw new ForgeError("VALIDATION_FAILED", "Site is required");

    const config = parseStationConfig(body.config ?? body);
    const locationId = asOptionalString(body.locationId ?? body.inventoryLocationId);
    const departmentId = asOptionalString(body.departmentId);
    const description = asOptionalString(body.description);
    const workArea = asOptionalString(body.workArea);
    const now = new Date();
    const token = generatePublicToken();
    const tokenHash = hashPublicToken(token);

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [site] = await tx
          .select({ id: industrialSites.id, name: industrialSites.name })
          .from(industrialSites)
          .where(
            and(
              eq(industrialSites.id, siteId),
              eq(industrialSites.tenantId, tenantId),
              isNull(industrialSites.archivedAt),
            ),
          )
          .limit(1);
        if (!site) throw new ForgeError("NOT_FOUND", "Site not found");

        if (locationId) {
          const [loc] = await tx
            .select({ id: industrialSupplyLocations.id })
            .from(industrialSupplyLocations)
            .where(
              and(
                eq(industrialSupplyLocations.id, locationId),
                eq(industrialSupplyLocations.tenantId, tenantId),
                isNull(industrialSupplyLocations.archivedAt),
              ),
            )
            .limit(1);
          if (!loc) throw new ForgeError("NOT_FOUND", "Supply location not found");
        }

        const id = createId();
        const actionConfig = {
          supplyRequestStation: {
            ...config,
            workArea,
          },
        };
        const [row] = await tx
          .insert(qrLinks)
          .values({
            id,
            tenantId,
            siteId,
            departmentId,
            label: name,
            description,
            displayCode: generateDisplayCode(),
            status: "ACTIVE",
            accessMode: "PUBLIC_ACTION",
            targetType: SUPPLY_REQUEST_STATION_TARGET,
            targetId: locationId,
            tokenHash,
            tokenIssuedAt: now,
            actionConfig,
            metadata: withSealedPortalToken({}, tenantId, token),
            activatedAt: now,
            createdByUserId: principal.userId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return this.mapStation(row!, { publicToken: token, requestCount: 0 });
      },
      principal.userId,
    );
  }

  async updateStation(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(qrLinks)
          .where(
            and(
              eq(qrLinks.id, id),
              eq(qrLinks.tenantId, tenantId),
              eq(qrLinks.targetType, SUPPLY_REQUEST_STATION_TARGET),
              isNull(qrLinks.archivedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Supply request QR not found");

        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (body.name !== undefined || body.label !== undefined) {
          const name = asString(body.name || body.label);
          if (!name) throw new ForgeError("VALIDATION_FAILED", "QR name is required");
          patch.label = name;
        }
        if (body.description !== undefined) patch.description = asOptionalString(body.description);
        if (body.siteId !== undefined) {
          const siteId = asOptionalString(body.siteId);
          if (!siteId) throw new ForgeError("VALIDATION_FAILED", "Site is required");
          patch.siteId = siteId;
        }
        if (body.departmentId !== undefined) {
          patch.departmentId = asOptionalString(body.departmentId);
        }
        if (body.locationId !== undefined || body.inventoryLocationId !== undefined) {
          patch.targetId = asOptionalString(body.locationId ?? body.inventoryLocationId);
        }
        if (body.config !== undefined || body.workArea !== undefined) {
          const prev = parseStationConfig(existing.actionConfig);
          const next = parseStationConfig({
            ...prev,
            ...(typeof body.config === "object" && body.config ? body.config : {}),
            workArea:
              body.workArea !== undefined
                ? asOptionalString(body.workArea)
                : (existing.actionConfig as Record<string, unknown>)?.supplyRequestStation &&
                    typeof (existing.actionConfig as Record<string, unknown>)
                      .supplyRequestStation === "object"
                  ? asOptionalString(
                      (
                        (existing.actionConfig as Record<string, unknown>)
                          .supplyRequestStation as Record<string, unknown>
                      ).workArea,
                    )
                  : null,
          });
          patch.actionConfig = { supplyRequestStation: next };
        }

        const [row] = await tx.update(qrLinks).set(patch).where(eq(qrLinks.id, id)).returning();
        return this.mapStation(row!);
      },
      principal.userId,
    );
  }

  async setStationStatus(principal: ForgePrincipal, id: string, status: "ACTIVE" | "INACTIVE") {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const now = new Date();
        const [row] = await tx
          .update(qrLinks)
          .set({
            status,
            deactivatedAt: status === "INACTIVE" ? now : null,
            activatedAt: status === "ACTIVE" ? now : undefined,
            updatedAt: now,
          })
          .where(
            and(
              eq(qrLinks.id, id),
              eq(qrLinks.tenantId, tenantId),
              eq(qrLinks.targetType, SUPPLY_REQUEST_STATION_TARGET),
              isNull(qrLinks.archivedAt),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Supply request QR not found");
        return this.mapStation(row);
      },
      principal.userId,
    );
  }

  async regenerateStationToken(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [existing] = await tx
          .select()
          .from(qrLinks)
          .where(
            and(
              eq(qrLinks.id, id),
              eq(qrLinks.tenantId, tenantId),
              eq(qrLinks.targetType, SUPPLY_REQUEST_STATION_TARGET),
              isNull(qrLinks.archivedAt),
            ),
          )
          .limit(1);
        if (!existing) throw new ForgeError("NOT_FOUND", "Supply request QR not found");
        const token = generatePublicToken();
        const now = new Date();
        const [row] = await tx
          .update(qrLinks)
          .set({
            tokenHash: hashPublicToken(token),
            tokenIssuedAt: now,
            metadata: withSealedPortalToken(
              withoutSealedPortalToken((existing.metadata ?? {}) as Record<string, unknown>),
              tenantId,
              token,
            ),
            updatedAt: now,
          })
          .where(eq(qrLinks.id, id))
          .returning();
        return this.mapStation(row!, { publicToken: token });
      },
      principal.userId,
    );
  }

  async archiveStation(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [countRow] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialSupplyRequests)
          .where(
            and(
              eq(industrialSupplyRequests.tenantId, tenantId),
              eq(industrialSupplyRequests.qrLinkId, id),
              isNull(industrialSupplyRequests.archivedAt),
            ),
          );
        if ((countRow?.count ?? 0) > 0) {
          throw new ForgeError(
            "CONFLICT",
            "This QR has historical requests. Disable it instead of deleting.",
          );
        }
        const now = new Date();
        const [row] = await tx
          .update(qrLinks)
          .set({ archivedAt: now, status: "ARCHIVED", deactivatedAt: now, updatedAt: now })
          .where(
            and(
              eq(qrLinks.id, id),
              eq(qrLinks.tenantId, tenantId),
              eq(qrLinks.targetType, SUPPLY_REQUEST_STATION_TARGET),
              isNull(qrLinks.archivedAt),
            ),
          )
          .returning();
        if (!row) throw new ForgeError("NOT_FOUND", "Supply request QR not found");
        return this.mapStation(row);
      },
      principal.userId,
    );
  }

  async stationPng(principal: ForgePrincipal, id: string, appBaseUrl?: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(qrLinks)
          .where(
            and(
              eq(qrLinks.id, id),
              eq(qrLinks.tenantId, tenantId),
              eq(qrLinks.targetType, SUPPLY_REQUEST_STATION_TARGET),
              isNull(qrLinks.archivedAt),
            ),
          )
          .limit(1);
        if (!row) throw new ForgeError("NOT_FOUND", "Supply request QR not found");
        const sealed = readSealedPortalToken((row.metadata ?? {}) as Record<string, unknown>);
        const token = sealed ? openPortalToken(tenantId, sealed) : null;
        if (!token) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            "No printable token available. Regenerate the QR token first.",
          );
        }
        const url = this.requestPortalUrl(token, appBaseUrl);
        const png = await qrCodePngBuffer(url, 512);
        return {
          pngBase64: png.toString("base64"),
          publicUrl: url,
          label: row.label,
          siteId: row.siteId,
        };
      },
      principal.userId,
    );
  }

  private async resolveTokenTenant(token: string): Promise<{
    tokenHash: string;
    tenantId: string;
  }> {
    if (!isValidPublicToken(token)) {
      throw new ForgeError("NOT_FOUND", "This QR code is no longer active.");
    }
    const tokenHash = hashPublicToken(token);
    const rows = [
      ...(await this.db.execute(
        sql`select forge_industrial_qr_link_tenant_for_token(${tokenHash}) as tenant_id`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id ? String(rows[0].tenant_id) : null;
    if (!tenantId) {
      throw new ForgeError("NOT_FOUND", "This QR code is no longer active.");
    }
    return { tokenHash, tenantId };
  }

  private async loadActiveStation(tx: DbTx, tenantId: string, tokenHash: string) {
    const [row] = await tx
      .select()
      .from(qrLinks)
      .where(
        and(
          eq(qrLinks.tenantId, tenantId),
          eq(qrLinks.tokenHash, tokenHash),
          eq(qrLinks.targetType, SUPPLY_REQUEST_STATION_TARGET),
          isNull(qrLinks.archivedAt),
        ),
      )
      .limit(1);
    if (!row || row.status !== "ACTIVE") {
      throw new ForgeError(
        "NOT_FOUND",
        "This Safety Supply Request QR code is currently unavailable. Please contact the Safety Department.",
      );
    }
    return row;
  }

  async resolvePublicStation(token: string) {
    const { tokenHash, tenantId } = await this.resolveTokenTenant(token);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await this.loadActiveStation(tx, tenantId, tokenHash);
      const config = parseStationConfig(row.actionConfig);
      let siteName: string | null = null;
      if (row.siteId) {
        const [site] = await tx
          .select({ name: industrialSites.name })
          .from(industrialSites)
          .where(and(eq(industrialSites.id, row.siteId), eq(industrialSites.tenantId, tenantId)))
          .limit(1);
        siteName = site?.name ?? null;
      }
      let locationName: string | null = null;
      if (row.targetId) {
        const [loc] = await tx
          .select({ name: industrialSupplyLocations.name, code: industrialSupplyLocations.code })
          .from(industrialSupplyLocations)
          .where(
            and(
              eq(industrialSupplyLocations.id, row.targetId),
              eq(industrialSupplyLocations.tenantId, tenantId),
            ),
          )
          .limit(1);
        locationName = loc ? `${loc.name} (${loc.code})` : null;
      }

      await tx
        .update(qrLinks)
        .set({
          scanCount: sql`${qrLinks.scanCount} + 1`,
          lastScannedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(qrLinks.id, row.id));

      const workArea =
        typeof (row.actionConfig as Record<string, unknown>)?.supplyRequestStation === "object"
          ? asOptionalString(
              (
                (row.actionConfig as Record<string, unknown>).supplyRequestStation as Record<
                  string,
                  unknown
                >
              ).workArea,
            )
          : null;

      return {
        qrName: row.label ?? "Safety Supply Request",
        description: row.description,
        siteName,
        locationName,
        workArea,
        config: {
          allowAnonymous: config.allowAnonymous,
          requireEmployeeId: config.requireEmployeeId,
          allowContractors: config.allowContractors,
          allowCustomItems: config.allowCustomItems,
          allowUrgent: config.allowUrgent,
          allowNotes: config.allowNotes,
          inventoryVisibility: config.inventoryVisibility,
          allowOutOfStockRequests: config.allowOutOfStockRequests,
        },
      };
    });
  }

  async lookupPublicEmployee(token: string, body: Record<string, unknown>) {
    assertPublicRateLimit(`employee:${hashPublicToken(token)}`, 30);
    const { tokenHash, tenantId } = await this.resolveTokenTenant(token);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await this.loadActiveStation(tx, tenantId, tokenHash);
      const config = parseStationConfig(row.actionConfig);
      if (!config.requireEmployeeId && config.allowAnonymous) {
        /* still allow lookup */
      }
      const employeeNumber = asString(body.employeeNumber);
      const lastName = asOptionalString(body.lastName);
      if (!employeeNumber) {
        throw new ForgeError("VALIDATION_FAILED", "Employee number is required");
      }
      const clause = employeeNumberWhereClause(employeeNumber);
      if (!clause) {
        return { matched: false as const };
      }
      const matches = await tx
        .select({
          id: industrialPersonnel.id,
          firstName: industrialPersonnel.firstName,
          lastName: industrialPersonnel.lastName,
          employeeNumber: industrialPersonnel.employeeNumber,
          departmentId: industrialPersonnel.departmentId,
          siteId: industrialPersonnel.siteId,
          status: industrialPersonnel.status,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            isNull(industrialPersonnel.archivedAt),
            clause,
          ),
        )
        .limit(10);
      const active = matches.filter((m) => isActivePersonnelStatus(m.status));
      let filtered = active;
      if (lastName) {
        const needle = lastName.toLowerCase();
        filtered = active.filter((m) => (m.lastName ?? "").trim().toLowerCase() === needle);
      }
      const match = pickPreferredPersonnelMatch(filtered, employeeNumber);
      if (!match) {
        return { matched: false as const };
      }
      return {
        matched: true as const,
        employee: {
          displayName: [match.firstName, match.lastName].filter(Boolean).join(" ").trim(),
          employeeNumber: match.employeeNumber,
          departmentId: match.departmentId,
          // opaque id for submit only — not a directory
          personnelToken: match.id,
        },
      };
    });
  }

  async listPublicItems(token: string, query: ListQuery = {}) {
    const { tokenHash, tenantId } = await this.resolveTokenTenant(token);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const row = await this.loadActiveStation(tx, tenantId, tokenHash);
      const config = parseStationConfig(row.actionConfig);
      const q = asOptionalString(query.q)?.toLowerCase() ?? "";
      const categoryId = asOptionalString(query.categoryId);

      const filters = [
        eq(industrialSupplyItems.tenantId, tenantId),
        isNull(industrialSupplyItems.archivedAt),
        eq(industrialSupplyItems.status, "ACTIVE"),
        eq(industrialSupplyItems.allowQrRequests, true),
      ];
      if (config.catalogMode === "CATEGORIES" && config.categoryIds.length > 0) {
        filters.push(inArray(industrialSupplyItems.categoryId, config.categoryIds));
      }
      if (config.catalogMode === "ITEMS" && config.itemIds.length > 0) {
        filters.push(inArray(industrialSupplyItems.id, config.itemIds));
      }
      if (categoryId) filters.push(eq(industrialSupplyItems.categoryId, categoryId));
      if (q) {
        filters.push(
          or(
            ilike(industrialSupplyItems.name, `%${q}%`),
            ilike(industrialSupplyItems.itemNumber, `%${q}%`),
            ilike(industrialSupplyItems.sku, `%${q}%`),
            ilike(industrialSupplyItems.description, `%${q}%`),
          )!,
        );
      }

      const items = await tx
        .select({
          id: industrialSupplyItems.id,
          name: industrialSupplyItems.name,
          shortName: industrialSupplyItems.shortName,
          description: industrialSupplyItems.description,
          itemNumber: industrialSupplyItems.itemNumber,
          sku: industrialSupplyItems.sku,
          categoryId: industrialSupplyItems.categoryId,
          unitOfMeasure: industrialSupplyItems.unitOfMeasure,
          maxQuantityPerRequest: industrialSupplyItems.maxQuantityPerRequest,
          ppeCategory: industrialSupplyItems.ppeCategory,
        })
        .from(industrialSupplyItems)
        .where(and(...filters))
        .orderBy(industrialSupplyItems.name)
        .limit(200);

      const itemIds = items.map((i) => i.id);
      const variants =
        itemIds.length === 0
          ? []
          : await tx
              .select({
                id: industrialSupplyItemVariants.id,
                itemId: industrialSupplyItemVariants.itemId,
                name: industrialSupplyItemVariants.name,
                sizeLabel: industrialSupplyItemVariants.sizeLabel,
                status: industrialSupplyItemVariants.status,
              })
              .from(industrialSupplyItemVariants)
              .where(
                and(
                  eq(industrialSupplyItemVariants.tenantId, tenantId),
                  isNull(industrialSupplyItemVariants.archivedAt),
                  inArray(industrialSupplyItemVariants.itemId, itemIds),
                ),
              );

      const qtyByItem = new Map<string, number>();
      if (itemIds.length > 0 && config.inventoryVisibility !== "HIDDEN") {
        const invFilters = [
          eq(industrialSupplyLocationInventory.tenantId, tenantId),
          inArray(industrialSupplyLocationInventory.itemId, itemIds),
        ];
        if (config.catalogMode === "LOCATION_ONLY" && row.targetId) {
          invFilters.push(eq(industrialSupplyLocationInventory.locationId, row.targetId));
        } else if (row.targetId && config.catalogMode !== "ALL_SITE") {
          invFilters.push(eq(industrialSupplyLocationInventory.locationId, row.targetId));
        }
        const inv = await tx
          .select({
            itemId: industrialSupplyLocationInventory.itemId,
            qty: sql<string>`coalesce(sum(${industrialSupplyLocationInventory.quantityAvailable}), 0)`,
          })
          .from(industrialSupplyLocationInventory)
          .where(and(...invFilters))
          .groupBy(industrialSupplyLocationInventory.itemId);
        for (const rowInv of inv) {
          qtyByItem.set(rowInv.itemId, Number(rowInv.qty) || 0);
        }
      }

      const categories = await tx
        .select({
          id: industrialSupplyCategories.id,
          name: industrialSupplyCategories.name,
          code: industrialSupplyCategories.code,
        })
        .from(industrialSupplyCategories)
        .where(
          and(
            eq(industrialSupplyCategories.tenantId, tenantId),
            isNull(industrialSupplyCategories.archivedAt),
          ),
        )
        .orderBy(industrialSupplyCategories.sortOrder);

      return {
        categories: categories.map((c) => ({ id: c.id, name: c.name, code: c.code })),
        items: items.map((item) => {
          const qty = qtyByItem.get(item.id);
          let availability: "AVAILABLE" | "LOW" | "OUT" | null = null;
          let quantityAvailable: number | null = null;
          if (config.inventoryVisibility === "EXACT") {
            quantityAvailable = qty ?? 0;
            availability = (qty ?? 0) <= 0 ? "OUT" : (qty ?? 0) <= 5 ? "LOW" : "AVAILABLE";
          } else if (config.inventoryVisibility === "AVAILABILITY") {
            availability = (qty ?? 0) <= 0 ? "OUT" : (qty ?? 0) <= 5 ? "LOW" : "AVAILABLE";
          }
          return {
            id: item.id,
            name: item.name,
            shortName: item.shortName,
            description: item.description,
            itemNumber: item.itemNumber,
            sku: item.sku,
            categoryId: item.categoryId,
            unitOfMeasure: item.unitOfMeasure,
            maxQuantityPerRequest: item.maxQuantityPerRequest,
            ppeCategory: item.ppeCategory,
            availability,
            quantityAvailable,
            variants: variants
              .filter((v) => v.itemId === item.id && v.status === "ACTIVE")
              .map((v) => ({
                id: v.id,
                name: v.name,
                sizeLabel: v.sizeLabel,
              })),
          };
        }),
      };
    });
  }

  private async nextSsrNumber(tx: DbTx, tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SSR-${year}-`;
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(industrialSupplyRequests)
      .where(
        and(
          eq(industrialSupplyRequests.tenantId, tenantId),
          sql`${industrialSupplyRequests.requestNumber} like ${`${prefix}%`}`,
        ),
      );
    const n = (row?.count ?? 0) + 1;
    return `${prefix}${String(n).padStart(5, "0")}`;
  }

  private async writeEvent(
    tx: DbTx,
    input: {
      tenantId: string;
      requestId: string;
      eventType: string;
      previousStatus?: string | null;
      newStatus?: string | null;
      userId?: string | null;
      personnelId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.insert(industrialSupplyRequestEvents).values({
      id: createId(),
      tenantId: input.tenantId,
      requestId: input.requestId,
      eventType: input.eventType,
      previousStatus: input.previousStatus ?? null,
      newStatus: input.newStatus ?? null,
      userId: input.userId ?? null,
      personnelId: input.personnelId ?? null,
      metadataJson: input.metadata ?? {},
      createdAt: new Date(),
    });
  }

  async createPublicRequest(token: string, body: Record<string, unknown>) {
    assertPublicRateLimit(`create:${hashPublicToken(token)}`, 15);
    const { tokenHash, tenantId } = await this.resolveTokenTenant(token);
    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const station = await this.loadActiveStation(tx, tenantId, tokenHash);
      const config = parseStationConfig(station.actionConfig);
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        throw new ForgeError("VALIDATION_FAILED", "Add at least one supply item");
      }

      let priority = asString(body.priority, "ROUTINE").toUpperCase();
      if (!["ROUTINE", "NEEDED_SOON", "URGENT"].includes(priority)) priority = "ROUTINE";
      if (priority === "URGENT" && !config.allowUrgent) {
        throw new ForgeError("VALIDATION_FAILED", "Urgent requests are not enabled for this QR");
      }

      const requestorType = asString(body.requestorType, "EMPLOYEE").toUpperCase();
      let personnelId: string | null = null;
      if (requestorType === "EMPLOYEE") {
        personnelId = asOptionalString(body.personnelToken ?? body.personnelId);
        if (config.requireEmployeeId && !personnelId && !config.allowAnonymous) {
          throw new ForgeError("VALIDATION_FAILED", "Employee identification is required");
        }
        if (personnelId) {
          const [person] = await tx
            .select({ id: industrialPersonnel.id })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.id, personnelId),
                eq(industrialPersonnel.tenantId, tenantId),
                isNull(industrialPersonnel.archivedAt),
              ),
            )
            .limit(1);
          if (!person) throw new ForgeError("VALIDATION_FAILED", "Employee not found");
        }
      } else if (
        requestorType === "CONTRACTOR" ||
        requestorType === "TEMPORARY" ||
        requestorType === "VISITOR"
      ) {
        if (!config.allowContractors) {
          throw new ForgeError("VALIDATION_FAILED", "Contractor requests are not enabled");
        }
        if (!asString(body.contractorName)) {
          throw new ForgeError("VALIDATION_FAILED", "Name is required");
        }
      } else if (requestorType === "ANONYMOUS") {
        if (!config.allowAnonymous) {
          throw new ForgeError("VALIDATION_FAILED", "Anonymous requests are not enabled");
        }
      }

      const notes = config.allowNotes ? asOptionalString(body.notes ?? body.reason) : null;
      const now = new Date();
      const statusToken = generatePublicToken();
      const requestNumber = await this.nextSsrNumber(tx, tenantId);

      const [req] = await tx
        .insert(industrialSupplyRequests)
        .values({
          id: createId(),
          tenantId,
          requestNumber,
          siteId: station.siteId,
          qrLinkId: station.id,
          source: "QR_CODE",
          requestorType,
          personnelId,
          departmentId: station.departmentId,
          locationId: station.targetId,
          contractorName: asOptionalString(body.contractorName),
          contractorCompany: asOptionalString(body.contractorCompany),
          contractorPhone: asOptionalString(body.contractorPhone),
          contractorEmail: asOptionalString(body.contractorEmail),
          workArea: asOptionalString(body.workArea),
          reason: notes,
          notes,
          priority,
          status: "SUBMITTED",
          publicStatusTokenHash: hashPublicToken(statusToken),
          submittedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const lineSummaries: Array<{ name: string; quantity: number; size?: string | null }> = [];
      for (const raw of items) {
        const line = (raw ?? {}) as Record<string, unknown>;
        const custom = asBool(line.customItem, false);
        if (custom) {
          if (!config.allowCustomItems) {
            throw new ForgeError("VALIDATION_FAILED", "Custom items are not enabled");
          }
          const customName = asString(line.customItemName || line.name);
          const qty = Number(line.quantity ?? line.quantityRequested ?? 0);
          if (!customName || !(qty > 0)) continue;
          await tx.insert(industrialSupplyRequestItems).values({
            id: createId(),
            tenantId,
            requestId: req!.id,
            itemId: null,
            variantId: null,
            quantityRequested: String(qty),
            quantityApproved: "0",
            quantityReserved: "0",
            quantityIssued: "0",
            quantityBackordered: "0",
            status: "PENDING",
            customItem: true,
            customItemName: customName,
            customItemDescription: asOptionalString(line.customItemDescription || line.description),
            createdAt: now,
            updatedAt: now,
          });
          lineSummaries.push({ name: customName, quantity: qty });
          continue;
        }

        const itemId = asString(line.itemId);
        const qty = Number(line.quantity ?? line.quantityRequested ?? 0);
        if (!itemId || !(qty > 0)) continue;
        const [item] = await tx
          .select()
          .from(industrialSupplyItems)
          .where(
            and(
              eq(industrialSupplyItems.id, itemId),
              eq(industrialSupplyItems.tenantId, tenantId),
              isNull(industrialSupplyItems.archivedAt),
              eq(industrialSupplyItems.allowQrRequests, true),
            ),
          )
          .limit(1);
        if (!item) continue;
        if (item.maxQuantityPerRequest && qty > Number(item.maxQuantityPerRequest)) {
          throw new ForgeError(
            "VALIDATION_FAILED",
            `Maximum quantity for ${item.name} is ${item.maxQuantityPerRequest}`,
          );
        }
        const variantId = asOptionalString(line.variantId);
        await tx.insert(industrialSupplyRequestItems).values({
          id: createId(),
          tenantId,
          requestId: req!.id,
          itemId,
          variantId,
          quantityRequested: String(qty),
          quantityApproved: "0",
          quantityReserved: "0",
          quantityIssued: "0",
          quantityBackordered: "0",
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        });
        lineSummaries.push({ name: item.name, quantity: qty, size: null });
      }

      await this.writeEvent(tx, {
        tenantId,
        requestId: req!.id,
        eventType: "REQUEST_CREATED",
        newStatus: "SUBMITTED",
        personnelId,
        metadata: { source: "QR_CODE", qrLinkId: station.id, priority },
      });

      return {
        request: req!,
        statusToken,
        lineSummaries,
        station,
        config,
        priority,
      };
    });

    await this.notifyNewRequest({
      tenantId,
      requestId: result.request.id,
      requestNumber: result.request.requestNumber,
      siteId: result.station.siteId,
      priority: result.priority,
      config: result.config,
      lineCount: result.lineSummaries.length,
    });

    return {
      requestNumber: result.request.requestNumber,
      status: result.request.status,
      priority: result.request.priority,
      statusToken: result.statusToken,
      items: result.lineSummaries,
      message: "Your request has been sent to the Safety/EHS team.",
    };
  }

  async getPublicRequestStatus(statusToken: string) {
    if (!isValidPublicToken(statusToken)) {
      throw new ForgeError("NOT_FOUND", "Request not found");
    }
    const hash = hashPublicToken(statusToken);
    const rows = [
      ...(await this.db.execute(
        sql`select tenant_id::text as tenant_id from industrial_supply_requests where public_status_token_hash = ${hash} and archived_at is null limit 1`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id ? String(rows[0].tenant_id) : null;
    if (!tenantId) throw new ForgeError("NOT_FOUND", "Request not found");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [req] = await tx
        .select()
        .from(industrialSupplyRequests)
        .where(
          and(
            eq(industrialSupplyRequests.tenantId, tenantId),
            eq(industrialSupplyRequests.publicStatusTokenHash, hash),
            isNull(industrialSupplyRequests.archivedAt),
          ),
        )
        .limit(1);
      if (!req) throw new ForgeError("NOT_FOUND", "Request not found");
      const lines = await tx
        .select({
          quantityRequested: industrialSupplyRequestItems.quantityRequested,
          quantityIssued: industrialSupplyRequestItems.quantityIssued,
          status: industrialSupplyRequestItems.status,
          customItemName: industrialSupplyRequestItems.customItemName,
          itemName: industrialSupplyItems.name,
        })
        .from(industrialSupplyRequestItems)
        .leftJoin(
          industrialSupplyItems,
          eq(industrialSupplyItems.id, industrialSupplyRequestItems.itemId),
        )
        .where(
          and(
            eq(industrialSupplyRequestItems.tenantId, tenantId),
            eq(industrialSupplyRequestItems.requestId, req.id),
          ),
        );
      return {
        requestNumber: req.requestNumber,
        status: req.status,
        priority: req.priority,
        employeeMessage: req.employeeMessage,
        submittedAt: req.submittedAt ?? req.createdAt,
        items: lines.map((l) => ({
          name: l.customItemName || l.itemName || "Item",
          quantityRequested: l.quantityRequested,
          quantityIssued: l.quantityIssued,
          status: l.status,
        })),
      };
    });
  }

  private async notifyNewRequest(input: {
    tenantId: string;
    requestId: string;
    requestNumber: string;
    siteId: string | null;
    priority: string;
    config: SupplyRequestStationConfig;
    lineCount: number;
  }) {
    if (!this.notifications) return;
    const recipients = new Set<string>();
    if (input.config.primaryRecipientUserId) recipients.add(input.config.primaryRecipientUserId);
    for (const id of input.config.notifyUserIds) recipients.add(id);
    if (recipients.size === 0) return;

    const urgent = input.priority === "URGENT";
    const title = urgent ? "URGENT Safety Supply Request" : "New Safety Supply Request";
    const body = `${input.requestNumber}: ${input.lineCount} item(s) requested.`;
    const href = `/modules/safety-supplies?tab=requests&id=${encodeURIComponent(input.requestId)}`;

    for (const userId of recipients) {
      try {
        await this.notifications.create(
          input.tenantId,
          {
            userId,
            type: urgent
              ? "industrial.supplies.request_urgent"
              : "industrial.supplies.request_submitted",
            title,
            body,
            priority: urgent ? "HIGH" : "NORMAL",
            destination: "IN_APP",
            href,
            metadataJson: {
              requestId: input.requestId,
              requestNumber: input.requestNumber,
              siteId: input.siteId,
            },
          },
          {
            userId: null,
            tenantId: input.tenantId,
            isPlatformAdmin: true,
            permissions: new Set(),
            activeProducts: new Set(),
          } as unknown as ForgePrincipal,
        );
      } catch {
        /* best-effort */
      }
    }
  }

  async requestAnalytics(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const openStatuses = [
          "SUBMITTED",
          "PENDING",
          "UNDER_REVIEW",
          "APPROVED",
          "PARTIALLY_APPROVED",
          "READY_FOR_PICKUP",
          "PARTIALLY_FULFILLED",
          "BACKORDERED",
        ];
        const [open] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialSupplyRequests)
          .where(
            and(
              eq(industrialSupplyRequests.tenantId, tenantId),
              isNull(industrialSupplyRequests.archivedAt),
              inArrayStatus(openStatuses),
            ),
          );
        const [urgent] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialSupplyRequests)
          .where(
            and(
              eq(industrialSupplyRequests.tenantId, tenantId),
              isNull(industrialSupplyRequests.archivedAt),
              eq(industrialSupplyRequests.priority, "URGENT"),
              inArrayStatus(openStatuses),
            ),
          );
        const [ready] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialSupplyRequests)
          .where(
            and(
              eq(industrialSupplyRequests.tenantId, tenantId),
              isNull(industrialSupplyRequests.archivedAt),
              eq(industrialSupplyRequests.status, "READY_FOR_PICKUP"),
            ),
          );
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const [fulfilledToday] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialSupplyRequests)
          .where(
            and(
              eq(industrialSupplyRequests.tenantId, tenantId),
              isNull(industrialSupplyRequests.archivedAt),
              eq(industrialSupplyRequests.status, "FULFILLED"),
              sql`${industrialSupplyRequests.fulfilledAt} >= ${startOfDay}`,
            ),
          );

        const stations = await tx
          .select({
            id: qrLinks.id,
            label: qrLinks.label,
            scanCount: qrLinks.scanCount,
          })
          .from(qrLinks)
          .where(
            and(
              eq(qrLinks.tenantId, tenantId),
              eq(qrLinks.targetType, SUPPLY_REQUEST_STATION_TARGET),
              isNull(qrLinks.archivedAt),
            ),
          )
          .orderBy(desc(qrLinks.scanCount))
          .limit(10);

        const stationIds = stations.map((s) => s.id);
        const requestCounts =
          stationIds.length === 0
            ? []
            : await tx
                .select({
                  qrLinkId: industrialSupplyRequests.qrLinkId,
                  count: sql<number>`count(*)::int`,
                })
                .from(industrialSupplyRequests)
                .where(
                  and(
                    eq(industrialSupplyRequests.tenantId, tenantId),
                    isNull(industrialSupplyRequests.archivedAt),
                    inArray(industrialSupplyRequests.qrLinkId, stationIds),
                  ),
                )
                .groupBy(industrialSupplyRequests.qrLinkId);

        const countByStation = new Map(
          requestCounts.map((row) => [row.qrLinkId as string, row.count ?? 0]),
        );

        const [scanAgg] = await tx
          .select({
            scans: sql<number>`coalesce(sum(${qrLinks.scanCount}), 0)::int`,
          })
          .from(qrLinks)
          .where(
            and(
              eq(qrLinks.tenantId, tenantId),
              eq(qrLinks.targetType, SUPPLY_REQUEST_STATION_TARGET),
              isNull(qrLinks.archivedAt),
            ),
          );

        const [qrReqAgg] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialSupplyRequests)
          .where(
            and(
              eq(industrialSupplyRequests.tenantId, tenantId),
              isNull(industrialSupplyRequests.archivedAt),
              eq(industrialSupplyRequests.source, "QR_CODE"),
            ),
          );

        const totalScans = scanAgg?.scans ?? 0;
        const totalQrRequests = qrReqAgg?.count ?? 0;

        return {
          openRequests: open?.count ?? 0,
          urgentRequests: urgent?.count ?? 0,
          readyForPickup: ready?.count ?? 0,
          fulfilledToday: fulfilledToday?.count ?? 0,
          totalScans,
          totalQrRequests,
          conversionRate: totalScans > 0 ? totalQrRequests / totalScans : null,
          topQrStations: stations.map((s) => ({
            id: s.id,
            name: s.label,
            scanCount: s.scanCount,
            requestCount: countByStation.get(s.id) ?? 0,
          })),
        };
      },
      principal.userId,
    );
  }
}

function inArrayStatus(statuses: string[]) {
  return inArray(industrialSupplyRequests.status, statuses);
}

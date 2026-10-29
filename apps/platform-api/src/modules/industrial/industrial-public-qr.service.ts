import { Inject, Injectable } from "@nestjs/common";
import {
  createId,
  industrialCorrectiveActions,
  industrialDepartments,
  industrialEquipment,
  industrialFleetVehicles,
  industrialInspections,
  industrialLotoProcedures,
  industrialPersonnel,
  industrialPersonnelSmsConsents,
  industrialQrLinkAuditEvents,
  industrialQrLinkScanEvents,
  industrialSites,
  industrialSupplyItems,
  industrialSupplyKits,
  industrialSupplyLocations,
  industrialSupplySerials,
  industrialTrainingAssignmentAssignees,
  industrialTrainingAssignments,
  qrLinks,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import {
  EMERGENCY_SMS_CONSENT_TEXT,
  EMERGENCY_SMS_CONSENT_VERSION,
  EMERGENCY_SMS_SIGNUP_QR_TARGET,
} from "@forge/contracts";
import { ForgeError, isForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { RequestWithIds } from "../../common/request-ids.js";
import { DATABASE } from "../../tokens.js";
import { AuthContextService } from "../auth-context/auth-context.service.js";
import { IndustrialDomainService } from "./industrial-domain.service.js";
import {
  defaultQrActionConfigFlags,
  inspectionFrequencyLabel,
  parseQrActionConfig,
  qrActionConfigEnabled,
} from "./qr-action-config.js";
import {
  createQrIssueCorrectiveAction,
  isQrAssetTargetType,
  markQrAssetOutOfService,
  returnQrAssetToService,
} from "./qr-scan-asset.js";
import { personnelIsActive } from "./personnel-status.js";
import { IndustrialTrainingLmsService } from "./industrial-training-lms.service.js";
import {
  formatSmsPhone,
  lastNameMatchesPersonnel,
  maskSmsPhone,
  normalizeSmsPhone,
} from "./sms-signup.js";
import { employeeNumberWhereClause, pickPreferredPersonnelMatch } from "./employee-number.js";
import {
  buildScanActions,
  filterScanActionsForViewer,
  type ScanActionDef,
} from "./scan-actions.js";
import {
  hashPublicToken,
  isPublicQrAccessMode,
  isPublicRequiredQrTarget,
  isValidPublicToken,
  normalizeQrAccessMode,
  resolveQrAccessModeForTarget,
} from "./qr-token.js";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type ResolvedToken = {
  raw: string;
  tokenHash: string;
  tenantId: string;
};

type AssetSummary = {
  label: string;
  sublabel?: string | null;
  status?: string | null;
  locationName?: string | null;
  outOfService?: boolean;
  outOfServiceReason?: string | null;
  /** Fleet vehicles only — when true, scan actions prefer DVIR pre/post trip. */
  dotRegulated?: boolean;
  /** Plaintext DVIR public token when still stored on the vehicle payload. */
  dvirPublicToken?: string | null;
};

type VerifiedPerson = {
  id: string;
  displayName: string;
  employeeNumber: string;
  departmentId: string | null;
  siteId: string | null;
};

type TrainingStatusItem = {
  assignmentId: string;
  title: string;
  status: "CURRENT" | "EXPIRED" | "NOT_COMPLETED" | "ASSIGNED" | "IN_PROGRESS";
  completedAt?: string | null;
  href: string;
};

@Injectable()
export class IndustrialPublicQrService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly domain: IndustrialDomainService,
    private readonly authContext: AuthContextService,
    private readonly lms: IndustrialTrainingLmsService,
  ) {}

  /**
   * Public QR routes must never trust client-supplied permission codes.
   * When a Bearer token is present, resolve the principal server-side and
   * only apply permissions if the caller belongs to the QR tenant (or is a
   * platform admin). Invalid tokens fall back to anonymous (empty set).
   */
  private async resolveViewerPermissions(
    req: RequestWithIds | undefined,
    qrTenantId: string,
  ): Promise<Set<string>> {
    if (!req) return new Set();
    const authHeader = req.header("authorization") ?? req.header("Authorization");
    if (!authHeader || !/^Bearer\s+\S+/i.test(authHeader)) {
      return new Set();
    }
    try {
      const principal = await this.authContext.resolvePrincipal(req);
      if (principal.tenantId !== qrTenantId && !principal.isPlatformAdmin) {
        return new Set();
      }
      return new Set(principal.permissions);
    } catch (error) {
      if (isForgeError(error) && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")) {
        return new Set();
      }
      throw error;
    }
  }

  private async resolveToken(token: string): Promise<ResolvedToken> {
    const raw = String(token ?? "").trim();
    if (!isValidPublicToken(raw)) throw new ForgeError("NOT_FOUND", "QR link not found");
    const tokenHash = hashPublicToken(raw);
    const rows = [
      ...(await this.db.execute(
        sql`select forge_industrial_qr_link_tenant_for_token(${tokenHash}) as tenant_id`,
      )),
    ] as Array<{ tenant_id?: string | null }>;
    const tenantId = rows[0]?.tenant_id ? String(rows[0].tenant_id) : null;
    if (!tenantId) throw new ForgeError("NOT_FOUND", "QR link not found");
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

  private async resolveAssetSummary(
    tx: DatabaseTransaction,
    tenantId: string,
    targetType: string | null | undefined,
    targetId: string | null | undefined,
    accessMode: string,
  ): Promise<AssetSummary | null> {
    const type = String(targetType ?? "")
      .trim()
      .toUpperCase();
    const id = String(targetId ?? "").trim();
    if (!type || !id) return null;

    const limited =
      accessMode === "PUBLIC_READ" ||
      accessMode === "PUBLIC_LIMITED" ||
      accessMode === "PUBLIC_FORM_ONLY" ||
      accessMode === "PUBLIC_ACTION";

    if (type === "EQUIPMENT" || type === "MACHINE" || type === "TOOL") {
      const [row] = await tx
        .select()
        .from(industrialEquipment)
        .where(
          and(
            eq(industrialEquipment.id, id),
            eq(industrialEquipment.tenantId, tenantId),
            isNull(industrialEquipment.archivedAt),
          ),
        )
        .limit(1);
      if (!row) return null;
      let locationName: string | null = null;
      if (row.siteId) {
        const [site] = await tx
          .select({ name: industrialSites.name })
          .from(industrialSites)
          .where(eq(industrialSites.id, row.siteId))
          .limit(1);
        locationName = site?.name ?? null;
      }
      const meta = (row.sourcePayload ?? {}) as Record<string, unknown>;
      const outOfService =
        String(row.status ?? "").toUpperCase() !== "ACTIVE" ||
        meta.outOfService === true ||
        meta.out_of_service === true;
      return {
        label: row.name,
        sublabel: row.equipmentNumber ?? row.equipmentType,
        status: row.status,
        locationName,
        outOfService,
        outOfServiceReason:
          typeof meta.outOfServiceReason === "string"
            ? meta.outOfServiceReason
            : typeof meta.out_of_service_reason === "string"
              ? meta.out_of_service_reason
              : null,
      };
    }

    if (type === "VEHICLE") {
      const [row] = await tx
        .select()
        .from(industrialFleetVehicles)
        .where(
          and(
            eq(industrialFleetVehicles.id, id),
            eq(industrialFleetVehicles.tenantId, tenantId),
            isNull(industrialFleetVehicles.archivedAt),
          ),
        )
        .limit(1);
      if (!row) return null;
      const label =
        row.assetNumber?.trim() ||
        [row.year, row.make, row.model].filter(Boolean).join(" ") ||
        row.licensePlate?.trim() ||
        "Fleet asset";
      const meta = (row.sourcePayload ?? {}) as Record<string, unknown>;
      const outOfService =
        row.outOfService ||
        String(row.status ?? "").toUpperCase() !== "ACTIVE" ||
        meta.outOfService === true;
      let dvirPublicToken: string | null = null;
      if (row.dvirPublicTokenHash) {
        const stored = String(meta.dvirPublicToken ?? "").trim();
        if (stored.length >= 16 && hashPublicToken(stored) === row.dvirPublicTokenHash) {
          dvirPublicToken = stored;
        }
      }
      return {
        label,
        sublabel: limited ? null : (row.vin ?? row.licensePlate),
        status: row.status,
        locationName: row.locationName,
        outOfService,
        outOfServiceReason:
          row.outOfServiceReason ??
          (typeof meta.outOfServiceReason === "string" ? meta.outOfServiceReason : null),
        dotRegulated: Boolean(row.dotRegulated),
        dvirPublicToken,
      };
    }

    if (type === "LOCATION") {
      const [row] = await tx
        .select()
        .from(industrialSites)
        .where(
          and(
            eq(industrialSites.id, id),
            eq(industrialSites.tenantId, tenantId),
            isNull(industrialSites.archivedAt),
          ),
        )
        .limit(1);
      if (!row) return null;
      return { label: row.name, status: row.status };
    }

    if (type === "SAFETY_SUPPLY" || type === "SUPPLY_ITEM") {
      const [row] = await tx
        .select()
        .from(industrialSupplyItems)
        .where(
          and(
            eq(industrialSupplyItems.id, id),
            eq(industrialSupplyItems.tenantId, tenantId),
            isNull(industrialSupplyItems.archivedAt),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        label: row.name,
        sublabel: row.itemNumber ?? row.sku,
        status: row.status,
      };
    }

    if (type === "SUPPLY_LOCATION") {
      const [row] = await tx
        .select()
        .from(industrialSupplyLocations)
        .where(
          and(
            eq(industrialSupplyLocations.id, id),
            eq(industrialSupplyLocations.tenantId, tenantId),
            isNull(industrialSupplyLocations.archivedAt),
          ),
        )
        .limit(1);
      if (!row) return null;
      return { label: row.name, sublabel: row.code, status: row.status };
    }

    if (type === "SUPPLY_KIT") {
      const [row] = await tx
        .select()
        .from(industrialSupplyKits)
        .where(
          and(
            eq(industrialSupplyKits.id, id),
            eq(industrialSupplyKits.tenantId, tenantId),
            isNull(industrialSupplyKits.archivedAt),
          ),
        )
        .limit(1);
      if (!row) return null;
      return { label: row.name, sublabel: row.kitNumber, status: row.status };
    }

    if (type === "SUPPLY_SERIAL") {
      const [row] = await tx
        .select()
        .from(industrialSupplySerials)
        .where(
          and(
            eq(industrialSupplySerials.id, id),
            eq(industrialSupplySerials.tenantId, tenantId),
            isNull(industrialSupplySerials.archivedAt),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        label: row.forgeAssetNumber,
        sublabel: row.manufacturerSerialNumber,
        status: row.status,
        outOfService: ["OUT_OF_SERVICE", "QUARANTINED", "RETIRED", "DISPOSED", "DAMAGED"].includes(
          String(row.status ?? "").toUpperCase(),
        ),
      };
    }

    if (type === "LOTO_PROCEDURE") {
      const [row] = await tx
        .select()
        .from(industrialLotoProcedures)
        .where(
          and(
            eq(industrialLotoProcedures.id, id),
            eq(industrialLotoProcedures.tenantId, tenantId),
            isNull(industrialLotoProcedures.archivedAt),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        label: row.title,
        sublabel: row.procedureNumber,
        status: row.status,
      };
    }

    return limited ? { label: type.replace(/_/g, " "), status: "ACTIVE" } : null;
  }

  private async recordPublicScan(
    tx: DatabaseTransaction,
    tenantId: string,
    qrLinkId: string,
    action: string,
    input: {
      personnelId?: string | null;
      anonymous?: boolean;
      result?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    const now = new Date();
    await tx.insert(industrialQrLinkScanEvents).values({
      id: createId(),
      tenantId,
      qrLinkId,
      scannedAt: now,
      action,
      result: input.result ?? "OK",
      anonymous: input.anonymous ?? !input.personnelId,
      personnelId: input.personnelId ?? null,
      metadata: input.metadata ?? {},
      sourceSystem: "FORGE",
      createdAt: now,
      updatedAt: now,
    });
    await tx
      .update(qrLinks)
      .set({
        lastScannedAt: now,
        scanCount: sql`${qrLinks.scanCount} + 1`,
        updatedAt: now,
      })
      .where(and(eq(qrLinks.id, qrLinkId), eq(qrLinks.tenantId, tenantId)));
  }

  async getScanContext(token: string) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
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

      let link = row;
      const targetType = String(link.targetType ?? "")
        .trim()
        .toUpperCase();
      if (isPublicRequiredQrTarget(targetType) && !isPublicQrAccessMode(link.accessMode)) {
        const before = normalizeQrAccessMode(link.accessMode);
        const now = new Date();
        const nextConfig = {
          ...defaultQrActionConfigFlags(),
          ...(typeof link.actionConfig === "object" &&
          link.actionConfig &&
          !Array.isArray(link.actionConfig)
            ? (link.actionConfig as Record<string, unknown>)
            : {}),
          reportIssue: true,
          ...(targetType === "LOTO_PROCEDURE"
            ? {
                viewLoto: true,
                lotoProcedureId: link.targetId,
              }
            : {}),
        };
        const [updated] = await tx
          .update(qrLinks)
          .set({
            accessMode: resolveQrAccessModeForTarget(targetType, "PUBLIC_ACTION"),
            actionConfig: nextConfig,
            updatedAt: now,
          })
          .where(and(eq(qrLinks.id, link.id), eq(qrLinks.tenantId, tenantId)))
          .returning();
        if (updated) {
          link = updated;
          await tx.insert(industrialQrLinkAuditEvents).values({
            id: createId(),
            tenantId,
            qrLinkId: link.id,
            eventType: "ACCESS_MODE_CHANGED",
            eventAt: now,
            actorUserId: null,
            details: {
              before,
              after: "PUBLIC_ACTION",
              via: "public-scan-upgrade",
              targetType,
            },
            sourceSystem: "FORGE",
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const accessMode = normalizeQrAccessMode(link.accessMode);
      const branding = await this.resolveTenantBrandingSummary(tx, tenantId);
      const asset = await this.resolveAssetSummary(
        tx,
        tenantId,
        link.targetType,
        link.targetId,
        accessMode,
      );

      await this.recordPublicScan(tx, tenantId, link.id, "CONTEXT", {
        anonymous: true,
        metadata: { accessMode },
      });

      const actions = buildScanActions({
        targetType: link.targetType,
        targetId: link.targetId,
        accessMode,
        actionConfig: link.actionConfig,
        qrLinkId: link.id,
        assetOutOfService: Boolean(asset?.outOfService),
        dotRegulated: Boolean(asset?.dotRegulated),
        publicToken: token,
        dvirPublicToken: asset?.dvirPublicToken ?? null,
      });

      return {
        qrLinkId: link.id,
        name: link.label ?? link.displayCode ?? "QR link",
        displayCode: link.displayCode,
        description: link.description,
        accessMode,
        targetType: link.targetType,
        targetId: link.targetId,
        requiresEmployeeNumber:
          accessMode === "EMPLOYEE_NUMBER" || accessMode === "AUTHENTICATED_RECORD",
        requiresSignIn:
          accessMode === "AUTHENTICATED_ONLY" || accessMode === "AUTHENTICATED_RECORD",
        publicLimited: isPublicQrAccessMode(accessMode),
        tenantKey: branding.tenantKey,
        companyName: branding.companyName,
        logoUrl: branding.logoUrl,
        asset,
        actions,
      };
    });
  }

  async identifyEmployee(token: string, employeeNumber: string) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
    const normalized = String(employeeNumber ?? "").trim();
    if (!normalized) throw new ForgeError("VALIDATION_FAILED", "employeeNumber is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [link] = await tx
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
      if (!link) throw new ForgeError("NOT_FOUND", "QR link not found");

      const clause = employeeNumberWhereClause(normalized);
      if (!clause)
        throw new ForgeError("NOT_FOUND", "Employee number not found for this organization.");

      const candidates = await tx
        .select({
          id: industrialPersonnel.id,
          displayName: industrialPersonnel.displayName,
          employeeNumber: industrialPersonnel.employeeNumber,
          departmentId: industrialPersonnel.departmentId,
          siteId: industrialPersonnel.siteId,
          jobTitle: industrialPersonnel.jobTitle,
        })
        .from(industrialPersonnel)
        .where(
          and(
            eq(industrialPersonnel.tenantId, tenantId),
            clause,
            personnelIsActive(),
            isNull(industrialPersonnel.archivedAt),
          ),
        );

      const person = pickPreferredPersonnelMatch(candidates, normalized);

      if (!person?.employeeNumber) {
        throw new ForgeError("NOT_FOUND", "Employee number not found for this organization.");
      }

      let departmentName: string | null = null;
      let siteName: string | null = null;
      if (person.departmentId) {
        const [dept] = await tx
          .select({ name: industrialDepartments.name })
          .from(industrialDepartments)
          .where(eq(industrialDepartments.id, person.departmentId))
          .limit(1);
        departmentName = dept?.name ?? null;
      }
      if (person.siteId) {
        const [site] = await tx
          .select({ name: industrialSites.name })
          .from(industrialSites)
          .where(eq(industrialSites.id, person.siteId))
          .limit(1);
        siteName = site?.name ?? null;
      }

      await this.recordPublicScan(tx, tenantId, link.id, "IDENTIFY", {
        personnelId: person.id,
        metadata: { employeeNumber: person.employeeNumber },
      });

      const accessMode = normalizeQrAccessMode(link.accessMode);
      const asset = await this.resolveAssetSummary(
        tx,
        tenantId,
        link.targetType,
        link.targetId,
        accessMode,
      );
      const allActions = buildScanActions({
        targetType: link.targetType,
        targetId: link.targetId,
        accessMode,
        actionConfig: link.actionConfig,
        qrLinkId: link.id,
        assetOutOfService: Boolean(asset?.outOfService),
        dotRegulated: Boolean(asset?.dotRegulated),
        publicToken: token,
        dvirPublicToken: asset?.dvirPublicToken ?? null,
      });
      const actions = filterScanActionsForViewer(allActions, {
        verifiedEmployee: true,
        permissions: new Set(),
      });

      const trainingStatus = await this.resolveTrainingStatus(
        tx,
        tenantId,
        person.id,
        person.employeeNumber,
        link.targetType,
        link.targetId,
        link.actionConfig,
      );

      return {
        personnelId: person.id,
        displayName: person.displayName ?? person.employeeNumber,
        employeeNumber: person.employeeNumber,
        departmentName,
        siteName,
        jobTitle: person.jobTitle,
        actions,
        trainingStatus,
      };
    });
  }

  private async resolveTrainingStatus(
    tx: DatabaseTransaction,
    tenantId: string,
    personnelId: string,
    employeeNumber: string,
    targetType: string | null | undefined,
    targetId: string | null | undefined,
    actionConfigRaw: unknown,
  ): Promise<TrainingStatusItem[]> {
    const actionConfig = parseQrActionConfig(actionConfigRaw);
    const assignmentIds = new Set<string>();
    if (actionConfig.trainingAssignmentId) assignmentIds.add(actionConfig.trainingAssignmentId);
    if (String(targetType ?? "").toUpperCase() === "TRAINING" && targetId) {
      assignmentIds.add(String(targetId));
    }
    if (assignmentIds.size === 0) return [];

    const items: TrainingStatusItem[] = [];
    for (const assignmentId of assignmentIds) {
      const [assignment] = await tx
        .select({
          id: industrialTrainingAssignments.id,
          title: industrialTrainingAssignments.title,
          status: industrialTrainingAssignments.status,
        })
        .from(industrialTrainingAssignments)
        .where(
          and(
            eq(industrialTrainingAssignments.tenantId, tenantId),
            eq(industrialTrainingAssignments.id, assignmentId),
            isNull(industrialTrainingAssignments.archivedAt),
          ),
        )
        .limit(1);
      if (!assignment) continue;

      const [assignee] = await tx
        .select({
          status: industrialTrainingAssignmentAssignees.status,
          completedAt: industrialTrainingAssignmentAssignees.completedAt,
        })
        .from(industrialTrainingAssignmentAssignees)
        .where(
          and(
            eq(industrialTrainingAssignmentAssignees.tenantId, tenantId),
            eq(industrialTrainingAssignmentAssignees.assignmentId, assignmentId),
            or(
              eq(industrialTrainingAssignmentAssignees.personnelId, personnelId),
              sql`lower(trim(coalesce(${industrialTrainingAssignmentAssignees.employeeNumber}, ''))) = lower(${employeeNumber})`,
            ),
          ),
        )
        .limit(1);

      const rawStatus = String(assignee?.status ?? "NOT_STARTED").toUpperCase();
      let status: TrainingStatusItem["status"] = "NOT_COMPLETED";
      if (rawStatus === "COMPLETED" || assignee?.completedAt) status = "CURRENT";
      else if (rawStatus === "IN_PROGRESS") status = "IN_PROGRESS";
      else if (rawStatus === "ASSIGNED" || rawStatus === "NOT_STARTED") status = "ASSIGNED";

      items.push({
        assignmentId: assignment.id,
        title: assignment.title,
        status,
        completedAt: assignee?.completedAt?.toISOString?.() ?? null,
        href: `/training/portal?assignmentId=${encodeURIComponent(assignment.id)}`,
      });
    }
    return items;
  }

  async listActions(
    token: string,
    body: {
      employeeNumber?: string;
      req?: RequestWithIds;
    } = {},
  ) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
    const permissions = await this.resolveViewerPermissions(body.req, tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [link] = await tx
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
      if (!link) throw new ForgeError("NOT_FOUND", "QR link not found");

      const accessMode = normalizeQrAccessMode(link.accessMode);
      const asset = await this.resolveAssetSummary(
        tx,
        tenantId,
        link.targetType,
        link.targetId,
        accessMode,
      );
      const allActions = buildScanActions({
        targetType: link.targetType,
        targetId: link.targetId,
        accessMode,
        actionConfig: link.actionConfig,
        qrLinkId: link.id,
        assetOutOfService: Boolean(asset?.outOfService),
        dotRegulated: Boolean(asset?.dotRegulated),
        publicToken: token,
        dvirPublicToken: asset?.dvirPublicToken ?? null,
      });

      let verifiedEmployee = false;
      const normalized = String(body.employeeNumber ?? "").trim();
      if (normalized) {
        const clause = employeeNumberWhereClause(normalized);
        const candidates = clause
          ? await tx
              .select({ id: industrialPersonnel.id })
              .from(industrialPersonnel)
              .where(
                and(
                  eq(industrialPersonnel.tenantId, tenantId),
                  clause,
                  personnelIsActive(),
                  isNull(industrialPersonnel.archivedAt),
                ),
              )
          : [];
        verifiedEmployee = candidates.length > 0;
      }

      const actions: ScanActionDef[] = filterScanActionsForViewer(allActions, {
        verifiedEmployee,
        permissions,
      });

      return { actions, verifiedEmployee };
    });
  }

  private fieldWorkerPrincipal(tenantId: string): ForgePrincipal {
    return {
      authenticationIdentityId: "qr-public-scan",
      userId: "qr-public-scan",
      personId: null,
      tenantId,
      organizationIds: [],
      permissions: new Set(),
      activeProducts: new Set(["INDUSTRIAL"]),
      activeModules: new Set(),
      correlationId: "qr-public-scan",
      requestId: "qr-public-scan",
      authProvider: "COGNITO",
      isPlatformAdmin: false,
    };
  }

  private async loadActiveLink(tx: DatabaseTransaction, tenantId: string, tokenHash: string) {
    const [link] = await tx
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
    if (!link) throw new ForgeError("NOT_FOUND", "QR link not found");
    return link as typeof link & { actionConfig: Record<string, unknown> };
  }

  private async verifyEmployeeInTx(
    tx: DatabaseTransaction,
    tenantId: string,
    employeeNumber: string,
  ): Promise<VerifiedPerson> {
    const normalized = String(employeeNumber ?? "").trim();
    if (!normalized) throw new ForgeError("VALIDATION_FAILED", "employeeNumber is required");

    const clause = employeeNumberWhereClause(normalized);
    if (!clause) throw new ForgeError("VALIDATION_FAILED", "employeeNumber is required");

    const candidates = await tx
      .select({
        id: industrialPersonnel.id,
        displayName: industrialPersonnel.displayName,
        employeeNumber: industrialPersonnel.employeeNumber,
        departmentId: industrialPersonnel.departmentId,
        siteId: industrialPersonnel.siteId,
      })
      .from(industrialPersonnel)
      .where(
        and(
          eq(industrialPersonnel.tenantId, tenantId),
          clause,
          personnelIsActive(),
          isNull(industrialPersonnel.archivedAt),
        ),
      );

    const person = pickPreferredPersonnelMatch(candidates, normalized);

    if (!person?.employeeNumber) {
      throw new ForgeError("NOT_FOUND", "Employee number not found for this organization.");
    }

    return {
      id: person.id,
      displayName: person.displayName ?? person.employeeNumber,
      employeeNumber: person.employeeNumber,
      departmentId: person.departmentId,
      siteId: person.siteId,
    };
  }

  /**
   * Emergency SMS Alerts self-signup from the tenant signup QR code.
   * Verifies employee number + last name, updates the personnel SMS number,
   * and files a signed consent record on the personnel file.
   */
  async submitSmsSignup(
    token: string,
    body: Record<string, unknown>,
    client: { ip: string | null; userAgent: string | null },
  ) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
    const employeeNumber = String(body.employeeNumber ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const signatureName = String(body.signatureName ?? "")
      .trim()
      .slice(0, 300);
    if (!employeeNumber || !lastName) {
      throw new ForgeError("VALIDATION_FAILED", "Employee number and last name are required.");
    }
    const phoneDigits = normalizeSmsPhone(body.phone);
    if (!phoneDigits) {
      throw new ForgeError("VALIDATION_FAILED", "Enter a valid 10-digit US mobile number.");
    }
    if (body.consent !== true) {
      throw new ForgeError("VALIDATION_FAILED", "Check the consent box to sign up for SMS alerts.");
    }
    if (signatureName.length < 2) {
      throw new ForgeError("VALIDATION_FAILED", "Type your full name to sign the form.");
    }

    const bucketKey = `sms-signup:${tokenHash.slice(0, 16)}:${client.ip ?? "unknown"}`;
    await this.lms.checkRateLimit(tenantId, bucketKey, false);

    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const link = await this.loadActiveLink(tx, tenantId, tokenHash);
      if (link.targetType !== EMERGENCY_SMS_SIGNUP_QR_TARGET) {
        throw new ForgeError("NOT_FOUND", "QR link not found");
      }

      const clause = employeeNumberWhereClause(employeeNumber);
      const candidates = clause
        ? await tx
            .select({
              id: industrialPersonnel.id,
              displayName: industrialPersonnel.displayName,
              firstName: industrialPersonnel.firstName,
              lastName: industrialPersonnel.lastName,
              employeeNumber: industrialPersonnel.employeeNumber,
              phone: industrialPersonnel.phone,
              smsAuthorizedAt: industrialPersonnel.smsAuthorizedAt,
              smsOptedOutAt: industrialPersonnel.smsOptedOutAt,
            })
            .from(industrialPersonnel)
            .where(
              and(
                eq(industrialPersonnel.tenantId, tenantId),
                clause,
                personnelIsActive(),
                isNull(industrialPersonnel.archivedAt),
              ),
            )
        : [];
      const person = pickPreferredPersonnelMatch(candidates, employeeNumber);
      if (!person?.employeeNumber || !lastNameMatchesPersonnel(lastName, person)) {
        return { matched: false as const };
      }

      const now = new Date();
      const previousPhone = String(person.phone ?? "").trim();
      const phoneChanged = normalizeSmsPhone(previousPhone) !== phoneDigits;
      const alreadyEnrolled =
        !phoneChanged && Boolean(person.smsAuthorizedAt) && !person.smsOptedOutAt;
      const phone = phoneChanged ? formatSmsPhone(phoneDigits) : previousPhone;

      await tx
        .update(industrialPersonnel)
        .set({
          phone,
          smsAuthorizedAt: now,
          smsAuthorizedByUserId: null,
          smsOptedOutAt: null,
          updatedAt: now,
        })
        .where(eq(industrialPersonnel.id, person.id));

      await tx.insert(industrialPersonnelSmsConsents).values({
        id: createId(),
        tenantId,
        personnelId: person.id,
        action: "AUTHORIZED",
        method: "QR_SELF_SERVICE",
        phoneNumber: phone,
        previousPhoneNumber: phoneChanged && previousPhone ? previousPhone : null,
        consentText: EMERGENCY_SMS_CONSENT_TEXT,
        consentVersion: EMERGENCY_SMS_CONSENT_VERSION,
        signatureName,
        employeeNumber: person.employeeNumber,
        qrLinkId: link.id,
        ipAddress: client.ip?.slice(0, 64) ?? null,
        userAgent: client.userAgent?.slice(0, 500) ?? null,
        createdAt: now,
      });

      await this.recordPublicScan(tx, tenantId, link.id, "SMS_SIGNUP", {
        personnelId: person.id,
        metadata: { phoneChanged },
      });

      const firstName =
        String(person.firstName ?? "").trim() ||
        String(person.displayName ?? "")
          .trim()
          .split(/\s+/)[0] ||
        null;
      return {
        matched: true as const,
        firstName,
        phoneMasked: maskSmsPhone(phoneDigits),
        phoneChanged,
        alreadyEnrolled,
        signedAt: now.toISOString(),
      };
    });

    if (!result.matched) {
      await this.lms.checkRateLimit(tenantId, bucketKey, true);
      throw new ForgeError(
        "FORBIDDEN",
        "We couldn't match that employee number and last name. Check both and try again, or ask your supervisor.",
      );
    }
    const { matched: _matched, ...response } = result;
    return response;
  }

  async getAssetHistory(
    token: string,
    body: {
      employeeNumber?: string;
      req?: RequestWithIds;
    } = {},
  ) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
    const permissions = await this.resolveViewerPermissions(body.req, tenantId);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const link = await this.loadActiveLink(tx, tenantId, tokenHash);
      const targetType = String(link.targetType ?? "")
        .trim()
        .toUpperCase();
      const targetId = String(link.targetId ?? "").trim();
      if (!targetType || !targetId) {
        throw new ForgeError("VALIDATION_FAILED", "This QR link is not assigned to an asset.");
      }

      const normalized = String(body.employeeNumber ?? "").trim();
      let verifiedEmployee = false;
      if (normalized) {
        const clause = employeeNumberWhereClause(normalized);
        const candidates = clause
          ? await tx
              .select({ id: industrialPersonnel.id })
              .from(industrialPersonnel)
              .where(
                and(
                  eq(industrialPersonnel.tenantId, tenantId),
                  clause,
                  personnelIsActive(),
                  isNull(industrialPersonnel.archivedAt),
                ),
              )
          : [];
        verifiedEmployee = candidates.length > 0;
      }

      const canView =
        verifiedEmployee ||
        permissions.has("industrial.qr.history.view") ||
        permissions.has("industrial.admin") ||
        permissions.has("industrial.access");
      if (!canView) {
        throw new ForgeError("FORBIDDEN", "You are not authorized to view asset history.");
      }

      const inspectionRows = await tx
        .select()
        .from(industrialInspections)
        .where(
          and(
            eq(industrialInspections.tenantId, tenantId),
            isNull(industrialInspections.archivedAt),
            sql`${industrialInspections.sourcePayload} ->> 'targetId' = ${targetId}`,
            sql`${industrialInspections.sourcePayload} ->> 'targetType' = ${targetType}`,
          ),
        )
        .orderBy(desc(industrialInspections.updatedAt))
        .limit(40);

      const correctiveRows = await tx
        .select()
        .from(industrialCorrectiveActions)
        .where(
          and(
            eq(industrialCorrectiveActions.tenantId, tenantId),
            isNull(industrialCorrectiveActions.archivedAt),
            or(
              sql`${industrialCorrectiveActions.sourcePayload} ->> 'targetId' = ${targetId}`,
              eq(industrialCorrectiveActions.parentEntityId, link.id),
            )!,
          ),
        )
        .orderBy(desc(industrialCorrectiveActions.updatedAt))
        .limit(40);

      const auditRows = await tx
        .select()
        .from(industrialQrLinkAuditEvents)
        .where(
          and(
            eq(industrialQrLinkAuditEvents.tenantId, tenantId),
            eq(industrialQrLinkAuditEvents.qrLinkId, link.id),
            isNull(industrialQrLinkAuditEvents.archivedAt),
          ),
        )
        .orderBy(desc(industrialQrLinkAuditEvents.eventAt))
        .limit(30);

      const scanRows = await tx
        .select()
        .from(industrialQrLinkScanEvents)
        .where(
          and(
            eq(industrialQrLinkScanEvents.tenantId, tenantId),
            eq(industrialQrLinkScanEvents.qrLinkId, link.id),
          ),
        )
        .orderBy(desc(industrialQrLinkScanEvents.scannedAt))
        .limit(20);

      type HistoryEntry = {
        id: string;
        kind: string;
        at: string;
        title: string;
        subtitle?: string | null;
        status?: string | null;
        actorName?: string | null;
      };

      const entries: HistoryEntry[] = [];

      for (const row of inspectionRows) {
        const payload =
          row.sourcePayload && typeof row.sourcePayload === "object"
            ? (row.sourcePayload as Record<string, unknown>)
            : {};
        const frequency = String(payload.inspectionFrequency ?? "").trim();
        const label = frequency
          ? inspectionFrequencyLabel(frequency as "DAILY" | "WEEKLY" | "MONTHLY")
          : "Inspection";
        const failed =
          String(row.status ?? "").toUpperCase() === "COMPLETED" &&
          Array.isArray(payload.items) &&
          (payload.items as Array<{ answer?: string }>).some((item) => item.answer === "NO");
        entries.push({
          id: row.id,
          kind: "INSPECTION",
          at: (row.completedAt ?? row.updatedAt).toISOString(),
          title: `${label} — ${failed ? "FAIL" : row.status === "COMPLETED" ? "PASS" : row.status}`,
          subtitle: row.title,
          status: row.status,
          actorName: typeof payload.responsibleName === "string" ? payload.responsibleName : null,
        });
      }

      for (const row of correctiveRows) {
        const payload =
          row.sourcePayload && typeof row.sourcePayload === "object"
            ? (row.sourcePayload as Record<string, unknown>)
            : {};
        entries.push({
          id: row.id,
          kind: "CORRECTIVE_ACTION",
          at: row.updatedAt.toISOString(),
          title: row.title,
          subtitle: row.parentEntityType,
          status: row.status,
          actorName:
            typeof payload.reporterName === "string"
              ? payload.reporterName
              : (row.ownerName ?? null),
        });
      }

      for (const row of auditRows) {
        const details =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, unknown>)
            : {};
        entries.push({
          id: row.id,
          kind: row.eventType,
          at: row.eventAt.toISOString(),
          title: row.eventType.replace(/_/g, " "),
          subtitle:
            typeof details.reason === "string"
              ? details.reason
              : typeof details.notes === "string"
                ? details.notes
                : null,
          actorName: typeof details.personnelName === "string" ? details.personnelName : null,
        });
      }

      for (const row of scanRows) {
        if (row.action === "CONTEXT") continue;
        entries.push({
          id: row.id,
          kind: "SCAN",
          at: row.scannedAt.toISOString(),
          title: `QR scan — ${row.action}`,
          status: row.result,
        });
      }

      entries.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

      await this.recordPublicScan(tx, tenantId, link.id, "HISTORY", {
        anonymous: !verifiedEmployee,
        metadata: { targetType, targetId },
      });

      return {
        targetType,
        targetId,
        items: entries.slice(0, 60),
      };
    });
  }

  async reportIssue(token: string, body: Record<string, unknown>) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
    const employeeNumber = String(body.employeeNumber ?? "").trim();
    const description = String(body.description ?? "").trim();
    if (!description) throw new ForgeError("VALIDATION_FAILED", "description is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const link = await this.loadActiveLink(tx, tenantId, tokenHash);
      const accessMode = normalizeQrAccessMode(link.accessMode);
      const publicAccess =
        accessMode === "PUBLIC_READ" ||
        accessMode === "PUBLIC_LIMITED" ||
        accessMode === "PUBLIC_FORM_ONLY" ||
        accessMode === "PUBLIC_ACTION";

      let person: VerifiedPerson | null = null;
      if (employeeNumber) {
        person = await this.verifyEmployeeInTx(tx, tenantId, employeeNumber);
      } else if (!publicAccess) {
        throw new ForgeError("VALIDATION_FAILED", "employeeNumber is required");
      }

      const title =
        String(body.title ?? "").trim() ||
        `Issue reported for ${link.label ?? link.displayCode ?? "asset"}`;
      const priority = String(body.priority ?? "MEDIUM")
        .trim()
        .toUpperCase();
      const category = String(body.category ?? "").trim() || null;
      const immediateHazard = body.immediateHazard === true || body.immediateHazard === "true";
      const markOutOfService =
        body.outOfService === true || body.outOfService === "true" || immediateHazard;
      const appBaseUrl =
        typeof body.appBaseUrl === "string" && body.appBaseUrl.trim()
          ? body.appBaseUrl.trim()
          : undefined;

      // Out-of-service changes still require a verified employee (asset control).
      if (markOutOfService && !person) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "employeeNumber is required to mark an asset out of service.",
        );
      }

      const issue = await createQrIssueCorrectiveAction(tx, {
        tenantId,
        qrLinkId: link.id,
        targetType: link.targetType,
        targetId: link.targetId,
        siteId: person?.siteId ?? null,
        personnelId: person?.id ?? null,
        personnelName: person?.displayName ?? null,
        anonymous: !person,
        title,
        description,
        priority,
        category,
        immediateHazard,
        photos: Array.isArray(body.photos) ? body.photos : [],
        ...(appBaseUrl ? { appBaseUrl } : {}),
      });

      if (
        markOutOfService &&
        person &&
        link.targetType &&
        link.targetId &&
        isQrAssetTargetType(String(link.targetType).toUpperCase())
      ) {
        await markQrAssetOutOfService(tx, {
          tenantId,
          targetType: String(link.targetType),
          targetId: String(link.targetId),
          reason: description.slice(0, 500),
          personnelId: person.id,
          personnelName: person.displayName,
          notes: String(body.notes ?? "").trim() || null,
          qrLinkId: link.id,
          source: "QR_ISSUE",
        });
      }

      await this.recordPublicScan(tx, tenantId, link.id, "REPORT_ISSUE", {
        personnelId: person?.id ?? null,
        anonymous: !person,
        metadata: {
          correctiveActionId: issue.id,
          markOutOfService,
        },
      });

      return {
        correctiveActionId: issue.id,
        closeoutUrl: issue.closeoutUrl,
        outOfService: markOutOfService,
      };
    });
  }

  async getPublicLotoProcedure(token: string) {
    const { tokenHash, tenantId, raw } = await this.resolveToken(token);
    const linkMeta = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const link = await this.loadActiveLink(tx, tenantId, tokenHash);
      const actionConfig = parseQrActionConfig(link.actionConfig);
      const procedureId =
        actionConfig.lotoProcedureId ||
        (String(link.targetType ?? "").toUpperCase() === "LOTO_PROCEDURE"
          ? String(link.targetId ?? "").trim()
          : "");
      if (!procedureId) {
        throw new ForgeError("NOT_FOUND", "No LOTO procedure is linked to this QR code.");
      }
      if (!qrActionConfigEnabled(actionConfig, "viewLoto", true)) {
        throw new ForgeError("FORBIDDEN", "LOTO viewing is disabled for this QR code.");
      }

      await this.recordPublicScan(tx, tenantId, link.id, "VIEW_LOTO", {
        anonymous: true,
        metadata: { procedureId },
      });

      return {
        procedureId,
        qrLinkId: link.id,
        accessMode: normalizeQrAccessMode(link.accessMode),
      };
    });

    const detail = await this.domain.getLotoDetail(
      this.fieldWorkerPrincipal(tenantId),
      linkMeta.procedureId,
    );
    return {
      ...linkMeta,
      publicToken: raw,
      detail,
    };
  }

  async markOutOfService(token: string, body: Record<string, unknown>) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
    const employeeNumber = String(body.employeeNumber ?? "").trim();
    const reason = String(body.reason ?? body.outOfServiceReason ?? "").trim();
    if (!reason) throw new ForgeError("VALIDATION_FAILED", "reason is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const link = await this.loadActiveLink(tx, tenantId, tokenHash);
      const person = await this.verifyEmployeeInTx(tx, tenantId, employeeNumber);
      const targetType = String(link.targetType ?? "")
        .trim()
        .toUpperCase();
      const targetId = String(link.targetId ?? "").trim();
      if (!targetType || !targetId || !isQrAssetTargetType(targetType)) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Out of service is only supported for equipment assets.",
        );
      }

      const result = await markQrAssetOutOfService(tx, {
        tenantId,
        targetType,
        targetId,
        reason,
        personnelId: person.id,
        personnelName: person.displayName,
        notes: String(body.notes ?? "").trim() || null,
        qrLinkId: link.id,
        source: "QR_SCAN",
      });

      await this.recordPublicScan(tx, tenantId, link.id, "OUT_OF_SERVICE", {
        personnelId: person.id,
        metadata: { reason },
      });

      return result;
    });
  }

  async returnToService(token: string, body: Record<string, unknown>) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
    const employeeNumber = String(body.employeeNumber ?? "").trim();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const link = await this.loadActiveLink(tx, tenantId, tokenHash);
      const person = await this.verifyEmployeeInTx(tx, tenantId, employeeNumber);
      const targetType = String(link.targetType ?? "")
        .trim()
        .toUpperCase();
      const targetId = String(link.targetId ?? "").trim();
      if (!targetType || !targetId || !isQrAssetTargetType(targetType)) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Return to service is only supported for equipment assets.",
        );
      }

      const result = await returnQrAssetToService(tx, {
        tenantId,
        targetType,
        targetId,
        personnelId: person.id,
        personnelName: person.displayName,
        notes: String(body.notes ?? "").trim() || null,
        qrLinkId: link.id,
      });

      await this.recordPublicScan(tx, tenantId, link.id, "RETURN_TO_SERVICE", {
        personnelId: person.id,
      });

      return result;
    });
  }

  async startInspection(token: string, body: Record<string, unknown>) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
    const employeeNumber = String(body.employeeNumber ?? "").trim();
    const frequency = String(body.frequency ?? body.inspectionFrequency ?? "")
      .trim()
      .toUpperCase();

    const { link, person, assetLabel } = await withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const activeLink = await this.loadActiveLink(tx, tenantId, tokenHash);
        const verified = await this.verifyEmployeeInTx(tx, tenantId, employeeNumber);
        const asset = await this.resolveAssetSummary(
          tx,
          tenantId,
          activeLink.targetType,
          activeLink.targetId,
          normalizeQrAccessMode(activeLink.accessMode),
        );
        return {
          link: activeLink,
          person: verified,
          assetLabel: asset?.label ?? activeLink.label ?? "Asset",
        };
      },
    );

    const actionConfig = parseQrActionConfig(link.actionConfig);
    const templateFromConfig =
      frequency === "DAILY" || frequency === "WEEKLY" || frequency === "MONTHLY"
        ? actionConfig.inspectionTemplates?.[frequency]
        : undefined;
    const templateId = String(body.templateId ?? templateFromConfig ?? "").trim() || undefined;
    const freqLabel =
      frequency === "DAILY" || frequency === "WEEKLY" || frequency === "MONTHLY"
        ? inspectionFrequencyLabel(frequency)
        : "Inspection";

    const inspection = await this.domain.createInspection(this.fieldWorkerPrincipal(tenantId), {
      title: `${assetLabel} — ${freqLabel}`,
      departmentId: person.departmentId,
      templateId,
      // Responsible party defaults to department contact inside createInspection.
      targetType: link.targetType,
      targetId: link.targetId,
      qrLinkId: link.id,
      inspectionFrequency: frequency || null,
      qrScanSource: true,
      performerPersonnelId: person.id,
      performerName: person.displayName,
      appBaseUrl:
        typeof body.appBaseUrl === "string" && body.appBaseUrl.trim()
          ? body.appBaseUrl.trim()
          : undefined,
    });

    await withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.recordPublicScan(tx, tenantId, link.id, "INSPECTION_START", {
        personnelId: person.id,
        metadata: { inspectionId: inspection.id, frequency },
      });
    });

    return {
      inspectionId: inspection.id,
      title: inspection.title,
      status: inspection.status,
      items:
        (inspection as Record<string, unknown>).items ??
        (inspection.sourcePayload as Record<string, unknown> | undefined)?.items ??
        [],
    };
  }

  async completeInspection(token: string, inspectionId: string, body: Record<string, unknown>) {
    const { tokenHash, tenantId } = await this.resolveToken(token);
    const employeeNumber = String(body.employeeNumber ?? "").trim();
    const recordId = String(inspectionId ?? "").trim();
    if (!recordId) throw new ForgeError("VALIDATION_FAILED", "inspectionId is required");

    const { link, person } = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const activeLink = await this.loadActiveLink(tx, tenantId, tokenHash);
      const verified = await this.verifyEmployeeInTx(tx, tenantId, employeeNumber);
      return { link: activeLink, person: verified };
    });

    const completed = await this.domain.completeInspection(
      this.fieldWorkerPrincipal(tenantId),
      recordId,
      {
        items: body.items,
        appBaseUrl:
          typeof body.appBaseUrl === "string" && body.appBaseUrl.trim()
            ? body.appBaseUrl.trim()
            : undefined,
      },
    );

    const asset = await withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.recordPublicScan(tx, tenantId, link.id, "INSPECTION_COMPLETE", {
        personnelId: person.id,
        metadata: { inspectionId: recordId, status: completed.status },
      });
      return await this.resolveAssetSummary(
        tx,
        tenantId,
        link.targetType,
        link.targetId,
        normalizeQrAccessMode(link.accessMode),
      );
    });

    return {
      inspection: completed,
      assetOutOfService: Boolean(asset?.outOfService),
      outOfServiceReason: asset?.outOfServiceReason ?? null,
    };
  }
}

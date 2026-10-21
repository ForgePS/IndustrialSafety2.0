import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  createId,
  industrialEmergencyAlertAuditLogs,
  industrialEmergencyAlertCapFeeds,
  industrialEmergencyAlertChannels,
  industrialEmergencyAlertDeliveries,
  industrialEmergencyAlertGroupMembers,
  industrialEmergencyAlertGroups,
  industrialEmergencyAlertRecipients,
  industrialEmergencyAlertAcknowledgments,
  industrialEmergencyAlerts,
  industrialEmergencyAlertSettings,
  industrialEmergencyAlertTemplates,
  industrialEmergencyAlertVersions,
  industrialPersonnel,
  tenants,
  type Database,
  type DatabaseTransaction,
  withBypassRlsTransaction,
  withTenantTransaction,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { APP_ENV, DATABASE } from "../../tokens.js";
import { isDemoTenant } from "../../common/demo-tenant.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import {
  countMvixLocationsForAudience,
  listTargetLookups,
  parseAudience,
  resolveAudienceRecipients,
  summarizeAudience,
} from "./industrial-emergency-alerts-audience.js";
import {
  buildSmsMessageBody,
  createEmergencyAlertSmsProvider,
  isSmsProviderReady,
  mapPool,
  resolveEmergencyAlertSmsConfig,
  toE164Phone,
} from "./sms/resolve-sms-provider.js";
import { SMS_PROVIDER_AWS, SMS_PROVIDER_STUB } from "./sms/emergency-alert-sms.types.js";

const ACTIVE_STATUSES = ["ACTIVE", "UPDATING"] as const;
const CHANNELS = ["SMS", "IN_APP", "MVIX", "EMAIL"] as const;
type AlertChannel = (typeof CHANNELS)[number];

function asString(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function normalizeChannels(value: unknown): AlertChannel[] {
  const raw = Array.isArray(value) ? value : ["SMS", "IN_APP", "MVIX"];
  const out: AlertChannel[] = [];
  for (const item of raw) {
    const ch = String(item).toUpperCase() as AlertChannel;
    if (CHANNELS.includes(ch) && !out.includes(ch)) out.push(ch);
  }
  return out.length ? out : ["IN_APP"];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

@Injectable()
export class IndustrialEmergencyAlertsService {
  private readonly logger = new Logger(IndustrialEmergencyAlertsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private smsConfigFromSettings(settings: {
    smsProvider?: string | null;
    smsEnabled?: boolean | null;
    settingsJson?: unknown;
  } | null) {
    return resolveEmergencyAlertSmsConfig(this.env, settings);
  }

  private mapSettings(row: {
    smsProvider: string;
    smsEnabled: boolean;
    mvixEnabled: boolean;
    inAppEnabled: boolean;
    requireSendConfirmation: boolean;
    defaultChannelsJson: unknown;
    settingsJson: unknown;
  }) {
    const smsConfig = this.smsConfigFromSettings(row);
    return {
      smsProvider: row.smsProvider,
      smsEnabled: row.smsEnabled,
      mvixEnabled: row.mvixEnabled,
      inAppEnabled: row.inAppEnabled,
      requireSendConfirmation: row.requireSendConfirmation,
      defaultChannels: row.defaultChannelsJson,
      settings: row.settingsJson,
      smsProviderReady: isSmsProviderReady(smsConfig),
      smsDryRun: smsConfig.dryRun,
      smsOriginationConfigured: Boolean(smsConfig.originationIdentity),
    };
  }

  private tenant(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  private async writeAudit(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      alertId?: string | null;
      actorUserId: string;
      action: string;
      detail?: Record<string, unknown>;
    },
  ) {
    await tx.insert(industrialEmergencyAlertAuditLogs).values({
      id: createId(),
      tenantId: input.tenantId,
      alertId: input.alertId ?? null,
      actorUserId: input.actorUserId,
      action: input.action,
      detailJson: input.detail ?? {},
    });
  }

  private mapAlert(row: typeof industrialEmergencyAlerts.$inferSelect) {
    return {
      id: row.id,
      alertNumber: row.alertNumber,
      alertType: row.alertType,
      severity: row.severity,
      headline: row.headline,
      shortMessage: row.shortMessage,
      detailedMessage: row.detailedMessage,
      instructions: row.instructions,
      status: row.status,
      isDrill: row.isDrill,
      requiresAcknowledgment: row.requiresAcknowledgment,
      audience: row.audienceJson,
      channels: row.channelsJson,
      createdByUserId: row.createdByUserId,
      approvedByUserId: row.approvedByUserId,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      effectiveAt: row.effectiveAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      clearedAt: row.clearedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async dashboard(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, tenantId),
            inArray(industrialEmergencyAlerts.status, [...ACTIVE_STATUSES]),
          ),
        );
      const [sentToday] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, tenantId),
            sql`${industrialEmergencyAlerts.issuedAt} >= date_trunc('day', now())`,
          ),
        );
      const [pendingAck] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, tenantId),
            inArray(industrialEmergencyAlerts.status, [...ACTIVE_STATUSES]),
            eq(industrialEmergencyAlerts.requiresAcknowledgment, true),
          ),
        );
      const recent = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(eq(industrialEmergencyAlerts.tenantId, tenantId))
        .orderBy(desc(industrialEmergencyAlerts.createdAt))
        .limit(8);
      const [settings] = await tx
        .select()
        .from(industrialEmergencyAlertSettings)
        .where(eq(industrialEmergencyAlertSettings.tenantId, tenantId))
        .limit(1);
      const smsConfig = this.smsConfigFromSettings(settings ?? null);
      const configured = smsConfig.provider === SMS_PROVIDER_AWS && Boolean(smsConfig.originationIdentity);
      const ready = isSmsProviderReady(smsConfig);

      return {
        activeAlerts: active?.count ?? 0,
        alertsSentToday: sentToday?.count ?? 0,
        smsDeliveryRate: null as number | null,
        mvixDisplaysOnline: null as number | null,
        recipientsReached: null as number | null,
        acknowledgmentsPending: pendingAck?.count ?? 0,
        recent: recent.map((r) => this.mapAlert(r)),
        smsProviderReady: ready,
        smsProvider: settings?.smsProvider ?? SMS_PROVIDER_STUB,
        smsEnabled: Boolean(settings?.smsEnabled),
        note: ready
          ? "AWS End User Messaging SMS is configured."
          : configured
            ? "SMS provider is configured but smsEnabled is false."
            : "Configure smsProvider=AWS_END_USER_MESSAGING, originationIdentity, and smsEnabled to send SMS.",
      };
    });
  }

  async listAlerts(
    principal: ForgePrincipal,
    query: { status?: string; q?: string; limit?: number },
  ) {
    const tenantId = this.tenant(principal);
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(eq(industrialEmergencyAlerts.tenantId, tenantId))
        .orderBy(desc(industrialEmergencyAlerts.createdAt))
        .limit(limit);
      let items = rows.map((r) => this.mapAlert(r));
      if (query.status) {
        const status = query.status.toUpperCase();
        if (status === "ACTIVE") {
          items = items.filter((i) => ACTIVE_STATUSES.includes(i.status as (typeof ACTIVE_STATUSES)[number]));
        } else if (status === "HISTORY") {
          items = items.filter((i) => !ACTIVE_STATUSES.includes(i.status as (typeof ACTIVE_STATUSES)[number]) && i.status !== "DRAFT");
        } else {
          items = items.filter((i) => i.status === status);
        }
      }
      if (query.q?.trim()) {
        const q = query.q.trim().toLowerCase();
        items = items.filter(
          (i) =>
            i.headline.toLowerCase().includes(q) ||
            i.shortMessage.toLowerCase().includes(q) ||
            i.alertNumber.toLowerCase().includes(q),
        );
      }
      return { items, page: 1, pageSize: limit, total: items.length };
    });
  }

  async getAlert(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, tenantId),
            eq(industrialEmergencyAlerts.id, id),
          ),
        )
        .limit(1);
      if (!row) throw new ForgeError("NOT_FOUND", "Emergency alert not found");

      const versions = await tx
        .select()
        .from(industrialEmergencyAlertVersions)
        .where(eq(industrialEmergencyAlertVersions.alertId, id))
        .orderBy(desc(industrialEmergencyAlertVersions.versionNumber));
      const channels = await tx
        .select()
        .from(industrialEmergencyAlertChannels)
        .where(eq(industrialEmergencyAlertChannels.alertId, id));
      const audit = await tx
        .select()
        .from(industrialEmergencyAlertAuditLogs)
        .where(eq(industrialEmergencyAlertAuditLogs.alertId, id))
        .orderBy(desc(industrialEmergencyAlertAuditLogs.createdAt))
        .limit(50);

      const myAcknowledgment = await this.findMyAcknowledgment(
        tx,
        tenantId,
        id,
        principal.userId,
      );

      return {
        ...this.mapAlert(row),
        myAcknowledgment,
        versions: versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          changeType: v.changeType,
          headline: v.headline,
          shortMessage: v.shortMessage,
          detailedMessage: v.detailedMessage,
          instructions: v.instructions,
          severity: v.severity,
          effectiveAt: v.effectiveAt?.toISOString() ?? null,
          expiresAt: v.expiresAt?.toISOString() ?? null,
          createdByUserId: v.createdByUserId,
          createdAt: v.createdAt.toISOString(),
        })),
        channelStatuses: channels.map((c) => ({
          channel: c.channel,
          enabled: c.enabled,
          status: c.status,
          targetCount: c.targetCount,
          successCount: c.successCount,
          failureCount: c.failureCount,
          startedAt: c.startedAt?.toISOString() ?? null,
          completedAt: c.completedAt?.toISOString() ?? null,
        })),
        audit: audit.map((a) => ({
          id: a.id,
          action: a.action,
          actorUserId: a.actorUserId,
          detail: a.detailJson,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    });
  }

  private async findMyAcknowledgment(
    tx: DatabaseTransaction,
    tenantId: string,
    alertId: string,
    userId: string,
  ) {
    const [recipient] = await tx
      .select({ id: industrialEmergencyAlertRecipients.id })
      .from(industrialEmergencyAlertRecipients)
      .where(
        and(
          eq(industrialEmergencyAlertRecipients.tenantId, tenantId),
          eq(industrialEmergencyAlertRecipients.alertId, alertId),
          eq(industrialEmergencyAlertRecipients.userId, userId),
        ),
      )
      .limit(1);
    if (!recipient) return null;

    const [ack] = await tx
      .select()
      .from(industrialEmergencyAlertAcknowledgments)
      .where(
        and(
          eq(industrialEmergencyAlertAcknowledgments.tenantId, tenantId),
          eq(industrialEmergencyAlertAcknowledgments.alertId, alertId),
          eq(industrialEmergencyAlertAcknowledgments.recipientId, recipient.id),
        ),
      )
      .limit(1);
    if (!ack) return null;
    return {
      id: ack.id,
      status: ack.status,
      method: ack.method,
      acknowledgedAt: ack.acknowledgedAt?.toISOString() ?? null,
      responseText: ack.responseText,
    };
  }

  /**
   * Field / employee acknowledgment for an active alert that requires it.
   * Idempotent: returns existing acknowledgment when already recorded.
   */
  async acknowledgeAlert(
    principal: ForgePrincipal,
    id: string,
    body: Record<string, unknown> = {},
  ) {
    const tenantId = this.tenant(principal);
    const userId = principal.userId?.trim();
    if (!userId) throw new ForgeError("VALIDATION_FAILED", "Signed-in user is required");

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [alert] = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(
          and(eq(industrialEmergencyAlerts.tenantId, tenantId), eq(industrialEmergencyAlerts.id, id)),
        )
        .limit(1);
      if (!alert) throw new ForgeError("NOT_FOUND", "Emergency alert not found");
      if (!ACTIVE_STATUSES.includes(alert.status as (typeof ACTIVE_STATUSES)[number])) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Only active emergency alerts can be acknowledged",
        );
      }
      if (!alert.requiresAcknowledgment) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "This alert does not require acknowledgment",
        );
      }

      const existing = await this.findMyAcknowledgment(tx, tenantId, id, userId);
      if (existing) {
        return {
          alert: this.mapAlert(alert),
          acknowledgment: existing,
          alreadyAcknowledged: true,
        };
      }

      let [recipient] = await tx
        .select()
        .from(industrialEmergencyAlertRecipients)
        .where(
          and(
            eq(industrialEmergencyAlertRecipients.tenantId, tenantId),
            eq(industrialEmergencyAlertRecipients.alertId, id),
            eq(industrialEmergencyAlertRecipients.userId, userId),
          ),
        )
        .limit(1);

      if (!recipient) {
        const locationId =
          body.locationId != null && String(body.locationId).trim()
            ? String(body.locationId).trim()
            : null;
        const recipientId = createId();
        await tx.insert(industrialEmergencyAlertRecipients).values({
          id: recipientId,
          tenantId,
          alertId: id,
          userId,
          personnelId: null,
          recipientType: "EMPLOYEE",
          locationId,
          departmentId: null,
          phoneNumberSnapshot: null,
          smsEligible: false,
          exclusionReason: "SELF_ACK_FIELD",
        });
        const [created] = await tx
          .select()
          .from(industrialEmergencyAlertRecipients)
          .where(eq(industrialEmergencyAlertRecipients.id, recipientId))
          .limit(1);
        recipient = created!;
      }

      const now = new Date();
      const ackId = createId();
      const responseText =
        body.responseText != null && String(body.responseText).trim()
          ? String(body.responseText).trim()
          : null;
      const method =
        body.method != null && String(body.method).trim()
          ? String(body.method).trim().toUpperCase().slice(0, 32)
          : "IN_APP";

      await tx.insert(industrialEmergencyAlertAcknowledgments).values({
        id: ackId,
        tenantId,
        alertId: id,
        recipientId: recipient.id,
        userId,
        status: "ACKNOWLEDGED",
        method,
        acknowledgedAt: now,
        responseText,
      });

      await this.writeAudit(tx, {
        tenantId,
        alertId: id,
        actorUserId: userId,
        action: "ACKNOWLEDGED",
        detail: { method, acknowledgmentId: ackId },
      });

      return {
        alert: this.mapAlert(alert),
        acknowledgment: {
          id: ackId,
          status: "ACKNOWLEDGED",
          method,
          acknowledgedAt: now.toISOString(),
          responseText,
        },
        alreadyAcknowledged: false,
      };
    });
  }

  async createAlert(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const headline = asString(body.headline);
    const shortMessage = asString(body.shortMessage ?? body.short_message);
    if (!headline) throw new ForgeError("VALIDATION_FAILED", "headline is required");
    if (!shortMessage) throw new ForgeError("VALIDATION_FAILED", "shortMessage is required");

    const channels = normalizeChannels(body.channels ?? body.channelsJson);
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const id = createId();
      const alertNumber = `EA-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${id.slice(0, 8).toUpperCase()}`;
      const [row] = await tx
        .insert(industrialEmergencyAlerts)
        .values({
          id,
          tenantId,
          alertNumber,
          alertType: asString(body.alertType ?? body.alert_type, "GENERAL").toUpperCase() || "GENERAL",
          severity: asString(body.severity, "SEVERE").toUpperCase() || "SEVERE",
          headline: headline.slice(0, 300),
          shortMessage: shortMessage.slice(0, 500),
          detailedMessage: asString(body.detailedMessage ?? body.detailed_message) || null,
          instructions: asString(body.instructions) || null,
          status: "DRAFT",
          isDrill: asBool(body.isDrill ?? body.is_drill, false),
          requiresAcknowledgment: asBool(
            body.requiresAcknowledgment ?? body.requires_acknowledgment,
            false,
          ),
          audienceJson: parseAudience(body.audience),
          channelsJson: channels,
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await this.writeAudit(tx, {
        tenantId,
        alertId: id,
        actorUserId: principal.userId,
        action: "CREATE",
        detail: { alertNumber, channels },
      });

      return this.mapAlert(row!);
    });
  }

  async updateDraft(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, tenantId),
            eq(industrialEmergencyAlerts.id, id),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Emergency alert not found");
      if (existing.status !== "DRAFT") {
        throw new ForgeError("CONFLICT", "Only draft alerts can be edited this way");
      }

      const channels =
        body.channels !== undefined || body.channelsJson !== undefined
          ? normalizeChannels(body.channels ?? body.channelsJson)
          : (existing.channelsJson as AlertChannel[]);

      const [row] = await tx
        .update(industrialEmergencyAlerts)
        .set({
          alertType:
            asString(body.alertType ?? body.alert_type, existing.alertType).toUpperCase() ||
            existing.alertType,
          severity:
            asString(body.severity, existing.severity).toUpperCase() || existing.severity,
          headline: asString(body.headline, existing.headline).slice(0, 300) || existing.headline,
          shortMessage:
            asString(body.shortMessage ?? body.short_message, existing.shortMessage).slice(0, 500) ||
            existing.shortMessage,
          detailedMessage:
            body.detailedMessage !== undefined || body.detailed_message !== undefined
              ? asString(body.detailedMessage ?? body.detailed_message) || null
              : existing.detailedMessage,
          instructions:
            body.instructions !== undefined
              ? asString(body.instructions) || null
              : existing.instructions,
          isDrill:
            body.isDrill !== undefined || body.is_drill !== undefined
              ? asBool(body.isDrill ?? body.is_drill, existing.isDrill)
              : existing.isDrill,
          requiresAcknowledgment:
            body.requiresAcknowledgment !== undefined ||
            body.requires_acknowledgment !== undefined
              ? asBool(
                  body.requiresAcknowledgment ?? body.requires_acknowledgment,
                  existing.requiresAcknowledgment,
                )
              : existing.requiresAcknowledgment,
          audienceJson:
            body.audience !== undefined
              ? parseAudience(body.audience)
              : existing.audienceJson,
          channelsJson: channels,
          updatedAt: new Date(),
        })
        .where(eq(industrialEmergencyAlerts.id, id))
        .returning();

      await this.writeAudit(tx, {
        tenantId,
        alertId: id,
        actorUserId: principal.userId,
        action: "UPDATE_DRAFT",
      });

      return this.mapAlert(row!);
    });
  }

  /**
   * Issue an alert. Recipients resolve from personnel by location / department /
   * group targeting. SMS uses AWS End User Messaging when configured; IN_APP
   * notifies linked Forge users; MVIX updates matching CAP feeds.
   */
  async sendAlert(principal: ForgePrincipal, id: string, body: Record<string, unknown> = {}) {
    const tenantId = this.tenant(principal);
    const confirmed = asBool(body.confirmed, false);
    const demoTenant = await isDemoTenant(this.db, tenantId);

    const result = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, tenantId),
            eq(industrialEmergencyAlerts.id, id),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Emergency alert not found");
      if (existing.status !== "DRAFT" && existing.status !== "APPROVED") {
        throw new ForgeError("CONFLICT", `Cannot send alert in status ${existing.status}`);
      }

      const [settings] = await tx
        .select()
        .from(industrialEmergencyAlertSettings)
        .where(eq(industrialEmergencyAlertSettings.tenantId, tenantId))
        .limit(1);
      if ((settings?.requireSendConfirmation ?? true) && !confirmed) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Send confirmation is required. Pass confirmed: true after review.",
        );
      }

      const now = new Date();
      const versionId = createId();
      const channels = normalizeChannels(existing.channelsJson);
      const smsConfig = this.smsConfigFromSettings(settings ?? null);
      const smsProviderName = smsConfig.provider || settings?.smsProvider || SMS_PROVIDER_STUB;
      const { audience, recipients } = await resolveAudienceRecipients(
        tx,
        tenantId,
        existing.audienceJson,
      );
      if (!recipients.length) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "No personnel match the selected audience. Adjust locations, departments, or groups.",
        );
      }

      await tx.insert(industrialEmergencyAlertVersions).values({
        id: versionId,
        tenantId,
        alertId: id,
        versionNumber: 1,
        changeType: existing.isDrill ? "DRILL" : "ISSUE",
        headline: existing.headline,
        shortMessage: existing.shortMessage,
        detailedMessage: existing.detailedMessage,
        instructions: existing.instructions,
        severity: existing.severity,
        effectiveAt: now,
        expiresAt: existing.expiresAt,
        createdByUserId: principal.userId,
        createdAt: now,
      });

      const recipientRows: {
        id: string;
        userId: string | null;
        smsEligible: boolean;
        phoneNumberSnapshot: string | null;
      }[] = [];
      for (const r of recipients) {
        const recipientId = createId();
        recipientRows.push({
          id: recipientId,
          userId: r.userId,
          smsEligible: r.smsEligible,
          phoneNumberSnapshot: r.phoneNumberSnapshot,
        });
        await tx.insert(industrialEmergencyAlertRecipients).values({
          id: recipientId,
          tenantId,
          alertId: id,
          userId: r.userId,
          personnelId: r.personnelId,
          recipientType: r.recipientType,
          locationId: r.locationId,
          departmentId: r.departmentId,
          phoneNumberSnapshot: r.phoneNumberSnapshot,
          smsEligible: r.smsEligible,
          exclusionReason: r.exclusionReason,
        });
      }

      const smsTargets = recipientRows.filter((r) => r.smsEligible && r.phoneNumberSnapshot);
      const inAppTargets = recipientRows.filter((r) => r.userId);
      const smsJobs: { deliveryId: string; recipientId: string; e164: string }[] = [];
      let smsChannelId: string | null = null;

      for (const channel of channels) {
        const channelId = createId();
        const enabled =
          channel === "SMS"
            ? Boolean(settings?.smsEnabled)
            : channel === "MVIX"
              ? (settings?.mvixEnabled ?? true)
              : channel === "IN_APP"
                ? (settings?.inAppEnabled ?? true)
                : true;

        let status = "PENDING";
        let success = 0;
        let failure = 0;
        let targetCount = recipients.length;
        let completedAt: Date | null = now;

        if (!enabled) {
          status = "SKIPPED";
          targetCount = 0;
        } else if (channel === "SMS") {
          smsChannelId = channelId;
          targetCount = smsTargets.length;
          status = "QUEUED";
          completedAt = null;
          for (const r of smsTargets) {
            const e164 = toE164Phone(r.phoneNumberSnapshot);
            const deliveryId = createId();
            if (!e164) {
              failure += 1;
              await tx.insert(industrialEmergencyAlertDeliveries).values({
                id: deliveryId,
                tenantId,
                alertId: id,
                alertVersionId: versionId,
                recipientId: r.id,
                channel: "SMS",
                provider: smsProviderName,
                status: "FAILED",
                queuedAt: now,
                failedAt: now,
                failureCode: "INVALID_DESTINATION",
                failureReason: "Could not convert stored phone to E.164",
                attemptCount: 0,
                createdAt: now,
                updatedAt: now,
              });
              continue;
            }
            smsJobs.push({ deliveryId, recipientId: r.id, e164 });
            await tx.insert(industrialEmergencyAlertDeliveries).values({
              id: deliveryId,
              tenantId,
              alertId: id,
              alertVersionId: versionId,
              recipientId: r.id,
              channel: "SMS",
              provider: smsProviderName,
              status: "QUEUED",
              queuedAt: now,
              attemptCount: 0,
              createdAt: now,
              updatedAt: now,
            });
          }
          if (!smsJobs.length) {
            status = failure ? "FAILED" : "SKIPPED";
            completedAt = now;
          }
        } else if (channel === "MVIX") {
          if (demoTenant) {
            status = "SKIPPED";
            targetCount = 0;
            success = 0;
          } else {
            status = "PUBLISHED";
            success = 1;
            targetCount = await countMvixLocationsForAudience(tx, tenantId, audience);
            const feedFilter =
              audience.scope === "TARGETED" && audience.locationIds.length
                ? and(
                    eq(industrialEmergencyAlertCapFeeds.tenantId, tenantId),
                    eq(industrialEmergencyAlertCapFeeds.enabled, true),
                    or(
                      isNull(industrialEmergencyAlertCapFeeds.locationId),
                      inArray(industrialEmergencyAlertCapFeeds.locationId, audience.locationIds),
                    ),
                  )
                : and(
                    eq(industrialEmergencyAlertCapFeeds.tenantId, tenantId),
                    eq(industrialEmergencyAlertCapFeeds.enabled, true),
                  );
            await tx
              .update(industrialEmergencyAlertCapFeeds)
              .set({ lastGeneratedAt: now, updatedAt: now })
              .where(feedFilter!);
          }
        } else if (channel === "IN_APP") {
          status = "SENT";
          targetCount = inAppTargets.length;
          success = inAppTargets.length;
        }

        await tx.insert(industrialEmergencyAlertChannels).values({
          id: channelId,
          tenantId,
          alertId: id,
          channel,
          enabled,
          status,
          targetCount,
          successCount: success,
          failureCount: failure,
          startedAt: now,
          completedAt,
          createdAt: now,
          updatedAt: now,
        });
      }

      const [row] = await tx
        .update(industrialEmergencyAlerts)
        .set({
          status: "ACTIVE",
          audienceJson: audience,
          issuedAt: now,
          effectiveAt: now,
          updatedAt: now,
        })
        .where(eq(industrialEmergencyAlerts.id, id))
        .returning();

      await this.writeAudit(tx, {
        tenantId,
        alertId: id,
        actorUserId: principal.userId,
        action: existing.isDrill ? "SEND_DRILL" : "SEND",
        detail: {
          channels,
          audience,
          recipientCount: recipients.length,
          smsEligible: smsTargets.length,
          smsQueued: smsJobs.length,
          forgeUsers: inAppTargets.length,
          smsProvider: smsProviderName,
        },
      });

      return {
        alert: this.mapAlert(row!),
        versionId,
        recipientCount: recipients.length,
        preview: summarizeAudience(
          audience,
          recipients,
          await countMvixLocationsForAudience(tx, tenantId, audience),
        ),
        notifyUserIds: channels.includes("IN_APP")
          ? inAppTargets
              .map((r) => r.userId)
              .filter((uid): uid is string => Boolean(uid) && uid !== principal.userId)
          : [],
        smsJobs,
        smsChannelId,
        smsConfig,
        messageBody: buildSmsMessageBody({
          shortMessage: existing.shortMessage,
          isDrill: existing.isDrill,
          headline: existing.headline,
        }),
      };
    });

    const smsDispatch = await this.dispatchQueuedSms({
      tenantId,
      alertId: result.alert.id,
      alertNumber: result.alert.alertNumber,
      channelId: result.smsChannelId,
      jobs: result.smsJobs,
      config: result.smsConfig,
      messageBody: result.messageBody,
    });

    for (const userId of result.notifyUserIds.slice(0, 200)) {
      try {
        await this.notifications.create(
          tenantId,
          {
            userId,
            type: "industrial.emergency_alerts.issued",
            title: result.alert.isDrill
              ? `[DRILL] ${result.alert.headline}`
              : result.alert.headline,
            body: result.alert.shortMessage,
            priority: "HIGH",
            destination: "IN_APP",
            href: "/modules/emergency-alerts",
            metadataJson: {
              alertId: result.alert.id,
              alertNumber: result.alert.alertNumber,
              isDrill: result.alert.isDrill,
            },
          },
          principal,
        );
      } catch (err) {
        this.logger.warn(
          `Failed in-app notify for alert ${result.alert.id} user ${userId}: ${String(err)}`,
        );
      }
    }

    return {
      ...result.alert,
      recipientCount: result.recipientCount,
      preview: result.preview,
      sms: smsDispatch,
    };
  }

  private async dispatchQueuedSms(input: {
    tenantId: string;
    alertId: string;
    alertNumber: string;
    channelId: string | null;
    jobs: { deliveryId: string; recipientId: string; e164: string }[];
    config: ReturnType<IndustrialEmergencyAlertsService["smsConfigFromSettings"]>;
    messageBody: string;
  }) {
    if (!input.jobs.length || !input.channelId) {
      return {
        attempted: 0,
        accepted: 0,
        failed: 0,
        provider: input.config.provider,
        ready: isSmsProviderReady(input.config),
        dryRun: input.config.dryRun,
        note: "No SMS deliveries were queued",
      };
    }

    if (await isDemoTenant(this.db, input.tenantId)) {
      const now = new Date();
      await withTenantTransaction(this.db, input.tenantId, async (tx) => {
        for (const job of input.jobs) {
          await tx
            .update(industrialEmergencyAlertDeliveries)
            .set({
              status: "STUBBED",
              failureCode: "DEMO_TENANT_BLOCKED",
              failureReason: "External SMS is disabled for demo tenants",
              attemptCount: 1,
              lastAttemptAt: now,
              updatedAt: now,
            })
            .where(eq(industrialEmergencyAlertDeliveries.id, job.deliveryId));
        }
        if (input.channelId) {
          await tx
            .update(industrialEmergencyAlertChannels)
            .set({
              status: "SKIPPED",
              successCount: 0,
              failureCount: 0,
              completedAt: now,
              updatedAt: now,
            })
            .where(eq(industrialEmergencyAlertChannels.id, input.channelId));
        }
      });
      return {
        attempted: input.jobs.length,
        accepted: 0,
        failed: 0,
        provider: "demo-blocked",
        ready: false,
        dryRun: true,
        note: "External SMS blocked for demo tenant",
      };
    }

    const provider = createEmergencyAlertSmsProvider(input.config);
    const now = new Date();
    let accepted = 0;
    let failed = 0;

    const results = await mapPool(input.jobs, input.config.concurrency, async (job) => {
      const sendResult = await provider.send({
        destinationPhoneNumber: job.e164,
        messageBody: input.messageBody,
        context: {
          alertId: input.alertId.slice(0, 100),
          alertNumber: String(input.alertNumber).slice(0, 100),
          tenantId: input.tenantId.slice(0, 100),
        },
      });
      return { job, sendResult };
    });

    await withTenantTransaction(this.db, input.tenantId, async (tx) => {
      for (const { job, sendResult } of results) {
        if (sendResult.ok) {
          accepted += 1;
          await tx
            .update(industrialEmergencyAlertDeliveries)
            .set({
              status: sendResult.status,
              providerMessageId: sendResult.providerMessageId,
              sentAt: now,
              attemptCount: 1,
              lastAttemptAt: now,
              updatedAt: now,
              failureCode: null,
              failureReason: null,
              failedAt: null,
            })
            .where(eq(industrialEmergencyAlertDeliveries.id, job.deliveryId));
        } else {
          failed += 1;
          await tx
            .update(industrialEmergencyAlertDeliveries)
            .set({
              status: sendResult.failureCode === "PROVIDER_NOT_CONFIGURED" ? "STUBBED" : "FAILED",
              failedAt: now,
              failureCode: sendResult.failureCode,
              failureReason: sendResult.failureReason,
              attemptCount: 1,
              lastAttemptAt: now,
              updatedAt: now,
            })
            .where(eq(industrialEmergencyAlertDeliveries.id, job.deliveryId));
        }
      }

      const priorFailures = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(industrialEmergencyAlertDeliveries)
        .where(
          and(
            eq(industrialEmergencyAlertDeliveries.alertId, input.alertId),
            eq(industrialEmergencyAlertDeliveries.channel, "SMS"),
            inArray(industrialEmergencyAlertDeliveries.status, ["FAILED", "STUBBED"]),
          ),
        );
      const totalFailed = priorFailures[0]?.count ?? failed;
      const channelStatus =
        accepted > 0 && totalFailed === 0
          ? "SENT"
          : accepted > 0
            ? "PARTIAL"
            : totalFailed > 0
              ? "FAILED"
              : "SKIPPED";

      await tx
        .update(industrialEmergencyAlertChannels)
        .set({
          status: channelStatus,
          successCount: accepted,
          failureCount: totalFailed,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(industrialEmergencyAlertChannels.id, input.channelId!));
    });

    this.logger.log(
      `Emergency alert ${input.alertId} SMS dispatch provider=${input.config.provider} accepted=${accepted} failed=${failed} dryRun=${input.config.dryRun}`,
    );

    return {
      attempted: input.jobs.length,
      accepted,
      failed,
      provider: input.config.provider,
      ready: provider.isReady(),
      dryRun: input.config.dryRun,
      note: provider.isReady()
        ? input.config.dryRun
          ? "SMS DryRun accepted by AWS End User Messaging (no carrier send)."
          : "SMS submitted to AWS End User Messaging."
        : "SMS provider was not ready; deliveries marked STUBBED/FAILED.",
    };
  }

  async updateActive(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const headline = asString(body.headline);
    const shortMessage = asString(body.shortMessage ?? body.short_message);
    if (!headline && !shortMessage && body.instructions === undefined) {
      throw new ForgeError("VALIDATION_FAILED", "Provide an update message");
    }

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, tenantId),
            eq(industrialEmergencyAlerts.id, id),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Emergency alert not found");
      if (!ACTIVE_STATUSES.includes(existing.status as (typeof ACTIVE_STATUSES)[number])) {
        throw new ForgeError("CONFLICT", "Only active alerts can be updated");
      }

      const [latest] = await tx
        .select({ max: sql<number>`coalesce(max(${industrialEmergencyAlertVersions.versionNumber}), 0)::int` })
        .from(industrialEmergencyAlertVersions)
        .where(eq(industrialEmergencyAlertVersions.alertId, id));
      const nextVersion = (latest?.max ?? 0) + 1;
      const now = new Date();
      const nextHeadline = headline || existing.headline;
      const nextShort = shortMessage || existing.shortMessage;
      const nextInstructions =
        body.instructions !== undefined
          ? asString(body.instructions) || null
          : existing.instructions;
      const nextDetailed =
        body.detailedMessage !== undefined || body.detailed_message !== undefined
          ? asString(body.detailedMessage ?? body.detailed_message) || null
          : existing.detailedMessage;

      await tx.insert(industrialEmergencyAlertVersions).values({
        id: createId(),
        tenantId,
        alertId: id,
        versionNumber: nextVersion,
        changeType: "UPDATE",
        headline: nextHeadline,
        shortMessage: nextShort,
        detailedMessage: nextDetailed,
        instructions: nextInstructions,
        severity: asString(body.severity, existing.severity).toUpperCase() || existing.severity,
        effectiveAt: now,
        expiresAt: existing.expiresAt,
        createdByUserId: principal.userId,
        createdAt: now,
      });

      const [row] = await tx
        .update(industrialEmergencyAlerts)
        .set({
          headline: nextHeadline,
          shortMessage: nextShort,
          detailedMessage: nextDetailed,
          instructions: nextInstructions,
          status: "ACTIVE",
          updatedAt: now,
        })
        .where(eq(industrialEmergencyAlerts.id, id))
        .returning();

      await tx
        .update(industrialEmergencyAlertCapFeeds)
        .set({ lastGeneratedAt: now, updatedAt: now })
        .where(
          and(
            eq(industrialEmergencyAlertCapFeeds.tenantId, tenantId),
            eq(industrialEmergencyAlertCapFeeds.enabled, true),
          ),
        );

      await this.writeAudit(tx, {
        tenantId,
        alertId: id,
        actorUserId: principal.userId,
        action: "UPDATE",
        detail: { versionNumber: nextVersion },
      });

      return this.mapAlert(row!);
    });
  }

  async allClear(principal: ForgePrincipal, id: string, body: Record<string, unknown> = {}) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, tenantId),
            eq(industrialEmergencyAlerts.id, id),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Emergency alert not found");
      if (!ACTIVE_STATUSES.includes(existing.status as (typeof ACTIVE_STATUSES)[number])) {
        throw new ForgeError("CONFLICT", "Only active alerts can be cleared");
      }

      const now = new Date();
      const [latest] = await tx
        .select({ max: sql<number>`coalesce(max(${industrialEmergencyAlertVersions.versionNumber}), 0)::int` })
        .from(industrialEmergencyAlertVersions)
        .where(eq(industrialEmergencyAlertVersions.alertId, id));
      const clearMessage =
        asString(body.message, "All clear. Resume normal operations.") ||
        "All clear. Resume normal operations.";

      await tx.insert(industrialEmergencyAlertVersions).values({
        id: createId(),
        tenantId,
        alertId: id,
        versionNumber: (latest?.max ?? 0) + 1,
        changeType: "ALL_CLEAR",
        headline: `ALL CLEAR: ${existing.headline}`.slice(0, 300),
        shortMessage: clearMessage.slice(0, 500),
        detailedMessage: existing.detailedMessage,
        instructions: clearMessage,
        severity: "MINOR",
        effectiveAt: now,
        createdByUserId: principal.userId,
        createdAt: now,
      });

      const [row] = await tx
        .update(industrialEmergencyAlerts)
        .set({
          status: "CLEARED",
          clearedAt: now,
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(industrialEmergencyAlerts.id, id))
        .returning();

      await tx
        .update(industrialEmergencyAlertCapFeeds)
        .set({ lastGeneratedAt: now, updatedAt: now })
        .where(
          and(
            eq(industrialEmergencyAlertCapFeeds.tenantId, tenantId),
            eq(industrialEmergencyAlertCapFeeds.enabled, true),
          ),
        );

      await this.writeAudit(tx, {
        tenantId,
        alertId: id,
        actorUserId: principal.userId,
        action: "ALL_CLEAR",
      });

      return this.mapAlert(row!);
    });
  }

  async cancelAlert(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, tenantId),
            eq(industrialEmergencyAlerts.id, id),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Emergency alert not found");
      if (existing.status !== "DRAFT" && existing.status !== "PENDING_APPROVAL") {
        throw new ForgeError("CONFLICT", "Only draft or pending alerts can be cancelled");
      }
      const [row] = await tx
        .update(industrialEmergencyAlerts)
        .set({ status: "CANCELLED", closedAt: new Date(), updatedAt: new Date() })
        .where(eq(industrialEmergencyAlerts.id, id))
        .returning();
      await this.writeAudit(tx, {
        tenantId,
        alertId: id,
        actorUserId: principal.userId,
        action: "CANCEL",
      });
      return this.mapAlert(row!);
    });
  }

  async listTemplates(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialEmergencyAlertTemplates)
        .where(eq(industrialEmergencyAlertTemplates.tenantId, tenantId))
        .orderBy(desc(industrialEmergencyAlertTemplates.updatedAt));
      return {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          alertType: r.alertType,
          severity: r.severity,
          headline: r.headline,
          shortMessage: r.shortMessage,
          detailedMessage: r.detailedMessage,
          instructions: r.instructions,
          channels: r.channelsJson,
          requiresAcknowledgment: r.requiresAcknowledgment,
          enabled: r.enabled,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      };
    });
  }

  async createTemplate(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name);
    const headline = asString(body.headline);
    const shortMessage = asString(body.shortMessage ?? body.short_message);
    if (!name || !headline || !shortMessage) {
      throw new ForgeError("VALIDATION_FAILED", "name, headline, and shortMessage are required");
    }
    const now = new Date();
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(industrialEmergencyAlertTemplates)
        .values({
          id: createId(),
          tenantId,
          name: name.slice(0, 200),
          alertType: asString(body.alertType, "GENERAL").toUpperCase() || "GENERAL",
          severity: asString(body.severity, "SEVERE").toUpperCase() || "SEVERE",
          headline: headline.slice(0, 300),
          shortMessage: shortMessage.slice(0, 500),
          detailedMessage: asString(body.detailedMessage) || null,
          instructions: asString(body.instructions) || null,
          channelsJson: normalizeChannels(body.channels),
          requiresAcknowledgment: asBool(body.requiresAcknowledgment, false),
          enabled: true,
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return {
        id: row!.id,
        name: row!.name,
        alertType: row!.alertType,
        severity: row!.severity,
        headline: row!.headline,
        shortMessage: row!.shortMessage,
        channels: row!.channelsJson,
        enabled: row!.enabled,
      };
    });
  }

  async updateTemplate(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialEmergencyAlertTemplates)
        .where(
          and(
            eq(industrialEmergencyAlertTemplates.id, id),
            eq(industrialEmergencyAlertTemplates.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Template not found");

      const name = asString(body.name, existing.name);
      const headline = asString(body.headline, existing.headline);
      const shortMessage = asString(
        body.shortMessage ?? body.short_message,
        existing.shortMessage,
      );
      if (!name || !headline || !shortMessage) {
        throw new ForgeError("VALIDATION_FAILED", "name, headline, and shortMessage are required");
      }

      const channels =
        body.channels !== undefined || body.channelsJson !== undefined
          ? normalizeChannels(body.channels ?? body.channelsJson)
          : (existing.channelsJson as string[]);

      const [row] = await tx
        .update(industrialEmergencyAlertTemplates)
        .set({
          name: name.slice(0, 200),
          alertType:
            asString(body.alertType ?? body.alert_type, existing.alertType).toUpperCase() ||
            existing.alertType,
          severity:
            asString(body.severity, existing.severity).toUpperCase() || existing.severity,
          headline: headline.slice(0, 300),
          shortMessage: shortMessage.slice(0, 500),
          detailedMessage:
            body.detailedMessage !== undefined || body.detailed_message !== undefined
              ? asString(body.detailedMessage ?? body.detailed_message) || null
              : existing.detailedMessage,
          instructions:
            body.instructions !== undefined
              ? asString(body.instructions) || null
              : existing.instructions,
          channelsJson: channels,
          requiresAcknowledgment:
            body.requiresAcknowledgment !== undefined ||
            body.requires_acknowledgment !== undefined
              ? asBool(
                  body.requiresAcknowledgment ?? body.requires_acknowledgment,
                  existing.requiresAcknowledgment,
                )
              : existing.requiresAcknowledgment,
          enabled:
            body.enabled !== undefined
              ? asBool(body.enabled, existing.enabled)
              : existing.enabled,
          updatedAt: new Date(),
        })
        .where(eq(industrialEmergencyAlertTemplates.id, id))
        .returning();

      return {
        id: row!.id,
        name: row!.name,
        alertType: row!.alertType,
        severity: row!.severity,
        headline: row!.headline,
        shortMessage: row!.shortMessage,
        detailedMessage: row!.detailedMessage,
        instructions: row!.instructions,
        channels: row!.channelsJson,
        requiresAcknowledgment: row!.requiresAcknowledgment,
        enabled: row!.enabled,
        updatedAt: row!.updatedAt.toISOString(),
      };
    });
  }

  async deleteTemplate(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: industrialEmergencyAlertTemplates.id })
        .from(industrialEmergencyAlertTemplates)
        .where(
          and(
            eq(industrialEmergencyAlertTemplates.id, id),
            eq(industrialEmergencyAlertTemplates.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Template not found");
      await tx
        .delete(industrialEmergencyAlertTemplates)
        .where(eq(industrialEmergencyAlertTemplates.id, id));
      return { id, deleted: true };
    });
  }

  async getOrCreateSettings(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialEmergencyAlertSettings)
        .where(eq(industrialEmergencyAlertSettings.tenantId, tenantId))
        .limit(1);
      if (existing) return this.mapSettings(existing);
      const [row] = await tx
        .insert(industrialEmergencyAlertSettings)
        .values({
          id: createId(),
          tenantId,
        })
        .returning();
      return this.mapSettings(row!);
    });
  }

  async updateSettings(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialEmergencyAlertSettings)
        .where(eq(industrialEmergencyAlertSettings.tenantId, tenantId))
        .limit(1);

      const providerRaw = asString(body.smsProvider || body.sms_provider);
      const smsProvider = providerRaw
        ? providerRaw.toUpperCase()
        : (existing?.smsProvider ?? SMS_PROVIDER_STUB);
      if (
        smsProvider !== SMS_PROVIDER_STUB &&
        smsProvider !== SMS_PROVIDER_AWS
      ) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          `smsProvider must be ${SMS_PROVIDER_STUB} or ${SMS_PROVIDER_AWS}`,
        );
      }

      const prevBag =
        existing?.settingsJson && typeof existing.settingsJson === "object"
          ? { ...(existing.settingsJson as Record<string, unknown>) }
          : {};
      const nextBag =
        body.settings && typeof body.settings === "object"
          ? { ...prevBag, ...(body.settings as Record<string, unknown>) }
          : prevBag;

      // Never persist credential-looking keys in tenant settings JSON.
      for (const key of Object.keys(nextBag)) {
        const lower = key.toLowerCase();
        if (
          lower.includes("secret") ||
          lower.includes("password") ||
          lower.includes("apikey") ||
          lower.includes("api_key") ||
          lower.includes("token")
        ) {
          delete nextBag[key];
        }
      }

      const values = {
        smsProvider,
        smsEnabled:
          body.smsEnabled !== undefined || body.sms_enabled !== undefined
            ? asBool(body.smsEnabled ?? body.sms_enabled, false)
            : (existing?.smsEnabled ?? false),
        mvixEnabled:
          body.mvixEnabled !== undefined || body.mvix_enabled !== undefined
            ? asBool(body.mvixEnabled ?? body.mvix_enabled, true)
            : (existing?.mvixEnabled ?? true),
        inAppEnabled:
          body.inAppEnabled !== undefined || body.in_app_enabled !== undefined
            ? asBool(body.inAppEnabled ?? body.in_app_enabled, true)
            : (existing?.inAppEnabled ?? true),
        requireSendConfirmation:
          body.requireSendConfirmation !== undefined ||
          body.require_send_confirmation !== undefined
            ? asBool(body.requireSendConfirmation ?? body.require_send_confirmation, true)
            : (existing?.requireSendConfirmation ?? true),
        defaultChannelsJson:
          body.defaultChannels !== undefined || body.default_channels !== undefined
            ? normalizeChannels(body.defaultChannels ?? body.default_channels)
            : (existing?.defaultChannelsJson ?? ["SMS", "IN_APP", "MVIX"]),
        settingsJson: nextBag,
        updatedAt: new Date(),
      };

      if (existing) {
        const [row] = await tx
          .update(industrialEmergencyAlertSettings)
          .set(values)
          .where(eq(industrialEmergencyAlertSettings.id, existing.id))
          .returning();
        await this.writeAudit(tx, {
          tenantId,
          actorUserId: principal.userId,
          action: "UPDATE_SETTINGS",
          detail: {
            smsProvider: values.smsProvider,
            smsEnabled: values.smsEnabled,
            originationConfigured: Boolean(
              asString((nextBag as { originationIdentity?: unknown }).originationIdentity),
            ),
          },
        });
        return this.mapSettings(row!);
      }

      const [row] = await tx
        .insert(industrialEmergencyAlertSettings)
        .values({
          id: createId(),
          tenantId,
          ...values,
        })
        .returning();
      await this.writeAudit(tx, {
        tenantId,
        actorUserId: principal.userId,
        action: "CREATE_SETTINGS",
        detail: { smsProvider: values.smsProvider, smsEnabled: values.smsEnabled },
      });
      return this.mapSettings(row!);
    });
  }

  async listCapFeeds(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialEmergencyAlertCapFeeds)
        .where(eq(industrialEmergencyAlertCapFeeds.tenantId, tenantId))
        .orderBy(desc(industrialEmergencyAlertCapFeeds.createdAt));
      return {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          publicFeedId: r.publicFeedId,
          locationId: r.locationId,
          enabled: r.enabled,
          feedType: r.feedType,
          lastGeneratedAt: r.lastGeneratedAt?.toISOString() ?? null,
          publicPath: `/api/v1/public/emergency-alerts/cap/${r.publicFeedId}`,
        })),
      };
    });
  }

  async createCapFeed(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name, "Facility CAP Feed") || "Facility CAP Feed";
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const publicFeedId = asString(body.publicFeedId) || createId().replace(/-/g, "").slice(0, 24);
      const [row] = await tx
        .insert(industrialEmergencyAlertCapFeeds)
        .values({
          id: createId(),
          tenantId,
          name: name.slice(0, 200),
          publicFeedId,
          locationId: asString(body.locationId) || null,
          enabled: true,
          feedType: asString(body.feedType, "MVIX").toUpperCase() || "MVIX",
        })
        .returning();
      return {
        id: row!.id,
        name: row!.name,
        publicFeedId: row!.publicFeedId,
        publicPath: `/api/v1/public/emergency-alerts/cap/${row!.publicFeedId}`,
        enabled: row!.enabled,
      };
    });
  }

  /** Public CAP 1.2 Atom-like feed for Mvix CAP Alert App (no auth). */
  async renderPublicCapFeed(publicFeedId: string): Promise<string> {
    return withBypassRlsTransaction(this.db, async (tx) => {
      const [feed] = await tx
        .select()
        .from(industrialEmergencyAlertCapFeeds)
        .where(
          and(
            eq(industrialEmergencyAlertCapFeeds.publicFeedId, publicFeedId),
            eq(industrialEmergencyAlertCapFeeds.enabled, true),
          ),
        )
        .limit(1);
      if (!feed) throw new ForgeError("NOT_FOUND", "CAP feed not found");

      // Demo tenants must never publish live alerts to external TV / MVix destinations.
      const demoRows = await tx
        .select({ isDemoTenant: tenants.isDemoTenant })
        .from(tenants)
        .where(eq(tenants.id, feed.tenantId))
        .limit(1);
      if (demoRows[0]?.isDemoTenant) {
        const now = new Date().toISOString();
        return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feed.name)} (demo)</title>
  <id>urn:forge:cap:${escapeXml(feed.publicFeedId)}</id>
  <updated>${escapeXml(now)}</updated>
</feed>`;
      }

      const alerts = await tx
        .select()
        .from(industrialEmergencyAlerts)
        .where(
          and(
            eq(industrialEmergencyAlerts.tenantId, feed.tenantId),
            inArray(industrialEmergencyAlerts.status, [...ACTIVE_STATUSES]),
          ),
        )
        .orderBy(desc(industrialEmergencyAlerts.issuedAt))
        .limit(40);

      const matching = alerts.filter((alert) => {
        const aud = parseAudience(alert.audienceJson);
        if (aud.scope === "TENANT") return true;
        if (!feed.locationId) return true;
        if (!aud.locationIds.length) return true;
        return aud.locationIds.includes(feed.locationId);
      });

      const now = new Date().toISOString();
      const entries = matching
        .slice(0, 20)
        .map((alert) => {
          const issued = (alert.issuedAt ?? alert.createdAt).toISOString();
          const msgType = alert.status === "CLEARED" ? "Cancel" : "Alert";
          return `  <entry>
    <id>${escapeXml(alert.id)}</id>
    <title>${escapeXml(alert.isDrill ? `[DRILL] ${alert.headline}` : alert.headline)}</title>
    <updated>${escapeXml(issued)}</updated>
    <content type="text/xml">
      <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
        <identifier>${escapeXml(alert.alertNumber)}</identifier>
        <sender>forge-emergency-alerts</sender>
        <sent>${escapeXml(issued)}</sent>
        <status>${alert.isDrill ? "Exercise" : "Actual"}</status>
        <msgType>${msgType}</msgType>
        <scope>Public</scope>
        <info>
          <category>Safety</category>
          <event>${escapeXml(alert.alertType)}</event>
          <urgency>Immediate</urgency>
          <severity>${escapeXml(alert.severity)}</severity>
          <certainty>Observed</certainty>
          <headline>${escapeXml(alert.headline)}</headline>
          <description>${escapeXml(alert.shortMessage)}</description>
          <instruction>${escapeXml(alert.instructions ?? "")}</instruction>
        </info>
      </alert>
    </content>
  </entry>`;
        })
        .join("\n");

      await tx
        .update(industrialEmergencyAlertCapFeeds)
        .set({ lastGeneratedAt: new Date(), updatedAt: new Date() })
        .where(eq(industrialEmergencyAlertCapFeeds.id, feed.id));

      return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feed.name)}</title>
  <id>urn:forge:cap:${escapeXml(feed.publicFeedId)}</id>
  <updated>${escapeXml(now)}</updated>
${entries}
</feed>
`;
    });
  }

  async previewAudience(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const { audience, recipients } = await resolveAudienceRecipients(
        tx,
        tenantId,
        body.audience ?? body,
      );
      const mvixLocations = await countMvixLocationsForAudience(tx, tenantId, audience);
      return summarizeAudience(audience, recipients, mvixLocations);
    });
  }

  async listTargets(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => listTargetLookups(tx, tenantId));
  }

  async listGroups(principal: ForgePrincipal) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(industrialEmergencyAlertGroups)
        .where(eq(industrialEmergencyAlertGroups.tenantId, tenantId))
        .orderBy(desc(industrialEmergencyAlertGroups.updatedAt));
      const items = [];
      for (const g of rows) {
        const [memberCount] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(industrialEmergencyAlertGroupMembers)
          .where(eq(industrialEmergencyAlertGroupMembers.groupId, g.id));
        items.push({
          id: g.id,
          name: g.name,
          description: g.description,
          groupType: g.groupType,
          dynamic: g.dynamic,
          locationId: g.locationId,
          departmentId: g.departmentId,
          ruleJson: g.ruleJson,
          enabled: g.enabled,
          expiresAt: g.expiresAt?.toISOString() ?? null,
          memberCount: memberCount?.count ?? 0,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
        });
      }
      return { items };
    });
  }

  async getGroup(principal: ForgePrincipal, id: string) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [g] = await tx
        .select()
        .from(industrialEmergencyAlertGroups)
        .where(
          and(
            eq(industrialEmergencyAlertGroups.tenantId, tenantId),
            eq(industrialEmergencyAlertGroups.id, id),
          ),
        )
        .limit(1);
      if (!g) throw new ForgeError("NOT_FOUND", "Alert group not found");

      const memberRows = await tx
        .select({
          personnelId: industrialEmergencyAlertGroupMembers.personnelId,
          displayName: industrialPersonnel.displayName,
          employeeNumber: industrialPersonnel.employeeNumber,
          phone: industrialPersonnel.phone,
          status: industrialPersonnel.status,
        })
        .from(industrialEmergencyAlertGroupMembers)
        .leftJoin(
          industrialPersonnel,
          and(
            eq(industrialPersonnel.id, industrialEmergencyAlertGroupMembers.personnelId),
            eq(industrialPersonnel.tenantId, tenantId),
          ),
        )
        .where(
          and(
            eq(industrialEmergencyAlertGroupMembers.tenantId, tenantId),
            eq(industrialEmergencyAlertGroupMembers.groupId, id),
          ),
        )
        .orderBy(asc(industrialPersonnel.displayName));

      return {
        id: g.id,
        name: g.name,
        description: g.description,
        groupType: g.groupType,
        dynamic: g.dynamic,
        locationId: g.locationId,
        departmentId: g.departmentId,
        ruleJson: g.ruleJson,
        enabled: g.enabled,
        expiresAt: g.expiresAt?.toISOString() ?? null,
        memberCount: memberRows.length,
        members: memberRows.map((m) => ({
          personnelId: m.personnelId,
          displayName: m.displayName ?? "Unknown person",
          employeeNumber: m.employeeNumber ?? null,
          phone: m.phone ?? null,
          status: m.status ?? null,
        })),
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      };
    });
  }

  async createGroup(principal: ForgePrincipal, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    const name = asString(body.name);
    if (!name) throw new ForgeError("VALIDATION_FAILED", "name is required");
    const dynamic =
      asBool(body.dynamic, false) ||
      asString(body.groupType).toUpperCase() === "DYNAMIC";
    const personnelIds = Array.isArray(body.personnelIds)
      ? body.personnelIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const id = createId();
      const [row] = await tx
        .insert(industrialEmergencyAlertGroups)
        .values({
          id,
          tenantId,
          name: name.slice(0, 200),
          description: asString(body.description) || null,
          groupType: dynamic
            ? "DYNAMIC"
            : asString(body.groupType, "STATIC").toUpperCase() || "STATIC",
          locationId: asString(body.locationId) || null,
          departmentId: asString(body.departmentId) || null,
          dynamic,
          ruleJson:
            body.ruleJson && typeof body.ruleJson === "object"
              ? (body.ruleJson as Record<string, unknown>)
              : {
                  locationIds: asString(body.locationId) ? [asString(body.locationId)] : [],
                  departmentIds: asString(body.departmentId)
                    ? [asString(body.departmentId)]
                    : [],
                },
          enabled: true,
          expiresAt: asString(body.expiresAt) ? new Date(asString(body.expiresAt)) : null,
          createdByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!dynamic) {
        for (const personnelId of personnelIds.slice(0, 2000)) {
          await tx.insert(industrialEmergencyAlertGroupMembers).values({
            id: createId(),
            tenantId,
            groupId: id,
            personnelId,
          });
        }
      }

      return {
        id: row!.id,
        name: row!.name,
        groupType: row!.groupType,
        dynamic: row!.dynamic,
        memberCount: dynamic ? null : personnelIds.length,
      };
    });
  }

  async updateGroup(principal: ForgePrincipal, id: string, body: Record<string, unknown>) {
    const tenantId = this.tenant(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(industrialEmergencyAlertGroups)
        .where(
          and(
            eq(industrialEmergencyAlertGroups.tenantId, tenantId),
            eq(industrialEmergencyAlertGroups.id, id),
          ),
        )
        .limit(1);
      if (!existing) throw new ForgeError("NOT_FOUND", "Alert group not found");

      const [row] = await tx
        .update(industrialEmergencyAlertGroups)
        .set({
          name: asString(body.name, existing.name).slice(0, 200) || existing.name,
          description:
            body.description !== undefined
              ? asString(body.description) || null
              : existing.description,
          enabled:
            body.enabled !== undefined ? asBool(body.enabled, existing.enabled) : existing.enabled,
          locationId:
            body.locationId !== undefined
              ? asString(body.locationId) || null
              : existing.locationId,
          departmentId:
            body.departmentId !== undefined
              ? asString(body.departmentId) || null
              : existing.departmentId,
          ruleJson:
            body.ruleJson && typeof body.ruleJson === "object"
              ? (body.ruleJson as Record<string, unknown>)
              : existing.ruleJson,
          updatedAt: new Date(),
        })
        .where(eq(industrialEmergencyAlertGroups.id, id))
        .returning();

      if (Array.isArray(body.personnelIds) && !existing.dynamic) {
        await tx
          .delete(industrialEmergencyAlertGroupMembers)
          .where(eq(industrialEmergencyAlertGroupMembers.groupId, id));
        for (const personnelId of body.personnelIds
          .map((pid) => String(pid).trim())
          .filter(Boolean)
          .slice(0, 2000)) {
          await tx.insert(industrialEmergencyAlertGroupMembers).values({
            id: createId(),
            tenantId,
            groupId: id,
            personnelId,
          });
        }
      }

      return {
        id: row!.id,
        name: row!.name,
        enabled: row!.enabled,
        groupType: row!.groupType,
        dynamic: row!.dynamic,
      };
    });
  }
}

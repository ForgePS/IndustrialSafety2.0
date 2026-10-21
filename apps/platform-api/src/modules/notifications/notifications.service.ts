import { Inject, Injectable } from "@nestjs/common";
import {
  createNotificationInputSchema,
  EMAIL_TEMPLATE_KEYS,
  type CreateNotificationInput,
  type EmailAttachment,
  type EmailMessage,
} from "@forge/contracts";
import {
  createId,
  type Database,
  userNotifications,
  withTenantTransaction,
} from "@forge/database";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { createLogger, logOperationalFailure } from "@forge/observability";
import { DATABASE } from "../../tokens.js";
import {
  createEmailProviderFromEnv,
  renderTemplate,
  type EmailProvider,
} from "./email-provider.js";
import { WebPushService } from "./web-push.service.js";
import { isDemoTenant } from "../../common/demo-tenant.js";

const emailLogger = createLogger({
  service: "platform-api-email",
  environment: process.env.APP_ENV ?? "local",
});

const DEFAULT_EMAIL_BODIES: Record<
  (typeof EMAIL_TEMPLATE_KEYS)[number],
  { subject: string; htmlBody: string; textBody: string }
> = {
  welcome: {
    subject: "Welcome to Forge",
    htmlBody: "<p>Welcome {{displayName}}. Your tenant is ready.</p>",
    textBody: "Welcome {{displayName}}. Your tenant is ready.",
  },
  verification: {
    subject: "Verify your email",
    htmlBody: "<p>Verify your email for {{tenantName}}.</p>",
    textBody: "Verify your email for {{tenantName}}.",
  },
  invitation: {
    subject: "You are invited to {{tenantName}}",
    htmlBody: "<p>You have been invited to join {{tenantName}}.</p>",
    textBody: "You have been invited to join {{tenantName}}.",
  },
  membership_changed: {
    subject: "Membership update",
    htmlBody: "<p>Your membership status is now {{status}}.</p>",
    textBody: "Your membership status is now {{status}}.",
  },
  billing: {
    subject: "Billing update",
    htmlBody: "<p>A billing update is available for {{tenantName}}.</p>",
    textBody: "A billing update is available for {{tenantName}}.",
  },
  security: {
    subject: "Security notice",
    htmlBody: "<p>Security notice: {{detail}}</p>",
    textBody: "Security notice: {{detail}}.",
  },
  system_notification: {
    subject: "System notification",
    htmlBody: "<p>{{detail}}</p>",
    textBody: "{{detail}}",
  },
  workers_comp_weekly_status: {
    subject: "{{subject}}",
    htmlBody: "{{htmlBody}}",
    textBody: "{{textBody}}",
  },
  reporting_schedule_delivery: {
    subject: "{{subject}}",
    htmlBody: "{{htmlBody}}",
    textBody: "{{textBody}}",
  },
  sanitation_inspection_completed: {
    subject: "{{subject}}",
    htmlBody: "{{htmlBody}}",
    textBody: "{{textBody}}",
  },
  observation_assigned: {
    subject: "{{subject}}",
    htmlBody: "{{htmlBody}}",
    textBody: "{{textBody}}",
  },
};

@Injectable()
export class NotificationsService {
  private readonly email: EmailProvider;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly webPush: WebPushService,
  ) {
    this.email = createEmailProviderFromEnv();
  }

  async listForUser(tenantId: string, userId: string, limit = 50) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx.query.userNotifications.findMany({
        where: and(
          eq(userNotifications.tenantId, tenantId),
          eq(userNotifications.userId, userId),
        ),
        orderBy: [desc(userNotifications.createdAt)],
        limit: Math.min(Math.max(limit, 1), 100),
      });
    });
  }

  async unreadCount(tenantId: string, userId: string): Promise<number> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(userNotifications)
        .where(
          and(
            eq(userNotifications.tenantId, tenantId),
            eq(userNotifications.userId, userId),
            isNull(userNotifications.readAt),
          ),
        );
      return rows[0]?.count ?? 0;
    });
  }

  async markRead(tenantId: string, userId: string, notificationId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(userNotifications)
        .set({ readAt: now, updatedAt: now })
        .where(
          and(
            eq(userNotifications.id, notificationId),
            eq(userNotifications.tenantId, tenantId),
            eq(userNotifications.userId, userId),
          ),
        )
        .returning();
      return row ?? null;
    });
  }

  async markAllRead(tenantId: string, userId: string): Promise<number> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(userNotifications)
        .set({ readAt: now, updatedAt: now })
        .where(
          and(
            eq(userNotifications.tenantId, tenantId),
            eq(userNotifications.userId, userId),
            isNull(userNotifications.readAt),
          ),
        )
        .returning({ id: userNotifications.id });
      return updated.length;
    });
  }

  /**
   * Mark unread inbox rows of a given type whose metadataJson.threadId matches.
   * Used when the user opens a messaging thread so bell notifications clear with read receipts.
   */
  async markUnreadByTypeAndThread(
    tenantId: string,
    userId: string,
    type: string,
    threadId: string,
  ): Promise<number> {
    const trimmedType = type.trim();
    const trimmedThreadId = threadId.trim();
    if (!trimmedType || !trimmedThreadId) return 0;

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(userNotifications)
        .set({ readAt: now, updatedAt: now })
        .where(
          and(
            eq(userNotifications.tenantId, tenantId),
            eq(userNotifications.userId, userId),
            eq(userNotifications.type, trimmedType),
            isNull(userNotifications.readAt),
            sql`${userNotifications.metadataJson}->>'threadId' = ${trimmedThreadId}`,
          ),
        )
        .returning({ id: userNotifications.id });
      return updated.length;
    });
  }

  async create(
    tenantId: string,
    input: unknown,
    principal: ForgePrincipal,
    vars: Record<string, string> = {},
  ) {
    const data = createNotificationInputSchema.parse(input) as CreateNotificationInput;
    const now = new Date();
    const id = createId();

    const row = await withTenantTransaction(this.db, tenantId, async (tx) => {
      const [created] = await tx
        .insert(userNotifications)
        .values({
          id,
          tenantId,
          userId: data.userId,
          type: data.type,
          title: data.title,
          body: data.body,
          priority: data.priority,
          destination: data.destination,
          href: data.href ?? null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          metadataJson: {
            ...(data.metadataJson ?? {}),
            createdByUserId: principal.userId,
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return created;
    });

    let emailResult = null;
    if (
      (data.destination === "EMAIL" || data.destination === "BOTH") &&
      data.emailTo
    ) {
      emailResult = await this.sendTemplatedEmail({
        to: data.emailTo,
        templateKey: data.emailTemplateKey ?? "system_notification",
        tenantId,
        vars: {
          ...vars,
          detail: data.body,
          title: data.title,
        },
      });
    }

    let pushResult = null;
    if (data.destination === "IN_APP" || data.destination === "BOTH") {
      pushResult = await this.webPush
        .sendToUser(tenantId, data.userId, {
          title: data.title,
          body: data.body,
          href: data.href ?? "/alerts/",
        })
        .catch(() => ({ sent: 0, failed: 0 }));
    }

    return { notification: row, email: emailResult, push: pushResult };
  }

  async sendTemplatedEmail(input: {
    to: string;
    templateKey: (typeof EMAIL_TEMPLATE_KEYS)[number];
    tenantId?: string;
    vars?: Record<string, string>;
    attachments?: EmailAttachment[];
  }) {
    if (input.tenantId && (await isDemoTenant(this.db, input.tenantId))) {
      emailLogger.info("Demo tenant email blocked", {
        tenantId: input.tenantId,
        templateKey: input.templateKey,
      });
      return {
        accepted: true,
        provider: "demo-blocked",
        detail: "External email is disabled for demo tenants",
      };
    }
    const seeded = DEFAULT_EMAIL_BODIES[input.templateKey];
    const vars = input.vars ?? {};
    const message: EmailMessage = {
      to: input.to,
      subject: renderTemplate(seeded.subject, vars),
      htmlBody: renderTemplate(seeded.htmlBody, vars),
      textBody: renderTemplate(seeded.textBody, vars),
      templateKey: input.templateKey,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    };
    const result = await this.email.send(message);
    if (!result.accepted) {
      logOperationalFailure(emailLogger, {
        category: "EMAIL",
        message: "Email send not accepted",
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        code: "EMAIL_NOT_ACCEPTED",
        fields: {
          provider: result.provider,
          templateKey: input.templateKey,
          ...(result.detail ? { detail: result.detail } : {}),
        },
      });
    }
    return result;
  }

  getEmailProviderName(): string {
    return this.email.name;
  }
}

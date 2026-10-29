import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  createId,
  type Database,
  userPushSubscriptions,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { DATABASE } from "../../tokens.js";

type PushKeys = { publicKey: string; privateKey: string; subject: string };

function readVapidKeys(): PushKeys | null {
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "").trim();
  const subject = String(
    process.env.WEB_PUSH_VAPID_SUBJECT ?? "mailto:security@forgepublicsafety.com",
  ).trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private configured = false;

  constructor(@Inject(DATABASE) private readonly db: Database) {
    const keys = readVapidKeys();
    if (keys) {
      webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
      this.configured = true;
    }
  }

  isEnabled(): boolean {
    return this.configured;
  }

  getPublicKey(): { enabled: boolean; publicKey: string | null } {
    const keys = readVapidKeys();
    return { enabled: Boolean(keys), publicKey: keys?.publicKey ?? null };
  }

  async listForUser(principal: ForgePrincipal) {
    const tenantId = principal.tenantId?.trim();
    const userId = principal.userId?.trim();
    if (!tenantId || !userId)
      throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select({
          id: userPushSubscriptions.id,
          endpoint: userPushSubscriptions.endpoint,
          enabled: userPushSubscriptions.enabled,
          createdAt: userPushSubscriptions.createdAt,
        })
        .from(userPushSubscriptions)
        .where(
          and(
            eq(userPushSubscriptions.tenantId, tenantId),
            eq(userPushSubscriptions.userId, userId),
            eq(userPushSubscriptions.enabled, true),
          ),
        );
    });
  }

  async upsertSubscription(
    principal: ForgePrincipal,
    body: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      userAgent?: string;
    },
  ) {
    const tenantId = principal.tenantId?.trim();
    const userId = principal.userId?.trim();
    if (!tenantId || !userId)
      throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    if (!this.configured) {
      throw new ForgeError("VALIDATION_FAILED", "Web Push is not configured on this environment");
    }
    const endpoint = String(body.endpoint ?? "").trim();
    const p256dh = String(body.keys?.p256dh ?? "").trim();
    const auth = String(body.keys?.auth ?? "").trim();
    if (!endpoint || !p256dh || !auth) {
      throw new ForgeError("VALIDATION_FAILED", "endpoint and keys.p256dh/auth are required");
    }
    const userAgent =
      body.userAgent != null && String(body.userAgent).trim()
        ? String(body.userAgent).trim().slice(0, 500)
        : null;
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(userPushSubscriptions)
        .where(
          and(
            eq(userPushSubscriptions.tenantId, tenantId),
            eq(userPushSubscriptions.endpoint, endpoint),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await tx
          .update(userPushSubscriptions)
          .set({
            userId,
            p256dh,
            auth,
            userAgent,
            enabled: true,
            updatedAt: now,
          })
          .where(eq(userPushSubscriptions.id, existing.id))
          .returning();
        return {
          id: updated!.id,
          endpoint: updated!.endpoint,
          enabled: updated!.enabled,
        };
      }

      const id = createId();
      const [created] = await tx
        .insert(userPushSubscriptions)
        .values({
          id,
          tenantId,
          userId,
          endpoint,
          p256dh,
          auth,
          userAgent,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return {
        id: created!.id,
        endpoint: created!.endpoint,
        enabled: created!.enabled,
      };
    });
  }

  async disableSubscription(principal: ForgePrincipal, endpoint: string) {
    const tenantId = principal.tenantId?.trim();
    const userId = principal.userId?.trim();
    if (!tenantId || !userId)
      throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    const ep = String(endpoint ?? "").trim();
    if (!ep) throw new ForgeError("VALIDATION_FAILED", "endpoint is required");
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const updated = await tx
        .update(userPushSubscriptions)
        .set({ enabled: false, updatedAt: new Date() })
        .where(
          and(
            eq(userPushSubscriptions.tenantId, tenantId),
            eq(userPushSubscriptions.userId, userId),
            eq(userPushSubscriptions.endpoint, ep),
          ),
        )
        .returning({ id: userPushSubscriptions.id });
      return { disabled: updated.length };
    });
  }

  async sendToUser(
    tenantId: string,
    userId: string,
    payload: { title: string; body: string; href?: string | null },
  ): Promise<{ sent: number; failed: number }> {
    if (!this.configured) return { sent: 0, failed: 0 };
    const rows = await withTenantTransaction(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(userPushSubscriptions)
        .where(
          and(
            eq(userPushSubscriptions.tenantId, tenantId),
            eq(userPushSubscriptions.userId, userId),
            eq(userPushSubscriptions.enabled, true),
          ),
        );
    });

    let sent = 0;
    let failed = 0;
    const message = JSON.stringify({
      title: payload.title,
      body: payload.body,
      href: payload.href ?? "/alerts/",
    });

    for (const row of rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          message,
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await withTenantTransaction(this.db, tenantId, async (tx) => {
            await tx
              .update(userPushSubscriptions)
              .set({ enabled: false, updatedAt: new Date() })
              .where(eq(userPushSubscriptions.id, row.id));
          });
        } else {
          this.logger.warn(
            `Web push failed for ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    return { sent, failed };
  }
}

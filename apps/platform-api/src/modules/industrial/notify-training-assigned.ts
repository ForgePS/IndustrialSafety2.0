import {
  industrialPersonnel,
  type Database,
  withTenantTransaction,
} from "@forge/database";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, isNull } from "drizzle-orm";
import type { NotificationsService } from "../notifications/notifications.service.js";

/**
 * Best-effort in-app (+ email when available) notify when training is assigned.
 * Skips people without a linked userAuthId. Never throws.
 */
export async function notifyTrainingAssigned(
  db: Database,
  notifications: NotificationsService | undefined,
  principal: ForgePrincipal,
  input: {
    assignmentId: string;
    title: string;
    personnelIds: string[];
  },
): Promise<void> {
  if (!notifications) return;
  const uniqueIds = [...new Set(input.personnelIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return;

  const title = "New training assigned to you";
  const body = `"${input.title}" was assigned to you. Open My Training to start.`;
  const href = `/my-training/assignments/${encodeURIComponent(input.assignmentId)}`;

  for (const personnelId of uniqueIds) {
    try {
      const recipient = await withTenantTransaction(db, principal.tenantId, async (tx) => {
        const [person] = await tx
          .select({
            userAuthId: industrialPersonnel.userAuthId,
            email: industrialPersonnel.email,
            companyEmail: industrialPersonnel.companyEmail,
          })
          .from(industrialPersonnel)
          .where(
            and(
              eq(industrialPersonnel.id, personnelId),
              eq(industrialPersonnel.tenantId, principal.tenantId),
              isNull(industrialPersonnel.archivedAt),
            ),
          )
          .limit(1);
        return person ?? null;
      });

      const userId = String(recipient?.userAuthId ?? "").trim();
      if (!userId) continue;

      const email = String(recipient?.companyEmail || recipient?.email || "")
        .trim()
        .toLowerCase();

      await notifications.create(
        principal.tenantId,
        {
          userId,
          type: "industrial.training.assigned",
          title,
          body,
          priority: "HIGH",
          destination: email ? "BOTH" : "IN_APP",
          ...(email
            ? { emailTo: email, emailTemplateKey: "system_notification" as const }
            : {}),
          href,
          metadataJson: {
            assignmentId: input.assignmentId,
            assigneePersonnelId: personnelId,
          },
        },
        principal,
      );
    } catch {
      // Best-effort: assignment still succeeds if notify fails.
    }
  }
}

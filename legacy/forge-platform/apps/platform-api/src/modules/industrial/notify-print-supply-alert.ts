import type { ForgePrincipal } from "@forge/tenant-context";
import type { NotificationsService } from "../notifications/notifications.service.js";

/**
 * Best-effort in-app notify when print supply alert level worsens.
 * Never throws.
 */
export async function notifyPrintSupplyAlert(
  notifications: NotificationsService | undefined,
  principal: ForgePrincipal,
  input: {
    supplyId: string;
    supplyName: string;
    printerName: string | null;
    alertLevel: string;
    estimatedRemaining: number;
    unit: string;
    percentRemaining: number | null;
    userIds: string[];
  },
): Promise<void> {
  if (!notifications) return;
  const uniqueIds = [...new Set(input.userIds.map((id) => id.trim()).filter(Boolean))];
  if (!uniqueIds.length) return;

  const level = input.alertLevel.toUpperCase();
  const where = input.printerName ? ` on ${input.printerName}` : "";
  const pct = input.percentRemaining != null ? ` (~${input.percentRemaining}% remaining)` : "";
  const title =
    level === "EMPTY"
      ? "Print supply empty"
      : level === "CRITICAL"
        ? "Print supply critically low"
        : "Print supply low";
  const body = `${input.supplyName}${where} is estimated at ${input.estimatedRemaining} ${input.unit}${pct}.`;
  const href = `/system-tools/print-manager?tab=supplies`;

  for (const userId of uniqueIds) {
    try {
      await notifications.create(
        principal.tenantId,
        {
          userId,
          type:
            level === "EMPTY"
              ? "industrial.printer.supply_empty"
              : level === "CRITICAL"
                ? "industrial.printer.supply_critical"
                : "industrial.printer.supply_low",
          title,
          body,
          priority: level === "EMPTY" || level === "CRITICAL" ? "HIGH" : "NORMAL",
          destination: "IN_APP",
          href,
          metadataJson: {
            supplyId: input.supplyId,
            alertLevel: level,
            estimatedRemaining: input.estimatedRemaining,
          },
        },
        principal,
      );
    } catch {
      // Best-effort: print completion still succeeds if notify fails.
    }
  }
}

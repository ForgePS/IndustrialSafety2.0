import { Inject, Injectable } from "@nestjs/common";
import { createId, tenantSettings, type Database, withTenantTransaction } from "@forge/database";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../../tokens.js";

const NAMESPACE = "industrial";
const SETTING_KEY = "photo_markup";

export type PhotoMarkupSettings = {
  enabled: boolean;
  allowFreehand: boolean;
  allowSafetyIcons: boolean;
  allowText: boolean;
  allowBlur: boolean;
  allowRedaction: boolean;
  allowCrop: boolean;
  defaultColor: string;
  defaultStroke: "thin" | "medium" | "thick" | "extra";
  keepRevisionHistory: boolean;
  createRenderedCopy: boolean;
  defaultReportImage: "original" | "marked_if_available" | "both" | "ask";
};

export const DEFAULT_PHOTO_MARKUP_SETTINGS: PhotoMarkupSettings = {
  enabled: true,
  allowFreehand: true,
  allowSafetyIcons: true,
  allowText: true,
  allowBlur: true,
  allowRedaction: true,
  allowCrop: true,
  defaultColor: "#DC2626",
  defaultStroke: "medium",
  keepRevisionHistory: true,
  createRenderedCopy: true,
  defaultReportImage: "marked_if_available",
};

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  allowFreehand: z.boolean().optional(),
  allowSafetyIcons: z.boolean().optional(),
  allowText: z.boolean().optional(),
  allowBlur: z.boolean().optional(),
  allowRedaction: z.boolean().optional(),
  allowCrop: z.boolean().optional(),
  defaultColor: z.string().min(4).max(32).optional(),
  defaultStroke: z.enum(["thin", "medium", "thick", "extra"]).optional(),
  keepRevisionHistory: z.boolean().optional(),
  createRenderedCopy: z.boolean().optional(),
  defaultReportImage: z.enum(["original", "marked_if_available", "both", "ask"]).optional(),
});

function normalize(raw: unknown): PhotoMarkupSettings {
  const row =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    ...DEFAULT_PHOTO_MARKUP_SETTINGS,
    ...Object.fromEntries(
      Object.entries(row).filter(([key]) => key in DEFAULT_PHOTO_MARKUP_SETTINGS),
    ),
  } as PhotoMarkupSettings;
}

@Injectable()
export class IndustrialPhotoMarkupSettingsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private tenantId(principal: ForgePrincipal): string {
    const id = principal.tenantId?.trim();
    if (!id) throw new ForgeError("VALIDATION_FAILED", "Active tenant is required");
    return id;
  }

  async get(principal: ForgePrincipal): Promise<PhotoMarkupSettings> {
    const tenantId = this.tenantId(principal);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.namespace, NAMESPACE),
          eq(tenantSettings.settingKey, SETTING_KEY),
        ),
      });
      return normalize(existing?.valueJson);
    });
  }

  async update(principal: ForgePrincipal, input: unknown): Promise<PhotoMarkupSettings> {
    const tenantId = this.tenantId(principal);
    const patch = settingsSchema.parse(input ?? {});
    const now = new Date();

    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const existing = await tx.query.tenantSettings.findFirst({
        where: and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.namespace, NAMESPACE),
          eq(tenantSettings.settingKey, SETTING_KEY),
        ),
      });
      const next = normalize({
        ...(existing?.valueJson && typeof existing.valueJson === "object"
          ? existing.valueJson
          : {}),
        ...patch,
      });
      // Save Original is always required / locked on
      next.createRenderedCopy = next.createRenderedCopy !== false;
      next.keepRevisionHistory = next.keepRevisionHistory !== false;

      if (existing) {
        await tx
          .update(tenantSettings)
          .set({
            valueJson: next,
            updatedAt: now,
            recordVersion: sql`${tenantSettings.recordVersion} + 1`,
          })
          .where(eq(tenantSettings.id, existing.id));
      } else {
        await tx.insert(tenantSettings).values({
          id: createId(),
          tenantId,
          namespace: NAMESPACE,
          settingKey: SETTING_KEY,
          valueJson: next,
          createdAt: now,
          updatedAt: now,
        });
      }
      return next;
    });
  }
}

import { z } from "zod";

/** Upload kinds: `logo` = light theme, `logo_dark` = dark theme, `icon` = app icon. */
export const BRANDING_ASSET_KINDS = ["logo", "logo_dark", "icon"] as const;
export type BrandingAssetKind = (typeof BRANDING_ASSET_KINDS)[number];

export const putTenantBrandingInputSchema = z.object({
  displayName: z.string().max(200).optional().nullable(),
  shortName: z.string().max(80).optional().nullable(),
  logoDocumentId: z.string().uuid().optional().nullable(),
  logoDarkDocumentId: z.string().uuid().optional().nullable(),
  iconDocumentId: z.string().uuid().optional().nullable(),
  primaryColor: z.string().max(32).optional().nullable(),
  secondaryColor: z.string().max(32).optional().nullable(),
  accentColor: z.string().max(32).optional().nullable(),
  approvedColorsJson: z.array(z.string().max(32)).max(32).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactPhone: z.string().max(40).optional().nullable(),
  emailSenderName: z.string().max(200).optional().nullable(),
  supportEmail: z.string().email().max(320).optional().nullable(),
  reportIdentity: z.string().max(300).optional().nullable(),
  documentFooter: z.string().max(2000).optional().nullable(),
  customCssEnabled: z.boolean().optional(),
});

export type PutTenantBrandingInput = z.infer<typeof putTenantBrandingInputSchema>;

export const brandingAssetUploadInputSchema = z.object({
  kind: z.enum(BRANDING_ASSET_KINDS),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(255),
  contentLength: z.number().int().positive().max(5_000_000),
});

export type BrandingAssetUploadInput = z.infer<typeof brandingAssetUploadInputSchema>;

/** Object keys must be tenant-prefixed. */
export function objectKeyBelongsToTenant(objectKey: string, tenantId: string): boolean {
  return objectKey.startsWith(`tenants/${tenantId}/`);
}

export function documentBelongsToTenant(documentTenantId: string, tenantId: string): boolean {
  return documentTenantId === tenantId;
}

/** Signed URL expiry guard used by download responses and unit tests. */
export function isSignedAccessExpired(expiresAt: Date | string, now: Date = new Date()): boolean {
  const when = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return Number.isNaN(when.getTime()) || when.getTime() <= now.getTime();
}

export function brandingObjectKeyPrefix(tenantId: string): string {
  return `tenants/${tenantId}/branding/`;
}

/** Pick the logo URL for the active theme (light/dark), with sensible fallbacks. */
export function pickThemeLogoUrl(input: {
  theme: "light" | "dark";
  logoLightUrl?: string | null | undefined;
  logoDarkUrl?: string | null | undefined;
  fallbackUrl?: string | null | undefined;
}): string {
  const light = input.logoLightUrl?.trim() || "";
  const dark = input.logoDarkUrl?.trim() || "";
  const fallback = input.fallbackUrl?.trim() || "";
  if (input.theme === "dark") {
    return dark || light || fallback;
  }
  return light || fallback || dark;
}

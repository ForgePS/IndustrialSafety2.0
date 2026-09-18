import { z } from "zod";

/**
 * Unauthenticated login-branding response (FIS-L01).
 * Intentionally omits tenantId and other stable tenant identifiers.
 */
export const publicLoginPresentationSchema = z.object({
  logoUrl: z.string(),
  brandLabel: z.string(),
  headline: z.string(),
  body: z.string(),
  statusText: z.string(),
  buttonLabel: z.string(),
});

export const publicLoginBrandingSchema = z
  .object({
    host: z.string().min(1),
    displayName: z.string().min(1),
    brandLabel: z.string().min(1),
    logoUrl: z.string().min(1).optional(),
    primaryColor: z.string().min(1).optional(),
    login: publicLoginPresentationSchema,
  })
  .strict();

export type PublicLoginBrandingDto = z.infer<typeof publicLoginBrandingSchema>;

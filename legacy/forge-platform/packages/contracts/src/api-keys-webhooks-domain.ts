import { z } from "zod";

export const API_KEY_PREFIX = "forge_live_" as const;

export const createApiKeyInputSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1).max(120)).min(1).max(64),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;

export const createWebhookEndpointInputSchema = z.object({
  name: z.string().min(1).max(120),
  endpointUrl: z.string().url().max(2000),
  eventTypes: z.array(z.string().min(1).max(120)).min(1).max(64),
  enabled: z.boolean().optional().default(true),
});

export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointInputSchema>;

export const patchWebhookEndpointInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  endpointUrl: z.string().url().max(2000).optional(),
  eventTypes: z.array(z.string().min(1).max(120)).min(1).max(64).optional(),
  enabled: z.boolean().optional(),
  rotateSecret: z.boolean().optional(),
});

export type PatchWebhookEndpointInput = z.infer<typeof patchWebhookEndpointInputSchema>;

export const createWebhookDeliveryInputSchema = z.object({
  eventType: z.string().min(1).max(120),
  payload: z.record(z.unknown()).default({}),
});

export type CreateWebhookDeliveryInput = z.infer<typeof createWebhookDeliveryInputSchema>;

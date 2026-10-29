import { z } from "zod";

/** Canonical email template keys (MK-S13). */
export const EMAIL_TEMPLATE_KEYS = [
  "welcome",
  "verification",
  "invitation",
  "membership_changed",
  "billing",
  "security",
  "system_notification",
  "workers_comp_weekly_status",
  "reporting_schedule_delivery",
  "sanitation_inspection_completed",
  "workers_comp_form",
  "observation_assigned",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const NOTIFICATION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_DESTINATIONS = ["IN_APP", "EMAIL", "BOTH"] as const;
export type NotificationDestination = (typeof NOTIFICATION_DESTINATIONS)[number];

export const createNotificationInputSchema = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  priority: z.enum(NOTIFICATION_PRIORITIES).default("NORMAL"),
  destination: z.enum(NOTIFICATION_DESTINATIONS).default("IN_APP"),
  emailTo: z.string().email().optional(),
  emailTemplateKey: z.enum(EMAIL_TEMPLATE_KEYS).optional(),
  href: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
  metadataJson: z.record(z.unknown()).optional(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationInputSchema>;

export type EmailAttachment = {
  filename: string;
  contentType: string;
  /** Base64-encoded file bytes. */
  contentBase64: string;
};

export type EmailMessage = {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  templateKey?: EmailTemplateKey;
  tenantId?: string;
  correlationId?: string;
  attachments?: EmailAttachment[];
};

export type EmailSendResult = {
  provider: string;
  messageId: string | null;
  accepted: boolean;
  detail?: string;
};

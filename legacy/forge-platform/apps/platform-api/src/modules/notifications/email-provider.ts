import { randomBytes } from "node:crypto";
import { SESClient, SendEmailCommand, SendRawEmailCommand } from "@aws-sdk/client-ses";
import type { EmailMessage, EmailSendResult } from "@forge/contracts";
import { Resend } from "resend";

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class NoopEmailProvider implements EmailProvider {
  readonly name = "noop";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    return {
      provider: this.name,
      messageId: null,
      accepted: true,
      detail: `noop accepted mail to ${message.to} subject=${message.subject}`,
    };
  }
}

/**
 * SES-capable provider (MK-S13 + production wiring).
 * When FORGE_EMAIL_PROVIDER=ses, createEmailProviderFromEnv injects a live SendEmail sendFn.
 */
export class SesEmailProvider implements EmailProvider {
  readonly name = "ses";

  constructor(
    private readonly options: {
      fromAddress: string;
      region?: string;
      /** Injected send function; when omitted, returns not-configured result. */
      sendFn?: (message: EmailMessage, fromAddress: string) => Promise<EmailSendResult>;
    },
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.options.fromAddress) {
      return {
        provider: this.name,
        messageId: null,
        accepted: false,
        detail: "SES_FROM_ADDRESS not configured",
      };
    }
    if (!this.options.sendFn) {
      return {
        provider: this.name,
        messageId: null,
        accepted: false,
        detail:
          "SES provider stub is configured but no sendFn/client is injected (production SES wiring deferred)",
      };
    }
    return this.options.sendFn(message, this.options.fromAddress);
  }
}

/**
 * Resend.com HTTP API provider.
 * When FORGE_EMAIL_PROVIDER=resend, createEmailProviderFromEnv uses RESEND_API_KEY
 * (injected from Secrets Manager in ECS) and RESEND_FROM_ADDRESS.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly options: {
      fromAddress: string;
      apiKey: string;
      /** Injected send function for tests; when omitted, uses the Resend SDK. */
      sendFn?: (message: EmailMessage, fromAddress: string) => Promise<EmailSendResult>;
    },
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.options.fromAddress) {
      return {
        provider: this.name,
        messageId: null,
        accepted: false,
        detail: "RESEND_FROM_ADDRESS not configured",
      };
    }
    if (!this.options.apiKey && !this.options.sendFn) {
      return {
        provider: this.name,
        messageId: null,
        accepted: false,
        detail: "RESEND_API_KEY not configured",
      };
    }
    if (this.options.sendFn) {
      return this.options.sendFn(message, this.options.fromAddress);
    }
    return createResendSendFn(this.options.apiKey)(message, this.options.fromAddress);
  }
}

function wrapBase64(value: string): string {
  return value.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function encodeMimeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** multipart/mixed MIME message for SES SendRawEmail (needed for attachments). */
export function buildRawMimeMessage(message: EmailMessage, fromAddress: string): string {
  const mixed = `mixed_${randomBytes(12).toString("hex")}`;
  const alt = `alt_${randomBytes(12).toString("hex")}`;
  const lines: string[] = [
    `From: ${fromAddress}`,
    `To: ${message.to}`,
    `Subject: ${encodeMimeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
  ];
  if (message.textBody) {
    lines.push(
      `--${alt}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(Buffer.from(message.textBody, "utf8").toString("base64")),
    );
  }
  lines.push(
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(message.htmlBody, "utf8").toString("base64")),
    `--${alt}--`,
  );
  for (const attachment of message.attachments ?? []) {
    const name = attachment.filename.replace(/["\r\n]/g, "");
    lines.push(
      `--${mixed}`,
      `Content-Type: ${attachment.contentType}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(attachment.contentBase64.replace(/\s+/g, "")),
    );
  }
  lines.push(`--${mixed}--`, "");
  return lines.join("\r\n");
}

/** Build an SES SendEmail-backed sendFn for the given AWS region. */
export function createSesSendFn(region?: string) {
  const client = new SESClient(region ? { region } : {});
  return async (message: EmailMessage, fromAddress: string): Promise<EmailSendResult> => {
    if (message.attachments?.length) {
      const raw = await client.send(
        new SendRawEmailCommand({
          Source: fromAddress,
          Destinations: [message.to],
          RawMessage: { Data: Buffer.from(buildRawMimeMessage(message, fromAddress), "utf8") },
        }),
      );
      return {
        provider: "ses",
        messageId: raw.MessageId ?? null,
        accepted: true,
        detail: raw.MessageId ? `ses MessageId=${raw.MessageId}` : "ses accepted",
      };
    }
    const response = await client.send(
      new SendEmailCommand({
        Source: fromAddress,
        Destination: { ToAddresses: [message.to] },
        Message: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: message.htmlBody, Charset: "UTF-8" },
            ...(message.textBody ? { Text: { Data: message.textBody, Charset: "UTF-8" } } : {}),
          },
        },
      }),
    );
    return {
      provider: "ses",
      messageId: response.MessageId ?? null,
      accepted: true,
      detail: response.MessageId ? `ses MessageId=${response.MessageId}` : "ses accepted",
    };
  };
}

/** Build a Resend SDK sendFn (emails.send). */
export function createResendSendFn(apiKey: string) {
  const resend = new Resend(apiKey);
  return async (message: EmailMessage, fromAddress: string): Promise<EmailSendResult> => {
    try {
      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: [message.to],
        subject: message.subject,
        html: message.htmlBody,
        ...(message.textBody ? { text: message.textBody } : {}),
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((a) => ({
                filename: a.filename,
                contentType: a.contentType,
                content: Buffer.from(a.contentBase64, "base64"),
              })),
            }
          : {}),
      });

      if (error) {
        return {
          provider: "resend",
          messageId: null,
          accepted: false,
          detail: `resend rejected: ${error.message}`,
        };
      }

      return {
        provider: "resend",
        messageId: data?.id ?? null,
        accepted: true,
        detail: data?.id ? `resend id=${data.id}` : "resend accepted",
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        provider: "resend",
        messageId: null,
        accepted: false,
        detail: `resend threw: ${detail}`,
      };
    }
  };
}

export function createEmailProviderFromEnv(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  const mode = (env.FORGE_EMAIL_PROVIDER ?? "noop").toLowerCase();
  if (mode === "resend") {
    return new ResendEmailProvider({
      fromAddress:
        env.RESEND_FROM_ADDRESS?.trim() ||
        env.SES_FROM_ADDRESS?.trim() ||
        "noreply@forgepublicsafety.com",
      apiKey: env.RESEND_API_KEY ?? "",
    });
  }
  if (mode === "ses") {
    return new SesEmailProvider({
      fromAddress: env.SES_FROM_ADDRESS ?? "",
      ...(env.AWS_REGION ? { region: env.AWS_REGION } : {}),
      sendFn: createSesSendFn(env.AWS_REGION),
    });
  }
  return new NoopEmailProvider();
}

/** Minimal {{var}} substitution for seeded templates. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

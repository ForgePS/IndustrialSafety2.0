import { describe, expect, it, vi } from "vitest";
import {
  NoopEmailProvider,
  ResendEmailProvider,
  SesEmailProvider,
  buildRawMimeMessage,
  createEmailProviderFromEnv,
  renderTemplate,
} from "./email-provider.js";

describe("email provider (MK-S13)", () => {
  it("noop accepts messages", async () => {
    const provider = new NoopEmailProvider();
    const result = await provider.send({
      to: "user@example.com",
      subject: "Hello",
      htmlBody: "<p>Hi</p>",
    });
    expect(result.accepted).toBe(true);
    expect(result.provider).toBe("noop");
  });

  it("ses stub without sendFn does not accept", async () => {
    const provider = new SesEmailProvider({ fromAddress: "noreply@example.com" });
    const result = await provider.send({
      to: "user@example.com",
      subject: "Hello",
      htmlBody: "<p>Hi</p>",
    });
    expect(result.accepted).toBe(false);
    expect(result.provider).toBe("ses");
  });

  it("ses with injected sendFn accepts and forwards", async () => {
    const sendFn = vi.fn(async () => ({
      provider: "ses",
      messageId: "msg-123",
      accepted: true,
      detail: "ok",
    }));
    const provider = new SesEmailProvider({
      fromAddress: "noreply@forgepublicsafety.com",
      sendFn,
    });
    const message = {
      to: "director@example.com",
      subject: "Monthly report",
      htmlBody: "<p>Ready</p>",
      textBody: "Ready",
    };
    const result = await provider.send(message);
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBe("msg-123");
    expect(sendFn).toHaveBeenCalledWith(message, "noreply@forgepublicsafety.com");
  });

  it("resend without apiKey does not accept", async () => {
    const provider = new ResendEmailProvider({
      fromAddress: "noreply@forgepublicsafety.com",
      apiKey: "",
    });
    const result = await provider.send({
      to: "user@example.com",
      subject: "Hello",
      htmlBody: "<p>Hi</p>",
    });
    expect(result.accepted).toBe(false);
    expect(result.provider).toBe("resend");
  });

  it("resend with injected sendFn accepts and forwards", async () => {
    const sendFn = vi.fn(async () => ({
      provider: "resend",
      messageId: "re_123",
      accepted: true,
      detail: "ok",
    }));
    const provider = new ResendEmailProvider({
      fromAddress: "noreply@forgepublicsafety.com",
      apiKey: "re_test",
      sendFn,
    });
    const message = {
      to: "director@example.com",
      subject: "Monthly report",
      htmlBody: "<p>Ready</p>",
    };
    const result = await provider.send(message);
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBe("re_123");
    expect(sendFn).toHaveBeenCalledWith(message, "noreply@forgepublicsafety.com");
  });

  it("createEmailProviderFromEnv defaults to noop", () => {
    expect(createEmailProviderFromEnv({}).name).toBe("noop");
  });

  it("createEmailProviderFromEnv ses mode injects sendFn", async () => {
    const provider = createEmailProviderFromEnv({
      FORGE_EMAIL_PROVIDER: "ses",
      SES_FROM_ADDRESS: "noreply@forgepublicsafety.com",
      AWS_REGION: "us-east-1",
    });
    expect(provider.name).toBe("ses");
    expect(provider).toBeInstanceOf(SesEmailProvider);
  });

  it("createEmailProviderFromEnv resend mode builds resend provider", () => {
    const provider = createEmailProviderFromEnv({
      FORGE_EMAIL_PROVIDER: "resend",
      RESEND_FROM_ADDRESS: "noreply@forgepublicsafety.com",
      RESEND_API_KEY: "re_test_key",
    });
    expect(provider.name).toBe("resend");
    expect(provider).toBeInstanceOf(ResendEmailProvider);
  });

  it("renders template variables", () => {
    expect(renderTemplate("Hello {{name}}", { name: "Ada" })).toBe("Hello Ada");
  });

  it("builds a multipart MIME message carrying the attachment for SES raw send", () => {
    const pdfBase64 = Buffer.from("%PDF-1.3 test").toString("base64");
    const raw = buildRawMimeMessage(
      {
        to: "director@example.com",
        subject: "Sanitation inspection report: SAN-1",
        htmlBody: "<p>Attached</p>",
        textBody: "Attached",
        attachments: [
          { filename: "SAN-1.pdf", contentType: "application/pdf", contentBase64: pdfBase64 },
        ],
      },
      "noreply@forgepublicsafety.com",
    );
    expect(raw).toContain("Content-Type: multipart/mixed;");
    expect(raw).toContain('Content-Disposition: attachment; filename="SAN-1.pdf"');
    expect(raw).toContain(pdfBase64);
    expect(raw).toContain(Buffer.from("<p>Attached</p>").toString("base64"));
  });

  it("encodes non-ASCII subjects for MIME headers", () => {
    const raw = buildRawMimeMessage(
      { to: "a@example.com", subject: "Inspection – Mill", htmlBody: "<p>x</p>" },
      "noreply@forgepublicsafety.com",
    );
    expect(raw).toMatch(/^Subject: =\?UTF-8\?B\?/m);
  });
});

import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import type {
  EmergencyAlertSmsConfig,
  EmergencyAlertSmsProvider,
  SmsSendRequest,
  SmsSendResult,
} from "./emergency-alert-sms.types.js";
import { SMS_PROVIDER_AWS } from "./emergency-alert-sms.types.js";

/**
 * AWS End User Messaging SMS (Pinpoint SMS Voice v2) adapter.
 * Auth is IAM task-role based — no API keys in tenant settings.
 */
export class AwsEndUserMessagingSmsProvider implements EmergencyAlertSmsProvider {
  readonly name = SMS_PROVIDER_AWS;
  private readonly client: PinpointSMSVoiceV2Client;

  constructor(private readonly config: EmergencyAlertSmsConfig) {
    this.client = new PinpointSMSVoiceV2Client({ region: config.region });
  }

  isReady(): boolean {
    return (
      this.config.enabled &&
      this.config.provider === SMS_PROVIDER_AWS &&
      Boolean(this.config.originationIdentity?.trim())
    );
  }

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    if (!this.isReady()) {
      return {
        ok: false,
        failureCode: "PROVIDER_NOT_CONFIGURED",
        failureReason:
          "AWS End User Messaging SMS requires smsEnabled, provider AWS_END_USER_MESSAGING, and originationIdentity",
      };
    }

    const destination = request.destinationPhoneNumber.trim();
    const body = request.messageBody.trim();
    if (!destination.startsWith("+") || destination.length < 10) {
      return {
        ok: false,
        failureCode: "INVALID_DESTINATION",
        failureReason: "Destination must be E.164 (e.g. +15015551212)",
      };
    }
    if (!body) {
      return {
        ok: false,
        failureCode: "EMPTY_MESSAGE",
        failureReason: "Message body is required",
      };
    }

    try {
      const context = sanitizeContext(request.context);
      const result = await this.client.send(
        new SendTextMessageCommand({
          DestinationPhoneNumber: destination,
          OriginationIdentity: this.config.originationIdentity!,
          MessageBody: body.slice(0, 1600),
          MessageType: this.config.messageType,
          DryRun: this.config.dryRun,
          ...(this.config.configurationSetName
            ? { ConfigurationSetName: this.config.configurationSetName }
            : {}),
          ...(this.config.maxPrice ? { MaxPrice: this.config.maxPrice } : {}),
          ...(this.config.protectConfigurationId
            ? { ProtectConfigurationId: this.config.protectConfigurationId }
            : {}),
          ...(context ? { Context: context } : {}),
        }),
      );

      const messageId = String(result.MessageId ?? "").trim();
      if (!messageId && !this.config.dryRun) {
        return {
          ok: false,
          failureCode: "NO_MESSAGE_ID",
          failureReason: "SendTextMessage returned no MessageId",
        };
      }

      return {
        ok: true,
        providerMessageId: messageId || `dry-run-${Date.now()}`,
        status: this.config.dryRun ? "ACCEPTED" : "SENT",
        dryRun: this.config.dryRun,
      };
    } catch (err) {
      const parsed = parseAwsSmsError(err);
      return {
        ok: false,
        failureCode: parsed.code,
        failureReason: parsed.message,
      };
    }
  }
}

function sanitizeContext(
  context: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!context) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    const k = key.trim().slice(0, 100);
    const v = String(value ?? "")
      .trim()
      .slice(0, 800);
    if (!k || !v || /\s/.test(k)) continue;
    out[k] = v;
    if (Object.keys(out).length >= 5) break;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseAwsSmsError(err: unknown): { code: string; message: string } {
  if (err && typeof err === "object") {
    const e = err as {
      name?: string;
      message?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    const code = String(e.name || e.Code || "AWS_SMS_ERROR").slice(0, 64);
    const message = String(e.message || "AWS End User Messaging SMS send failed").slice(0, 500);
    return { code, message };
  }
  return { code: "AWS_SMS_ERROR", message: String(err).slice(0, 500) };
}

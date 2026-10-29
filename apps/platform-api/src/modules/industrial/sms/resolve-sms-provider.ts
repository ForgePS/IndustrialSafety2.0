import type { ForgeEnvironment } from "@forge/environment";
import { AwsEndUserMessagingSmsProvider } from "./aws-end-user-messaging-sms.provider.js";
import type {
  EmergencyAlertSmsConfig,
  EmergencyAlertSmsProvider,
  EmergencyAlertSmsProviderName,
  SmsMessageType,
} from "./emergency-alert-sms.types.js";
import { SMS_PROVIDER_AWS, SMS_PROVIDER_STUB } from "./emergency-alert-sms.types.js";
import { createStubSmsProvider } from "./stub-sms.provider.js";

type SettingsRow = {
  smsProvider?: string | null;
  smsEnabled?: boolean | null;
  settingsJson?: unknown;
};

type SettingsBag = {
  originationIdentity?: unknown;
  configurationSetName?: unknown;
  senderPool?: unknown;
  messageType?: unknown;
  dryRun?: unknown;
  maxPrice?: unknown;
  protectConfigurationId?: unknown;
  concurrency?: unknown;
  region?: unknown;
};

/**
 * Convert a stored phone snapshot (digits) to E.164 for SendTextMessage.
 * 10-digit US numbers become +1XXXXXXXXXX.
 */
export function toE164Phone(
  snapshot: string | null | undefined,
  defaultCountryCode = "1",
): string | null {
  if (!snapshot) return null;
  const trimmed = snapshot.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function buildSmsMessageBody(input: {
  shortMessage: string;
  isDrill?: boolean;
  headline?: string;
}): string {
  const short = String(input.shortMessage ?? "").trim();
  const prefix = input.isDrill ? "[DRILL] " : "";
  const body = `${prefix}${short}`.trim();
  return body.slice(0, 1600);
}

function asTrimmed(value: unknown): string {
  return String(value ?? "").trim();
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function resolveMessageType(value: unknown): SmsMessageType {
  return String(value ?? "").toUpperCase() === "PROMOTIONAL" ? "PROMOTIONAL" : "TRANSACTIONAL";
}

/**
 * Merge platform env defaults with tenant emergency_alert_settings.
 * Origination identity is configuration, not a secret (IAM authenticates sends).
 */
export function resolveEmergencyAlertSmsConfig(
  env: Pick<ForgeEnvironment, "AWS_REGION"> & {
    SMS_ORIGINATION_IDENTITY?: string;
    SMS_CONFIGURATION_SET_NAME?: string;
    SMS_REGION?: string;
    SMS_DRY_RUN?: string;
    SMS_MAX_PRICE?: string;
    SMS_PROTECT_CONFIGURATION_ID?: string;
    SMS_DEFAULT_PROVIDER?: string;
  },
  settings: SettingsRow | null | undefined,
): EmergencyAlertSmsConfig {
  const bag =
    settings?.settingsJson && typeof settings.settingsJson === "object"
      ? (settings.settingsJson as SettingsBag)
      : {};

  const providerRaw =
    asTrimmed(settings?.smsProvider) || asTrimmed(env.SMS_DEFAULT_PROVIDER) || SMS_PROVIDER_STUB;
  const provider = providerRaw.toUpperCase() as EmergencyAlertSmsProviderName;

  const originationIdentity =
    asTrimmed(bag.originationIdentity) ||
    asTrimmed(bag.senderPool) ||
    asTrimmed(env.SMS_ORIGINATION_IDENTITY) ||
    null;

  const configurationSetName =
    asTrimmed(bag.configurationSetName) || asTrimmed(env.SMS_CONFIGURATION_SET_NAME) || null;

  const region =
    asTrimmed(bag.region) || asTrimmed(env.SMS_REGION) || env.AWS_REGION || "us-east-1";

  const concurrencyRaw = Number(bag.concurrency);
  const concurrency =
    Number.isFinite(concurrencyRaw) && concurrencyRaw >= 1 && concurrencyRaw <= 25
      ? Math.floor(concurrencyRaw)
      : 5;

  return {
    provider,
    enabled: Boolean(settings?.smsEnabled),
    region,
    originationIdentity,
    configurationSetName,
    messageType: resolveMessageType(bag.messageType),
    dryRun: asBool(bag.dryRun, asBool(env.SMS_DRY_RUN, false)),
    maxPrice: asTrimmed(bag.maxPrice) || asTrimmed(env.SMS_MAX_PRICE) || null,
    protectConfigurationId:
      asTrimmed(bag.protectConfigurationId) || asTrimmed(env.SMS_PROTECT_CONFIGURATION_ID) || null,
    concurrency,
  };
}

export function isSmsConfigured(config: EmergencyAlertSmsConfig): boolean {
  return config.provider === SMS_PROVIDER_AWS && Boolean(config.originationIdentity);
}

export function isSmsProviderReady(config: EmergencyAlertSmsConfig): boolean {
  return config.enabled && isSmsConfigured(config);
}

export function createEmergencyAlertSmsProvider(
  config: EmergencyAlertSmsConfig,
): EmergencyAlertSmsProvider {
  if (config.provider === SMS_PROVIDER_AWS) {
    return new AwsEndUserMessagingSmsProvider(config);
  }
  return createStubSmsProvider(config);
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, 25));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export { SMS_PROVIDER_AWS, SMS_PROVIDER_STUB };

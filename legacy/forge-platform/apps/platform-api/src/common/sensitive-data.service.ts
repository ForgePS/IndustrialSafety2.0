import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { DecryptCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { Inject, Injectable } from "@nestjs/common";
import type { ForgeEnvironment } from "@forge/environment";
import { APP_ENV } from "../tokens.js";

const LOCAL_FALLBACK_KEY = Buffer.from("forge-local-sensitive-key-32b!!!!"); // 32 bytes

export interface EncryptedPayload {
  ciphertext: string;
  keyVersion: string;
  algorithm: "AES-256-GCM" | "AWS-KMS";
}

@Injectable()
export class SensitiveDataService {
  private readonly kms: KMSClient;
  private readonly localKey: Buffer;

  constructor(@Inject(APP_ENV) private readonly env: ForgeEnvironment) {
    this.kms = new KMSClient({ region: env.AWS_REGION });
    const fromEnv = process.env.SENSITIVE_DATA_LOCAL_KEY;
    if (fromEnv) {
      this.localKey = Buffer.from(fromEnv, "base64");
      if (this.localKey.length !== 32) {
        throw new Error("SENSITIVE_DATA_LOCAL_KEY must be base64-encoded 32 bytes");
      }
    } else {
      this.localKey = LOCAL_FALLBACK_KEY;
    }
  }

  async encrypt(
    plaintext: string,
    context: { tenantId: string; personId: string; dataType: string },
  ): Promise<EncryptedPayload> {
    const useLocal =
      this.env.APP_ENV === "local" ||
      this.env.APP_ENV === "development" ||
      this.env.APP_ENV === "testing" ||
      process.env.SENSITIVE_DATA_FORCE_LOCAL === "1";

    if (!useLocal) {
      try {
        const result = await this.kms.send(
          new EncryptCommand({
            KeyId: this.env.KMS_SENSITIVE_DATA_KEY_ARN,
            Plaintext: Buffer.from(plaintext, "utf8"),
            EncryptionContext: {
              tenantId: context.tenantId,
              personId: context.personId,
              dataType: context.dataType,
            },
          }),
        );
        if (result.CiphertextBlob) {
          return {
            ciphertext: Buffer.from(result.CiphertextBlob).toString("base64"),
            keyVersion: "kms-v1",
            algorithm: "AWS-KMS",
          };
        }
      } catch {
        // Fall through to local AES-GCM when KMS is unavailable.
      }
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.localKey, iv);
    cipher.setAAD(Buffer.from(`${context.tenantId}:${context.personId}:${context.dataType}`));
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: Buffer.concat([iv, tag, encrypted]).toString("base64"),
      keyVersion: "local-aes-gcm-v1",
      algorithm: "AES-256-GCM",
    };
  }

  async decrypt(
    payload: EncryptedPayload,
    context: { tenantId: string; personId: string; dataType: string },
  ): Promise<string> {
    if (payload.algorithm === "AWS-KMS") {
      const result = await this.kms.send(
        new DecryptCommand({
          CiphertextBlob: Buffer.from(payload.ciphertext, "base64"),
          EncryptionContext: {
            tenantId: context.tenantId,
            personId: context.personId,
            dataType: context.dataType,
          },
        }),
      );
      if (!result.Plaintext) {
        throw new Error("KMS decrypt returned empty plaintext");
      }
      return Buffer.from(result.Plaintext).toString("utf8");
    }

    const buf = Buffer.from(payload.ciphertext, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.localKey, iv);
    decipher.setAAD(Buffer.from(`${context.tenantId}:${context.personId}:${context.dataType}`));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  fingerprint(plaintext: string, dataType: string): string {
    return createHash("sha256").update(`${dataType}:${plaintext}`).digest("hex");
  }
}

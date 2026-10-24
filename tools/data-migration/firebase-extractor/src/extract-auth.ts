/** Auth metadata extract — no password hashes/tokens. */
import { createWriteStream } from "node:fs";
import type { Auth } from "firebase-admin/auth";
import { sha256File } from "./extract-firestore.js";

export type AuthExtractResult = {
  extractedCount: number;
  outputFile: string;
  sha256: string;
};

export async function extractAuthMetadata(
  auth: Auth,
  outputFile: string,
  extractRunId: string,
  projectId: string,
): Promise<AuthExtractResult> {
  const stream = createWriteStream(outputFile, { flags: "w" });
  let extractedCount = 0;
  let pageToken: string | undefined;

  const write = (obj: unknown) =>
    new Promise<void>((resolve, reject) => {
      stream.write(`${JSON.stringify(obj)}\n`, (err) => (err ? reject(err) : resolve()));
    });

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const claims = (user.customClaims ?? {}) as Record<string, unknown>;
      const businessClaim = claims.businessIds ?? claims.businessId ?? claims.businesses ?? null;
      await write({
        _migration: {
          sourceSystem: "FIREBASE_AUTH",
          sourceProject: projectId,
          extractRunId,
          extractedAt: new Date().toISOString(),
        },
        data: {
          firebaseUid: user.uid,
          email: user.email ?? null,
          emailVerified: user.emailVerified,
          disabled: user.disabled,
          providerIds: user.providerData.map((p) => p.providerId),
          createdAt: user.metadata.creationTime ?? null,
          lastSignInAt: user.metadata.lastSignInTime ?? null,
          businessClaims: businessClaim,
          // Explicitly omit passwordHash, salt, tokens
        },
      });
      extractedCount += 1;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  await new Promise<void>((resolve, reject) => {
    stream.end(() => resolve());
    stream.on("error", reject);
  });

  return { extractedCount, outputFile, sha256: sha256File(outputFile) };
}

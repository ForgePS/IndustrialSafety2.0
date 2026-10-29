import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..");
const CANONICAL_API = "https://api-dev.forgepublicsafety.com";
const LEGACY_API_CF = "d108fstxdv69bo.cloudfront.net";

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkFiles(full, acc);
    } else if (/\.(js|html|json|css|txt|map)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("creator console development API domain", () => {
  it("documents the canonical development API URL", () => {
    expect(CANONICAL_API).toBe("https://api-dev.forgepublicsafety.com");
  });

  it("rejects JWKS-shaped paste via shared web-kit guard (import smoke)", async () => {
    const { assertAccessTokenShape } = await import("@forge/web-kit");
    expect(() =>
      assertAccessTokenShape(JSON.stringify({ keys: [{ kty: "RSA", kid: "x" }] })),
    ).toThrow(/JWKS/);
    // Cold dynamic import transforms the @forge/web-kit graph; can exceed the 5s default under CI load.
  }, 30_000);
});

describe("creator console built assets (when present)", () => {
  it("must not embed the raw API CloudFront hostname; must reference canonical API when built for development", () => {
    const outDir = join(APP_ROOT, "out");
    if (!existsSync(outDir)) {
      // Build gate runs separately after `pnpm --filter @forge/creator-console build`.
      expect(true).toBe(true);
      return;
    }

    const files = walkFiles(outDir);
    expect(files.length).toBeGreaterThan(0);

    let foundCanonical = false;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text.includes(LEGACY_API_CF), `${file} contains legacy API CF hostname`).toBe(false);
      if (text.includes(CANONICAL_API)) {
        foundCanonical = true;
      }
      // Secret / JWKS embedded payload smoke checks
      expect(text.includes('"keys":[{"alg"'), `${file} embeds JWKS JSON`).toBe(false);
      expect(/AKIA[0-9A-Z]{16}/.test(text), `${file} looks like AWS access key`).toBe(false);
    }

    // When NEXT_PUBLIC_API_URL was set at build time, assets must contain the canonical host.
    if (process.env.NEXT_PUBLIC_API_URL === CANONICAL_API) {
      expect(foundCanonical).toBe(true);
    }
  });
});

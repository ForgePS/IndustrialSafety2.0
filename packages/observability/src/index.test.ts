import { describe, expect, it, vi } from "vitest";
import { createLogger, logOperationalFailure, OBSERVABILITY_ERROR_CATEGORIES } from "./index.js";

describe("observability (MK-S16)", () => {
  it("lists error categories including authz/webhook/email/job", () => {
    expect(OBSERVABILITY_ERROR_CATEGORIES).toContain("AUTHORIZATION");
    expect(OBSERVABILITY_ERROR_CATEGORIES).toContain("WEBHOOK");
    expect(OBSERVABILITY_ERROR_CATEGORIES).toContain("EMAIL");
    expect(OBSERVABILITY_ERROR_CATEGORIES).toContain("JOB");
  });

  it("logOperationalFailure writes redacted structured errors", () => {
    const writes: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

    const logger = createLogger({ service: "test", environment: "test" });
    logOperationalFailure(logger, {
      category: "EMAIL",
      message: "send failed",
      correlationId: "corr-1",
      fields: { apiKey: "forge_live_should_redact", detail: "Ses stub" },
    });

    process.stderr.write = orig;
    expect(writes.length).toBe(1);
    const line = writes[0] ?? "";
    expect(line).toContain('"errorCategory":"EMAIL"');
    expect(line).toContain("corr-1");
    expect(line).not.toContain("forge_live_should_redact");
    expect(line).toContain("[REDACTED]");
  });
});

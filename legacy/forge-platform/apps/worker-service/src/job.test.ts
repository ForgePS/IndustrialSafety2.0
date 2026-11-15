import { describe, expect, it } from "vitest";
import { assertValidJobContext } from "./job.js";

describe("worker-service", () => {
  it("rejects a missing tenant ID", () => {
    expect(() =>
      assertValidJobContext({
        jobId: "1",
        jobType: "noop",
        correlationId: "abc",
        createdAt: new Date().toISOString(),
        payload: {},
      }),
    ).toThrow(/missing tenantId/);
  });
});

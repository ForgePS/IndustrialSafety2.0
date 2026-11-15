import { describe, expect, it } from "vitest";
import { DOMAIN_EVENT_TYPES } from "./index.js";

describe("import domain event definitions", () => {
  it("includes S1 import event types", () => {
    expect(DOMAIN_EVENT_TYPES.IMPORT_JOB_CREATED).toBe("import.job.created.v1");
    expect(DOMAIN_EVENT_TYPES.IMPORT_FILE_REGISTERED).toBe("import.file.registered.v1");
    expect(DOMAIN_EVENT_TYPES.IMPORT_SENSITIVE_FIELD_ACCESSED).toBe(
      "import.sensitive_field.accessed.v1",
    );
    expect(DOMAIN_EVENT_TYPES.IMPORT_ROLLBACK_REFUSED).toBe("import.rollback.refused.v1");
  });
});

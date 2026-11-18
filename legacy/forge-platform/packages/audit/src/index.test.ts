import { describe, expect, it } from "vitest";
import {
  buildAuditRecord,
  isSaasAuditAction,
  maskSensitiveValue,
  SAAS_AUDIT_ACTIONS,
  SAAS_AUDIT_ACTION_VALUES,
} from "./index.js";

describe("audit", () => {
  it("redacts sensitive keys in snapshots", () => {
    const record = buildAuditRecord({
      id: "1",
      tenantId: "t",
      actorUserId: "u",
      actorPersonId: null,
      actorType: "USER",
      action: "person.update",
      resourceType: "person",
      result: "SUCCESS",
      riskLevel: "MEDIUM",
      correlationId: "c",
      requestId: "r",
      after: { password: "secret", name: "Ada" },
    });
    expect(JSON.stringify(record.afterJson)).not.toContain("secret");
  });

  it("masks SSN", () => {
    expect(maskSensitiveValue("SSN", "123456789")).toBe("***-**-6789");
  });

  it("exposes MK-S16 required SaaS audit actions", () => {
    expect(SAAS_AUDIT_ACTIONS.API_KEY_CREATED).toBe("api_key.create");
    expect(SAAS_AUDIT_ACTIONS.WEBHOOK_CHANGED).toBe("webhook.endpoint.changed");
    expect(SAAS_AUDIT_ACTIONS.EXPORT_GENERATED).toBe("audit.export.generated");
    expect(SAAS_AUDIT_ACTIONS.DATA_EXPORT_CREATED).toBe("export.job.created");
    expect(SAAS_AUDIT_ACTIONS.SUPPORT_ACTION).toBe("support.action");
    expect(SAAS_AUDIT_ACTION_VALUES.length).toBeGreaterThanOrEqual(15);
    expect(isSaasAuditAction("api_key.revoke")).toBe(true);
    expect(isSaasAuditAction("not.a.real.action")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  BILLING_LOGICAL_MODELS,
  BILLING_TYPES,
  BILLING_WEBHOOK_ENTITLEMENT_INVARIANT,
  billingWebhookEnvelopeSchema,
  toOperationalSubscriptionStatus,
  toSaasSubscriptionStatus,
} from "./billing-domain.js";

describe("billing-domain", () => {
  it("covers required logical models and billing types", () => {
    expect(BILLING_LOGICAL_MODELS).toContain("billing_customer");
    expect(BILLING_LOGICAL_MODELS).toContain("implementation_fee");
    expect(BILLING_TYPES).toContain("PER_SEAT");
    expect(BILLING_TYPES).toContain("COMPLIMENTARY");
    expect(BILLING_WEBHOOK_ENTITLEMENT_INVARIANT.toLowerCase()).toContain("not write");
  });

  it("normalizes operational and SaaS subscription statuses", () => {
    expect(toSaasSubscriptionStatus("TRIAL")).toBe("ACTIVE");
    expect(toSaasSubscriptionStatus("GRACE")).toBe("GRACE_PERIOD");
    expect(toSaasSubscriptionStatus("CANCELED")).toBe("TERMINATED");
    expect(toOperationalSubscriptionStatus("GRACE_PERIOD")).toBe("GRACE");
    expect(toOperationalSubscriptionStatus("TERMINATED")).toBe("CANCELED");
    expect(toOperationalSubscriptionStatus("bogus")).toBeNull();
  });

  it("parses webhook envelopes", () => {
    const parsed = billingWebhookEnvelopeSchema.parse({
      eventId: "evt_1",
      eventType: "subscription.updated",
      payload: { status: "ACTIVE" },
    });
    expect(parsed.eventId).toBe("evt_1");
  });
});

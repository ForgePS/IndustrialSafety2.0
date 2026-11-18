import { describe, expect, it } from "vitest";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import {
  MalformedDomainEventError,
  parseEventBridgeSqsBody,
  RejectedDomainEventError,
} from "./domain-event.js";

function buildEnvelope(detail: Record<string, unknown>) {
  return JSON.stringify({
    version: "0",
    id: "evt-bridge-1",
    "detail-type": detail.type,
    source: "forge.platform",
    account: "000000000000",
    time: "2026-07-25T00:00:00Z",
    region: "us-east-1",
    resources: [],
    detail,
  });
}

describe("parseEventBridgeSqsBody", () => {
  it("parses a valid EventBridge SQS payload", () => {
    const event = parseEventBridgeSqsBody(
      buildEnvelope({
        id: "11111111-1111-4111-8111-111111111111",
        type: DOMAIN_EVENT_TYPES.TENANT_CREATED,
        version: 1,
        tenantId: "22222222-2222-4222-8222-222222222222",
        aggregateType: "tenant",
        aggregateId: "22222222-2222-4222-8222-222222222222",
        correlationId: "corr-1",
        causationId: null,
        payload: { tenantKey: "acme" },
      }),
    );

    expect(event.type).toBe(DOMAIN_EVENT_TYPES.TENANT_CREATED);
    expect(event.tenantId).toBe("22222222-2222-4222-8222-222222222222");
    expect(event.payload).toEqual({ tenantKey: "acme" });
  });

  it("rejects tenantless events when not platform-scoped", () => {
    expect(() =>
      parseEventBridgeSqsBody(
        buildEnvelope({
          id: "11111111-1111-4111-8111-111111111111",
          type: DOMAIN_EVENT_TYPES.USER_INVITATION_CREATED,
          tenantId: null,
          aggregateType: "user_invitation",
          aggregateId: "33333333-3333-4333-8333-333333333333",
          correlationId: "corr-2",
          payload: {},
        }),
      ),
    ).toThrow(RejectedDomainEventError);
  });

  it("rejects malformed payloads", () => {
    expect(() => parseEventBridgeSqsBody("{")).toThrow(MalformedDomainEventError);
    expect(() =>
      parseEventBridgeSqsBody(
        buildEnvelope({
          id: "11111111-1111-4111-8111-111111111111",
          type: DOMAIN_EVENT_TYPES.TENANT_CREATED,
          tenantId: "22222222-2222-4222-8222-222222222222",
          aggregateType: "tenant",
          aggregateId: "22222222-2222-4222-8222-222222222222",
          correlationId: "corr-3",
          payload: { password: "secret" },
        }),
      ),
    ).toThrow(/sensitive fields/);
  });
});

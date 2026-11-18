import { describe, expect, it } from "vitest";
import { assertSafeEventPayload, createDomainEvent, DOMAIN_EVENT_TYPES } from "./index.js";

describe("events", () => {
  it("creates a typed envelope", () => {
    const event = createDomainEvent({
      id: "11111111-1111-7111-8111-111111111111",
      type: DOMAIN_EVENT_TYPES.PERSON_CREATED,
      tenantId: "t",
      actorUserId: "u",
      aggregateType: "person",
      aggregateId: "p",
      correlationId: "c",
      payload: { personId: "p" },
    });
    expect(event.type).toBe("platform.person.created.v1");
  });

  it("rejects sensitive-looking payloads", () => {
    expect(() => assertSafeEventPayload({ ssn: "123" })).toThrow(/sensitive/i);
  });
});

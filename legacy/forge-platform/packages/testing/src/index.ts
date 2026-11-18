import { createCorrelationId, createSecureId } from "@forge/security";
import type { RequestContext } from "@forge/shared-types";

/** Test data is SYNTHETIC only. Never use real personnel or SSNs. */

export function createTestUuid(): string {
  return "00000000-0000-4000-8000-000000000001";
}

export function createFakeTenant(overrides: Partial<{ id: string; name: string }> = {}) {
  return {
    id: overrides.id ?? createTestUuid(),
    name: overrides.name ?? "Synthetic Test Tenant",
    classification: "SYNTHETIC" as const,
  };
}

export function createFakeUser(overrides: Partial<{ id: string; email: string }> = {}) {
  return {
    id: overrides.id ?? "00000000-0000-4000-8000-000000000002",
    email: overrides.email ?? "synthetic.user@example.test",
    classification: "SYNTHETIC" as const,
  };
}

export function createFakeOrganization() {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Synthetic Fire Department",
    classification: "SYNTHETIC" as const,
  };
}

export function createSyntheticPerson() {
  return {
    id: createSecureId("person"),
    firstName: "Synthetic",
    lastName: "Person",
    email: "synthetic.person@example.test",
    // Prefer omitting full SSN entirely in fixtures.
    ssnLastFour: undefined,
    classification: "SYNTHETIC" as const,
  };
}

export function createMockRequestContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    correlationId: overrides.correlationId ?? createCorrelationId(),
    environment: overrides.environment ?? "testing",
    tenantId: overrides.tenantId ?? createTestUuid(),
    userId: overrides.userId ?? "00000000-0000-4000-8000-000000000002",
    product: overrides.product ?? "ACADEMY",
  };
}

export function createMockAuthorizationContext() {
  return {
    permissions: ["tenant.view"] as string[],
    roles: ["test_role"] as string[],
  };
}

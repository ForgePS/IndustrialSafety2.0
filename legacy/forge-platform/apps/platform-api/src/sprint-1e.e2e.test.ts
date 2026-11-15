import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateAuthorization, evaluateTenantOperationalState } from "@forge/authorization";
import { createId } from "@forge/database";
import { E2eHarness } from "./testing/e2e-harness.js";

/** Nest returns 201 for POST creates; idempotent replays preserve the original status. */
function expectMutationSuccess(status: number) {
  expect([200, 201]).toContain(status);
}

const STANDARD_USER_GRANT_PERMISSIONS = [
  "platform.organization.read",
  "platform.person.read",
  "platform.permission.read",
] as const;

describe("Sprint 1E Wave 8 platform E2E", () => {
  const harness = new E2eHarness();

  beforeAll(async () => {
    await harness.init();
  }, 120_000);

  afterAll(async () => {
    await harness.cleanup();
    await harness.close();
  });

  it("scenario 1: tenant A cannot read or modify tenant B data via API", async () => {
    const tenantA = await harness.createTenant();
    const tenantB = await harness.createTenant();
    const userA = await harness.createUser({
      tenantId: tenantA.tenantId,
      email: `tenant-a-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: [
        "platform.person.read",
        "platform.person.create",
        "platform.membership.read",
      ],
    });
    await harness.createPerson(tenantB.tenantId, "Bob", "Other");

    const crossRead = await harness
      .api(userA.userId, userA.tenantId)
      .get(`/api/v1/tenants/${tenantB.tenantId}/persons`)
      .expect(403);
    expect(crossRead.body.error.code).toBe("FORBIDDEN");

    const crossWrite = await harness
      .api(userA.userId, userA.tenantId)
      .post(`/api/v1/tenants/${tenantB.tenantId}/persons`)
      .set("Idempotency-Key", createId())
      .send({
        firstName: "Intruder",
        lastName: "Attempt",
        displayName: "Intruder Attempt",
      })
      .expect(403);
    expect(crossWrite.body.error.code).toBe("FORBIDDEN");
  });

  it("scenario 3: viewer cannot perform administrator actions", async () => {
    const tenant = await harness.createTenant();
    const viewer = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `viewer-${createId()}@example.test`,
      roleCode: "READ_ONLY_USER",
      rolePermissions: [
        "platform.organization.read",
        "platform.person.read",
        "platform.permission.read",
        "platform.audit.read",
      ],
    });

    const listPersons = await harness
      .api(viewer.userId, viewer.tenantId)
      .get(`/api/v1/tenants/${tenant.tenantId}/persons`)
      .expect(200);
    expect(Array.isArray(listPersons.body.data)).toBe(true);

    const createPerson = await harness
      .api(viewer.userId, viewer.tenantId)
      .post(`/api/v1/tenants/${tenant.tenantId}/persons`)
      .set("Idempotency-Key", createId())
      .send({
        firstName: "Should",
        lastName: "Fail",
        displayName: "Should Fail",
      })
      .expect(403);
    expect(createPerson.body.error.code).toBe("FORBIDDEN");
  });

  it("scenario 4: tenant admin cannot grant creator-only permissions", async () => {
    const tenant = await harness.createTenant();
    const tenantAdmin = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `admin-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: [
        "platform.membership.manage",
        "platform.membership.read",
        "platform.role.assign",
        "platform.permission.read",
        "platform.tenant.create",
      ],
    });
    const member = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `member-${createId()}@example.test`,
      roleCode: "STANDARD_USER",
      rolePermissions: ["platform.person.read", "platform.permission.read"],
      membershipStatus: "ACTIVE",
    });

    await harness.createRole(tenant.tenantId, "CREATOR_ESCALATION", ["platform.onboarding.manage"]);

    const membership = await harness
      .api(tenantAdmin.userId, tenant.tenantId)
      .get(`/api/v1/tenants/${tenant.tenantId}/memberships/${member.membershipId}`)
      .expect(200);
    const etag = membership.headers.etag as string;

    const denied = await harness
      .api(tenantAdmin.userId, tenant.tenantId)
      .put(`/api/v1/tenants/${tenant.tenantId}/memberships/${member.membershipId}/roles`)
      .set("If-Match", etag)
      .send({ roles: [{ roleCode: "CREATOR_ESCALATION", organizationId: null }] })
      .expect(403);
    expect(denied.body.error.message).toMatch(/creator permissions/i);
  });

  it("scenario 5: product-disabled and module-disabled users are blocked", async () => {
    const tenant = await harness.createTenant();
    const restricted = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `restricted-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: ["platform.person.read", "platform.permission.read"],
      productCodes: [],
      moduleCodes: [],
    });

    const principal = await harness.resolvePrincipal(restricted.userId, restricted.tenantId);
    expect(principal.activeProducts.size).toBe(0);
    expect(principal.activeModules.size).toBe(0);

    const productDecision = harness.evaluateForPrincipal(principal, "platform.person.read", {
      requiresEntitlement: { productCode: "FORGE_RMS" },
    });
    expect(productDecision.allowed).toBe(false);
    expect(productDecision.reasonCode).toBe("PRODUCT_ENTITLEMENT_REQUIRED");

    const moduleDecision = harness.evaluateForPrincipal(principal, "platform.person.read", {
      requiresEntitlement: { moduleCode: "PERSONNEL" },
    });
    expect(moduleDecision.allowed).toBe(false);
    expect(moduleDecision.reasonCode).toBe("MODULE_ENTITLEMENT_REQUIRED");
  });

  it("scenario 6: membership suspension immediately invalidates access", async () => {
    const tenant = await harness.createTenant();
    const admin = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `suspend-admin-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: [
        "platform.membership.manage",
        "platform.membership.read",
        "platform.person.read",
      ],
    });
    const target = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `suspend-target-${createId()}@example.test`,
      roleCode: "STANDARD_USER",
      rolePermissions: ["platform.person.read"],
    });

    await harness
      .api(target.userId, target.tenantId)
      .get(`/api/v1/tenants/${tenant.tenantId}/persons`)
      .expect(200);

    const before = await harness
      .api(admin.userId, tenant.tenantId)
      .get(`/api/v1/tenants/${tenant.tenantId}/memberships/${target.membershipId}`)
      .expect(200);

    await harness
      .api(admin.userId, tenant.tenantId)
      .post(`/api/v1/tenants/${tenant.tenantId}/memberships/${target.membershipId}/suspend`)
      .set("If-Match", before.headers.etag as string)
      .send({ reason: "E2E suspension test" })
      .expect((res) => expectMutationSuccess(res.status));

    const blocked = await harness
      .api(target.userId, target.tenantId)
      .get(`/api/v1/tenants/${tenant.tenantId}/persons`)
      .expect(403);
    expect(blocked.body.error.code).toBe("FORBIDDEN");
  });

  it("scenario 7: invitation acceptance links Cognito identity and activates membership", async () => {
    const tenant = await harness.createTenant();
    const admin = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `invite-admin-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: [
        "platform.invitation.manage",
        "platform.invitation.read",
        "platform.membership.read",
        ...STANDARD_USER_GRANT_PERMISSIONS,
      ],
    });
    const inviteEmail = `invited-${createId()}@example.test`;

    const created = await harness
      .api(admin.userId, tenant.tenantId)
      .post("/api/v1/auth/invitations")
      .set("Idempotency-Key", createId())
      .send({
        tenantId: tenant.tenantId,
        email: inviteEmail,
        firstName: "Invited",
        lastName: "User",
        roleCodes: ["STANDARD_USER"],
        productCodes: ["FORGE_RMS"],
        moduleCodes: ["CORE"],
        send: true,
      })
      .expect((res) => expectMutationSuccess(res.status));

    expect(created.body.data.token).toBeTruthy();
    const cognitoSubject = harness.simulatedCognitoSubject(inviteEmail);

    const accepted = await harness
      .request()
      .post("/api/v1/auth/invitations/accept")
      .send({
        token: created.body.data.token,
        cognitoSubject,
      })
      .expect((res) => expectMutationSuccess(res.status));

    expect(accepted.body.data.userId).toBeTruthy();
    expect(accepted.body.data.membershipId).toBeTruthy();

    const identity = await harness.adminDb.query.authenticationIdentities.findFirst({
      where: (table, { and, eq }) =>
        and(eq(table.provider, "COGNITO"), eq(table.providerSubject, cognitoSubject)),
    });
    expect(identity?.userId).toBe(accepted.body.data.userId);

    const membership = await harness.adminDb.query.userTenantMemberships.findFirst({
      where: (table, { eq }) => eq(table.id, accepted.body.data.membershipId),
    });
    expect(membership?.status).toBe("ACTIVE");
  });

  it("scenario 8: invitation cannot be accepted twice", async () => {
    const tenant = await harness.createTenant();
    const admin = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `double-admin-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: ["platform.invitation.manage", ...STANDARD_USER_GRANT_PERMISSIONS],
    });
    const inviteEmail = `double-${createId()}@example.test`;

    const created = await harness
      .api(admin.userId, tenant.tenantId)
      .post("/api/v1/auth/invitations")
      .set("Idempotency-Key", createId())
      .send({
        tenantId: tenant.tenantId,
        email: inviteEmail,
        roleCodes: ["STANDARD_USER"],
        productCodes: ["FORGE_RMS"],
        moduleCodes: ["CORE"],
        send: true,
      })
      .expect((res) => expectMutationSuccess(res.status));

    const payload = {
      token: created.body.data.token,
      cognitoSubject: harness.simulatedCognitoSubject(inviteEmail),
    };

    await harness
      .request()
      .post("/api/v1/auth/invitations/accept")
      .send(payload)
      .expect((res) => expectMutationSuccess(res.status));
    const second = await harness
      .request()
      .post("/api/v1/auth/invitations/accept")
      .send(payload)
      .expect(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });

  it("scenario 9: duplicate idempotent requests create one record and one event", async () => {
    const tenant = await harness.createTenant();
    const admin = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `idempotent-admin-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: ["platform.person.create", "platform.person.read"],
    });
    const idempotencyKey = `idem-${createId()}`;
    const body = {
      firstName: "Idem",
      lastName: "Potent",
      displayName: "Idem Potent",
    };

    const first = await harness
      .api(admin.userId, tenant.tenantId)
      .post(`/api/v1/tenants/${tenant.tenantId}/persons`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect((res) => expectMutationSuccess(res.status));

    const second = await harness
      .api(admin.userId, tenant.tenantId)
      .post(`/api/v1/tenants/${tenant.tenantId}/persons`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect((res) => expectMutationSuccess(res.status));

    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(second.body.data.id).toBe(first.body.data.id);

    const recordCount = await harness.countIdempotencyRecords(tenant.tenantId, idempotencyKey);
    expect(recordCount).toBe(1);

    const eventCount = await harness.countOutboxEvents(
      tenant.tenantId,
      "platform.person.created.v1",
      first.body.data.id,
    );
    expect(eventCount).toBe(1);

    const personsListed = await harness
      .api(admin.userId, tenant.tenantId)
      .get(`/api/v1/tenants/${tenant.tenantId}/persons`)
      .expect(200);
    const matches = personsListed.body.data.filter(
      (row: { displayName: string }) => row.displayName === "Idem Potent",
    );
    expect(matches).toHaveLength(1);
  });

  it("scenario 10: reusing an idempotency key with a changed payload is rejected", async () => {
    const tenant = await harness.createTenant();
    const admin = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `hash-admin-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: ["platform.person.create"],
    });
    const idempotencyKey = `hash-${createId()}`;

    await harness
      .api(admin.userId, tenant.tenantId)
      .post(`/api/v1/tenants/${tenant.tenantId}/persons`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        firstName: "Alpha",
        lastName: "One",
        displayName: "Alpha One",
      })
      .expect((res) => expectMutationSuccess(res.status));

    const conflict = await harness
      .api(admin.userId, tenant.tenantId)
      .post(`/api/v1/tenants/${tenant.tenantId}/persons`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        firstName: "Beta",
        lastName: "Two",
        displayName: "Beta Two",
      })
      .expect(409);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("scenario 11: concurrent stale update returns HTTP 412", async () => {
    const tenant = await harness.createTenant();
    const admin = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `concurrency-admin-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: ["platform.membership.manage", "platform.membership.read"],
    });
    const target = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `concurrency-target-${createId()}@example.test`,
      roleCode: "STANDARD_USER",
      rolePermissions: ["platform.person.read"],
    });

    const current = await harness
      .api(admin.userId, tenant.tenantId)
      .get(`/api/v1/tenants/${tenant.tenantId}/memberships/${target.membershipId}`)
      .expect(200);
    const staleEtag = current.headers.etag as string;

    await harness
      .api(admin.userId, tenant.tenantId)
      .post(`/api/v1/tenants/${tenant.tenantId}/memberships/${target.membershipId}/suspend`)
      .set("If-Match", staleEtag)
      .send({ reason: "First writer" })
      .expect((res) => expectMutationSuccess(res.status));

    const stale = await harness
      .api(admin.userId, tenant.tenantId)
      .post(`/api/v1/tenants/${tenant.tenantId}/memberships/${target.membershipId}/activate`)
      .set("If-Match", staleEtag)
      .expect(412);
    expect(stale.body.error.code).toBe("PRECONDITION_FAILED");
  });

  it("scenario 12: subscription states enforce expected access without deleting data", async () => {
    const tenant = await harness.createTenant();
    const admin = await harness.createUser({
      tenantId: tenant.tenantId,
      email: `sub-admin-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: [
        "platform.person.read",
        "platform.person.create",
        "platform.entitlement.manage",
      ],
    });
    const personId = await harness.createPerson(tenant.tenantId, "Retained", "Record");

    const cases: Array<{
      status: string;
      readStatus: number;
      writeStatus: number;
    }> = [
      { status: "ACTIVE", readStatus: 200, writeStatus: 200 },
      { status: "PAYMENT_DUE", readStatus: 200, writeStatus: 200 },
      { status: "GRACE_PERIOD", readStatus: 200, writeStatus: 200 },
      { status: "READ_ONLY", readStatus: 200, writeStatus: 403 },
      { status: "SUSPENDED", readStatus: 403, writeStatus: 403 },
      { status: "TERMINATED", readStatus: 403, writeStatus: 403 },
      { status: "ARCHIVED", readStatus: 200, writeStatus: 403 },
    ];

    for (const testCase of cases) {
      await harness.setSubscriptionStatus(tenant.tenantId, tenant.subscriptionId, testCase.status);

      await harness
        .api(admin.userId, tenant.tenantId)
        .get(`/api/v1/tenants/${tenant.tenantId}/persons/${personId}`)
        .expect(testCase.readStatus);

      const write = await harness
        .api(admin.userId, tenant.tenantId)
        .post(`/api/v1/tenants/${tenant.tenantId}/persons`)
        .set("Idempotency-Key", createId())
        .send({
          firstName: `Sub-${testCase.status}`,
          lastName: "Probe",
          displayName: `Sub-${testCase.status} Probe`,
        });

      if (testCase.writeStatus === 200) {
        expectMutationSuccess(write.status);
      } else {
        expect(write.status).toBe(testCase.writeStatus);
      }
    }

    const retained = await harness.adminDb.query.persons.findFirst({
      where: (table, { eq }) => eq(table.id, personId),
    });
    expect(retained?.firstName).toBe("Retained");

    const operationalArchived = evaluateTenantOperationalState({
      tenantStatus: "ACTIVE",
      subscriptionStatus: "ARCHIVED",
    });
    expect(operationalArchived.canUseProducts).toBe(false);

    const readAllowed = evaluateAuthorization({
      principal: await harness.resolvePrincipal(admin.userId, admin.tenantId),
      permissionCode: "platform.person.read",
      resourceType: "person",
      resourceTenantId: tenant.tenantId,
      tenantOperationalState: operationalArchived,
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
    });
    expect(readAllowed.allowed).toBe(true);
  });
});

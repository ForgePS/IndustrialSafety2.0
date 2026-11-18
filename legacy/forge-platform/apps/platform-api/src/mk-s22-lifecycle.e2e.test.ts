/**
 * MK-S22 End-to-End UAT — SaaS lifecycle (§49 directive steps 1–24).
 * Requires local Postgres (forge_platform_test). Not run in test:unit.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createId } from "@forge/database";
import { MK_S22_LIFECYCLE_STEPS } from "./mk-s22-lifecycle.scenario.test.js";
import { E2eHarness } from "./testing/e2e-harness.js";

function expectMutationSuccess(status: number) {
  expect([200, 201]).toContain(status);
}

const INDUSTRIAL_MODULES = ["CORE", "PERSONNEL", "LOCKOUT_TAGOUT"] as const;

describe("MK-S22 SaaS lifecycle UAT", () => {
  const harness = new E2eHarness();

  beforeAll(async () => {
    await harness.init();
  }, 120_000);

  afterAll(async () => {
    await harness.cleanup();
    await harness.close();
  });

  it("matrix lists all 24 directive steps", () => {
    expect(MK_S22_LIFECYCLE_STEPS).toHaveLength(24);
  });

  it("runs steps 1–24: provision → entitle → invite → facility → roles → module → billing → suspend → notify → audit → isolate", async () => {
    const creator = await harness.createPlatformSuperAdmin();
    const creatorApi = () => harness.api(creator.userId, creator.tenantId);

    // --- 1 Provision tenant ---
    const tenantKey = `mk-s22-${createId().replace(/-/g, "").slice(0, 16)}`;
    const provisioned = await creatorApi()
      .post("/api/v1/platform/tenants")
      .set("Idempotency-Key", createId())
      .send({
        tenantKey,
        slug: tenantKey,
        legalName: `${tenantKey} LLC`,
        displayName: `MK-S22 ${tenantKey}`,
        tenantType: "CUSTOMER",
      })
      .expect((res) => expectMutationSuccess(res.status));

    const tenantId = provisioned.body.data.id as string;
    expect(provisioned.body.data.status).toBe("PROVISIONING");
    let tenantEtag = provisioned.headers.etag as string;

    await creatorApi()
      .post(`/api/v1/platform/tenants/${tenantId}/activate`)
      .set("If-Match", tenantEtag)
      .expect((res) => expectMutationSuccess(res.status));

    const activated = await creatorApi().get(`/api/v1/platform/tenants/${tenantId}`).expect(200);
    expect(activated.body.data.status).toBe("ACTIVE");
    tenantEtag = activated.headers.etag as string;

    await harness.bootstrapProvisionedTenant(tenantId);

    // --- 2–3 Assign product + modules ---
    await creatorApi()
      .put(`/api/v1/tenants/${tenantId}/products/FORGE_INDUSTRIAL`)
      .set("Idempotency-Key", createId())
      .send({ status: "ACTIVE" })
      .expect((res) => expectMutationSuccess(res.status));

    // Product-scoped module IDs (codes are not globally unique across products).
    await harness.entitleModulesForProduct(tenantId, "FORGE_INDUSTRIAL", INDUSTRIAL_MODULES);

    // Unique industrial module also assigned via public entitlement API.
    await creatorApi()
      .put(`/api/v1/tenants/${tenantId}/modules/LOCKOUT_TAGOUT/entitlement`)
      .set("Idempotency-Key", createId())
      .send({ status: "ACTIVE" })
      .expect((res) => expectMutationSuccess(res.status));

    await creatorApi().get(`/api/v1/tenants/${tenantId}/entitlements`).expect(200);

    // --- 4–6 Owner invite / accept / authenticate ---
    const ownerEmail = `owner-${createId()}@example.test`;
    const ownerInvite = await creatorApi()
      .post("/api/v1/auth/invitations")
      .set("Idempotency-Key", createId())
      .send({
        tenantId,
        email: ownerEmail,
        firstName: "Owner",
        lastName: "Uat",
        roleCodes: ["TENANT_OWNER"],
        productCodes: ["FORGE_INDUSTRIAL"],
        moduleCodes: [...INDUSTRIAL_MODULES],
        send: true,
      })
      .expect((res) => expectMutationSuccess(res.status));

    expect(ownerInvite.body.data.token).toBeTruthy();
    const ownerAccept = await harness
      .request()
      .post("/api/v1/auth/invitations/accept")
      .send({
        token: ownerInvite.body.data.token,
        cognitoSubject: harness.simulatedCognitoSubject(ownerEmail),
      })
      .expect((res) => expectMutationSuccess(res.status));

    const ownerUserId = ownerAccept.body.data.userId as string;
    const ownerMembershipId = ownerAccept.body.data.membershipId as string;
    expect(ownerUserId).toBeTruthy();

    const ownerMe = await harness.api(ownerUserId, tenantId).get("/api/v1/auth/me").expect(200);
    expect(ownerMe.body.data.userId).toBe(ownerUserId);
    expect(ownerMe.body.data.tenantId).toBe(tenantId);

    // --- 7 Org settings ---
    const orgCreated = await harness
      .api(ownerUserId, tenantId)
      .post(`/api/v1/tenants/${tenantId}/organizations`)
      .set("Idempotency-Key", createId())
      .send({
        organizationTypeCode: "SAFETY_COMPANY",
        slug: `hq-${createId().replace(/-/g, "").slice(0, 10)}`,
        legalName: "MK-S22 HQ Legal",
        displayName: "MK-S22 HQ",
      })
      .expect((res) => expectMutationSuccess(res.status));

    const organizationId = orgCreated.body.data.id as string;
    const orgPatched = await harness
      .api(ownerUserId, tenantId)
      .patch(`/api/v1/tenants/${tenantId}/organizations/${organizationId}`)
      .set("If-Match", orgCreated.headers.etag as string)
      .send({ displayName: "MK-S22 HQ Updated" })
      .expect((res) => expectMutationSuccess(res.status));
    expect(orgPatched.body.data.displayName).toBe("MK-S22 HQ Updated");

    // --- 8 Facility added ---
    const facility = await harness
      .api(ownerUserId, tenantId)
      .post(`/api/v1/tenants/${tenantId}/facilities`)
      .set("Idempotency-Key", createId())
      .send({
        facilityKey: `plant-${createId().replace(/-/g, "").slice(0, 8)}`,
        name: "Plant One",
        organizationId,
      })
      .expect((res) => expectMutationSuccess(res.status));
    expect(facility.body.data.id).toBeTruthy();

    // --- 9–12 Admin invite / accept / role / permission ---
    const adminEmail = `admin-${createId()}@example.test`;
    const adminInvite = await harness
      .api(ownerUserId, tenantId)
      .post("/api/v1/auth/invitations")
      .set("Idempotency-Key", createId())
      .send({
        tenantId,
        email: adminEmail,
        firstName: "Admin",
        lastName: "Uat",
        roleCodes: ["STANDARD_USER"],
        productCodes: ["FORGE_INDUSTRIAL"],
        moduleCodes: [...INDUSTRIAL_MODULES],
        send: true,
      })
      .expect((res) => expectMutationSuccess(res.status));

    const adminAccept = await harness
      .request()
      .post("/api/v1/auth/invitations/accept")
      .send({
        token: adminInvite.body.data.token,
        cognitoSubject: harness.simulatedCognitoSubject(adminEmail),
      })
      .expect((res) => expectMutationSuccess(res.status));

    const adminUserId = adminAccept.body.data.userId as string;
    const adminMembershipId = adminAccept.body.data.membershipId as string;

    const adminMembership = await harness
      .api(ownerUserId, tenantId)
      .get(`/api/v1/tenants/${tenantId}/memberships/${adminMembershipId}`)
      .expect(200);

    await harness
      .api(ownerUserId, tenantId)
      .put(`/api/v1/tenants/${tenantId}/memberships/${adminMembershipId}/roles`)
      .set("If-Match", adminMembership.headers.etag as string)
      .send({ roles: [{ roleCode: "TENANT_ADMIN", organizationId: null }] })
      .expect((res) => expectMutationSuccess(res.status));

    await harness.api(adminUserId, tenantId).get(`/api/v1/tenants/${tenantId}/persons`).expect(200);

    await harness
      .api(adminUserId, tenantId)
      .post(`/api/v1/tenants/${tenantId}/persons`)
      .set("Idempotency-Key", createId())
      .send({
        firstName: "Admin",
        lastName: "Created",
        displayName: "Admin Created",
      })
      .expect((res) => expectMutationSuccess(res.status));

    const viewer = await harness.createUser({
      tenantId,
      email: `viewer-${createId()}@example.test`,
      roleCode: "STANDARD_USER",
      rolePermissions: [
        "platform.organization.read",
        "platform.person.read",
        "platform.permission.read",
      ],
      productCodes: ["FORGE_INDUSTRIAL"],
      moduleCodes: [...INDUSTRIAL_MODULES],
    });
    const viewerDenied = await harness
      .api(viewer.userId, tenantId)
      .post(`/api/v1/tenants/${tenantId}/persons`)
      .set("Idempotency-Key", createId())
      .send({
        firstName: "No",
        lastName: "Create",
        displayName: "No Create",
      })
      .expect(403);
    expect(viewerDenied.body.error.code).toBe("FORBIDDEN");

    // --- 13–17 Module accessible → disable → UI N/A → API reject → restore ---
    await harness
      .api(ownerUserId, tenantId)
      .get(`/api/v1/tenants/${tenantId}/facilities`)
      .expect(200);

    const ownerBefore = await harness.resolvePrincipal(ownerUserId, tenantId);
    expect(ownerBefore.activeModules.has("LOCKOUT_TAGOUT")).toBe(true);
    expect(
      harness.evaluateForPrincipal(ownerBefore, "tenant.facilities.read", {
        requiresEntitlement: { moduleCode: "LOCKOUT_TAGOUT" },
      }).allowed,
    ).toBe(true);

    const moduleFresh = await creatorApi()
      .put(`/api/v1/tenants/${tenantId}/modules/LOCKOUT_TAGOUT/entitlement`)
      .set("Idempotency-Key", createId())
      .send({ status: "ACTIVE" })
      .expect((res) => expectMutationSuccess(res.status));

    await creatorApi()
      .post(`/api/v1/tenants/${tenantId}/modules/LOCKOUT_TAGOUT/suspend`)
      .set("If-Match", moduleFresh.headers.etag as string)
      .expect((res) => expectMutationSuccess(res.status));

    // Step 15: UI remove — documented N/A (static export); covered in MK-S22-UAT.md
    expect(MK_S22_LIFECYCLE_STEPS.find((s) => s.step === 15)?.evidence).toBe("UI_N_A");

    const ownerDisabled = await harness.resolvePrincipal(ownerUserId, tenantId);
    expect(ownerDisabled.activeModules.has("LOCKOUT_TAGOUT")).toBe(false);
    const moduleDenied = harness.evaluateForPrincipal(ownerDisabled, "tenant.facilities.read", {
      requiresEntitlement: { moduleCode: "LOCKOUT_TAGOUT" },
    });
    expect(moduleDenied.allowed).toBe(false);
    expect(moduleDenied.reasonCode).toBe("MODULE_ENTITLEMENT_REQUIRED");

    // HTTP reject: only Nest route with requiresEntitlement is facilities (product gate)
    await creatorApi()
      .put(`/api/v1/tenants/${tenantId}/products/FORGE_INDUSTRIAL`)
      .set("Idempotency-Key", createId())
      .send({ status: "DISABLED" })
      .expect((res) => expectMutationSuccess(res.status));

    const facilityBlocked = await harness
      .api(ownerUserId, tenantId)
      .get(`/api/v1/tenants/${tenantId}/facilities`)
      .expect(403);
    expect(facilityBlocked.body.error.code).toBe("FORBIDDEN");

    await creatorApi()
      .put(`/api/v1/tenants/${tenantId}/products/FORGE_INDUSTRIAL`)
      .set("Idempotency-Key", createId())
      .send({ status: "ACTIVE" })
      .expect((res) => expectMutationSuccess(res.status));

    const reactivate = await creatorApi()
      .put(`/api/v1/tenants/${tenantId}/modules/LOCKOUT_TAGOUT/entitlement`)
      .set("Idempotency-Key", createId())
      .send({ status: "ACTIVE" })
      .expect((res) => expectMutationSuccess(res.status));

    await creatorApi()
      .post(`/api/v1/tenants/${tenantId}/modules/LOCKOUT_TAGOUT/activate`)
      .set("If-Match", reactivate.headers.etag as string)
      .expect((res) => expectMutationSuccess(res.status));

    const ownerRestored = await harness.resolvePrincipal(ownerUserId, tenantId);
    expect(ownerRestored.activeModules.has("LOCKOUT_TAGOUT")).toBe(true);
    await harness
      .api(ownerUserId, tenantId)
      .get(`/api/v1/tenants/${tenantId}/facilities`)
      .expect(200);

    // --- 18 Billing updated (creator-only write) ---
    const customer = await creatorApi()
      .post(`/api/v1/tenants/${tenantId}/billing/customers`)
      .send({
        displayName: "MK-S22 Billing",
        billingEmail: `billing-${createId()}@example.test`,
        billingProvider: "NONE",
      })
      .expect((res) => expectMutationSuccess(res.status));

    const customerVersion = customer.body.data.recordVersion as number;
    expect(customerVersion).toBeGreaterThan(0);
    const customerEtag = (customer.headers.etag as string | undefined) ?? `W/"${customerVersion}"`;

    const patched = await creatorApi()
      .patch(`/api/v1/tenants/${tenantId}/billing/customers`)
      .set("If-Match", customerEtag)
      .send({ displayName: "MK-S22 Billing Updated" });
    expect(
      [200, 201],
      `billing patch ${patched.status}: ${JSON.stringify(patched.body)}`,
    ).toContain(patched.status);

    await harness
      .api(ownerUserId, tenantId)
      .get(`/api/v1/tenants/${tenantId}/billing/overview`)
      .expect(200);

    // --- 19–21 Tenant suspend → restricted → restore ---
    const beforeSuspend = await creatorApi()
      .get(`/api/v1/platform/tenants/${tenantId}`)
      .expect(200);
    tenantEtag = beforeSuspend.headers.etag as string;

    await creatorApi()
      .post(`/api/v1/platform/tenants/${tenantId}/suspend`)
      .set("If-Match", tenantEtag)
      .send({ reason: "MK-S22 UAT suspension" })
      .expect((res) => expectMutationSuccess(res.status));

    const blockedWhileSuspended = await harness
      .api(ownerUserId, tenantId)
      .get(`/api/v1/tenants/${tenantId}/persons`)
      .expect(403);
    expect(blockedWhileSuspended.body.error.code).toBe("FORBIDDEN");

    const suspendedTenant = await creatorApi()
      .get(`/api/v1/platform/tenants/${tenantId}`)
      .expect(200);
    expect(suspendedTenant.body.data.status).toBe("SUSPENDED");
    tenantEtag = suspendedTenant.headers.etag as string;

    await creatorApi()
      .post(`/api/v1/platform/tenants/${tenantId}/activate`)
      .set("If-Match", tenantEtag)
      .expect((res) => expectMutationSuccess(res.status));

    await harness.api(ownerUserId, tenantId).get(`/api/v1/tenants/${tenantId}/persons`).expect(200);

    // --- 22 Notification delivered ---
    const notification = await harness
      .api(ownerUserId, tenantId)
      .post(`/api/v1/tenants/${tenantId}/notifications`)
      .send({
        userId: ownerUserId,
        type: "system.mk_s22_uat",
        title: "MK-S22 UAT",
        body: "Lifecycle notification delivered.",
        destination: "IN_APP",
      })
      .expect((res) => expectMutationSuccess(res.status));
    const notificationId = notification.body.data.notification?.id as string | undefined;
    expect(notificationId).toBeTruthy();

    const listed = await harness
      .api(ownerUserId, tenantId)
      .get(`/api/v1/tenants/${tenantId}/notifications`)
      .expect(200);
    const listedRows = listed.body.data as Array<{ id: string }>;
    expect(listedRows.some((n) => n.id === notificationId)).toBe(true);

    // --- 23 Audit verified ---
    const audit = await harness
      .api(ownerUserId, tenantId)
      .get(`/api/v1/tenants/${tenantId}/audit-events?pageSize=50`)
      .expect(200);
    expect(Array.isArray(audit.body.data)).toBe(true);
    expect(audit.body.data.length).toBeGreaterThan(0);

    // --- 24 Tenant isolation ---
    const other = await harness.createTenant({
      productCodes: ["FORGE_INDUSTRIAL"],
      moduleCodes: [...INDUSTRIAL_MODULES],
    });
    const otherUser = await harness.createUser({
      tenantId: other.tenantId,
      email: `other-${createId()}@example.test`,
      roleCode: "TENANT_ADMIN",
      rolePermissions: ["platform.person.read", "platform.person.create"],
      productCodes: ["FORGE_INDUSTRIAL"],
      moduleCodes: [...INDUSTRIAL_MODULES],
    });
    await harness.createPerson(other.tenantId, "Isolated", "Person");

    const cross = await harness
      .api(ownerUserId, tenantId)
      .get(`/api/v1/tenants/${other.tenantId}/persons`)
      .expect(403);
    expect(cross.body.error.code).toBe("FORBIDDEN");

    // Keep fixtures referenced so cleanup remains deterministic
    expect(ownerMembershipId).toBeTruthy();
    expect(otherUser.tenantId).toBe(other.tenantId);
  }, 180_000);
});

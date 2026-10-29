import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createId,
  featureDefinitions,
  featureOverrides,
  nerisIncidents,
  withTenantTransaction,
} from "@forge/database";
import { importNerisSchema } from "@forge/database/neris-import";
import { RMS_PERMISSIONS } from "@forge/contracts";
import { and, eq } from "drizzle-orm";
import { E2eHarness, TEST_ADMIN_URL } from "./testing/e2e-harness.js";

const INCIDENT_PERMISSIONS = RMS_PERMISSIONS.filter((p) => p.startsWith("rms.neris.incident"));

describe("NERIS Phase 2 incidents API", () => {
  const harness = new E2eHarness();

  beforeAll(async () => {
    await harness.init();
    await importNerisSchema({ databaseUrl: TEST_ADMIN_URL, publish: true });
  }, 360_000);

  afterAll(async () => {
    await harness.cleanup();
    await harness.close();
  });

  async function enableIncidentFlags(tenantId: string, actorUserId: string) {
    const flags = [
      "rms.neris.incident_shell.enabled",
      "rms.neris.manual_intake.enabled",
      "rms.neris.officer_review.enabled",
    ];
    const rows = await harness.adminDb
      .select()
      .from(featureDefinitions)
      .where(eq(featureDefinitions.key, flags[0]!));
    for (const key of flags) {
      const [feature] = await harness.adminDb
        .select()
        .from(featureDefinitions)
        .where(eq(featureDefinitions.key, key))
        .limit(1);
      if (!feature) continue;
      const existing = await harness.adminDb.query.featureOverrides.findFirst({
        where: and(
          eq(featureOverrides.tenantId, tenantId),
          eq(featureOverrides.featureDefinitionId, feature.id),
        ),
      });
      if (!existing) {
        await harness.adminDb.insert(featureOverrides).values({
          id: createId(),
          tenantId,
          featureDefinitionId: feature.id,
          valueJson: true,
          reason: "e2e",
          createdByUserId: actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
    void rows;
  }

  async function createIncidentUser(tenantId: string) {
    return harness.createUser({
      tenantId,
      email: `neris-incident-${createId()}@example.test`,
      roleCode: "RMS_INCIDENT_WRITER",
      rolePermissions: [
        ...INCIDENT_PERMISSIONS,
        "rms.neris.validation.view",
        "rms.neris.audit.view",
        "rms.masterdata.read",
        "platform.organization.read",
        "platform.person.read",
        "platform.permission.read",
      ],
      moduleCodes: ["CORE", "PERSONNEL", "NERIS"],
    });
  }

  it("creates incidents with unique auto numbers", async () => {
    const tenant = await harness.createTenant({ moduleCodes: ["CORE", "PERSONNEL", "NERIS"] });
    const user = await createIncidentUser(tenant.tenantId);
    await enableIncidentFlags(tenant.tenantId, user.userId);

    const api = harness.api(user.userId, tenant.tenantId);
    const first = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/neris/incidents`)
      .set("Idempotency-Key", createId())
      .send({ incidentDate: "2026-07-26", dispatchDescription: "Synthetic smoke" })
      .expect(200);
    const second = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/neris/incidents`)
      .set("Idempotency-Key", createId())
      .send({ incidentDate: "2026-07-26", dispatchDescription: "Synthetic smoke 2" })
      .expect(200);

    expect(first.body.data.incidentNumber).toBeTruthy();
    expect(second.body.data.incidentNumber).toBeTruthy();
    expect(first.body.data.incidentNumber).not.toBe(second.body.data.incidentNumber);
  });

  it("replays idempotent create with same key", async () => {
    const tenant = await harness.createTenant({ moduleCodes: ["CORE", "PERSONNEL", "NERIS"] });
    const user = await createIncidentUser(tenant.tenantId);
    await enableIncidentFlags(tenant.tenantId, user.userId);
    const key = createId();
    const api = harness.api(user.userId, tenant.tenantId);
    const first = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/neris/incidents`)
      .set("Idempotency-Key", key)
      .send({ incidentDate: "2026-07-26" })
      .expect(200);
    const replay = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/neris/incidents`)
      .set("Idempotency-Key", key)
      .send({ incidentDate: "2026-07-26" })
      .expect(200);
    expect(replay.body.data.id).toBe(first.body.data.id);
  });

  it("returns 412 on stale If-Match patch", async () => {
    const tenant = await harness.createTenant({ moduleCodes: ["CORE", "PERSONNEL", "NERIS"] });
    const user = await createIncidentUser(tenant.tenantId);
    await enableIncidentFlags(tenant.tenantId, user.userId);
    const api = harness.api(user.userId, tenant.tenantId);
    const created = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/neris/incidents`)
      .set("Idempotency-Key", createId())
      .send({ incidentDate: "2026-07-26" })
      .expect(200);
    const incidentId = created.body.data.id;
    const etag = created.headers.etag as string;

    await api
      .patch(`/api/v1/tenants/${tenant.tenantId}/neris/incidents/${incidentId}`)
      .set("If-Match", etag)
      .send({ dispatchDescription: "Updated once" })
      .expect(200);

    const stale = await api
      .patch(`/api/v1/tenants/${tenant.tenantId}/neris/incidents/${incidentId}`)
      .set("If-Match", etag)
      .send({ dispatchDescription: "Should fail" })
      .expect(412);
    expect(stale.body.error.code).toBe("CONFLICT");
  });

  it("denies cross-tenant incident reads under RLS", async () => {
    const tenantA = await harness.createTenant({ moduleCodes: ["CORE", "PERSONNEL", "NERIS"] });
    const tenantB = await harness.createTenant({ moduleCodes: ["CORE", "PERSONNEL", "NERIS"] });
    const userA = await createIncidentUser(tenantA.tenantId);
    await enableIncidentFlags(tenantA.tenantId, userA.userId);

    const created = await harness
      .api(userA.userId, tenantA.tenantId)
      .post(`/api/v1/tenants/${tenantA.tenantId}/neris/incidents`)
      .set("Idempotency-Key", createId())
      .send({ incidentDate: "2026-07-26" })
      .expect(200);

    await expect(
      withTenantTransaction(harness.appDb, tenantB.tenantId, async (tx) =>
        tx.query.nerisIncidents.findFirst({
          where: eq(nerisIncidents.id, created.body.data.id),
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("manages incident unit and personnel assignments", async () => {
    const tenant = await harness.createTenant({
      moduleCodes: ["CORE", "PERSONNEL", "NERIS", "APPARATUS"],
    });
    const user = await createIncidentUser(tenant.tenantId);
    await enableIncidentFlags(tenant.tenantId, user.userId);
    const api = harness.api(user.userId, tenant.tenantId);

    const station = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/rms/stations`)
      .set("Idempotency-Key", createId())
      .send({
        stationNumber: "9",
        name: "E2E Station",
        city: "Testville",
      })
      .expect(200);

    const unit = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/rms/units`)
      .set("Idempotency-Key", createId())
      .send({
        unitNumber: "E2E-U1",
        callSign: "E2E1",
        unitType: "ENGINE",
        stationId: station.body.data.id,
      })
      .expect(200);

    const personId = await harness.createPerson(tenant.tenantId, "Synthetic", "Responder");
    const personnel = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/rms/personnel`)
      .set("Idempotency-Key", createId())
      .send({ personId, rank: "Firefighter", stationId: station.body.data.id })
      .expect(200);

    const incident = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/neris/incidents`)
      .set("Idempotency-Key", createId())
      .send({ incidentDate: "2026-07-26", stationId: station.body.data.id })
      .expect(200);

    const unitAssignment = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/neris/incidents/${incident.body.data.id}/units`)
      .send({ unitId: unit.body.data.id, isPrimary: true, unitRole: "FIRST_DUE" })
      .expect(200);

    const personnelAssignment = await api
      .post(`/api/v1/tenants/${tenant.tenantId}/neris/incidents/${incident.body.data.id}/personnel`)
      .send({
        personnelId: personnel.body.data.id,
        unitAssignmentId: unitAssignment.body.data.id,
        role: "OFFICER",
      })
      .expect(200);

    const prefill = await api
      .get(
        `/api/v1/tenants/${tenant.tenantId}/neris/incidents/${incident.body.data.id}/prefill?stationId=${station.body.data.id}`,
      )
      .expect(200);
    expect(Array.isArray(prefill.body.data)).toBe(true);
    expect(
      prefill.body.data.some((row: { fieldKey: string }) => row.fieldKey === "response_district"),
    ).toBe(true);

    await api
      .delete(
        `/api/v1/tenants/${tenant.tenantId}/neris/incidents/${incident.body.data.id}/personnel/${personnelAssignment.body.data.id}`,
      )
      .set("If-Match", personnelAssignment.headers.etag as string)
      .expect(200);

    const units = await api
      .get(`/api/v1/tenants/${tenant.tenantId}/neris/incidents/${incident.body.data.id}/units`)
      .expect(200);
    expect(units.body.data).toHaveLength(1);
  });
});

import { createId } from "@forge/database";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { E2eHarness } from "./testing/e2e-harness.js";

const IMPORT_PERMS = [
  "import.view",
  "import.upload",
  "import.map",
  "import.validate",
  "import.preview",
  "import.approve",
  "import.profile.manage",
] as const;

describe("Import Platform S2 API", () => {
  const harness = new E2eHarness();

  beforeAll(async () => {
    await harness.init();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  });

  it("creates, lists, maps, lifecycle, profiles, templates with tenant isolation", async () => {
    const tenantA = await harness.createTenant({
      productCodes: ["FORGE_RMS"],
      moduleCodes: ["CORE", "PERSONNEL"],
    });
    const tenantB = await harness.createTenant({
      productCodes: ["FORGE_RMS"],
      moduleCodes: ["CORE", "PERSONNEL"],
    });

    const userA = await harness.createUser({
      tenantId: tenantA.tenantId,
      email: `import-a-${createId()}@example.test`,
      roleCode: "IMPORT_OPERATOR",
      rolePermissions: IMPORT_PERMS,
      productCodes: ["FORGE_RMS"],
      moduleCodes: ["CORE", "PERSONNEL"],
    });
    const userB = await harness.createUser({
      tenantId: tenantB.tenantId,
      email: `import-b-${createId()}@example.test`,
      roleCode: "IMPORT_OPERATOR",
      rolePermissions: IMPORT_PERMS,
      productCodes: ["FORGE_RMS"],
      moduleCodes: ["CORE", "PERSONNEL"],
    });
    const viewerA = await harness.createUser({
      tenantId: tenantA.tenantId,
      email: `import-viewer-${createId()}@example.test`,
      roleCode: "IMPORT_VIEWER",
      rolePermissions: ["import.view"],
      productCodes: ["FORGE_RMS"],
      moduleCodes: ["CORE"],
    });

    const apiA = harness.api(userA.userId, tenantA.tenantId);
    const apiB = harness.api(userB.userId, tenantB.tenantId);
    const apiViewer = harness.api(viewerA.userId, tenantA.tenantId);

    const createBody = {
      productKey: "FORGE_RMS",
      moduleKey: "CORE",
      recordCategory: "generic_record",
      displayName: "S2 acceptance job",
      description: "synthetic",
      sourceType: "csv",
      requestedMode: "UPSERT",
    };

    const jobIdempotencyKey = `job-${createId()}`;
    const createRes = await apiA
      .post("/api/v1/imports/jobs")
      .set("Idempotency-Key", jobIdempotencyKey)
      .send(createBody);
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe("READY_FOR_MAPPING");
    const jobId = createRes.body.data.id as string;

    const replay = await apiA
      .post("/api/v1/imports/jobs")
      .set("Idempotency-Key", jobIdempotencyKey)
      .send(createBody);
    // Idempotency interceptor may return 200/201 replay
    expect([200, 201]).toContain(replay.status);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.body.data.id).toBe(jobId);

    const conflict = await apiA
      .post("/api/v1/imports/jobs")
      .set("Idempotency-Key", jobIdempotencyKey)
      .send({ ...createBody, displayName: "Different body" });
    expect(conflict.status).toBe(409);

    const deniedCreate = await apiViewer
      .post("/api/v1/imports/jobs")
      .set("Idempotency-Key", `deny-${createId()}`)
      .send(createBody);
    expect(deniedCreate.status).toBe(403);

    const listA = await apiA.get("/api/v1/imports/jobs?search=acceptance&pageSize=10");
    expect(listA.status).toBe(200);
    expect(listA.body.data.total).toBeGreaterThanOrEqual(1);
    expect(listA.body.data.items.some((j: { id: string }) => j.id === jobId)).toBe(true);

    const getA = await apiA.get(`/api/v1/imports/jobs/${jobId}`);
    expect(getA.status).toBe(200);
    expect(getA.body.data.displayName).toBe("S2 acceptance job");

    const crossGet = await apiB.get(`/api/v1/imports/jobs/${jobId}`);
    expect(crossGet.status).toBe(404);
    expect(crossGet.body.error.code).toBe("IMPORT_JOB_NOT_FOUND");

    const guessed = await apiB.get(`/api/v1/imports/jobs/${createId()}`);
    expect(guessed.status).toBe(404);

    const mapRes = await apiA
      .put(`/api/v1/imports/jobs/${jobId}/mappings`)
      .set("Idempotency-Key", `map-${createId()}`)
      .send({
        mappings: [
          { sourceColumn: "ext_id", targetField: "external_id", isRequired: true, ordinal: 0 },
          { sourceColumn: "name", targetField: "display_name", ordinal: 1 },
        ],
      });
    expect(mapRes.status).toBe(200);
    expect(mapRes.body.data.job.status).toBe("MAPPED");
    expect(mapRes.body.data.mappings).toHaveLength(2);

    const crossMap = await apiB
      .put(`/api/v1/imports/jobs/${jobId}/mappings`)
      .set("Idempotency-Key", `map-b-${createId()}`)
      .send({
        mappings: [{ sourceColumn: "x", targetField: "y" }],
      });
    expect(crossMap.status).toBe(404);

    const invalidTransition = await apiA
      .post(`/api/v1/imports/jobs/${jobId}/approve`)
      .set("Idempotency-Key", `approve-early-${createId()}`)
      .send({});
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.error.code).toBe("IMPORT_INVALID_STATE_TRANSITION");

    const validationReq = await apiA
      .post(`/api/v1/imports/jobs/${jobId}/request-validation`)
      .set("Idempotency-Key", `val-${createId()}`)
      .send({});
    expect(validationReq.status).toBe(201);
    expect(validationReq.body.data.requestStatus).toBe("NOT_AVAILABLE_UNTIL_S3");

    const previewReq = await apiA
      .post(`/api/v1/imports/jobs/${jobId}/request-preview`)
      .set("Idempotency-Key", `prev-${createId()}`)
      .send({});
    expect(previewReq.status).toBe(201);
    expect(previewReq.body.data.requestStatus).toBe("NOT_AVAILABLE_UNTIL_S3");

    const submit = await apiA
      .post(`/api/v1/imports/jobs/${jobId}/submit-for-approval`)
      .set("Idempotency-Key", `submit-${createId()}`)
      .send({});
    expect(submit.status).toBe(201);
    expect(submit.body.data.status).toBe("AWAITING_APPROVAL");

    const approve = await apiA
      .post(`/api/v1/imports/jobs/${jobId}/approve`)
      .set("Idempotency-Key", `approve-${createId()}`)
      .send({});
    expect(approve.status).toBe(201);
    expect(approve.body.data.status).toBe("APPROVED");

    const job2 = await apiA
      .post("/api/v1/imports/jobs")
      .set("Idempotency-Key", `job2-${createId()}`)
      .send({ ...createBody, displayName: "Cancel candidate" });
    const job2Id = job2.body.data.id as string;
    await apiA
      .put(`/api/v1/imports/jobs/${job2Id}/mappings`)
      .set("Idempotency-Key", `map2-${createId()}`)
      .send({ mappings: [{ sourceColumn: "a", targetField: "b" }] });
    const cancel = await apiA
      .post(`/api/v1/imports/jobs/${job2Id}/cancel`)
      .set("Idempotency-Key", `cancel-${createId()}`)
      .send({});
    expect(cancel.status).toBe(201);
    expect(cancel.body.data.status).toBe("CANCELLED");

    const profile = await apiA
      .post("/api/v1/imports/profiles")
      .set("Idempotency-Key", `profile-${createId()}`)
      .send({
        profileKey: `s2-profile-${createId().slice(0, 8)}`,
        displayName: "S2 profile",
        productKey: "FORGE_RMS",
        moduleKey: "CORE",
        recordCategory: "generic_record",
        sourceType: "csv",
      });
    expect(profile.status).toBe(201);
    const profileId = profile.body.data.id as string;

    const crossProfile = await apiB.get(`/api/v1/imports/profiles/${profileId}`);
    expect(crossProfile.status).toBe(404);

    const archive = await apiA
      .post(`/api/v1/imports/profiles/${profileId}/archive`)
      .set("Idempotency-Key", `arch-${createId()}`)
      .send({});
    expect(archive.status).toBe(201);
    expect(archive.body.data.archivedAt).toBeTruthy();

    const restore = await apiA
      .post(`/api/v1/imports/profiles/${profileId}/restore`)
      .set("Idempotency-Key", `rest-${createId()}`)
      .send({});
    expect(restore.status).toBe(201);
    expect(restore.body.data.archivedAt).toBeNull();

    const templates = await apiA.get("/api/v1/imports/templates");
    expect(templates.status).toBe(200);
    expect(templates.body.data.items.length).toBeGreaterThan(0);

    const template = await apiA.get("/api/v1/imports/templates/generic.records.v1");
    expect(template.status).toBe(200);
    expect(template.body.data.templateKey).toBe("generic.records.v1");

    const unauth = await harness.request().get("/api/v1/imports/jobs");
    expect(unauth.status).toBe(401);

    const noEntitlementTenant = await harness.createTenant({
      productCodes: ["FORGE_ACADEMY"],
      moduleCodes: ["CORE"],
    });
    const noEntUser = await harness.createUser({
      tenantId: noEntitlementTenant.tenantId,
      email: `import-noent-${createId()}@example.test`,
      roleCode: "IMPORT_OPERATOR",
      rolePermissions: IMPORT_PERMS,
      productCodes: ["FORGE_ACADEMY"],
      moduleCodes: ["CORE"],
    });
    const deniedEnt = await harness
      .api(noEntUser.userId, noEntitlementTenant.tenantId)
      .post("/api/v1/imports/jobs")
      .set("Idempotency-Key", `noent-${createId()}`)
      .send(createBody);
    expect(deniedEnt.status).toBe(403);
    expect(deniedEnt.body.error.code).toBe("IMPORT_ENTITLEMENT_REQUIRED");

    // Regression smoke: health remains available
    const health = await harness.request().get("/health");
    expect(health.status).toBe(200);
  }, 180_000);
});

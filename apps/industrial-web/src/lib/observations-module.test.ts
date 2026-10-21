import { describe, expect, it } from "vitest";
import {
  departmentSupervisor,
  emptyObservationForm,
  sameAssignee,
  splitEmailList,
  mapObservationRecord,
  normalizeObservationStatus,
  normalizeObservationType,
  observationCategoryOptions,
  observationFormFromRecord,
  observationPayloadFromForm,
  validateObservationForm,
  followUpMissing,
  followUpPayload,
  isPositiveObservationType,
  mapObservationFollowUp,
  observedPersonAtFault,
} from "./observations-module";

describe("observations module", () => {
  it("defaults at-fault from the type and keeps explicit flags", () => {
    const record = mapObservationRecord({
      id: "1",
      peopleObserved: [{ personnelId: "p1", name: "Jane", atFault: false }, { name: "Bob" }],
    });
    const [jane, bob] = record.peopleObserved;
    expect(jane).toEqual({ personnelId: "p1", name: "Jane", atFault: false });
    expect(observedPersonAtFault(bob!, "UNSAFE_BEHAVIOR")).toBe(true);
    expect(observedPersonAtFault(jane!, "UNSAFE_BEHAVIOR")).toBe(false);
    expect(observedPersonAtFault({ ...bob!, atFault: true }, "SAFE_BEHAVIOR")).toBe(false);
    expect(isPositiveObservationType("GOOD_CATCH")).toBe(true);
  });

  it("maps follow-up data and checks the close-out requirements", () => {
    const record = mapObservationRecord({
      id: "1",
      followUp: { correctiveAction: " Fixed guard ", completedAt: "2026-01-02T00:00:00Z" },
    });
    expect(record.followUp.correctiveAction).toBe("Fixed guard");
    expect(record.followUpCompletedAt).toBe("2026-01-02T00:00:00Z");
    expect(mapObservationRecord({ id: "2", followUpSavedAt: "t" }).followUpSavedAt).toBe("t");

    const f = mapObservationFollowUp({ correctiveAction: "Fixed", completedDate: "2026-01-02" });
    expect(followUpMissing(f)).toMatch(/name/i);
    const done = { ...f, completedByName: "Pat", signatureDataUrl: "data:image/png;base64,S" };
    expect(followUpMissing(done)).toBeNull();
    expect(followUpPayload(done)).not.toHaveProperty("completedAt");
  });

  it("maps legacy Field values onto the structured options", () => {
    expect(normalizeObservationType("SAFE")).toBe("SAFE_BEHAVIOR");
    expect(normalizeObservationType("unsafe")).toBe("UNSAFE_BEHAVIOR");
    expect(normalizeObservationType("Near miss")).toBe("NEAR_MISS");
    expect(normalizeObservationType("bogus")).toBe("");
    expect(normalizeObservationStatus("ACTIVE")).toBe("OPEN");
    expect(normalizeObservationStatus("in progress")).toBe("IN_PROGRESS");
    expect(normalizeObservationStatus("")).toBe("OPEN");
  });

  it("keeps a removed category selectable on records that use it", () => {
    expect(observationCategoryOptions(["PPE"], "Legacy")).toEqual(["PPE", "Legacy"]);
    expect(observationCategoryOptions(["PPE"], "ppe")).toEqual(["PPE"]);
  });

  it("reads a Field observation and round-trips it through the form", () => {
    const record = mapObservationRecord({
      id: "abc",
      status: "ACTIVE",
      observationType: "UNSAFE",
      category: "PPE",
      description: "No gloves at the slicer",
      riskLevel: "moderate",
      location: "Main Plant",
      siteId: "site-1",
      photoCount: 2,
      peopleObserved: [{ personnelId: "p1", name: "Sam Lee" }, "Visitor Ann"],
      createdAt: "2026-10-01T15:00:00.000Z",
    });
    expect(record.status).toBe("OPEN");
    expect(record.observationType).toBe("UNSAFE_BEHAVIOR");
    expect(record.riskLevel).toBe("medium");
    expect(record.siteName).toBe("Main Plant");
    expect(record.photoCount).toBe(2);
    expect(record.peopleObserved).toEqual([
      { personnelId: "p1", name: "Sam Lee" },
      { personnelId: null, name: "Visitor Ann" },
    ]);

    const payload = observationPayloadFromForm(observationFormFromRecord(record));
    expect(payload).toMatchObject({
      observationType: "UNSAFE_BEHAVIOR",
      category: "PPE",
      riskLevel: "medium",
      status: "OPEN",
      siteId: "site-1",
      location: "Main Plant",
    });
    expect(new Date(String(payload.observedAt)).toISOString()).toBe("2026-10-01T15:00:00.000Z");
  });

  it("treats the department contact as its supervisor", () => {
    expect(departmentSupervisor(null)).toBeNull();
    expect(departmentSupervisor({ contactName: "", contactPersonnelId: null })).toBeNull();
    const boss = departmentSupervisor({ contactPersonnelId: "p9", contactName: "Pat Boss", contactEmail: "pat@x.com" });
    expect(boss).toEqual({ personnelId: "p9", name: "Pat Boss", email: "pat@x.com" });

    const form = emptyObservationForm();
    expect(sameAssignee(form, null)).toBe(true);
    expect(sameAssignee(form, boss)).toBe(false);
    form.assignedToPersonnelId = "p9";
    form.assignedToName = "Pat";
    expect(sameAssignee(form, boss)).toBe(true);
    expect(sameAssignee({ assignedToPersonnelId: "", assignedToName: "pat boss" }, { personnelId: "", name: "Pat Boss", email: "" })).toBe(true);
  });

  it("sends the assignee with the payload and validates its email", () => {
    const form = emptyObservationForm();
    Object.assign(form, {
      observationType: "HAZARD",
      category: "Electrical",
      description: "Exposed wiring",
      riskLevel: "high",
      assignedToName: "Pat Boss",
      assignedToEmail: "nope",
    });
    expect(validateObservationForm(form)).toMatch(/email/i);
    form.assignedToEmail = "pat@x.com";
    expect(validateObservationForm(form)).toBeNull();
    expect(observationPayloadFromForm(form)).toMatchObject({
      assignedToPersonnelId: null,
      assignedToName: "Pat Boss",
      assignedToEmail: "pat@x.com",
    });
    expect(splitEmailList("a@x.com; b@x.com ,c@x.com")).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });

  it("requires type, category, description and risk", () => {
    const form = emptyObservationForm();
    expect(validateObservationForm(form)).toMatch(/type/i);
    form.observationType = "HAZARD";
    expect(validateObservationForm(form)).toMatch(/category/i);
    form.category = "Electrical";
    expect(validateObservationForm(form)).toMatch(/describe/i);
    form.description = "Exposed wiring";
    expect(validateObservationForm(form)).toMatch(/risk/i);
    form.riskLevel = "high";
    expect(validateObservationForm(form)).toBeNull();
  });
});

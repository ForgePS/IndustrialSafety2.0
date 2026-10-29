import { describe, expect, it } from "vitest";
import {
  DEFAULT_OBSERVATION_CATEGORIES,
  addObservationFollowUpToken,
  appendObservationEmailLog,
  applyObservedPeopleFault,
  computeObservationScoreImpact,
  observedPersonAtFault,
  observedPersonKey,
  createObservationFollowUpToken,
  normalizeObservationFollowUp,
  observationFollowUpMissing,
  observationFollowUpTokenValid,
  parseObservationFollowUpToken,
  buildObservationEmail,
  buildObservationTitle,
  normalizeObservationRecipients,
  observationAssigneeKey,
  normalizeObservationCategories,
  normalizeObservationPhotos,
  normalizeObservationRiskLevel,
  normalizeObservationStatus,
  normalizeObservationType,
  normalizeObservedPeople,
  observationFieldsFromBody,
  observationStatusFilterValues,
  parseObservationsSettings,
} from "./observations-helpers.js";

describe("observations helpers", () => {
  it("expands a status filter to the legacy values stored for it", () => {
    const open = observationStatusFilterValues("open");
    expect(open).toContain("OPEN");
    expect(open).toContain("ACTIVE");
    expect(open).not.toContain("CLOSED");
    expect(observationStatusFilterValues("CLOSED")).toContain("COMPLETED");
    expect(observationStatusFilterValues("ARCHIVED")).toEqual(["ARCHIVED", "archived"]);
  });

  it("maps legacy Field types onto the new observation types", () => {
    expect(normalizeObservationType("SAFE")).toBe("SAFE_BEHAVIOR");
    expect(normalizeObservationType("UNSAFE")).toBe("UNSAFE_BEHAVIOR");
    expect(normalizeObservationType("HAZARD")).toBe("HAZARD");
    expect(normalizeObservationType("near miss")).toBe("NEAR_MISS");
    expect(normalizeObservationType("Good catch")).toBe("GOOD_CATCH");
    expect(normalizeObservationType("whatever")).toBe("");
  });

  it("limits status to Open, In progress, Closed, Archived", () => {
    expect(normalizeObservationStatus("ACTIVE")).toBe("OPEN");
    expect(normalizeObservationStatus("open")).toBe("OPEN");
    expect(normalizeObservationStatus("in progress")).toBe("IN_PROGRESS");
    expect(normalizeObservationStatus("COMPLETED")).toBe("CLOSED");
    expect(normalizeObservationStatus("ARCHIVED")).toBe("ARCHIVED");
    expect(normalizeObservationStatus(undefined)).toBe("OPEN");
  });

  it("normalizes risk levels", () => {
    expect(normalizeObservationRiskLevel("High")).toBe("high");
    expect(normalizeObservationRiskLevel("moderate")).toBe("medium");
    expect(normalizeObservationRiskLevel("??")).toBe("");
  });

  it("defaults categories to the standard list until a tenant saves one", () => {
    expect(parseObservationsSettings(null).categories).toEqual([...DEFAULT_OBSERVATION_CATEGORIES]);
    expect(parseObservationsSettings({ categories: [] }).categories).toEqual([]);
    expect(normalizeObservationCategories([" PPE ", "ppe", "", "Dust  control"])).toEqual([
      "PPE",
      "Dust control",
    ]);
  });

  it("de-duplicates observed people and drops empties", () => {
    expect(
      normalizeObservedPeople([
        { personnelId: "p1", name: "Jane Doe" },
        { personnelId: "p1", name: "Jane Doe" },
        { name: "Visitor Bob" },
        "Contractor Al",
        { name: "" },
      ]),
    ).toEqual([
      { personnelId: "p1", name: "Jane Doe" },
      { personnelId: null, name: "Visitor Bob" },
      { personnelId: null, name: "Contractor Al" },
    ]);
  });

  it("keeps only image data-URL photos", () => {
    const photos = normalizeObservationPhotos([
      { id: "a", dataUrl: "data:image/jpeg;base64,AAA", hasMarkup: true },
      { id: "b", dataUrl: "https://example.com/x.jpg" },
      null,
    ]);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ id: "a", hasMarkup: true, contentType: "image/jpeg" });
  });

  it("builds a readable title", () => {
    expect(
      buildObservationTitle({
        observationType: "UNSAFE",
        category: "PPE",
        description: "No safety glasses at grinder\nsecond line",
      }),
    ).toBe("Unsafe behavior · PPE: No safety glasses at grinder");
    expect(buildObservationTitle({ title: "Field title", description: "x" })).toBe("Field title");
    expect(buildObservationTitle({})).toBe("Observation");
  });

  it("returns only fields present in the body", () => {
    expect(observationFieldsFromBody({ category: " PPE ", riskLevel: "Moderate" })).toEqual({
      category: "PPE",
      riskLevel: "medium",
    });
  });

  it("normalizes the assigned supervisor fields", () => {
    expect(
      observationFieldsFromBody({
        assignedToPersonnelId: "",
        assignedToName: "  Pat Boss ",
        assignedToEmail: "not-an-email",
      }),
    ).toEqual({ assignedToPersonnelId: null, assignedToName: "Pat Boss", assignedToEmail: "" });
    expect(observationFieldsFromBody({ assignedToEmail: " Pat@Example.COM " })).toEqual({
      assignedToEmail: "pat@example.com",
    });
  });

  it("parses recipient lists and detects assignee changes", () => {
    expect(normalizeObservationRecipients("a@x.com; b@x.com, a@x.com bad")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
    expect(normalizeObservationRecipients(undefined)).toEqual([]);
    expect(observationAssigneeKey({ assignedToPersonnelId: "p1", assignedToName: "A" })).toBe(
      observationAssigneeKey({ assignedToPersonnelId: "p1", assignedToName: "Renamed" }),
    );
    expect(observationAssigneeKey({ assignedToName: "Pat" })).not.toBe(observationAssigneeKey({}));
  });

  it("caps the email log", () => {
    const entry = {
      to: ["a@x.com"],
      sentAt: "t",
      sentByUserId: null,
      sentByName: "Me",
      accepted: true,
    };
    let payload: Record<string, unknown> = {};
    for (let i = 0; i < 60; i += 1)
      payload = { emailLog: appendObservationEmailLog(payload, entry) };
    expect((payload.emailLog as unknown[]).length).toBe(50);
  });

  it("builds an escaped supervisor email with a link back to the record", () => {
    const email = buildObservationEmail({
      tenantName: "Acme",
      status: "ACTIVE",
      payload: {
        observationType: "UNSAFE",
        category: "PPE",
        riskLevel: "high",
        description: "No gloves <script>",
        siteName: "Main",
        departmentName: "Packaging",
        assignedToName: "Pat Boss",
        photos: [{}, {}],
      },
      link: "https://acme.forgeindustrialsafety.com/modules/observations/?id=1",
      senderName: "Jo",
      message: "Please follow up",
    });
    expect(email.subject).toBe("[High risk] Unsafe behavior - PPE (Main · Packaging) - Acme");
    expect(email.htmlBody).toContain("No gloves &lt;script&gt;");
    expect(email.htmlBody).not.toContain("<script>");
    expect(email.htmlBody).toContain("assigned to Pat Boss");
    expect(email.htmlBody).toContain("2 attached");
    expect(email.htmlBody).toContain("Open</td>");
    expect(email.textBody).toContain("Please follow up");
    expect(email.textBody).toContain(
      "https://acme.forgeindustrialsafety.com/modules/observations/?id=1",
    );
  });

  it("puts the no-login follow-up form first when a follow-up link is given", () => {
    const email = buildObservationEmail({
      tenantName: "Acme",
      status: "OPEN",
      payload: { observationType: "HAZARD", description: "Spill" },
      link: "https://acme.forgeindustrialsafety.com/modules/observations/?id=1",
      followUpLink: "https://acme.forgeindustrialsafety.com/observation-followup/?token=t",
      senderName: "Jo",
    });
    expect(email.htmlBody).toContain("Complete follow-up form");
    expect(email.htmlBody).toContain("observation-followup/?token=t");
    expect(email.textBody).toContain("observation-followup/?token=t");
  });

  it("creates follow-up tokens that resolve to the tenant and expire", () => {
    const tenantId = "11111111-2222-3333-4444-555555555555";
    const { token, hash } = createObservationFollowUpToken(tenantId);
    expect(parseObservationFollowUpToken(token)).toEqual({ tenantId, hash });
    expect(parseObservationFollowUpToken("garbage")).toBeNull();
    expect(parseObservationFollowUpToken(`${tenantId}.short`)).toBeNull();

    const now = new Date("2026-01-01T00:00:00Z");
    const payload = { followUpTokens: addObservationFollowUpToken({}, hash, now) };
    expect(observationFollowUpTokenValid(payload, hash, now)).toBe(true);
    expect(observationFollowUpTokenValid(payload, "other", now)).toBe(false);
    expect(observationFollowUpTokenValid(payload, hash, new Date("2026-06-01T00:00:00Z"))).toBe(
      false,
    );

    let many: Record<string, unknown> = {};
    for (let i = 0; i < 15; i += 1)
      many = { followUpTokens: addObservationFollowUpToken(many, `h${i}`, now) };
    expect((many.followUpTokens as unknown[]).length).toBe(10);
  });

  it("defaults fault from the observation type and honors explicit flags", () => {
    const [jane, bob] = normalizeObservedPeople([
      { personnelId: "p1", name: "Jane", atFault: false },
      { name: "Bob" },
    ]);
    expect(bob).toEqual({ personnelId: null, name: "Bob" });
    expect(observedPersonAtFault(bob!, "UNSAFE")).toBe(true);
    expect(observedPersonAtFault(bob!, "HAZARD")).toBe(false);
    expect(observedPersonAtFault(jane!, "UNSAFE_BEHAVIOR")).toBe(false);
    expect(observedPersonAtFault({ ...bob!, atFault: true }, "GOOD_CATCH")).toBe(false);
    expect(observedPersonAtFault({ ...bob!, atFault: true }, "NEAR_MISS")).toBe(true);

    const toggled = applyObservedPeopleFault(
      [jane!, bob!],
      [
        { key: "p1", atFault: true },
        { key: observedPersonKey(bob!), atFault: false },
        { key: "missing", atFault: true },
      ],
    );
    expect(toggled.map((p) => p.atFault)).toEqual([true, false]);
  });

  it("deducts by risk, restores half on close and steps back over clean time", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
    const fresh = computeObservationScoreImpact({
      unsafe: [
        { riskLevel: "critical", status: "OPEN", at: daysAgo(2) },
        { riskLevel: "high", status: "CLOSED", at: daysAgo(10) },
        { riskLevel: "", status: "OPEN", at: daysAgo(5) },
        { riskLevel: "medium", status: "ARCHIVED", at: daysAgo(1) },
      ],
      positiveCount: 8,
      now,
    });
    expect(fresh).toMatchObject({
      deduction: 14,
      credit: 5,
      unsafeCount: 3,
      unsafeOpen: 2,
      daysClean: 2,
      recoveryStep: 0,
    });

    const one = [{ riskLevel: "high", status: "OPEN", at: daysAgo(45) }];
    expect(computeObservationScoreImpact({ unsafe: one, positiveCount: 0, now })).toMatchObject({
      deduction: 4,
      recoveryStep: 1,
    });
    expect(
      computeObservationScoreImpact({
        unsafe: [{ ...one[0]!, at: daysAgo(70) }],
        positiveCount: 0,
        now,
      }).deduction,
    ).toBe(2);
    expect(
      computeObservationScoreImpact({
        unsafe: [{ ...one[0]!, at: daysAgo(95) }],
        positiveCount: 0,
        now,
      }).deduction,
    ).toBe(0);
    // A newer incident restarts the clean-time clock.
    expect(
      computeObservationScoreImpact({
        unsafe: [{ ...one[0]!, at: daysAgo(95) }],
        positiveCount: 0,
        incidentDates: [daysAgo(3)],
        now,
      }),
    ).toMatchObject({ deduction: 6, daysClean: 3, recoveryStep: 0 });
  });

  it("merges follow-up edits and requires the close-out fields", () => {
    const first = normalizeObservationFollowUp({
      rootCause: "PPE not used",
      correctiveAction: " Coached on glasses ",
      employeeCoached: "YES",
      completedDate: "not a date",
      signatureDataUrl: "javascript:alert(1)",
      afterPhotos: [{ dataUrl: "data:image/png;base64,AAA" }],
    });
    expect(first.correctiveAction).toBe("Coached on glasses");
    expect(first.employeeCoached).toBe("yes");
    expect(first.completedDate).toBe("");
    expect(first.signatureDataUrl).toBe("");
    expect(first.afterPhotos).toHaveLength(1);
    expect(observationFollowUpMissing(first)).toMatch(/date/i);

    const merged = normalizeObservationFollowUp(
      {
        completedDate: "2026-01-02",
        completedByName: "Pat",
        signatureDataUrl: "data:image/png;base64,S",
      },
      { ...first, savedAt: "2026-01-01T00:00:00Z" },
    );
    expect(merged.correctiveAction).toBe("Coached on glasses");
    expect(merged.savedAt).toBe("2026-01-01T00:00:00Z");
    expect(observationFollowUpMissing(merged)).toBeNull();
  });
});

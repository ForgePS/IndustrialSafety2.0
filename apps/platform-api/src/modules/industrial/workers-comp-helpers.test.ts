import { describe, expect, it } from "vitest";
import {
  hydrateWorkersCompFromSource,
  mergeWorkersCompClaimSummary,
  parseWorkersCompClaimSummary,
  resolveWorkersCompCaseNumber,
  syncWorkersCompClaimNumber,
  unwrapWorkersCompSourcePayload,
  canViewWorkersCompMedical,
  canManageWorkersCompMedical,
  canEditWorkersCompAuthoredNote,
  buildWorkersCompWeeklyStatusEmail,
  incidentNarrativeFromPayload,
  summarizeIncidentNarrative,
  normalizeEmailRecipients,
  parseWorkersCompWeeklyStatusSettings,
  deriveOshaOutcomeFromWorkersComp,
  normalizeWcCaseStatus,
  oshaPayloadFromWorkersComp,
  parseWorkersCompOshaLinkage,
  thursdayWeekOf,
  weeklyUpdateRowStatus,
  normalizeThursdayWeekOf,
  normalizeWorkersCompWorkerKey,
  workersCompInjuryDateKey,
  WC_WEEKLY_STATUS_REPORT_COLUMNS,
  workersCompWeeklyStatusReportRows,
  incidentPlaceFromPayload,
  resolveWorkersCompReportLocation,
  sortWorkersCompWeeklyStatusCases,
  looksLikeBodyPartText,
} from "./workers-comp-helpers.js";

describe("sortWorkersCompWeeklyStatusCases", () => {
  it("orders cases oldest injury first, undated last", () => {
    const sorted = sortWorkersCompWeeklyStatusCases([
      { workerName: "Newest", claimSummary: { dateOfInjury: "2026-09-30" } },
      { workerName: "No date" },
      { workerName: "Oldest", claimSummary: { dateOfInjury: "01/15/2025" } },
      { workerName: "Middle", reportedAt: "2026-03-02T14:00:00.000Z" },
    ]);
    expect(sorted.map((row) => row.workerName)).toEqual(["Oldest", "Middle", "Newest", "No date"]);
  });
});

describe("workers-comp-helpers", () => {
  it("never uses body-part text as the weekly report location", () => {
    const incidentPayload = {
      location: "Hand, Wrist",
      bodyParts: "Hand, Wrist",
      bodyLocations: ["right-hand", "right-wrist"],
      departmentName: "Packaging",
      community: "Bagging Line",
    };
    expect(
      resolveWorkersCompReportLocation({
        locationText: "Hand, Wrist",
        claimBodyParts: "Hand, Wrist",
        incidentPayload,
        incidentTitle: "26-09-14   Jane Doe - Packaging - Bagging Line",
      }),
    ).toBe("Packaging - Bagging Line");
    expect(
      resolveWorkersCompReportLocation({
        locationText: "Dryer building",
        claimBodyParts: "Hand, Wrist",
        incidentPayload,
      }),
    ).toBe("Dryer building");
    expect(resolveWorkersCompReportLocation({ locationText: "Knee", claimBodyParts: "Knee" })).toBe(
      "",
    );
    expect(
      incidentPlaceFromPayload(
        { location: "Back", bodyParts: "Back" },
        "26-08-22   Robert Drotar - Warehouse",
      ),
    ).toBe("Warehouse");
    expect(incidentPlaceFromPayload({ location: "Stuttgart", bodyParts: "Back" })).toBe(
      "Stuttgart",
    );
    expect(
      resolveWorkersCompReportLocation({
        locationText: "Left hand / wrist",
        claimBodyParts: "Left Middle Finger",
        incidentPayload: {
          location: "Left hand / wrist",
          bodyLocations: ["left-hand-front"],
          departmentName: "13th Street",
          community: "6th Floor",
        },
      }),
    ).toBe("13th Street - 6th Floor");
    expect(
      resolveWorkersCompReportLocation({
        locationText: "PB Packing",
        claimBodyParts: "Right Thumb",
        incidentPayload: { location: "Right hand / wrist", bodyLocations: ["right-hand-front"] },
      }),
    ).toBe("PB Packing");
  });

  it("drops body-part wording from the location even when it does not match the claim", () => {
    expect(
      resolveWorkersCompReportLocation({
        locationText: "Right hand / wrist",
        claimBodyParts: "Right Thumb",
      }),
    ).toBe("");
    expect(
      resolveWorkersCompReportLocation({
        locationText: "Lower back",
        claimBodyParts: "Lumbar",
        incidentPayload: { departmentName: "Warehouse", community: "Dock 3" },
      }),
    ).toBe("Warehouse - Dock 3");
    expect(
      resolveWorkersCompReportLocation({
        locationText: "left-hand-front",
        casePayload: { intake: { departmentName: "Mill", community: "Line 2" } },
      }),
    ).toBe("Mill - Line 2");
    expect(
      resolveWorkersCompReportLocation({ locationText: "Back dock", claimBodyParts: "Knee" }),
    ).toBe("Back dock");
  });

  it("recognizes body-part text but not place names", () => {
    for (const text of [
      "Hand, Wrist",
      "L index finger",
      "Both knees",
      "Upper arm & shoulder",
      "Back",
    ]) {
      expect(looksLikeBodyPartText(text)).toBe(true);
    }
    for (const text of ["Back dock", "Head office", "Packaging - Bagging Line", "Middle bay", ""]) {
      expect(looksLikeBodyPartText(text)).toBe(false);
    }
  });

  it("maps weekly status cases to report rows matching the digest columns", () => {
    const rows = workersCompWeeklyStatusReportRows([
      {
        workerName: "Jane Doe",
        caseNumber: "",
        status: "RESTRICTED_DUTY",
        workflowStage: "Treatment",
        severity: "lost_time",
        claimSummary: { claimNumber: "WC-12", dateOfInjury: "2026-09-14", bodyParts: "Hand" },
        locationText: "Packaging - Bagging Line",
        daysAway: 2,
        restrictedDays: 5,
        weekOf: "2026-10-01",
        weeklyNotes: "",
        notes: "Follow-up Monday",
        incidentNarrative: "<p>Caught hand&nbsp;in roller</p>",
      },
      { workerName: "", reportedAt: "2026-09-20T12:00:00.000Z" },
    ]);
    expect(rows[0]).toEqual({
      workerName: "Jane Doe",
      caseNumber: "WC-12",
      status: "RESTRICTED_DUTY",
      workflowStage: "Treatment",
      severity: "Lost Time → Recordable (Days Away From Work)",
      dateOfInjury: "2026-09-14",
      bodyParts: "Hand",
      incidentSummary: "Caught hand in roller",
      location: "Packaging - Bagging Line",
      daysAway: 2,
      restrictedDays: 5,
      weekOf: "2026-10-01",
      weeklyNotes: "Follow-up Monday",
    });
    expect(rows[1]).toMatchObject({
      workerName: "Unknown worker",
      status: "OPEN",
      dateOfInjury: "2026-09-20",
      daysAway: 0,
    });
    expect(Object.keys(rows[0]!)).toEqual(WC_WEEKLY_STATUS_REPORT_COLUMNS.map((c) => c.key));
  });

  it("normalizes worker keys for duplicate detection", () => {
    expect(normalizeWorkersCompWorkerKey("  John   SMITH ")).toBe("john smith");
    expect(normalizeWorkersCompWorkerKey(null)).toBe("");
  });

  it("derives injury date keys from DOI, falling back to reportedAt", () => {
    expect(workersCompInjuryDateKey("2026-09-14", null)).toBe("2026-09-14");
    expect(workersCompInjuryDateKey("2026-09-14T08:30:00Z", null)).toBe("2026-09-14");
    expect(workersCompInjuryDateKey("", new Date("2026-09-15T12:00:00.000Z"))).toBe("2026-09-15");
    expect(workersCompInjuryDateKey("", null)).toBe("");
  });

  it("parses claim summary", () => {
    expect(parseWorkersCompClaimSummary(null).claimNumber).toBe("");
    expect(
      parseWorkersCompClaimSummary({
        claimNumber: " EHP0378 ",
        carrierName: "Example Carrier",
      }).claimNumber,
    ).toBe("EHP0378");
  });

  it("merges claim summary patches", () => {
    const merged = mergeWorkersCompClaimSummary(
      { claimNumber: "A", carrierName: "Old" },
      { carrierName: "New", adjuster: "Pat" },
    );
    expect(merged.claimNumber).toBe("A");
    expect(merged.carrierName).toBe("New");
    expect(merged.adjuster).toBe("Pat");
  });

  it("syncs claim number from case number only when case number is present", () => {
    expect(
      syncWorkersCompClaimNumber("EHP0378", parseWorkersCompClaimSummary({ claimNumber: "other" }))
        .claimNumber,
    ).toBe("EHP0378");
    expect(
      syncWorkersCompClaimNumber("", parseWorkersCompClaimSummary({ claimNumber: "" })).claimNumber,
    ).toBe("");
    expect(
      syncWorkersCompClaimNumber(null, parseWorkersCompClaimSummary({ claimNumber: "KEEP" }))
        .claimNumber,
    ).toBe("KEEP");
    expect(resolveWorkersCompCaseNumber({ claimSummary: { claimNumber: "EHP0378" } })).toBe(
      "EHP0378",
    );
    expect(resolveWorkersCompCaseNumber({})).toBeNull();
  });

  it("gates medical view/manage permissions", () => {
    expect(canViewWorkersCompMedical({ permissions: ["industrial.workers_comp.view"] })).toBe(
      false,
    );
    expect(
      canViewWorkersCompMedical({ permissions: ["industrial.workers_comp.medical.view"] }),
    ).toBe(true);
    expect(
      canManageWorkersCompMedical({ permissions: ["industrial.workers_comp.medical.view"] }),
    ).toBe(false);
    expect(
      canManageWorkersCompMedical({ permissions: ["industrial.workers_comp.medical.manage"] }),
    ).toBe(true);
    expect(canViewWorkersCompMedical({ isPlatformAdmin: true, permissions: [] })).toBe(true);
  });

  it("allows note edits only for the author (or admin / legacy)", () => {
    expect(
      canEditWorkersCompAuthoredNote({
        userId: "u1",
        createdByUserId: "u1",
        permissions: [],
        canManageResource: false,
      }),
    ).toBe(true);
    expect(
      canEditWorkersCompAuthoredNote({
        userId: "u1",
        createdByUserId: "u2",
        permissions: ["industrial.workers_comp.medical.manage"],
        canManageResource: true,
      }),
    ).toBe(false);
    expect(
      canEditWorkersCompAuthoredNote({
        userId: "u1",
        createdByUserId: "u2",
        permissions: ["industrial.admin"],
        canManageResource: false,
      }),
    ).toBe(true);
    expect(
      canEditWorkersCompAuthoredNote({
        userId: "u1",
        createdByUserId: null,
        permissions: [],
        canManageResource: true,
      }),
    ).toBe(true);
    expect(
      canEditWorkersCompAuthoredNote({
        userId: "u1",
        createdByUserId: null,
        permissions: [],
        canManageResource: false,
      }),
    ).toBe(false);
  });

  it("hydrates firebase workersCompCases payloads", () => {
    const doubleEncoded = {
      caseNumber: "WC-9",
      workStatus: "Restricted duty",
      nextAction: { label: "Need classification", dueDate: "2026-01-01" },
      personnelId: "p1",
    };
    expect(unwrapWorkersCompSourcePayload(JSON.stringify(doubleEncoded)).caseNumber).toBe("WC-9");
    const hydrated = hydrateWorkersCompFromSource({
      caseNumber: null,
      status: null,
      severity: null,
      workflowStage: null,
      daysAway: null,
      restrictedDays: null,
      claimSummary: {},
      sourcePayload: JSON.stringify(JSON.stringify(doubleEncoded)),
      reportedAt: null,
    });
    expect(hydrated.caseNumber).toBe("WC-9");
    expect(hydrated.status).toBe("ACTIVE");
    expect(hydrated.nextAction?.label).toContain("classification");
    expect(hydrated.firebasePersonnelId).toBe("p1");
  });

  it("prefers saved claim_summary over source_payload claim fields", () => {
    const hydrated = hydrateWorkersCompFromSource({
      caseNumber: "WC-SAVED",
      status: "OPEN",
      severity: null,
      workflowStage: "INTAKE",
      daysAway: null,
      restrictedDays: null,
      claimSummary: {
        claimNumber: "WC-SAVED",
        notes: "Updated clinical notes",
        bodyParts: "Left wrist",
        carrierName: "Saved Carrier",
      },
      sourcePayload: {
        caseNumber: "WC-OLD",
        claim: {
          claimNumber: "WC-OLD",
          notes: "Stale import notes",
          bodyParts: "Right hand",
          carrierName: "Import Carrier",
          adjuster: "Import Adjuster",
        },
      },
      reportedAt: null,
    });
    expect(hydrated.claimSummary.notes).toBe("Updated clinical notes");
    expect(hydrated.claimSummary.bodyParts).toBe("Left wrist");
    expect(hydrated.claimSummary.carrierName).toBe("Saved Carrier");
    // Empty saved fields still fill from source.
    expect(hydrated.claimSummary.adjuster).toBe("Import Adjuster");
  });
});

describe("workers-comp weekly status email", () => {
  it("normalizes and dedupes recipients", () => {
    expect(normalizeEmailRecipients(["a@x.com", " A@x.com ", "bad", "b@y.com", "a@x.com"])).toEqual(
      ["a@x.com", "b@y.com"],
    );
    expect(normalizeEmailRecipients("safety@co.com; ops@co.com\n safety@co.com")).toEqual([
      "safety@co.com",
      "ops@co.com",
    ]);
  });

  it("parses settings defaults", () => {
    expect(parseWorkersCompWeeklyStatusSettings(null)).toEqual({
      enabled: false,
      recipients: [],
      lastSentAt: null,
    });
    expect(
      parseWorkersCompWeeklyStatusSettings({
        enabled: true,
        recipients: ["Boss@Co.com"],
        lastSentAt: "2026-08-01T12:00:00.000Z",
      }),
    ).toEqual({
      enabled: true,
      recipients: ["boss@co.com"],
      lastSentAt: "2026-08-01T12:00:00.000Z",
    });
  });

  it("builds open-case digest email bodies", () => {
    const built = buildWorkersCompWeeklyStatusEmail({
      tenantName: "Producers Rice Mill",
      generatedAt: new Date("2026-08-28T15:00:00.000Z"),
      weekOf: "2026-08-27",
      cases: [
        {
          caseNumber: "WC-1",
          workerName: "Jane Doe",
          status: "RESTRICTED",
          workflowStage: "RETURN_TO_WORK",
          severity: "restricted",
          daysAway: 2,
          restrictedDays: 5,
          locationText: "Mill A",
          claimSummary: {
            claimNumber: "CL-9",
            carrierName: "Travelers",
            dateOfInjury: "2026-07-01",
            bodyParts: "Hand",
            carrierId: "",
            adjuster: "",
            notes: "",
            lostTimeStart: "",
            lostTimeEnd: "",
          },
          notes: "Legacy case note",
          weeklyNotes: "Follow up Friday",
          incidentNarrative: "<p>Caught hand in conveyor &amp; pinched fingers.</p>",
        },
      ],
    });
    expect(built.openCount).toBe(1);
    expect(built.subject).toContain("1 open");
    expect(built.textBody).toContain("Jane Doe");
    expect(built.textBody).toContain("Week of 2026-08-27");
    expect(built.textBody).toContain("Weekly notes: Follow up Friday");
    expect(built.textBody).toContain(
      "Incident summary: Caught hand in conveyor & pinched fingers.",
    );
    expect(built.htmlBody).toContain("<table");
    expect(built.htmlBody).toContain("Follow up Friday");
    expect(built.htmlBody).toContain("Weekly notes");
    expect(built.htmlBody).toContain("Caught hand in conveyor &amp; pinched fingers.");
    expect(built.htmlBody).toContain("<th>Status</th><th>Severity</th><th>Injury</th>");
    expect(built.htmlBody).toContain("<td>Active</td>");
    expect(built.textBody).toContain("Status: Active\n");
    for (const body of [built.textBody, built.htmlBody]) {
      expect(body).not.toContain("RETURN_TO_WORK");
      expect(body).not.toContain("Stage");
    }
    expect(built.htmlBody).toContain(
      "<td>Restricted<br/><small>Recordable (Job Transfer or Restriction)</small></td>",
    );
    expect(built.textBody).toContain(
      "Severity: Restricted - Recordable (Job Transfer or Restriction)",
    );
    for (const body of [built.textBody, built.htmlBody]) {
      expect(body).not.toContain("WC-1");
      expect(body).not.toContain("CL-9");
      expect(body).not.toContain("Travelers");
      expect(body).not.toContain("Carrier");
    }
    expect(built.htmlBody).not.toContain("<th>Case</th>");
  });

  it("summarizes long incident narratives at a word boundary", () => {
    const long = `Worker slipped on wet floor near the parboil bay ${"and continued working ".repeat(30)}`;
    const summary = summarizeIncidentNarrative(long, 80);
    expect(summary.length).toBeLessThanOrEqual(81);
    expect(summary.endsWith("…")).toBe(true);
    expect(summary.startsWith("Worker slipped on wet floor")).toBe(true);
    expect(summarizeIncidentNarrative("  Short  note ")).toBe("Short note");
  });

  it("reads incident narrative from incident or WC intake payloads", () => {
    expect(incidentNarrativeFromPayload({ description: "Fell from ladder" })).toBe(
      "Fell from ladder",
    );
    expect(incidentNarrativeFromPayload({ IncidentDescription: "Legacy text" })).toBe(
      "Legacy text",
    );
    expect(
      incidentNarrativeFromPayload(JSON.stringify({ intake: { injuryNarrative: "Burned arm" } })),
    ).toBe("Burned arm");
    expect(incidentNarrativeFromPayload(null)).toBe("");
  });

  it("falls back to case notes and flags missing weekly notes", () => {
    const built = buildWorkersCompWeeklyStatusEmail({
      tenantName: "Demo",
      weekOf: "2026-09-17",
      cases: [
        {
          caseNumber: "WC-2",
          workerName: "Sam",
          status: "OPEN",
          notes: "Intake only",
          weeklyNotes: "",
        },
      ],
    });
    expect(built.textBody).toContain("Missing weekly notes: 1");
    expect(built.textBody).toContain("Notes: Intake only");
    expect(built.htmlBody).toContain("Intake only");
  });

  it("handles empty open-case digest", () => {
    const built = buildWorkersCompWeeklyStatusEmail({
      tenantName: "Demo",
      cases: [],
      generatedAt: new Date("2026-08-28T15:00:00.000Z"),
    });
    expect(built.openCount).toBe(0);
    expect(built.textBody).toContain("no open");
  });

  it("limits case status to ACTIVE, CLOSED, ARCHIVED", () => {
    expect(normalizeWcCaseStatus("closed")).toBe("CLOSED");
    expect(normalizeWcCaseStatus("ARCHIVED")).toBe("ARCHIVED");
    for (const legacy of ["OPEN", "DRAFT", "RESTRICTED", "LOST_TIME", "", null, undefined]) {
      expect(normalizeWcCaseStatus(legacy)).toBe("ACTIVE");
    }
  });

  it("derives OSHA Form 300 outcome from WC days and severity", () => {
    expect(deriveOshaOutcomeFromWorkersComp({ daysAway: 3, restrictedDays: 0 })).toBe("DAYS_AWAY");
    expect(deriveOshaOutcomeFromWorkersComp({ daysAway: 0, restrictedDays: 5 })).toBe(
      "JOB_TRANSFER_RESTRICTION",
    );
    expect(
      deriveOshaOutcomeFromWorkersComp({
        daysAway: 0,
        restrictedDays: 0,
        severity: "fatality",
      }),
    ).toBe("DEATH");
    expect(deriveOshaOutcomeFromWorkersComp({ daysAway: 0, restrictedDays: 0 })).toBe(
      "OTHER_RECORDABLE",
    );
    expect(
      deriveOshaOutcomeFromWorkersComp({ daysAway: 0, restrictedDays: 0, severity: "lost_time" }),
    ).toBe("DAYS_AWAY");
    expect(
      deriveOshaOutcomeFromWorkersComp({ daysAway: 0, restrictedDays: 0, severity: "Restricted" }),
    ).toBe("JOB_TRANSFER_RESTRICTION");
    expect(
      deriveOshaOutcomeFromWorkersComp({ daysAway: 0, restrictedDays: 0, severity: "moderate" }),
    ).toBe("OTHER_RECORDABLE");
  });

  it("maps WC case fields into OSHA Form 300 payload", () => {
    const linkage = parseWorkersCompOshaLinkage({
      oshaRecordable: true,
      oshaJobTitle: "Welder",
      oshaIllnessCategory: "1",
    });
    const payload = oshaPayloadFromWorkersComp({
      workerName: "JIMMY J SANNER",
      locationText: "Parboil bay",
      notes: "",
      daysAway: 3,
      restrictedDays: 0,
      claimSummary: {
        carrierId: "",
        carrierName: "",
        claimNumber: "EHP1",
        adjuster: "",
        dateOfInjury: "2026-07-08",
        bodyParts: "Burn on forearm",
        notes: "",
        lostTimeStart: "",
        lostTimeEnd: "",
      },
      siteName: "Crowley",
      osha: linkage,
    });
    expect(payload.employeeName).toBe("JIMMY J SANNER");
    expect(payload.jobTitle).toBe("Welder");
    expect(payload.caseOutcome).toBe("DAYS_AWAY");
    expect(payload.illnessCategory).toBe("1");
    expect(payload.daysAway).toBe(3);
    expect(payload.establishment).toBe("Crowley");
  });
});

describe("workers-comp weekly update week key", () => {
  it("resolves Thursday for each weekday in the same week", () => {
    // Local dates: Sun 2026-09-13 .. Sat 2026-09-19 → Thursday 2026-09-17
    expect(thursdayWeekOf(new Date(2026, 8, 13))).toBe("2026-09-17");
    expect(thursdayWeekOf(new Date(2026, 8, 15))).toBe("2026-09-17");
    expect(thursdayWeekOf(new Date(2026, 8, 17))).toBe("2026-09-17");
    expect(thursdayWeekOf(new Date(2026, 8, 19))).toBe("2026-09-17");
  });

  it("normalizes arbitrary weekOf inputs to Thursday", () => {
    expect(normalizeThursdayWeekOf("2026-09-15")).toBe("2026-09-17");
    expect(normalizeThursdayWeekOf("")).toBe(thursdayWeekOf());
  });

  it("marks due before Thursday and overdue on/after", () => {
    expect(weeklyUpdateRowStatus("2026-09-17", true, new Date(2026, 8, 18))).toBe("complete");
    expect(weeklyUpdateRowStatus("2026-09-17", false, new Date(2026, 8, 15))).toBe("due");
    expect(weeklyUpdateRowStatus("2026-09-17", false, new Date(2026, 8, 17))).toBe("overdue");
    expect(weeklyUpdateRowStatus("2026-09-17", false, new Date(2026, 8, 18))).toBe("overdue");
  });
});

import { describe, expect, it } from "vitest";
import {
  applyPersonnelLinkToIncidentForm,
  buildIncidentCreatePayload,
  createDefaultLifecycle,
  createDefaultEvaluationChecklist,
  deriveIncidentTitle,
  emptyIncidentCreateForm,
  formatIncidentHireDateForInput,
  formatIncidentTitleDate,
  incidentRecordToCreateFormState,
  joinIncidentDateOccurred,
  ensureRootCauseAnalysis,
  incidentPlaceLocation,
  countUndatedIncidents,
  filterAndGroupIncidents,
  groupIncidentsByYear,
  incidentListYear,
  incidentMatchesSearch,
  incidentNeedsOccurrenceDate,
  incidentOccurrenceDate,
  incidentPrintFilename,
  splitIncidentDateOccurred,
  incidentReportDetailRows,
  INJURY_TYPE_OPTIONS,
  resolveIncidentTitleLocation,
  incidentSummaryTiles,
  incidentTabLabel,
  parseIncidentTab,
  parseIncidentWorkspaceTab,
  incidentReportHref,
  incidentWorkspaceHref,
  sortIncidentsByDate,
  sortIncidentsNumerically,
  suggestIncidentTitle,
  toIncidentRecord,
  toIncidentSummary,
  type IncidentRecord,
} from "./incidents-module";
import { cloneEmptyReasonableSuspicion } from "./reasonable-suspicion";

function stubIncident(overrides: Partial<IncidentRecord>): IncidentRecord {
  return {
    id: "id",
    title: "Untitled",
    status: "open",
    category: "injuries",
    severity: "",
    location: "",
    description: "",
    reportedBy: "",
    reportedByTitle: "",
    reportedByPhone: "",
    reportedByDate: "",
    createdAt: "",
    updatedAt: "",
    dateOccurred: "",
    personAffected: "",
    personnelId: "",
    incidentTypeName: "",
    division: "",
    community: "",
    witnessNames: "",
    departmentName: "",
    workDayDetails: "",
    submittedAt: "",
    injuriesFront: "",
    injuriesBack: "",
    bodyLocations: [],
    siteId: "",
    departmentId: "",
    locationDetail: "",
    hireDate: "",
    dateOfBirth: "",
    shiftStartTime: "",
    physicianName: "",
    treatmentFacility: "",
    treatmentStreet: "",
    treatmentCity: "",
    treatmentState: "",
    treatmentZip: "",
    treatedInEr: null,
    hospitalizedOvernight: null,
    completedBy: "",
    completedByTitle: "",
    completedByPhone: "",
    completedByDate: "",
    workersCompRelevant: false,
    workersCompNotes: "",
    workersCompCaseId: "",
    oshaCaseId: "",
    attachments: [],
    medicalRefusalAcknowledgment: null,
    reasonableSuspicion: null,
    drugAlcoholConsents: [],
    lifecycle: null,
    evaluationChecklist: null,
    rootCauseAnalysis: null,
    ...overrides,
  };
}

describe("incidents module helpers", () => {
  it("lists injury type picklist values for injury reports", () => {
    expect(INJURY_TYPE_OPTIONS[0]).toBe("No Injury");
    expect(INJURY_TYPE_OPTIONS).toContain("Cut / Laceration");
    expect(INJURY_TYPE_OPTIONS).toContain("Burn – Chemical");
    expect(INJURY_TYPE_OPTIONS.at(-1)).toBe("Other Injury");
    expect(INJURY_TYPE_OPTIONS).toHaveLength(39);
  });

  it("maps summary tiles and tabs including process tabs", () => {
    const summary = toIncidentSummary({
      injuries: 2,
      nearMisses: 5,
      medicalRefusals: 1,
      drugAlcohol: 2,
      propertyDamage: 0,
      automotive: 3,
      open: 4,
      inWorkflow: 1,
      evaluations: 0,
      rcas: 0,
      total: 13,
    });
    const tiles = incidentSummaryTiles(summary);
    expect(tiles).toHaveLength(10);
    expect(tiles.find((t) => t.id === "drug-alcohol")).toMatchObject({
      label: "Drug/Alcohol",
      value: 2,
      tab: "drug-alcohol",
    });
    expect(parseIncidentTab("drug-alcohol")).toBe("drug-alcohol");
    expect(parseIncidentWorkspaceTab("drug-alcohol")).toBe("drug-alcohol");
    expect(incidentReportHref({ id: "abc-123", category: "drug-alcohol" })).toBe(
      "/modules/incidents/?tab=drug-alcohol&incident=abc-123",
    );
    expect(tiles[0]).toMatchObject({
      label: "Injuries",
      value: 2,
      tab: "injuries",
      tone: "danger",
      icon: "bx-first-aid",
    });
    expect(tiles.find((t) => t.id === "open")?.tone).toBe("danger");
    expect(tiles.every((t) => t.icon.startsWith("bx-"))).toBe(true);
    expect(tiles.find((t) => t.id === "in-workflow")?.tab).toBe("incident-workflow");
    expect(tiles.find((t) => t.id === "evaluations")?.tab).toBe("evaluation-checklist");
    expect(tiles.find((t) => t.id === "rcas")?.tab).toBe("root-cause-analysis");
    expect(parseIncidentTab("near-misses")).toBe("near-misses");
    expect(parseIncidentWorkspaceTab("root-cause-analysis")).toBe("root-cause-analysis");
    expect(incidentTabLabel("medical-refusals")).toBe("Medical Refusals");
    expect(incidentTabLabel("incident-workflow")).toBe("Incident Workflow");
    expect(incidentReportHref({ id: "abc-123", category: "injuries" })).toBe(
      "/modules/incidents/?tab=injuries&incident=abc-123",
    );
    expect(incidentReportHref({ id: "abc-123", category: "near-misses" })).toBe(
      "/modules/incidents/?tab=near-misses&incident=abc-123",
    );
    expect(incidentReportHref({ id: "abc-123" })).toBe(
      "/modules/incidents/?tab=injuries&incident=abc-123",
    );
    expect(incidentWorkspaceHref("injuries", { incident: "abc-123" })).toBe(
      "/modules/incidents/?incident=abc-123",
    );
    expect(incidentWorkspaceHref("near-misses", { incident: "abc-123" })).toBe(
      "/modules/incidents/?tab=near-misses&incident=abc-123",
    );
    expect(incidentWorkspaceHref("body-map", { region: "head" })).toBe(
      "/modules/incidents/?tab=body-map&region=head",
    );
  });

  it("normalizes list rows and create payloads", () => {
    const record = toIncidentRecord({
      id: "i1",
      title: "Forklift near miss",
      status: "open",
      category: "near-misses",
      severity: "moderate",
      lifecycle: createDefaultLifecycle("Alex"),
      evaluationChecklist: createDefaultEvaluationChecklist(),
    });
    expect(record?.title).toBe("Forklift near miss");
    expect(record?.lifecycle?.steps).toHaveLength(7);
    expect(record?.evaluationChecklist?.items).toHaveLength(14);
    expect(ensureRootCauseAnalysis(record!).fiveWhys).toHaveLength(5);
    expect(ensureRootCauseAnalysis(record!).fiveWhyQuestions).toHaveLength(5);
    const legacy = toIncidentRecord({
      id: "i2",
      title: "Legacy RCA",
      status: "open",
      rootCauseAnalysis: { rootCause: "Worn guard", fiveWhys: ["Guard missing", "Not replaced"] },
    });
    const legacyRca = ensureRootCauseAnalysis(legacy!);
    expect(legacyRca.fiveWhys).toEqual(["Guard missing", "Not replaced", "", "", ""]);
    expect(legacyRca.fiveWhyQuestions).toEqual([
      'Why did "Legacy RCA" occur?',
      'Why did "Guard missing" happen?',
      'Why did "Not replaced" happen?',
      "Why did that happen?",
      "Why did that happen?",
    ]);
    const custom = toIncidentRecord({
      id: "i3",
      title: "Custom",
      status: "open",
      rootCauseAnalysis: { fiveWhys: ["A."], fiveWhyQuestions: ["My own question?"] },
    });
    expect(ensureRootCauseAnalysis(custom!).fiveWhyQuestions.slice(0, 2)).toEqual([
      "My own question?",
      'Why did "A" happen?',
    ]);
    const injury = toIncidentRecord({
      id: "i4",
      title: "26-09-14   Jane Doe - Packaging",
      status: "open",
      location: "Hand",
      bodyParts: "Hand",
      bodyLocations: ["right-hand"],
      departmentName: "Packaging",
    });
    expect(incidentPlaceLocation(injury!)).toBe("Packaging");
    expect(
      incidentPlaceLocation(
        toIncidentRecord({ id: "i5", title: "Spill", status: "open", location: "Dock 3" })!,
      ),
    ).toBe("Dock 3");
    expect(ensureRootCauseAnalysis(record!).fiveWhyQuestions[0]).toBe(
      'Why did "Forklift near miss" occur?',
    );
    expect(
      buildIncidentCreatePayload(
        {
          title: "  Slip  ",
          severity: "minor",
          location: "Dock",
          locationDetail: "",
          description: "",
          reportedBy: "",
          reportedByTitle: "",
          reportedByPhone: "",
          reportedByDate: "",
          dateOccurred: "",
          status: "open",
          personAffected: "Jane Doe",
          personnelId: "",
          witnessNames: "",
          correctiveActions: "",
          division: "Milling",
          community: "Dock 3",
          siteId: "",
          departmentId: "",
          incidentTypeName: "",
          hireDate: "",
          dateOfBirth: "",
          shiftStartTime: "",
          physicianName: "",
          treatmentFacility: "",
          treatmentStreet: "",
          treatmentCity: "",
          treatmentState: "",
          treatmentZip: "",
          treatedInEr: null,
          hospitalizedOvernight: null,
          completedBy: "",
          completedByTitle: "",
          completedByPhone: "",
          completedByDate: "",
          workersCompRelevant: false,
          workersCompNotes: "",
          medicalRefusalAcknowledgment: {
            confirmations: {
              voluntary: false,
              askedQuestions: false,
              understandsRisks: false,
              documentsDecision: false,
              mayRequestLater: false,
              doesNotWaiveRights: false,
            },
            servicesOffered: [],
            servicesOther: "",
            employeeDecision: "",
            employeeDecisionOther: "",
            employeeStatementAck: false,
            employeeSignature: "",
            employeeSignedAt: "",
            witnessName: "",
            witnessTitle: "",
            witnessSignature: "",
            witnessSignedAt: "",
            additionalComments: "",
          },
          reasonableSuspicion: cloneEmptyReasonableSuspicion(),
          drugAlcoholConsents: [],
        },
        "injuries",
      ),
    ).toMatchObject({
      title: "Slip",
      category: "injuries",
      personAffected: "Jane Doe",
      division: "Milling",
      community: "Dock 3",
    });

    expect(
      suggestIncidentTitle({
        dateOccurred: "2025-07-21T16:16",
        personAffected: "Jane Doe",
        location: "Parboil",
      }),
    ).toBe("25-07-21   Jane Doe - Parboil");

    expect(
      suggestIncidentTitle({
        dateOccurred: "2025-03-05",
        personAffected: "Jane Doe",
      }),
    ).toBe("25-03-05   Jane Doe");

    const blank = emptyIncidentCreateForm("Reporter");
    expect(blank.dateOccurred).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(blank.title).toBe(suggestIncidentTitle({ dateOccurred: blank.dateOccurred }));
    expect(blank.title.startsWith(formatIncidentTitleDate(blank.dateOccurred))).toBe(true);
    expect(blank.reportedBy).toBe("Reporter");

    expect(formatIncidentHireDateForInput("2024-03-04T00:00:00.000Z")).toBe("2024-03-04");
    expect(splitIncidentDateOccurred("2026-09-11T08:30")).toEqual({
      date: "2026-09-11",
      time: "08:30",
    });
    expect(joinIncidentDateOccurred("2026-09-11", "08:30")).toBe("2026-09-11T08:30");
    expect(joinIncidentDateOccurred("2026-09-11", "")).toBe("2026-09-11");
    expect(
      applyPersonnelLinkToIncidentForm(blank, {
        personnelId: "p1",
        displayName: "Alex Rivera",
        siteId: "site-1",
        siteLabel: "Stuttgart",
        divisionName: "Milling",
        departmentId: "dept-1",
        hireDate: "2022-06-15T12:00:00.000Z",
        dateOfBirth: "1990-01-20T00:00:00.000Z",
      }),
    ).toMatchObject({
      personnelId: "p1",
      personAffected: "Alex Rivera",
      siteId: "site-1",
      location: "Stuttgart",
      division: "Milling",
      departmentId: "dept-1",
      hireDate: "2022-06-15",
      dateOfBirth: "1990-01-20",
    });

    const editWithoutDate = incidentRecordToCreateFormState(
      stubIncident({
        title: "",
        dateOccurred: "",
        personAffected: "Alex",
        community: "Dock",
      }),
    );
    expect(editWithoutDate.dateOccurred).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(editWithoutDate.title).toBe(
      suggestIncidentTitle({
        dateOccurred: editWithoutDate.dateOccurred,
        personAffected: "Alex",
        location: "Dock",
      }),
    );

    const editKeepsTitle = incidentRecordToCreateFormState(
      stubIncident({
        title: "25-07-21   Jane Doe - Shipping",
        dateOccurred: "2025-07-21T16:16",
        personAffected: "Jane Doe",
      }),
    );
    expect(editKeepsTitle.title).toBe("25-07-21   Jane Doe - Shipping");
    expect(editKeepsTitle.dateOccurred).toBe("2025-07-21T16:16");

    expect(
      deriveIncidentTitle({
        title: "25-07-21 Londell Whitfield",
        dateOccurred: "07/21/2025 04:16 PM CDT",
        personAffected: "Londell Whitfield",
        community: "Shipping",
        location: "Producers Rice Mill, Inc.",
      }),
    ).toBe("25-07-21   Londell Whitfield - Shipping");

    expect(
      deriveIncidentTitle({
        title: "05-05-05 Mikhail Banks",
        dateOccurred: "05/05/2025 12:00 PM CDT",
        personAffected: "Mikhail Banks",
        community: "Old Shipping",
        location: "Producers Rice Mill, Inc.",
      }),
    ).toBe("25-05-05   Mikhail Banks - Old Shipping");

    expect(
      deriveIncidentTitle({
        title: "26-07-15   Robert Hall - Stuttgart",
        personAffected: "Robert Hall",
        community: "Machine Tech",
      }),
    ).toBe("26-07-15   Robert Hall - Stuttgart");

    expect(
      deriveIncidentTitle({
        title: "26/05/04 Don Baity - Greenville, MS",
      }),
    ).toBe("26-05-04   Don Baity - Greenville, MS");

    expect(
      deriveIncidentTitle({
        title: "26-07-24 Joe Frazier - WR Supply",
        personAffected: "Joe Frazier",
      }),
    ).toBe("26-07-24   Joe Frazier - WR Supply");

    expect(
      deriveIncidentTitle({
        title: "26/02/27 Oscar Curlett Jr.-Parboil Packing",
      }),
    ).toBe("26-02-27   Oscar Curlett Jr. - Parboil Packing");

    expect(
      toIncidentRecord({
        id: "i-title",
        title: "25-07-21 Londell Whitfield",
        status: "closed",
        PersonAffected: "Londell Whitfield",
        IncidentDateTime: "07/21/2025 04:16 PM CDT",
        Community: "Shipping",
        IncidentLocationName: "Producers Rice Mill, Inc.",
      })?.title,
    ).toBe("25-07-21   Londell Whitfield - Shipping");

    expect(
      buildIncidentCreatePayload(
        {
          ...emptyIncidentCreateForm(),
          title: "",
          dateOccurred: "2025-07-21T16:16",
          personAffected: "Jane Doe",
          location: "Producers Rice Mill, Inc.",
          community: "Shipping",
        },
        "injuries",
        ["head-front", "lower-back"],
        { departmentLabel: "Parboil" },
      ),
    ).toMatchObject({
      title: "25-07-21   Jane Doe - Parboil - Shipping",
      location: "Head, Lower back",
      bodyLocations: ["head-front", "lower-back"],
      injuriesFront: "Head",
      injuriesBack: "Lower back",
      InjuriesFront: "Head",
      InjuriesBack: "Lower back",
      bodyParts: "Head, Lower back",
    });

    expect(
      buildIncidentCreatePayload(
        {
          ...emptyIncidentCreateForm(),
          title: "",
          dateOccurred: "2025-07-21T16:16",
          personAffected: "Jane Doe",
          community: "Shipping",
        },
        "injuries",
        [],
      ),
    ).toMatchObject({
      title: "25-07-21   Jane Doe - Shipping",
    });

    expect(
      deriveIncidentTitle({
        title: "",
        dateOccurred: "2025-07-21",
        personAffected: "Jane Doe",
        departmentName: "Parboil",
        community: "Shipping",
      }),
    ).toBe("25-07-21   Jane Doe - Parboil - Shipping");

    // No area → department is last (and only) location token — not division/site.
    expect(
      resolveIncidentTitleLocation(
        {
          location: "Producers Rice Mill, Inc.",
          community: "",
          division: "Milling",
          locationDetail: "",
        },
        { departmentLabel: "Parboil", siteLabel: "Producers Rice Mill, Inc." },
      ),
    ).toBe("Parboil");

    expect(
      resolveIncidentTitleLocation(
        {
          location: "Producers Rice Mill, Inc.",
          community: "Shipping",
          division: "Milling",
          locationDetail: "",
        },
        { departmentLabel: "Parboil" },
      ),
    ).toBe("Parboil - Shipping");
  });

  it("reads Safety Incidents Detail source fields onto the report", () => {
    const record = toIncidentRecord({
      id: "i2",
      title: "25-07-21 Londell Whitfield",
      status: "closed",
      IncidentDescription: "UTV caught the door",
      PersonAffected: "Londell Whitfield",
      SubmittedBy: "Kiley McPherson",
      IncidentDateTime: "07/21/2025 04:16 PM CDT",
      Division: "Parboil",
      Community: "Shipping",
      IncidentTypeName: "General Liability",
      IncidentLocationName: "Producers Rice Mill, Inc.",
    });
    expect(record?.personAffected).toBe("Londell Whitfield");
    expect(record?.description).toBe("UTV caught the door");
    expect(record?.incidentTypeName).toBe("General Liability");
    expect(incidentReportDetailRows(record!).some((row) => row.label === "Division")).toBe(true);
  });

  it("persists linked personnelId on create/update payloads", () => {
    const linked = toIncidentRecord({
      id: "i-linked",
      personAffected: "Jane Doe",
      personnelId: "pers-123",
    });
    expect(linked?.personnelId).toBe("pers-123");
    expect(
      buildIncidentCreatePayload(
        {
          ...emptyIncidentCreateForm(),
          personAffected: "Jane Doe",
          personnelId: "pers-123",
        },
        "injuries",
      ),
    ).toMatchObject({
      personAffected: "Jane Doe",
      personnelId: "pers-123",
    });
    expect(incidentRecordToCreateFormState(linked!).personnelId).toBe("pers-123");
  });

  it("builds a safe printable download filename", () => {
    expect(
      incidentPrintFilename({
        id: "abc-12345678",
        title: "26-03-10 Alex - Mill / Dock",
      }),
    ).toBe("26-03-10-alex-mill-dock.html");
    expect(incidentPrintFilename({ id: "zzzzzzzz-zzzz", title: "   " })).toBe(
      "incident-zzzzzzzz.html",
    );
  });

  it("groups by year, sorts numerically, and matches search", () => {
    const older = stubIncident({
      id: "a",
      title: "24-03-10 Alice - Mill",
      dateOccurred: "2024-03-10",
      personAffected: "Alice",
      location: "Mill",
    });
    const newerSameYear = stubIncident({
      id: "b",
      title: "24-11-02 Bob - Dock",
      dateOccurred: "2024-11-02",
      personAffected: "Bob",
      location: "Dock",
    });
    const priorYear = stubIncident({
      id: "c",
      title: "23-01-05 Carol - Yard",
      dateOccurred: "2023-01-05",
      personAffected: "Carol",
      location: "Yard",
    });
    const undated = stubIncident({
      id: "d",
      title: "Freeform report",
      description: "forklift near miss",
    });

    expect(incidentOccurrenceDate(older)).toBe("2024-03-10");
    expect(incidentListYear(priorYear)).toBe(2023);
    expect(incidentListYear(undated)).toBeNull();

    const sorted = sortIncidentsNumerically([newerSameYear, undated, priorYear, older]);
    expect(sorted.map((row) => row.id)).toEqual(["c", "a", "b", "d"]);

    const newest = sortIncidentsByDate([newerSameYear, undated, priorYear, older], "newest");
    expect(newest.map((row) => row.id)).toEqual(["b", "a", "c", "d"]);

    const groupsNewest = groupIncidentsByYear(newest, "newest");
    expect(groupsNewest.map((g) => g.label)).toEqual(["2024", "2023", "Needs date"]);
    expect(groupsNewest[0]!.items.map((row) => row.id)).toEqual(["b", "a"]);

    const groupsOldest = filterAndGroupIncidents(
      [newerSameYear, undated, priorYear, older],
      "",
      "oldest",
    );
    expect(groupsOldest.map((g) => g.label)).toEqual(["2023", "2024", "Needs date"]);
    expect(groupsOldest[1]!.items.map((row) => row.id)).toEqual(["a", "b"]);

    const groups = groupIncidentsByYear(sorted);
    expect(groups.map((g) => g.label)).toEqual(["2024", "2023", "Needs date"]);
    expect(groups[0]!.items.map((row) => row.id)).toEqual(["a", "b"]);

    expect(incidentMatchesSearch(older, "alice mill")).toBe(true);
    expect(incidentMatchesSearch(older, "bob")).toBe(false);
    expect(incidentNeedsOccurrenceDate(undated)).toBe(true);
    expect(incidentNeedsOccurrenceDate(older)).toBe(false);
    expect(countUndatedIncidents(groups)).toBe(1);

    const filtered = filterAndGroupIncidents(
      [newerSameYear, undated, priorYear, older],
      "forklift",
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.label).toBe("Needs date");
    expect(filtered[0]!.items[0]!.id).toBe("d");
  });
});

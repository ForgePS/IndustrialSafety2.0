import { describe, expect, it } from "vitest";
import {
  form300ATotalsFromCases,
  hydrateOshaFromSource,
  mergeOshaCasePayloadFields,
  mergeOshaSeedPreferExisting,
  normalizeOshaCaseOutcome,
  normalizeOshaIllnessCategory,
  normalizeOshaRecordability,
  oshaFlagsFromRecordability,
  parseOshaForm300AMeta,
  readOshaForm300AMetaFromSitePayload,
  recordabilityFromFlags,
  seedForm301FieldsFromIncident,
  unwrapOshaSourcePayload,
  writeOshaForm300AMetaToSitePayload,
} from "./osha-helpers.js";

describe("osha-helpers", () => {
  it("unwraps double-encoded source payloads", () => {
    const nested = JSON.stringify({
      title: "26/07/08 Jimmy Sanner - Parboil Maint.",
      employeeName: "JIMMY J SANNER",
      injuryDate: "2026-07-08",
      recordabilityStatus: "PENDING",
    });
    expect(unwrapOshaSourcePayload(JSON.stringify(nested)).employeeName).toBe("JIMMY J SANNER");
  });

  it("normalizes recordability aliases", () => {
    expect(normalizeOshaRecordability("privacy case")).toBe("PRIVACY_CASE");
    expect(normalizeOshaRecordability("not-recordable")).toBe("NOT_RECORDABLE");
    expect(recordabilityFromFlags({ oshaRecordable: true })).toBe("RECORDABLE");
    expect(recordabilityFromFlags({ oshaRecordable: false })).toBe("NOT_RECORDABLE");
    expect(recordabilityFromFlags({ privacyCase: true })).toBe("PRIVACY_CASE");
    expect(oshaFlagsFromRecordability("PRIVACY_CASE")).toEqual({
      oshaRecordable: true,
      privacyCase: true,
    });
  });

  it("normalizes Form 300 outcome and illness categories", () => {
    expect(normalizeOshaCaseOutcome("H")).toBe("DAYS_AWAY");
    expect(normalizeOshaCaseOutcome("job transfer")).toBe("JOB_TRANSFER_RESTRICTION");
    expect(normalizeOshaIllnessCategory("hearing loss")).toBe("5");
    expect(normalizeOshaIllnessCategory(3)).toBe("3");
  });

  it("hydrates Firebase oshaCases fields (dateOfInjury, recordability, incidentTitle)", () => {
    const hydrated = hydrateOshaFromSource({
      title: null,
      sourcePayload: {
        incidentId: "JYurLMsrWiddmrQwDCgl",
        incidentTitle: "26/07/08 Jimmy Sanner - Parboil Maint.",
        employeeName: "JIMMY J SANNER",
        dateOfInjury: "2026-07-08",
        establishmentName: "Crowley",
        recordability: "pending",
        decidedBy: "",
        privacyCase: false,
        daysAway: 0,
        daysRestricted: 2,
        eventLocation: "Parboil maintenance bay",
        caseOutcome: "DAYS_AWAY",
        illnessCategory: "1",
        activityBefore: "Tightening a flange",
      },
      incident: {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        title: "26/07/08 Jimmy Sanner - Parboil Maint.",
      },
    });
    expect(hydrated.title).toContain("Jimmy Sanner");
    expect(hydrated.injuryDate).toBe("2026-07-08");
    expect(hydrated.establishment).toBe("Crowley");
    expect(hydrated.recordabilityStatus).toBe("PENDING");
    expect(hydrated.incidentId).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(hydrated.sourceIncidentId).toBe("JYurLMsrWiddmrQwDCgl");
    expect(hydrated.restrictedDays).toBe(2);
    expect(hydrated.eventLocation).toBe("Parboil maintenance bay");
    expect(hydrated.caseOutcome).toBe("DAYS_AWAY");
    expect(hydrated.illnessCategory).toBe("1");
    expect(hydrated.activityBefore).toBe("Tightening a flange");
  });

  it("merges whitelisted Form 300/301 payload fields", () => {
    const merged = mergeOshaCasePayloadFields(
      { employeeName: "A" },
      {
        caseOutcome: "DEATH",
        illnessCategory: "6",
        treatedInEr: true,
        timeCannotBeDetermined: "true",
        daysAway: "3",
        ignored: "nope",
      },
    );
    expect(merged.caseOutcome).toBe("DEATH");
    expect(merged.illnessCategory).toBe("6");
    expect(merged.treatedInEr).toBe(true);
    expect(merged.timeCannotBeDetermined).toBe(true);
    expect(merged.daysAway).toBe(3);
    expect(merged).not.toHaveProperty("ignored");
  });

  it("reads and writes Form 300A meta on site payload", () => {
    const written = writeOshaForm300AMetaToSitePayload(
      {},
      parseOshaForm300AMeta(
        {
          street: "1 Main",
          city: "Crowley",
          state: "LA",
          zip: "70526",
          naics: "311",
          annualAverageEmployees: 40,
          totalHoursWorked: 80000,
          companyExecutive: "Jane Doe",
        },
        2026,
        "Crowley Plant",
      ),
    );
    const read = readOshaForm300AMetaFromSitePayload(written, 2026, "Crowley Plant");
    expect(read.street).toBe("1 Main");
    expect(read.naics).toBe("311");
    expect(read.annualAverageEmployees).toBe(40);
    expect(read.companyExecutive).toBe("Jane Doe");
  });

  it("aggregates Form 300A totals from log cases", () => {
    const totals = form300ATotalsFromCases(
      [
        {
          recordabilityStatus: "RECORDABLE",
          calendarYear: 2026,
          caseOutcome: "DAYS_AWAY",
          daysAway: 5,
          restrictedDays: 0,
          illnessCategory: "1",
        },
        {
          recordabilityStatus: "PRIVACY_CASE",
          calendarYear: 2026,
          caseOutcome: "OTHER_RECORDABLE",
          daysAway: 0,
          restrictedDays: 2,
          illnessCategory: "5",
        },
        {
          recordabilityStatus: "PENDING",
          calendarYear: 2026,
          caseOutcome: "DEATH",
          daysAway: 0,
          restrictedDays: 0,
          illnessCategory: "1",
        },
      ],
      2026,
    );
    expect(totals.daysAwayCases).toBe(1);
    expect(totals.otherRecordableCases).toBe(1);
    expect(totals.deaths).toBe(0);
    expect(totals.daysAway).toBe(5);
    expect(totals.restrictedDays).toBe(2);
    expect(totals.injuries).toBe(1);
    expect(totals.hearingLoss).toBe(1);
  });

  it("seeds Form 301 lines 11 and 13 from incident Date occurred", () => {
    const seed = seedForm301FieldsFromIncident({
      incidentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      title: "Fracture",
      payload: {
        personAffected: "Taygen Wilson",
        dateOccurred: "2026-01-07T15:05",
        description: "Fracture",
      },
    });
    expect(seed.injuryDate).toBe("2026-01-07");
    expect(seed.timeOfEvent).toBe("3:05");
    expect(seed.timeOfEventAmPm).toBe("PM");
  });

  it("seeds Form 301 fields from an incident and linked personnel", () => {
    const seed = seedForm301FieldsFromIncident({
      incidentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      title: "Hand injury",
      payload: {
        personAffected: "JIMMY J SANNER",
        dateOccurred: "2026-07-08",
        dateOfBirth: "1988-01-15",
        hireDate: "2019-03-01",
        locationDetail: "Parboil bay",
        description: "Burn on forearm from acetylene torch",
        reportedBy: "Supervisor",
        personnelId: "11111111-2222-3333-4444-555555555555",
      },
      personnel: {
        id: "11111111-2222-3333-4444-555555555555",
        jobTitle: "Welder",
        street: "100 Main St",
        city: "Crowley",
        state: "LA",
        zip: "70526",
        gender: "MALE",
        phone: "337-555-0100",
      },
    });
    expect(seed.employeeName).toBe("JIMMY J SANNER");
    expect(seed.injuryDate).toBe("2026-07-08");
    expect(seed.dateOfBirth).toBe("1988-01-15");
    expect(seed.dateHired).toBe("2019-03-01");
    expect(seed.jobTitle).toBe("Welder");
    expect(seed.street).toBe("100 Main St");
    expect(seed.eventLocation).toBe("Parboil bay");
    expect(seed.injuryOrIllness).toBe("Burn on forearm from acetylene torch");
    expect(seed.whatHappened).toBe("Burn on forearm from acetylene torch");
    expect(seed.activityBefore).toBe("Working at Parboil bay");
    expect(seed.completedBy).toBe("Supervisor");

    const withCompleter = seedForm301FieldsFromIncident({
      incidentId: "inc-2",
      title: "Case",
      siteId: null,
      payload: {
        personAffected: "Worker",
        completedBy: "Preston Barnett",
        completedByTitle: "Safety Manager",
        completedByPhone: "337-555-0199",
        completedByDate: "2026-01-08",
      },
      person: null,
    });
    expect(withCompleter.completedBy).toBe("Preston Barnett");
    expect(withCompleter.completedByTitle).toBe("Safety Manager");
    expect(withCompleter.completedByPhone).toBe("337-555-0199");
    expect(withCompleter.completedByDate).toBe("2026-01-08");

    const merged = mergeOshaSeedPreferExisting(
      { employeeName: "Existing", street: "" },
      seed,
    );
    expect(merged.employeeName).toBe("Existing");
    expect(merged.street).toBe("100 Main St");
  });
});

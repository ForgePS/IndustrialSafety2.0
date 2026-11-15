import { describe, expect, it } from "vitest";
import {
  cloneEmptyDrugAlcoholIncident,
  drugAlcoholConsentsValidationMessage,
  drugAlcoholValidationMessage,
  newDrugAlcoholConsent,
  parseDrugAlcoholConsents,
  parseDrugAlcoholIncident,
} from "./drug-alcohol-incident";

describe("drug-alcohol-incident", () => {
  it("requires consent details when testing is flagged", () => {
    const blank = cloneEmptyDrugAlcoholIncident();
    expect(drugAlcoholValidationMessage(blank)).toBeNull();

    blank.testingRequired = true;
    expect(drugAlcoholValidationMessage(blank)).toMatch(/reason/i);

    blank.reason = "post-accident";
    expect(drugAlcoholValidationMessage(blank)).toMatch(/consent/i);
  });

  it("parses stored payload", () => {
    const parsed = parseDrugAlcoholIncident({
      testingRequired: true,
      reason: "reasonable-suspicion",
      testStatus: "ordered",
      substances: ["drug", "alcohol"],
      consent: { informed: true },
    });
    expect(parsed.testingRequired).toBe(true);
    expect(parsed.reason).toBe("reasonable-suspicion");
    expect(parsed.substances).toEqual(["drug", "alcohol"]);
    expect(parsed.consent.informed).toBe(true);
    expect(parsed.consent.voluntaryConsent).toBe(false);
  });

  it("reads multiple consent forms and keeps per-employee data", () => {
    const consents = parseDrugAlcoholConsents({
      drugAlcoholConsents: [
        { id: "a", employeeName: "Pat Lee", personnelId: "p1", testingRequired: true },
        { id: "b", employeeName: "Sam Ortiz", testingRequired: true, reason: "post-accident" },
        { id: "c" },
      ],
    });
    expect(consents.map((c) => c.id)).toEqual(["a", "b"]);
    expect(consents[0]?.personnelId).toBe("p1");
    expect(consents[1]?.reason).toBe("post-accident");
  });

  it("converts the legacy single drugAlcohol object into one form for the person affected", () => {
    const consents = parseDrugAlcoholConsents(
      { drugAlcohol: { testingRequired: true, reason: "post-accident" } },
      { employeeName: "Pat Lee", personnelId: "p1" },
    );
    expect(consents).toHaveLength(1);
    expect(consents[0]?.employeeName).toBe("Pat Lee");
    expect(consents[0]?.personnelId).toBe("p1");
    expect(parseDrugAlcoholConsents({ drugAlcohol: { testingRequired: false } })).toEqual([]);
  });

  it("prefers the consent list over legacy data, even when the list is empty", () => {
    expect(
      parseDrugAlcoholConsents({
        drugAlcoholConsents: [],
        drugAlcohol: { testingRequired: true, reason: "post-accident" },
      }),
    ).toEqual([]);
  });

  it("validates each consent form and names the employee in the message", () => {
    const unnamed = newDrugAlcoholConsent();
    expect(drugAlcoholConsentsValidationMessage([unnamed])).toMatch(/Consent form 1: .*employee/i);

    const named = newDrugAlcoholConsent({ employeeName: "Pat Lee" });
    expect(drugAlcoholConsentsValidationMessage([named])).toMatch(/^Pat Lee: .*consent/i);
    expect(drugAlcoholConsentsValidationMessage([])).toBeNull();
  });
});

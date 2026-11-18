import { describe, expect, it } from "vitest";
import {
  buildIncidentCreatePayload,
  emptyIncidentCreateForm,
  toIncidentRecord,
} from "./incidents-module";
import { drugAlcoholValidationMessage, newDrugAlcoholConsent } from "./drug-alcohol-incident";
import {
  cloneEmptyReasonableSuspicion,
  formatReasonableSuspicionDetailLines,
  parseReasonableSuspicion,
  reasonableSuspicionHasContent,
  reasonableSuspicionTestDeadlines,
  reasonableSuspicionValidationMessage,
  type ReasonableSuspicionObservation,
} from "./reasonable-suspicion";

function complete(): ReasonableSuspicionObservation {
  return {
    ...cloneEmptyReasonableSuspicion(),
    observedAt: "2026-10-08T09:15",
    indicators: ["odor-alcohol", "slurred-speech"],
    observationNarrative: "Strong odor of alcohol at the line 2 huddle; speech slurred.",
    dotCovered: false,
    observerName: "Pat Supervisor",
    observerSignature: "data:image/png;base64,AAAA",
  };
}

describe("reasonable-suspicion", () => {
  it("requires the observation, signs, DOT answer, and supervisor signature", () => {
    const empty = cloneEmptyReasonableSuspicion();
    expect(reasonableSuspicionHasContent(empty)).toBe(false);
    expect(reasonableSuspicionValidationMessage(empty)).toMatch(/date and time/i);
    expect(reasonableSuspicionValidationMessage({ ...complete(), indicators: [] })).toMatch(
      /observed sign/i,
    );
    expect(
      reasonableSuspicionValidationMessage({
        ...complete(),
        indicators: [],
        indicatorsOther: "Smell of solvent",
      }),
    ).toBeNull();
    expect(reasonableSuspicionValidationMessage({ ...complete(), dotCovered: null })).toMatch(
      /DOT/,
    );
    expect(reasonableSuspicionValidationMessage({ ...complete(), observerSignature: "" })).toMatch(
      /sign/i,
    );
    expect(reasonableSuspicionValidationMessage(complete())).toBeNull();
  });

  it("parses saved payloads and drops unknown indicator ids", () => {
    const parsed = parseReasonableSuspicion({
      observedAt: "2026-10-08T09:15",
      indicators: ["odor-alcohol", "made-up", "odor-alcohol"],
      dotCovered: "yes",
      observerTrained: "true",
      transportation: "bogus",
    });
    expect(parsed.indicators).toEqual(["odor-alcohol"]);
    expect(parsed.dotCovered).toBe(true);
    expect(parsed.observerTrained).toBe(true);
    expect(parsed.transportation).toBe("");
    expect(parseReasonableSuspicion(null)).toEqual(cloneEmptyReasonableSuspicion());
  });

  it("computes DOT testing windows from the observation time", () => {
    expect(reasonableSuspicionTestDeadlines("2026-10-08T23:30")).toEqual({
      alcoholBy: "2026-10-09T01:30",
      alcoholCutoff: "2026-10-09T07:30",
      drugBy: "2026-10-10T07:30",
    });
    expect(reasonableSuspicionTestDeadlines("")).toBeNull();
  });

  it("formats readable detail lines", () => {
    const rows = formatReasonableSuspicionDetailLines({
      ...complete(),
      observerTrained: true,
      removedFromDuty: true,
      transportation: "family",
    });
    expect(rows.find((r) => r.label === "Observed signs")?.value).toContain("Odor of alcohol");
    expect(rows.find((r) => r.label === "Observing supervisor")?.value).toContain("trained");
    expect(rows.find((r) => r.label === "Transportation")?.value).toMatch(/Family member/);
  });

  it("saves the observation only on Drug/Alcohol reports and round-trips it", () => {
    const form = { ...emptyIncidentCreateForm(), reasonableSuspicion: complete() };
    const payload = buildIncidentCreatePayload(form, "drug-alcohol");
    expect(payload.category).toBe("drug-alcohol");
    expect(payload.reasonableSuspicion?.observerName).toBe("Pat Supervisor");
    expect(buildIncidentCreatePayload(form, "injuries").reasonableSuspicion).toBeUndefined();

    const record = toIncidentRecord({ id: "inc-1", ...payload });
    expect(record?.reasonableSuspicion?.indicators).toEqual(["odor-alcohol", "slurred-speech"]);
    expect(toIncidentRecord({ id: "inc-2" })?.reasonableSuspicion).toBeNull();
  });

  it("lets a refused test save without the employee's consent signature", () => {
    const refused = {
      ...newDrugAlcoholConsent({ employeeName: "Sam Worker" }),
      reason: "reasonable-suspicion" as const,
      testStatus: "refused" as const,
    };
    expect(drugAlcoholValidationMessage(refused)).toMatch(/refused/);
    expect(drugAlcoholValidationMessage({ ...refused, substances: ["alcohol"] })).toBeNull();
    expect(
      drugAlcoholValidationMessage({ ...refused, testStatus: "ordered", substances: ["alcohol"] }),
    ).toMatch(/consent/i);
  });
});

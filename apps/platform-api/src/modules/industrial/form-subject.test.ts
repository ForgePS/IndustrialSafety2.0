import { describe, expect, it } from "vitest";
import { formSubmissionBelongsToPerson } from "./form-subject.js";

const person = {
  id: "person-1",
  employeeNumber: "EMP-100",
  displayName: "Ada Byron",
};

describe("formSubmissionBelongsToPerson", () => {
  it("connects when personnelId is the subject", () => {
    expect(
      formSubmissionBelongsToPerson(
        { sourcePayload: { personnelId: "person-1", answers: { notes: "ok" } } },
        person,
      ),
    ).toBe(true);
  });

  it("connects when answers.employeeNumber matches", () => {
    expect(formSubmissionBelongsToPerson({ answers: { employeeNumber: "EMP-100" } }, person)).toBe(
      true,
    );
  });

  it("connects when responses.employeeName matches (imported forms)", () => {
    expect(
      formSubmissionBelongsToPerson(
        { sourcePayload: { responses: { employeeName: "Ada Byron" } } },
        person,
      ),
    ).toBe(true);
  });

  it("does not connect when the person only signed as supervisor", () => {
    expect(
      formSubmissionBelongsToPerson(
        {
          answers: {
            employeeName: "Jane Doe",
            supervisorSignature: {
              image: "data:image/png;base64,AAA",
              signedByName: "Ada Byron",
            },
            submittedBy: "Ada Byron",
          },
        },
        person,
      ),
    ).toBe(false);
  });

  it("does not connect on a loose name match buried in notes", () => {
    expect(
      formSubmissionBelongsToPerson(
        { answers: { notes: "Discussed with Ada Byron yesterday" } },
        person,
      ),
    ).toBe(false);
  });

  it("does not connect unrelated submissions", () => {
    expect(
      formSubmissionBelongsToPerson(
        { answers: { employeeName: "Other Person", employeeNumber: "EMP-999" } },
        person,
      ),
    ).toBe(false);
  });
});

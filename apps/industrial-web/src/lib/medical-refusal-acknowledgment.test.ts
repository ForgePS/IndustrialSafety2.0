import { describe, expect, it } from "vitest";
import {
  EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT,
  medicalRefusalAcknowledgmentIsComplete,
  medicalRefusalValidationMessage,
  parseMedicalRefusalAcknowledgment,
  summarizeMedicalRefusalAcknowledgment,
} from "./medical-refusal-acknowledgment";

describe("medical-refusal-acknowledgment", () => {
  it("parses services, decision, and confirmations", () => {
    const parsed = parseMedicalRefusalAcknowledgment({
      confirmations: { voluntary: true, askedQuestions: "true" },
      servicesOffered: ["first-aid", "clinic", "bogus"],
      servicesOther: "Nurse visit",
      employeeDecision: "decline-all",
      employeeStatementAck: true,
      witnessName: "Jane Supervisor",
    });
    expect(parsed.confirmations.voluntary).toBe(true);
    expect(parsed.confirmations.askedQuestions).toBe(true);
    expect(parsed.confirmations.understandsRisks).toBe(false);
    expect(parsed.servicesOffered).toEqual(["first-aid", "clinic"]);
    expect(parsed.employeeDecision).toBe("decline-all");
    expect(parsed.witnessName).toBe("Jane Supervisor");
  });

  it("requires full acknowledgment before complete", () => {
    const incomplete = {
      ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT,
      confirmations: { ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT.confirmations },
      employeeDecision: "decline-all" as const,
    };
    expect(medicalRefusalAcknowledgmentIsComplete(incomplete)).toBe(false);
    expect(medicalRefusalValidationMessage(incomplete)).toMatch(/confirm/i);

    const complete = {
      ...EMPTY_MEDICAL_REFUSAL_ACKNOWLEDGMENT,
      confirmations: {
        voluntary: true,
        askedQuestions: true,
        understandsRisks: true,
        documentsDecision: true,
        mayRequestLater: true,
        doesNotWaiveRights: true,
      },
      servicesOffered: ["first-aid" as const],
      employeeDecision: "accepted-first-aid" as const,
      employeeStatementAck: true,
      employeeSignature: "data:image/jpeg;base64,abc",
      witnessName: "Sam Safety",
    };
    expect(medicalRefusalAcknowledgmentIsComplete(complete)).toBe(true);
    expect(medicalRefusalValidationMessage(complete)).toBeNull();
    expect(summarizeMedicalRefusalAcknowledgment(complete)).toContain("first aid");
  });
});

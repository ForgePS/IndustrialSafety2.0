import { describe, expect, it, vi } from "vitest";

vi.mock("@forge/web-kit", () => ({ apiFetchRaw: vi.fn(), apiGet: vi.fn(), apiSend: vi.fn() }));

const { apiSend } = await import("@forge/web-kit");
const {
  emptyHipaaDraft,
  guidelinesDraftError,
  hipaaDraftError,
  parseOutsideEmails,
  signWcForm,
  todayLocalIso,
  wcFormEmailSummary,
} = await import("./wc-forms");
const { parseWcDetailTab, wcCaseHref } = await import("./workers-comp-module");

const TODAY = "2026-10-23";
const SIGNATURE = "data:image/jpeg;base64,AAAA";

describe("workers' comp forms client", () => {
  it("prefills the HIPAA draft from the case", () => {
    const draft = emptyHipaaDraft({ employeeName: "Jordan Lee", dateOfBirth: "1984-03-17" }, TODAY);
    expect(draft).toMatchObject({ patientName: "Jordan Lee", dateOfBirth: "1984-03-17", signerName: "Jordan Lee", signerRelationship: "Self", signedDate: TODAY });
    expect(Object.values(draft.initials).every((v) => v === "")).toBe(true);
  });

  it("checks the guidelines acknowledgment before submitting", () => {
    expect(guidelinesDraftError({ employeeName: "", signedDate: TODAY, signatureDataUrl: SIGNATURE }, TODAY)).toMatch(/name/);
    expect(guidelinesDraftError({ employeeName: "A", signedDate: "2026-10-24", signatureDataUrl: SIGNATURE }, TODAY)).toMatch(/future/);
    expect(guidelinesDraftError({ employeeName: "A", signedDate: TODAY, signatureDataUrl: "" }, TODAY)).toMatch(/sign/);
    expect(guidelinesDraftError({ employeeName: "A", signedDate: TODAY, signatureDataUrl: SIGNATURE }, TODAY)).toBeNull();
  });

  it("checks the HIPAA authorization before submitting", () => {
    const ready = { ...emptyHipaaDraft({ employeeName: "Jordan Lee", dateOfBirth: "1984-03-17" }, TODAY), providerName: "Clinic", signatureDataUrl: SIGNATURE };
    expect(hipaaDraftError({ ...ready, initials: { ...ready.initials, releaseRecords: "JL" } }, TODAY)).toBeNull();
    expect(hipaaDraftError(ready, TODAY)).toMatch(/at least one/);
    expect(hipaaDraftError({ ...ready, initials: { ...ready.initials, releaseRecords: "J1" } }, TODAY)).toMatch(/letters/);
    expect(hipaaDraftError({ ...ready, providerName: "", initials: { ...ready.initials, releaseRecords: "JL" } }, TODAY)).toMatch(/provider/);
    expect(hipaaDraftError({ ...ready, dateOfBirth: TODAY, initials: { ...ready.initials, releaseRecords: "JL" } }, TODAY)).toMatch(/date of birth/);
  });

  it("splits outside email addresses and flags bad ones", () => {
    expect(parseOutsideEmails("Clinic@Example.com; carrier@example.com,\nclinic@example.com nope")).toEqual({
      emails: ["clinic@example.com", "carrier@example.com"],
      invalid: ["nope"],
    });
  });

  it("summarizes email results", () => {
    expect(wcFormEmailSummary({ sent: 2, failed: [], skipped: [] })).toEqual({ tone: "success", text: "Sent to 2 recipients." });
    expect(wcFormEmailSummary({ sent: 1, failed: [{ email: "x@example.com", name: null, accepted: false }], skipped: [] }).tone).toBe("warning");
    expect(wcFormEmailSummary({ sent: 0, failed: [], skipped: [] }).tone).toBe("danger");
  });

  it("signs with an idempotency key so a retry never signs twice", async () => {
    await signWcForm("case-1", "INJURY_GUIDELINES_ACK", { employeeName: "A", signedDate: TODAY, signatureDataUrl: SIGNATURE }, "key-1");
    expect(apiSend).toHaveBeenCalledWith(
      "/api/v1/industrial/workers-comp-forms/cases/case-1",
      "POST",
      expect.objectContaining({ formKey: "INJURY_GUIDELINES_ACK", employeeName: "A" }),
      { idempotencyKey: "key-1" },
    );
  });

  it("uses the local calendar date for today", () => {
    expect(todayLocalIso(new Date(2026, 9, 23, 23, 30))).toBe(TODAY);
  });

  it("deep-links to the Forms tab on a case", () => {
    expect(parseWcDetailTab("forms")).toBe("forms");
    expect(wcCaseHref("abc", "forms")).toContain("tab=forms");
  });
});

import { describe, expect, it } from "vitest";
import {
  answerLabel,
  buildDvirSubmitPayload,
  buildDvirTitle,
  dvirDefectSummary,
  dvirDriverName,
  dvirDayStatus,
  dvirInspectionDate,
  dvirRetentionDateRange,
  DVIR_RETENTION_DAYS,
  dvirIsSubmitted,
  groupDvirsByDate,
  dvirNeedsDriverReview,
  dvirNeedsMechanic,
  emptyDvirForm,
  initialDvirStatus,
  isDvirRecord,
  resolveDvirPublicToken,
  resolveDvirReportItems,
  setDvirItemAnswer,
  setDvirItemNotes,
  summarizeDvirList,
  validateDvirDriverSubmit,
  validateDvirMechanicCertify,
  type DvirFormState,
  type DvirItemAnswer,
} from "./dvir";

const SIG = "data:image/jpeg;base64,abc";

function allYes(items: DvirItemAnswer[]): DvirItemAnswer[] {
  return items.map((item) => ({ ...item, answer: "YES" as const, notes: "" }));
}

function withNo(
  form: DvirFormState,
  id: string,
  notes: string,
): DvirFormState {
  let items = setDvirItemAnswer(allYes(form.items), id, "NO");
  items = setDvirItemNotes(items, id, notes);
  return { ...form, items, conditionSatisfactory: false };
}

describe("dvir", () => {
  it("builds titles and initial status", () => {
    expect(buildDvirTitle({ tripType: "PRE_TRIP", truckNumber: "12" })).toBe("Pre-trip DVIR 12");
    expect(buildDvirTitle({ tripType: "POST_TRIP", truckNumber: "Unit 7" })).toBe(
      "Post-trip DVIR Unit 7",
    );
    expect(initialDvirStatus(false)).toBe("CLOSED");
    expect(initialDvirStatus(true)).toBe("OPEN");
  });

  it("requires every item Yes/No/N/A and a note on No", () => {
    const base = emptyDvirForm({
      tripType: "POST_TRIP",
      truckNumber: "42",
      workerName: "Alex Driver",
      driverSignatureDataUrl: SIG,
      driverSignatureDate: "2026-08-21",
      conditionSatisfactory: true,
      items: allYes(emptyDvirForm().items),
    });
    expect(validateDvirDriverSubmit(base)).toEqual({ ok: true });

    expect(validateDvirDriverSubmit(emptyDvirForm({ ...base, items: blankish() }))).toMatchObject({
      ok: false,
    });

    expect(
      validateDvirDriverSubmit({
        ...base,
        items: setDvirItemAnswer(allYes(base.items), "brakes", "NO"),
        conditionSatisfactory: false,
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/note/i) });

    expect(
      validateDvirDriverSubmit(
        withNo(base, "brakes", "Soft pedal"),
      ),
    ).toEqual({ ok: true });

    expect(
      validateDvirDriverSubmit({
        ...withNo(base, "brakes", "Soft pedal"),
        conditionSatisfactory: true,
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/satisfactory/i) });
  });

  it("validates mechanic certify exclusivity", () => {
    expect(
      validateDvirMechanicCertify({
        defectsCorrected: true,
        defectsNeedNotBeCorrected: true,
        mechanicName: "Sam",
        mechanicSignatureDataUrl: SIG,
        mechanicSignatureDate: "2026-08-21",
      }),
    ).toMatchObject({ ok: false });

    expect(
      validateDvirMechanicCertify({
        defectsCorrected: true,
        defectsNeedNotBeCorrected: false,
        mechanicName: "Sam",
        mechanicSignatureDataUrl: SIG,
        mechanicSignatureDate: "2026-08-21",
      }),
    ).toEqual({ ok: true });
  });

  it("builds submit payload with all answers", () => {
    const form = withNo(
      emptyDvirForm({
        tripType: "PRE_TRIP",
        truckNumber: "9",
        workerName: "Pat",
        driverSignatureDataUrl: SIG,
      }),
      "horn",
      "Weak horn",
    );
    const payload = buildDvirSubmitPayload(form, "public-qr", "2026-08-21T12:00:00.000Z");
    expect(payload.category).toBe("dvirs");
    expect(payload.recordType).toBe("DVIR");
    expect(payload.submittedVia).toBe("public-qr");
    expect(payload.conditionSatisfactory).toBe(false);
    expect(payload.truckDefects).toEqual(["horn"]);
    expect(payload.driverSignedAt).toContain("2026-08-21");
    expect(payload.items).toHaveLength(form.items.length);
    expect(payload.items.find((item) => item.id === "horn")).toMatchObject({
      answer: "NO",
      notes: "Weak horn",
    });
    expect(payload.items.every((item) => item.answer === "YES" || item.answer === "NO" || item.answer === "NA")).toBe(
      true,
    );
  });

  it("detects follow-up needs from items or legacy defects", () => {
    const open = {
      items: [{ id: "brakes", label: "Brakes", section: "truck", answer: "NO", notes: "Soft" }],
    };
    expect(dvirNeedsMechanic(open)).toBe(true);
    expect(dvirNeedsDriverReview(open)).toBe(false);

    const certified = { ...open, mechanicSignedAt: "2026-08-21T12:00:00.000Z" };
    expect(dvirNeedsMechanic(certified)).toBe(false);
    expect(dvirNeedsDriverReview(certified)).toBe(true);

    const done = { ...certified, driverReviewSignedAt: "2026-08-21T13:00:00.000Z" };
    expect(dvirNeedsDriverReview(done)).toBe(false);

    expect(
      dvirNeedsMechanic({
        truckDefects: ["brakes"],
        trailerDefects: [],
      }),
    ).toBe(true);
  });

  it("resolves report items including legacy rows", () => {
    const modern = resolveDvirReportItems({
      items: [
        { id: "horn", label: "Horn", section: "truck", answer: "NO", notes: "Weak" },
        { id: "brakes", label: "Brakes", section: "truck", answer: "YES", notes: "" },
      ],
    });
    expect(modern).toHaveLength(2);
    expect(answerLabel(modern[0]?.answer)).toBe("No");

    const legacy = resolveDvirReportItems({
      truckDefects: ["horn"],
      trailerDefects: [],
      remarks: "Weak horn",
    });
    expect(legacy.find((item) => item.id === "horn")).toMatchObject({
      answer: "NO",
      notes: "Weak horn",
    });
    expect(legacy.every((item) => item.answer === "YES" || item.answer === "NO")).toBe(true);
  });

  it("summarizes list rows", () => {
    const rows = [
      {
        recordType: "DVIR",
        tripType: "PRE_TRIP",
        inspectionDate: "2099-01-01",
        status: "CLOSED",
        items: allYes(emptyDvirForm().items),
      },
      {
        recordType: "DVIR",
        tripType: "POST_TRIP",
        inspectionDate: "2099-01-01",
        status: "OPEN",
        items: withNo(emptyDvirForm(), "tires", "Flat").items,
      },
      { title: "DRIVER qualification file", status: "OPEN" },
    ];
    const summary = summarizeDvirList(rows);
    expect(summary.total).toBe(2);
    expect(summary.openDefects).toBe(1);
  });

  it("identifies DVIR records", () => {
    expect(isDvirRecord({ recordType: "DVIR" })).toBe(true);
    expect(isDvirRecord({ category: "dvirs" })).toBe(true);
    expect(isDvirRecord({ title: "Pre-trip inspection Unit 1" })).toBe(true);
    expect(isDvirRecord({ title: "DRIVER qualification file" })).toBe(false);
  });

  it("resolves public tokens from query or browser path when route param is placeholder", () => {
    const token = "abcdefghijklmnopqrstuvwxyz123456";
    expect(
      resolveDvirPublicToken({
        pathname: `/dvir/${token}/`,
        queryToken: null,
        routeToken: "placeholder",
      }),
    ).toBe(token);
    expect(
      resolveDvirPublicToken({
        pathname: "/dvir/",
        queryToken: token,
        routeToken: "placeholder",
      }),
    ).toBe(token);
    expect(
      resolveDvirPublicToken({
        pathname: "/dvir/placeholder/",
        queryToken: null,
        routeToken: "placeholder",
      }),
    ).toBe("");
  });

  it("summarizes defects for DOT reports", () => {
    expect(
      dvirDefectSummary({
        items: [
          { id: "brakes", label: "Brakes", answer: "NO", notes: "Soft pedal" },
          { id: "lights", label: "Lights", answer: "YES", notes: "" },
        ],
      }),
    ).toEqual({
      hasDefects: true,
      yesNo: "Yes",
      text: "Brakes: Soft pedal",
    });
    expect(dvirDefectSummary({ items: [{ id: "lights", label: "Lights", answer: "YES" }] })).toEqual({
      hasDefects: false,
      yesNo: "No",
      text: "",
    });
    expect(dvirDriverName({ workerName: "Alex" })).toBe("Alex");
    expect(dvirInspectionDate({ inspectionDate: "2026-03-01T00:00:00.000Z" })).toBe("2026-03-01");
  });

  it("groups DVIRs by date and tracks 91-day calendar window", () => {
    expect(DVIR_RETENTION_DAYS).toBe(91);
    const range = dvirRetentionDateRange(new Date("2026-08-22T12:00:00Z"));
    expect(range.length).toBe(91);
    expect(range[0]).toBe("2026-05-24");
    expect(range[range.length - 1]).toBe("2026-08-22");

    const byDate = groupDvirsByDate([
      {
        id: "1",
        category: "dvirs",
        recordType: "DVIR",
        tripType: "PRE_TRIP",
        inspectionDate: "2026-08-21",
      },
      {
        id: "2",
        category: "dvirs",
        recordType: "DVIR",
        tripType: "POST_TRIP",
        inspectionDate: "2026-08-21",
      },
    ]);
    const bucket = byDate.get("2026-08-21");
    expect(bucket?.preTrip?.id).toBe("1");
    expect(bucket?.postTrip?.id).toBe("2");
    expect(dvirDayStatus(bucket)).toBe("complete");
    expect(dvirDayStatus(byDate.get("2026-08-20"))).toBe("empty");
  });

  it("locks submitted DVIRs from editing", () => {
    expect(
      dvirIsSubmitted({
        recordType: "DVIR",
        driverSignatureDataUrl: "data:image/jpeg;base64,abc",
      }),
    ).toBe(true);
    expect(dvirIsSubmitted({ recordType: "DVIR", driverSignedAt: "2026-08-21" })).toBe(true);
    expect(dvirIsSubmitted({ recordType: "DVIR" })).toBe(false);
    expect(dvirIsSubmitted({ recordType: "MVR" })).toBe(false);
  });
});

function blankish(): DvirItemAnswer[] {
  return emptyDvirForm().items;
}

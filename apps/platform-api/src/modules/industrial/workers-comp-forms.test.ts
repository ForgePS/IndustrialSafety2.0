import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ForgePrincipal } from "@forge/tenant-context";
import {
  buildBlankWcFormPdf,
  buildFilledWcFormPdf,
  formatFormDate,
  loadWcFormTemplate,
  wcFormPdfFilename,
} from "./workers-comp-forms-pdf.js";

// Queue-driven fake for the drizzle query chains the service awaits (select/insert/update).
const queue: unknown[][] = [];
const updates: unknown[] = [];
function chain(): unknown {
  const target = () => undefined;
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        const next = queue.shift() ?? [];
        return (resolve: (v: unknown) => void) => resolve(next);
      }
      if (prop === "set") {
        return (values: unknown) => {
          updates.push(values);
          return chain();
        };
      }
      return () => chain();
    },
  });
}
const tx = {
  select: () => chain(),
  insert: () => chain(),
  update: () => chain(),
  execute: vi.fn(async () => undefined),
};
vi.mock("@forge/database", async () => {
  const actual = await vi.importActual<typeof import("@forge/database")>("@forge/database");
  return { ...actual, withTenantTransaction: async (_db: unknown, _tenant: string, fn: (t: unknown) => unknown) => fn(tx) };
});

const {
  WorkersCompFormsService,
  isProducersRiceMillTenant,
  parseSignatureDataUrl,
  parseWcFormData,
  parseWcFormRecipients,
  wcFormAccess,
} = await import("./workers-comp-forms.service.js");

// pdf-parse's package entry runs a self-test when imported directly; use the library file.
const pdfText = async (pdf: Buffer) => {
  const { default: parse } = await import("pdf-parse/lib/pdf-parse.js");
  return (await parse(pdf)).text as string;
};

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const TODAY = "2026-10-23";
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FORM_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const PERSON_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const principal = (...perms: string[]): ForgePrincipal =>
  ({ tenantId: TENANT, userId: "11111111-1111-4111-8111-111111111111", personId: null, isPlatformAdmin: false, permissions: new Set(perms) }) as unknown as ForgePrincipal;

const HIPAA_DATA = {
  patientName: "Jordan Lee",
  dateOfBirth: "1984-03-17",
  providerName: "Stuttgart Occupational Clinic",
  initials: { releaseRecords: "JL", sensitiveInformation: "JL", postalOrFax: "", unencryptedEmail: "" },
  signerName: "Jordan Lee",
  signerRelationship: "Self",
  signedDate: TODAY,
};

describe("workers' comp form PDFs", () => {
  it("prints the blank form exactly as the original file", () => {
    for (const key of ["INJURY_GUIDELINES_ACK", "HIPAA_AUTHORIZATION"] as const) {
      expect(Buffer.compare(buildBlankWcFormPdf(key), Buffer.from(loadWcFormTemplate(key)))).toBe(0);
    }
  });

  it("draws the HIPAA answers onto the original single letter-size page", async () => {
    const pdf = await buildFilledWcFormPdf({ formKey: "HIPAA_AUTHORIZATION", formId: FORM_ID, signedAt: new Date(`${TODAY}T15:00:00Z`), signatureDataUrl: PNG_1PX, data: HIPAA_DATA });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    expect([doc.getPage(0).getWidth(), doc.getPage(0).getHeight()]).toEqual([612, 792]);
    const textContent = await pdfText(pdf);
    for (const value of ["Jordan Lee", "03/17/1984", "Stuttgart Occupational Clinic", "Jordan Lee, Self", "10/23/2026", FORM_ID]) {
      expect(textContent).toContain(value);
    }
  });

  it("adds the employee acknowledgment to the guidelines sheet", async () => {
    const pdf = await buildFilledWcFormPdf({ formKey: "INJURY_GUIDELINES_ACK", formId: FORM_ID, signedAt: new Date(), signatureDataUrl: PNG_1PX, data: { employeeName: "Jordan Lee", signedDate: TODAY } });
    const textContent = await pdfText(pdf);
    expect(textContent).toContain("Employee Acknowledgment");
    expect(textContent).toContain("Jordan Lee");
  });

  it("rejects signatures that are not PNG or JPEG data URLs", async () => {
    await expect(
      buildFilledWcFormPdf({ formKey: "INJURY_GUIDELINES_ACK", formId: FORM_ID, signedAt: new Date(), signatureDataUrl: "data:image/svg+xml;base64,AAAA", data: { employeeName: "A", signedDate: TODAY } }),
    ).rejects.toThrow(/PNG or JPEG/);
  });

  it("formats dates and file names", () => {
    expect(formatFormDate("2026-10-23")).toBe("10/23/2026");
    expect(wcFormPdfFilename("HIPAA_AUTHORIZATION", "WC 2026/014", true)).toBe("hipaa-authorization-WC-2026-014-signed.pdf");
    expect(wcFormPdfFilename("INJURY_GUIDELINES_ACK", null, false)).toBe("employee-injury-guidelines-blank.pdf");
  });
});

describe("workers' comp form validation", () => {
  it("requires the guidelines employee name and a past or present date", () => {
    expect(() => parseWcFormData("INJURY_GUIDELINES_ACK", {}, TODAY)).toThrow(/employee's name/);
    expect(() => parseWcFormData("INJURY_GUIDELINES_ACK", { employeeName: "A", signedDate: "2026-10-24" }, TODAY)).toThrow(/future/);
    expect(parseWcFormData("INJURY_GUIDELINES_ACK", { employeeName: "  Jordan   Lee " }, TODAY).signerName).toBe("Jordan Lee");
  });

  it("validates the HIPAA fields and initials", () => {
    expect(() => parseWcFormData("HIPAA_AUTHORIZATION", { ...HIPAA_DATA, dateOfBirth: "1984-02-30" }, TODAY)).toThrow(/date of birth/);
    expect(() => parseWcFormData("HIPAA_AUTHORIZATION", { ...HIPAA_DATA, providerName: " " }, TODAY)).toThrow(/provider/);
    expect(() => parseWcFormData("HIPAA_AUTHORIZATION", { ...HIPAA_DATA, initials: {} }, TODAY)).toThrow(/at least one/);
    expect(() => parseWcFormData("HIPAA_AUTHORIZATION", { ...HIPAA_DATA, initials: { releaseRecords: "J1" } }, TODAY)).toThrow(/letters/);
    const parsed = parseWcFormData("HIPAA_AUTHORIZATION", { ...HIPAA_DATA, initials: { releaseRecords: "jl" }, signerName: "", signerRelationship: "" }, TODAY);
    expect(parsed.signerName).toBe("Jordan Lee");
    expect(parsed.signerRelationship).toBe("Self");
    expect((parsed.data as typeof HIPAA_DATA).initials.releaseRecords).toBe("JL");
  });

  it("requires a valid signature image", () => {
    expect(() => parseSignatureDataUrl("")).toThrow(/signature is required/);
    expect(() => parseSignatureDataUrl("data:text/html;base64,AAAA")).toThrow(/not valid/);
    expect(parseSignatureDataUrl(PNG_1PX)).toBe(PNG_1PX);
  });

  it("parses staff and outside recipients with limits", () => {
    expect(() => parseWcFormRecipients({})).toThrow(/at least one/);
    expect(() => parseWcFormRecipients({ emails: "clinic@example.com, not-an-email" })).toThrow(/not-an-email/);
    expect(() => parseWcFormRecipients({ emails: Array.from({ length: 11 }, (_, i) => `a${i}@example.com`) })).toThrow(/no more than 10/);
    const parsed = parseWcFormRecipients({ personnelIds: [PERSON_ID, PERSON_ID, "bad"], emails: "Clinic@Example.com; clinic@example.com" });
    expect(parsed.personnelIds).toEqual([PERSON_ID]);
    expect(parsed.emails).toEqual(["clinic@example.com"]);
  });

  it("limits the forms to Producers Rice Mill", () => {
    expect(isProducersRiceMillTenant("producers-rice-mill", null)).toBe(true);
    expect(isProducersRiceMillTenant(null, "Producers Rice Mill, Inc.")).toBe(true);
    expect(isProducersRiceMillTenant("acme-foods", "Acme Foods")).toBe(false);
  });
});

describe("workers' comp form permissions", () => {
  it("keeps the HIPAA form behind the medical permissions", () => {
    const viewer = principal("industrial.workers_comp.view");
    expect(wcFormAccess(viewer, "INJURY_GUIDELINES_ACK")).toEqual({ read: true, act: false });
    expect(wcFormAccess(viewer, "HIPAA_AUTHORIZATION")).toEqual({ read: false, act: false });

    const manager = principal("industrial.workers_comp.manage");
    expect(wcFormAccess(manager, "INJURY_GUIDELINES_ACK")).toEqual({ read: true, act: true });
    expect(wcFormAccess(manager, "HIPAA_AUTHORIZATION")).toEqual({ read: false, act: false });

    expect(wcFormAccess(principal("industrial.workers_comp.medical.view"), "HIPAA_AUTHORIZATION")).toEqual({ read: true, act: false });
    expect(wcFormAccess(principal("industrial.workers_comp.medical.manage"), "HIPAA_AUTHORIZATION")).toEqual({ read: true, act: true });
    expect(wcFormAccess(principal("industrial.admin"), "HIPAA_AUTHORIZATION")).toEqual({ read: true, act: true });
  });
});

describe("WorkersCompFormsService", () => {
  const sendTemplatedEmail = vi.fn(async () => ({ accepted: true }));
  const writeInTransaction = vi.fn(async () => "audit-id");
  const service = new WorkersCompFormsService({} as never, { sendTemplatedEmail } as never, { writeInTransaction } as never);
  const hipaaRow = {
    id: FORM_ID,
    tenantId: TENANT,
    caseId: CASE_ID,
    formKey: "HIPAA_AUTHORIZATION",
    status: "SIGNED",
    formData: HIPAA_DATA,
    signatureDataUrl: PNG_1PX,
    signerName: "Jordan Lee",
    signerRelationship: "Self",
    signedAt: new Date(`${TODAY}T15:00:00Z`),
    createdByUserId: null,
    voidedAt: null,
    voidedByUserId: null,
    voidReason: null,
    emailLog: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const producers = [{ slug: "producers-rice-mill", displayName: "Producers Rice Mill" }];
  const caseRow = [{ id: CASE_ID, caseNumber: "WC-14", archivedAt: null, personnelName: "Jordan Lee", personnelFirstName: "Jordan", personnelLastName: "Lee", dateOfBirth: "1984-03-17" }];

  beforeEach(() => {
    queue.length = 0;
    updates.length = 0;
    sendTemplatedEmail.mockClear();
    writeInTransaction.mockClear();
  });

  it("emails the signed HIPAA PDF to staff and outside addresses and records it", async () => {
    // tenant check, form, case, personnel; then the email-log update
    queue.push(producers, [hipaaRow], caseRow, [{ id: PERSON_ID, displayName: "Safety Lead", email: null, companyEmail: "safety@producers.example" }], []);
    const result = await service.email(principal("industrial.workers_comp.medical.manage"), FORM_ID, {
      personnelIds: [PERSON_ID],
      emails: "records@clinic.example",
      message: "For the carrier file.",
    });
    expect(result.sent).toBe(2);
    expect(sendTemplatedEmail).toHaveBeenCalledTimes(2);
    type SentEmail = { to: string; templateKey: string; vars: { htmlBody: string }; attachments: Array<{ contentType: string; filename: string }> };
    const calls = sendTemplatedEmail.mock.calls as unknown as Array<[SentEmail]>;
    expect(calls.map(([c]) => c.to)).toEqual(["safety@producers.example", "records@clinic.example"]);
    const first = calls[0]![0];
    expect(first.templateKey).toBe("workers_comp_form");
    expect(first.attachments[0].contentType).toBe("application/pdf");
    expect(first.attachments[0].filename).toBe("hipaa-authorization-WC-14-signed.pdf");
    expect(first.vars.htmlBody).toContain("protected health information");
    expect(first.vars.htmlBody).toContain("For the carrier file.");
    expect(updates).toHaveLength(1);
    expect(writeInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ action: "workers_comp.form.emailed", riskLevel: "HIGH" }));
  });

  it("refuses to email a HIPAA form without the medical manage permission", async () => {
    queue.push(producers, [hipaaRow]);
    await expect(service.email(principal("industrial.workers_comp.manage", "industrial.workers_comp.medical.view"), FORM_ID, { emails: "a@example.com" })).rejects.toThrow(/permission to email/);
    expect(sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it("refuses to email a voided form", async () => {
    queue.push(producers, [{ ...hipaaRow, status: "VOIDED" }]);
    await expect(service.email(principal("industrial.admin"), FORM_ID, { emails: "a@example.com" })).rejects.toThrow(/Voided/);
  });

  it("refuses the forms for other companies", async () => {
    queue.push([{ slug: "acme-foods", displayName: "Acme Foods" }]);
    await expect(service.email(principal("industrial.admin"), FORM_ID, { emails: "a@example.com" })).rejects.toThrow(/not available/);
  });

  it("does not let a non-medical manager sign a HIPAA form", async () => {
    await expect(
      service.create(principal("industrial.workers_comp.manage"), CASE_ID, { formKey: "HIPAA_AUTHORIZATION", signatureDataUrl: PNG_1PX, ...HIPAA_DATA }),
    ).rejects.toThrow(/medical permission/);
  });

  it("hides the date of birth prefill from people who cannot fill the HIPAA form", async () => {
    queue.push(producers, caseRow, []);
    const asManager = await service.list(principal("industrial.workers_comp.manage"), CASE_ID);
    expect(asManager.prefill).toEqual({ employeeName: "Jordan Lee", dateOfBirth: "" });
    queue.push(producers, caseRow, []);
    const asMedical = await service.list(principal("industrial.workers_comp.medical.manage"), CASE_ID);
    expect(asMedical.prefill.dateOfBirth).toBe("1984-03-17");
  });
});

import { describe, expect, it } from "vitest";
import { parseIncidentAttachments } from "./incident-attachments";
import { toIncidentRecord } from "./incidents-module";

describe("parseIncidentAttachments", () => {
  it("returns empty for non-arrays", () => {
    expect(parseIncidentAttachments(null)).toEqual([]);
    expect(parseIncidentAttachments({})).toEqual([]);
  });

  it("keeps unique document refs", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      parseIncidentAttachments([
        { documentId: id, fileName: "a.pdf", contentType: "application/pdf" },
        { documentId: id, fileName: "dup.pdf" },
        { documentId: "  ", fileName: "bad" },
        { originalFilename: "legacy.docx", documentId: "22222222-2222-4222-8222-222222222222" },
      ]),
    ).toEqual([
      {
        documentId: id,
        fileName: "a.pdf",
        contentType: "application/pdf",
      },
      {
        documentId: "22222222-2222-4222-8222-222222222222",
        fileName: "legacy.docx",
      },
    ]);
  });
});

describe("toIncidentRecord workersComp + attachments", () => {
  it("maps reverse WC pointer and attachments from payload fields", () => {
    const caseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const oshaId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const docId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const record = toIncidentRecord({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      title: "Injury",
      status: "open",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      workersCompCaseId: caseId,
      oshaCaseId: oshaId,
      attachments: [{ documentId: docId, fileName: "photo.jpg", contentType: "image/jpeg" }],
    });
    expect(record?.workersCompCaseId).toBe(caseId);
    expect(record?.oshaCaseId).toBe(oshaId);
    expect(record?.workersCompRelevant).toBe(true);
    expect(record?.attachments).toEqual([
      { documentId: docId, fileName: "photo.jpg", contentType: "image/jpeg" },
    ]);
  });
});

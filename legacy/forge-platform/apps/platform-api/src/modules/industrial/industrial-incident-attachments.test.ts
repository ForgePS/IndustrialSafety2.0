import { describe, expect, it } from "vitest";
import { createId } from "@forge/database";
import { readIncidentAttachments } from "./industrial-incident-attachments.service.js";

describe("readIncidentAttachments", () => {
  it("reads attachment refs from source_payload", () => {
    const documentId = createId();
    const rows = readIncidentAttachments({
      attachments: [
        {
          documentId,
          fileName: "scene.pdf",
          contentType: "application/pdf",
          uploadedAt: "2026-03-01T12:00:00.000Z",
        },
        { documentId: "not-a-uuid", fileName: "skip" },
      ],
    });
    expect(rows).toEqual([
      {
        documentId,
        fileName: "scene.pdf",
        contentType: "application/pdf",
        uploadedAt: "2026-03-01T12:00:00.000Z",
      },
    ]);
  });

  it("unwraps stringified payloads", () => {
    const documentId = "550e8400-e29b-41d4-a716-446655440000";
    const rows = readIncidentAttachments(
      JSON.stringify({
        attachments: [{ documentId, originalFilename: "note.txt" }],
      }),
    );
    expect(rows).toEqual([
      {
        documentId,
        fileName: "note.txt",
        contentType: "application/octet-stream",
        uploadedAt: new Date(0).toISOString(),
      },
    ]);
  });
});

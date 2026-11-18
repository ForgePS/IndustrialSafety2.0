import { describe, expect, it, vi } from "vitest";
import {
  canRenameFolder,
  deleteFolderPrompt,
  documentNameFromFilename,
  folderUploadNotice,
  sameFolderName,
  sortByDocumentName,
  uploadFilesToFolder,
} from "./document-folders";

describe("canRenameFolder", () => {
  const base = { id: "f1", name: "SOPs", documentCount: 0, builtIn: false, canDelete: true };
  it("allows renaming non-built-in folders", () => {
    expect(canRenameFolder({ ...base, canRename: true })).toBe(true);
  });
  it("blocks built-ins and missing folders", () => {
    expect(canRenameFolder({ ...base, builtIn: true, canRename: false })).toBe(false);
    expect(canRenameFolder(null)).toBe(false);
  });
});

describe("deleteFolderPrompt", () => {
  it("says documents are kept when the folder has some", () => {
    expect(deleteFolderPrompt({ name: "SOPs", documentCount: 3 })).toContain(
      "3 documents will be kept",
    );
    expect(deleteFolderPrompt({ name: "SOPs", documentCount: 1 })).toContain("1 document will");
  });
  it("is a plain question for an empty folder", () => {
    expect(deleteFolderPrompt({ name: "SOPs", documentCount: 0 })).toBe(
      'Delete the folder "SOPs"?',
    );
  });
});

const names = (items: { name: string }[]) => items.map((item) => item.name);

describe("sortByDocumentName", () => {
  it("puts the lowest number first", () => {
    const input = ["EHS-010 Hot Work", "EHS-2 PPE", "EHS-001 Policy Statement", "EHS-100 Audits"];
    expect(names(sortByDocumentName(input.map((name) => ({ name }))))).toEqual([
      "EHS-001 Policy Statement",
      "EHS-2 PPE",
      "EHS-010 Hot Work",
      "EHS-100 Audits",
    ]);
  });

  it("orders leading numbers numerically, not alphabetically", () => {
    const input = ["10 Lockout", "1 General", "2 Hazcom"];
    expect(names(sortByDocumentName(input.map((name) => ({ name }))))).toEqual([
      "1 General",
      "2 Hazcom",
      "10 Lockout",
    ]);
  });
});

describe("sameFolderName", () => {
  it("ignores case and surrounding spaces", () => {
    expect(sameFolderName(" ehs policies", "EHS Policies")).toBe(true);
    expect(sameFolderName("SOPs", "EHS Policies")).toBe(false);
    expect(sameFolderName(null, "")).toBe(true);
  });
});

describe("documentNameFromFilename", () => {
  it("drops the extension and tidies separators", () => {
    expect(documentNameFromFilename("EHS-002 Hot_Work Permit.pdf")).toBe("EHS-002 Hot Work Permit");
    expect(documentNameFromFilename("C:\\fakepath\\SDS.v2.docx")).toBe("SDS.v2");
  });
  it("keeps names without an extension and never returns empty", () => {
    expect(documentNameFromFilename("README")).toBe("README");
    expect(documentNameFromFilename(".pdf")).toBe(".pdf");
    expect(documentNameFromFilename("   ")).toBe("Untitled document");
  });
});

describe("uploadFilesToFolder", () => {
  const file = (name: string) => new File(["x"], name, { type: "application/pdf" });

  it("creates each document in the folder and uploads its file", async () => {
    let n = 0;
    const createDocument = vi.fn(async () => ({ id: `doc-${++n}` }));
    const uploadVersion = vi.fn(async (_documentId: string, _file: File) => "v1");
    const result = await uploadFilesToFolder("Safety Data Sheets", [file("A.pdf"), file("B.pdf")], {
      createDocument,
      uploadVersion,
    });
    expect(createDocument).toHaveBeenNthCalledWith(1, {
      name: "A",
      category: "Safety Data Sheets",
    });
    expect(createDocument).toHaveBeenNthCalledWith(2, {
      name: "B",
      category: "Safety Data Sheets",
    });
    expect(uploadVersion.mock.calls.map((c) => c[0])).toEqual(["doc-1", "doc-2"]);
    expect(result.uploaded).toEqual([
      { filename: "A.pdf", documentId: "doc-1" },
      { filename: "B.pdf", documentId: "doc-2" },
    ]);
    expect(result.failed).toEqual([]);
  });

  it("discards the new document when its upload fails and keeps going", async () => {
    let n = 0;
    const discardDocument = vi.fn(async () => undefined);
    const result = await uploadFilesToFolder("SOPs", [file("bad.pdf"), file("good.pdf")], {
      createDocument: async () => ({ id: `doc-${++n}` }),
      uploadVersion: async (id) => {
        if (id === "doc-1") throw new Error("Upload failed (403)");
      },
      discardDocument,
    });
    expect(discardDocument).toHaveBeenCalledWith("doc-1");
    expect(result.failed.map((f) => f.filename)).toEqual(["bad.pdf"]);
    expect(result.uploaded.map((u) => u.documentId)).toEqual(["doc-2"]);
  });

  it("does not discard when the document was never created", async () => {
    const discardDocument = vi.fn(async () => undefined);
    const result = await uploadFilesToFolder("SOPs", [file("a.pdf")], {
      createDocument: async () => {
        throw new Error("forbidden");
      },
      uploadVersion: async () => undefined,
      discardDocument,
    });
    expect(discardDocument).not.toHaveBeenCalled();
    expect(result.failed).toHaveLength(1);
  });
});

describe("folderUploadNotice", () => {
  it("counts documents", () => {
    expect(folderUploadNotice("SOPs", 1)).toBe('Uploaded 1 document to "SOPs"');
    expect(folderUploadNotice("SOPs", 3)).toBe('Uploaded 3 documents to "SOPs"');
  });
});

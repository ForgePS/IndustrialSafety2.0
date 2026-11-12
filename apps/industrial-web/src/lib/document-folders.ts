import { apiGet, apiSend } from "@forge/web-kit";
import { DOCUMENTS_API } from "@/lib/document-control";

/**
 * Document Control library folder. A document is in a folder when its category equals the
 * folder name. Folders come from the API: built-ins, folders users create, and categories
 * already in use.
 */
export type DocumentFolder = {
  /** Stored folder id; null for built-in folders and categories without a stored folder. */
  id: string | null;
  name: string;
  documentCount: number;
  builtIn: boolean;
  /** Every folder except built-ins can be renamed. Older APIs omit this. */
  canRename?: boolean;
  /** Every folder except built-ins can be deleted; its documents are kept. */
  canDelete: boolean;
};

export const EHS_POLICIES_CATEGORY = "EHS Policies";

/** Shown if the folder list can't load, so the built-in folder is still there. */
export const FALLBACK_DOCUMENT_FOLDERS: readonly DocumentFolder[] = [
  {
    id: null,
    name: EHS_POLICIES_CATEGORY,
    documentCount: 0,
    builtIn: true,
    canRename: false,
    canDelete: false,
  },
];

export async function listDocumentFolders() {
  return apiGet<{ items: DocumentFolder[] }>(`${DOCUMENTS_API}/folders`);
}

export async function createDocumentFolder(name: string) {
  return apiSend<DocumentFolder>(`${DOCUMENTS_API}/folders`, "POST", { name });
}

/** Rename a folder; documents in it move to the new name. */
export async function renameDocumentFolder(name: string, newName: string) {
  return apiSend<{ id: string; name: string; documentsMoved: number }>(
    `${DOCUMENTS_API}/folders/rename`,
    "POST",
    { name, newName },
  );
}

/** Delete a folder; its documents are kept and moved out of it. */
export async function deleteDocumentFolder(name: string) {
  return apiSend<{ name: string; deleted: boolean; documentsMoved: number }>(
    `${DOCUMENTS_API}/folders/delete`,
    "POST",
    { name },
  );
}

export function canRenameFolder(folder: DocumentFolder | null | undefined): boolean {
  return Boolean(folder && !folder.builtIn && (folder.canRename ?? folder.canDelete));
}

export function deleteFolderPrompt(folder: Pick<DocumentFolder, "name" | "documentCount">) {
  const count = folder.documentCount;
  if (count === 0) return `Delete the folder "${folder.name}"?`;
  const docs = count === 1 ? "1 document" : `${count} documents`;
  return `Delete the folder "${folder.name}"? Its ${docs} will be kept and moved to All documents (no folder).`;
}

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Sort by name with numbers compared by value, so "EHS-2" comes before "EHS-10". */
export function sortByDocumentName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => nameCollator.compare(a.name.trim(), b.name.trim()));
}

export function sameFolderName(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** File types the documents API accepts for a version upload. */
export const DOCUMENT_UPLOAD_ACCEPT = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".txt",
].join(",");

/** Document name for an uploaded file: the filename without its extension. */
export function documentNameFromFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, "").trim();
  const withoutExt = base.replace(/\.[^.\s]{1,10}$/, "");
  const name = (withoutExt || base).replace(/[_\s]+/g, " ").trim();
  return name || "Untitled document";
}

export type FolderUploadDeps = {
  createDocument: (body: { name: string; category: string }) => Promise<{ id: string }>;
  uploadVersion: (documentId: string, file: File) => Promise<unknown>;
  /** Called when a file fails after its document was created, so no empty draft is left. */
  discardDocument?: (documentId: string) => Promise<unknown>;
};

export type FolderUploadResult = {
  uploaded: Array<{ filename: string; documentId: string }>;
  failed: Array<{ filename: string; error: unknown }>;
};

/**
 * Upload files into a folder through the normal document flow: each file becomes a new
 * document whose category is the folder name, with the file as its first version.
 */
export async function uploadFilesToFolder(
  folderName: string,
  files: readonly File[],
  deps: FolderUploadDeps,
): Promise<FolderUploadResult> {
  const result: FolderUploadResult = { uploaded: [], failed: [] };
  for (const file of files) {
    let documentId: string | null = null;
    try {
      const created = await deps.createDocument({
        name: documentNameFromFilename(file.name),
        category: folderName,
      });
      documentId = created.id;
      await deps.uploadVersion(created.id, file);
      result.uploaded.push({ filename: file.name, documentId: created.id });
    } catch (error) {
      if (documentId && deps.discardDocument) {
        await deps.discardDocument(documentId).catch(() => undefined);
      }
      result.failed.push({ filename: file.name, error });
    }
  }
  return result;
}

export function folderUploadNotice(folderName: string, uploadedCount: number): string {
  const docs = uploadedCount === 1 ? "1 document" : `${uploadedCount} documents`;
  return `Uploaded ${docs} to "${folderName}"`;
}

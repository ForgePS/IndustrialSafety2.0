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
  /** Only empty folders that someone created can be deleted. */
  canDelete: boolean;
};

export const EHS_POLICIES_CATEGORY = "EHS Policies";

/** Shown if the folder list can't load, so the built-in folder is still there. */
export const FALLBACK_DOCUMENT_FOLDERS: readonly DocumentFolder[] = [
  { id: null, name: EHS_POLICIES_CATEGORY, documentCount: 0, builtIn: true, canDelete: false },
];

export async function listDocumentFolders() {
  return apiGet<{ items: DocumentFolder[] }>(`${DOCUMENTS_API}/folders`);
}

export async function createDocumentFolder(name: string) {
  return apiSend<DocumentFolder>(`${DOCUMENTS_API}/folders`, "POST", { name });
}

export async function deleteDocumentFolder(id: string) {
  return apiSend<{ id: string; deleted: boolean }>(
    `${DOCUMENTS_API}/folders/${encodeURIComponent(id)}`,
    "DELETE",
  );
}

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Sort by name with numbers compared by value, so "EHS-2" comes before "EHS-10". */
export function sortByDocumentName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => nameCollator.compare(a.name.trim(), b.name.trim()));
}

export function sameFolderName(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

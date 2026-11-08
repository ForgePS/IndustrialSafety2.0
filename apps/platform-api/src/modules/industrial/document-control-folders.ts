/**
 * Document Control folders. A document is in a folder when its category equals the folder
 * name (case-insensitive). Folders come from three places: built-ins, folders users create
 * (platform_document_folders), and categories already used by documents.
 */

export const BUILT_IN_DOCUMENT_FOLDERS = ["EHS Policies"] as const;

export const MAX_FOLDER_NAME_LENGTH = 120;

export type DocumentFolderSummary = {
  /** Stored folder id; null for built-in folders and categories without a stored folder. */
  id: string | null;
  name: string;
  documentCount: number;
  builtIn: boolean;
  /** Every folder except built-ins can be renamed. */
  canRename: boolean;
  /**
   * Every folder except built-ins can be deleted. Its documents are kept and moved out of
   * the folder (category cleared).
   */
  canDelete: boolean;
};

/** Trim and collapse whitespace. Returns null when the name is empty or too long. */
export function normalizeFolderName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_FOLDER_NAME_LENGTH) return null;
  return name;
}

export function folderKey(name: string): string {
  return name.trim().toLowerCase();
}

export function isBuiltInFolder(
  name: string,
  builtIns: readonly string[] = BUILT_IN_DOCUMENT_FOLDERS,
) {
  return builtIns.some((builtIn) => folderKey(builtIn) === folderKey(name));
}

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareFolderNames(a: string, b: string): number {
  return nameCollator.compare(a, b);
}

export type FolderRenameCheck =
  | { ok: true; name: string; caseOnly: boolean }
  | { ok: false; code: "VALIDATION_FAILED" | "NOT_FOUND" | "CONFLICT"; message: string };

/** Validate renaming `from` to `to` against the current folder list. */
export function checkFolderRename(
  folders: readonly DocumentFolderSummary[],
  from: unknown,
  to: unknown,
): FolderRenameCheck {
  const oldName = normalizeFolderName(from);
  const newName = normalizeFolderName(to);
  if (!oldName || !newName) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: `Folder name is required (up to ${MAX_FOLDER_NAME_LENGTH} characters)`,
    };
  }
  const current = folders.find((f) => folderKey(f.name) === folderKey(oldName));
  if (!current) return { ok: false, code: "NOT_FOUND", message: "Folder not found" };
  if (!current.canRename) {
    return { ok: false, code: "VALIDATION_FAILED", message: `"${current.name}" can't be renamed` };
  }
  const caseOnly = folderKey(oldName) === folderKey(newName);
  if (!caseOnly && folders.some((f) => folderKey(f.name) === folderKey(newName))) {
    return { ok: false, code: "CONFLICT", message: `A folder named "${newName}" already exists` };
  }
  return { ok: true, name: newName, caseOnly };
}

export function mergeDocumentFolders(input: {
  stored: ReadonlyArray<{ id: string; name: string }>;
  categoryCounts: ReadonlyArray<{ category: string | null; count: number }>;
  builtIns?: readonly string[];
}): DocumentFolderSummary[] {
  const counts = new Map<string, number>();
  const categoryNames = new Map<string, string>();
  for (const row of input.categoryCounts) {
    const name = row.category?.trim();
    if (!name) continue;
    const key = folderKey(name);
    counts.set(key, (counts.get(key) ?? 0) + row.count);
    if (!categoryNames.has(key)) categoryNames.set(key, name);
  }

  const byKey = new Map<string, DocumentFolderSummary>();
  const add = (id: string | null, name: string, builtIn: boolean) => {
    const key = folderKey(name);
    if (byKey.has(key)) return;
    byKey.set(key, {
      id,
      name,
      documentCount: counts.get(key) ?? 0,
      builtIn,
      canRename: !builtIn,
      canDelete: !builtIn,
    });
  };
  for (const name of input.builtIns ?? BUILT_IN_DOCUMENT_FOLDERS) add(null, name, true);
  for (const row of input.stored) add(row.id, row.name, false);
  for (const name of categoryNames.values()) add(null, name, false);

  return [...byKey.values()].sort((a, b) => compareFolderNames(a.name, b.name));
}

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
  /** Only stored folders with no documents can be deleted. */
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

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareFolderNames(a: string, b: string): number {
  return nameCollator.compare(a, b);
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
  for (const name of input.builtIns ?? BUILT_IN_DOCUMENT_FOLDERS) {
    const key = folderKey(name);
    byKey.set(key, { id: null, name, documentCount: 0, builtIn: true, canDelete: false });
  }
  for (const row of input.stored) {
    const key = folderKey(row.name);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: row.id,
      name: row.name,
      documentCount: 0,
      builtIn: false,
      canDelete: true,
    });
  }
  for (const [key, name] of categoryNames) {
    if (byKey.has(key)) continue;
    byKey.set(key, { id: null, name, documentCount: 0, builtIn: false, canDelete: false });
  }

  return [...byKey.entries()]
    .map(([key, folder]) => {
      const documentCount = counts.get(key) ?? 0;
      return { ...folder, documentCount, canDelete: folder.canDelete && documentCount === 0 };
    })
    .sort((a, b) => compareFolderNames(a.name, b.name));
}

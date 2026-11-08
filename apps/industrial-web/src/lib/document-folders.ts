/** Document Control library folders. A folder is a saved category filter. */
export type DocumentFolder = {
  id: string;
  label: string;
  /** Category stored on documents in this folder; null means every document. */
  category: string | null;
};

export const EHS_POLICIES_CATEGORY = "EHS Policies";

export const DOCUMENT_FOLDERS: readonly DocumentFolder[] = [
  { id: "all", label: "All documents", category: null },
  { id: "ehs-policies", label: "EHS Policies", category: EHS_POLICIES_CATEGORY },
];

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Sort by name with numbers compared by value, so "EHS-2" comes before "EHS-10". */
export function sortByDocumentName<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => nameCollator.compare(a.name.trim(), b.name.trim()));
}

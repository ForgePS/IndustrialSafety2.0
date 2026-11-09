/** Shown when a course id has no matching course row (e.g. it was deleted). */
export const UNKNOWN_COURSE_TITLE = "—";

/**
 * Course ids referenced by QC rows that are not yet in the title map.
 * The QC course filter list only holds active courses, so questions and
 * completions from archived courses need a separate title lookup.
 */
export function missingCourseIds(
  known: ReadonlyMap<string, string>,
  ids: Iterable<string | null | undefined>,
): string[] {
  const missing = new Set<string>();
  for (const id of ids) {
    if (id && !known.has(id)) missing.add(id);
  }
  return [...missing];
}

export function courseTitleFor(
  titles: ReadonlyMap<string, string>,
  sourceId: string | null | undefined,
): string {
  const title = sourceId ? titles.get(sourceId)?.trim() : undefined;
  return title || UNKNOWN_COURSE_TITLE;
}

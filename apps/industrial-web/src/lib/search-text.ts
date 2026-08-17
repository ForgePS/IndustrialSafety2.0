/**
 * Shared text matching for the as-you-type filters in the industrial module.
 *
 * Roster data comes from a payroll export, so names carry accents, initials and
 * punctuation ("O'NEIL", "SMITH, JR.", "EMP-21055") that nobody types the same
 * way twice. Matching happens on a punctuation-free, accent-free form, token by
 * token, so word order does not matter and "smith john" finds "JOHN R SMITH".
 *
 * Word tokens match at the start of a word, not anywhere inside one: typing
 * "don" should find DON BAITY, not BRANDON and MCDONALD. Numeric tokens still
 * match anywhere so a partial employee number ("2492") keeps working.
 */

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchTokens(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized === "" ? [] : normalized.split(" ");
}

function haystackWords(haystack: readonly string[]): string[] {
  const normalized = normalizeSearchText(haystack.filter(Boolean).join(" "));
  return normalized === "" ? [] : normalized.split(" ");
}

function isNumeric(token: string): boolean {
  return /^[0-9]+$/.test(token);
}

/**
 * Every token has to match a word in the haystack, in any order. Letter tokens
 * match a word that starts with them; digit tokens match anywhere in a word.
 */
export function matchesSearchTokens(haystack: readonly string[], query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const words = haystackWords(haystack);
  if (words.length === 0) return false;
  return tokens.every((token) =>
    isNumeric(token)
      ? words.some((word) => word.includes(token))
      : words.some((word) => word.startsWith(token)),
  );
}

/**
 * Fallback for when a word-start search finds nobody: matches a token anywhere,
 * so "donald" can still reach MCDONALD once the strict pass comes up empty.
 */
export function matchesSearchTokensAnywhere(
  haystack: readonly string[],
  query: string,
): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const hay = normalizeSearchText(haystack.filter(Boolean).join(" "));
  return tokens.every((token) => hay.includes(token));
}

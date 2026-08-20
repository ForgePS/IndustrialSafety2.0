/**
 * Roster card model for the Personnel directory.
 *
 * The flat personnel list returns loosely typed rows (mapListItem spreads
 * sourcePayload over known columns), so normalizing happens here and the card
 * rendering stays free of `unknown` handling. Pure so the label rules are
 * unit-tested rather than eyeballed in the grid.
 */

import { resolvePersonnelLocationLabel } from "@/lib/personnel-file";
import { personHasPpeExpiryAlert } from "@/lib/personnel-ppe";
import { matchesSearchTokens, matchesSearchTokensAnywhere } from "@/lib/search-text";

export type RosterPerson = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  departmentName: string;
  employeeNumber: string;
  email: string;
  siteId: string;
  /** Free-text site from roster imports when siteId was never linked. */
  siteLabel: string;
  status: string;
  isCompanyDriver: boolean;
  hasPpeExpiryAlert: boolean;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Personnel file for one person. Ids stay in the query string (static export). */
export function personFileHref(id: string): string {
  return `/modules/personnel/person/?id=${encodeURIComponent(id)}`;
}

export function personEditHref(id: string): string {
  return `/modules/personnel/edit/?id=${encodeURIComponent(id)}`;
}

export function toRosterPerson(row: Record<string, unknown>): RosterPerson | null {
  const id = str(row.id);
  if (id === "") return null;

  const first = str(row.preferredName) || str(row.firstName);
  const displayName = str(row.displayName) || [first, str(row.lastName)].filter(Boolean).join(" ");

  return {
    id,
    displayName: displayName || id,
    firstName: str(row.firstName),
    lastName: str(row.lastName),
    jobTitle: str(row.jobTitle),
    departmentName: str(row.departmentName),
    employeeNumber: str(row.employeeNumber),
    email: str(row.email),
    siteId: str(row.siteId),
    siteLabel: resolvePersonnelLocationLabel(row),
    status: str(row.status),
    isCompanyDriver: row.isCompanyDriver === true,
    hasPpeExpiryAlert: personHasPpeExpiryAlert(row),
  };
}

export function toRosterPeople(rows: readonly unknown[]): RosterPerson[] {
  const people: RosterPerson[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const person = toRosterPerson(row as Record<string, unknown>);
    if (person) people.push(person);
  }
  return people;
}

export type RosterSort = "firstName" | "lastName";

export const ROSTER_SORT_OPTIONS: ReadonlyArray<{ value: RosterSort; label: string }> = [
  { value: "firstName", label: "First name (A–Z)" },
  { value: "lastName", label: "Last name (A–Z)" },
];

export const DEFAULT_ROSTER_SORT: RosterSort = "firstName";

function firstWord(value: string): string {
  return value.split(/\s+/)[0] ?? "";
}

function lastWord(value: string): string {
  const words = value.split(/\s+/).filter((w) => w !== "");
  return words.length === 0 ? "" : words[words.length - 1]!;
}

/**
 * Sort keys mirror the API's ORDER BY: a missing column falls back to the
 * matching word of the display name so imported records interleave with
 * hand-entered ones instead of clumping at one end.
 */
function sortKeys(person: RosterPerson, sort: RosterSort): [string, string] {
  const first = person.firstName || firstWord(person.displayName);
  const last = person.lastName || lastWord(person.displayName);
  return sort === "firstName" ? [first, last] : [last, first];
}

/**
 * Alphabetizes the loaded roster. The API sorts too; this keeps the grid in
 * order across appended pages and regardless of arrival order.
 */
export function sortRosterPeople(
  people: readonly RosterPerson[],
  sort: RosterSort,
): RosterPerson[] {
  const collate = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  return [...people].sort((a, b) => {
    const [aPrimary, aSecondary] = sortKeys(a, sort);
    const [bPrimary, bSecondary] = sortKeys(b, sort);
    return (
      collate(aPrimary, bPrimary) ||
      collate(aSecondary, bSecondary) ||
      collate(a.displayName, b.displayName)
    );
  });
}

/** Up to two letters for the card avatar. */
export function rosterInitials(displayName: string): string {
  const words = displayName
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w !== "");
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[1]![0]}`;
  return letters.toUpperCase();
}

/** Second line of the card: role, falling back the way the legacy roster did. */
export function rosterSubtitle(person: RosterPerson): string {
  return person.jobTitle || person.departmentName || "Team member";
}

/** Third line: employee number and where they work. */
export function rosterMeta(person: RosterPerson, siteName?: string): string {
  const place = siteName?.trim() || person.siteLabel || person.departmentName;
  return [person.employeeNumber, place].filter((part) => part !== "").join(" · ");
}

/** Sneat label class for a status badge. Unknown statuses stay neutral. */
export function statusBadgeClass(status: string): string {
  const key = status.trim().toLowerCase();
  if (key.startsWith("active")) return "bg-label-success";
  if (key.startsWith("leave")) return "bg-label-warning";
  if (key.startsWith("terminated")) return "bg-label-danger";
  return "bg-label-secondary";
}

function rosterHaystack(person: RosterPerson, siteName?: string): string[] {
  return [
    person.displayName,
    person.firstName,
    person.lastName,
    person.jobTitle,
    person.departmentName,
    person.employeeNumber,
    person.email,
    person.siteLabel,
    person.status,
    siteName ?? "",
  ];
}

/**
 * As-you-type narrowing across everything shown on a card. Wider than the
 * server's `q` filter (name, employee number, email) so typing a job title,
 * department or site still finds people. `anywhere` relaxes word-start matching
 * and is only used when the strict pass returns nobody.
 */
export function matchesRosterQuery(
  person: RosterPerson,
  query: string,
  siteName?: string,
  anywhere = false,
): boolean {
  const haystack = rosterHaystack(person, siteName);
  return anywhere
    ? matchesSearchTokensAnywhere(haystack, query)
    : matchesSearchTokens(haystack, query);
}

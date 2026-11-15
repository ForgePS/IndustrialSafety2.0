import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { industrialPersonnel } from "@forge/database";

export type PersonnelRow = typeof industrialPersonnel.$inferSelect;

export const EMPLOYEE_NUMBER_PREFIX = "EMP-";

/** Canonical EMP-#### form used when persisting training assignees. */
export function canonicalEmployeeNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  const withoutPrefix = upper.replace(/^EMP[-_\s]*/i, "");
  if (/^\d+$/.test(withoutPrefix)) {
    return `${EMPLOYEE_NUMBER_PREFIX}${String(Number(withoutPrefix))}`;
  }
  if (/^EMP[-_\s]*/i.test(upper)) {
    return `${EMPLOYEE_NUMBER_PREFIX}${withoutPrefix}`;
  }
  if (/^\d+$/.test(upper)) {
    return `${EMPLOYEE_NUMBER_PREFIX}${String(Number(upper))}`;
  }
  return upper;
}

/** Lowercase keys that should match the same roster person. */
export function employeeNumberLookupKeys(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const keys = new Set<string>();
  const add = (value: string) => {
    const next = value.trim();
    if (next) keys.add(next.toLowerCase());
  };

  add(trimmed);
  add(canonicalEmployeeNumber(trimmed));

  const upper = trimmed.toUpperCase();
  const withoutPrefix = upper.replace(/^EMP[-_\s]*/i, "");
  add(withoutPrefix);
  if (/^\d+$/.test(withoutPrefix)) {
    const numeric = String(Number(withoutPrefix));
    add(numeric);
    add(`${EMPLOYEE_NUMBER_PREFIX}${numeric}`);
    add(`EMP${numeric}`);
  }

  return [...keys];
}

export function employeeNumbersMatch(left: string, right: string): boolean {
  const leftKeys = new Set(employeeNumberLookupKeys(left));
  return employeeNumberLookupKeys(right).some((key) => leftKeys.has(key));
}

export function indexByEmployeeNumberAliases<T>(
  rows: Array<{ employeeNumber: string; value: T }>,
): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    for (const key of employeeNumberLookupKeys(row.employeeNumber)) {
      if (!map.has(key)) map.set(key, row.value);
    }
  }
  return map;
}

export function employeeNumberWhereClause(employeeNumber: string): SQL | null {
  const keys = employeeNumberLookupKeys(employeeNumber);
  if (!keys.length) return null;
  return or(
    ...keys.map((key) => sql`lower(trim(${industrialPersonnel.employeeNumber})) = ${key}`),
  )!;
}

function readDefaultEmployeeNumber(candidate: unknown): string | null {
  return typeof candidate === "object" &&
    candidate !== null &&
    "employeeNumber" in candidate &&
    typeof (candidate as { employeeNumber?: unknown }).employeeNumber === "string"
    ? (candidate as { employeeNumber: string }).employeeNumber
    : null;
}

export function pickPreferredPersonnelMatch<T>(
  candidates: readonly T[],
  input: string,
  readEmployeeNumber: (candidate: T) => string | null | undefined = readDefaultEmployeeNumber,
): T | null {
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0]!;
  const preferred = canonicalEmployeeNumber(input).toLowerCase();
  const exact = candidates.find(
    (person) => readEmployeeNumber(person)?.trim().toLowerCase() === preferred,
  );
  return exact ?? candidates[0]!;
}

export async function findPersonnelByEmployeeNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts the db handle or a transaction handle
  tx: any,
  tenantId: string,
  employeeNumber: string,
): Promise<PersonnelRow | null> {
  const clause = employeeNumberWhereClause(employeeNumber);
  if (!clause) return null;
  const candidates = await tx
    .select()
    .from(industrialPersonnel)
    .where(
      and(
        eq(industrialPersonnel.tenantId, tenantId),
        isNull(industrialPersonnel.archivedAt),
        clause,
      ),
    );
  return pickPreferredPersonnelMatch(candidates, employeeNumber);
}

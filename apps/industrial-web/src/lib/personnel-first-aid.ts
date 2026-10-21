/**
 * First Aid / CPR certification tracking: expiration windows, roster helpers.
 * Reuses PPE expiry status helpers for the shared 30-day alert window.
 */

import {
  PPE_EXPIRY_WARNING_DAYS,
  ppeExpiryBadgeClass,
  ppeExpiryLabel,
  ppeExpiryStatus,
  type PpeExpiryStatus,
} from "@/lib/personnel-ppe";
import { resolvePersonnelLocationLabel } from "@/lib/personnel-file";
import { personNameDisplay } from "@/lib/person-name-display";

export const FIRST_AID_EXPIRY_WARNING_DAYS = PPE_EXPIRY_WARNING_DAYS;

export type FirstAidExpiryStatus = PpeExpiryStatus;

export type PersonnelFirstAidSummary = {
  trackedCount: number;
  cprExpiringSoon: number;
  firstAidExpiringSoon: number;
  cprExpired: number;
  firstAidExpired: number;
  expiringWithinDays: number;
};

export const EMPTY_PERSONNEL_FIRST_AID_SUMMARY: PersonnelFirstAidSummary = {
  trackedCount: 0,
  cprExpiringSoon: 0,
  firstAidExpiringSoon: 0,
  cprExpired: 0,
  firstAidExpired: 0,
  expiringWithinDays: FIRST_AID_EXPIRY_WARNING_DAYS,
};

export const firstAidExpiryStatus = ppeExpiryStatus;
export const firstAidExpiryLabel = ppeExpiryLabel;
export const firstAidExpiryBadgeClass = ppeExpiryBadgeClass;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asIsoDate(value: unknown): string {
  const raw = asText(value);
  if (raw === "") return "";
  return /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1] ?? "";
}

function asBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function displayName(row: Record<string, unknown>): string {
  const display = asText(row.displayName);
  if (display) return personNameDisplay(display);
  const given = asText(row.preferredName) || asText(row.firstName);
  const last = asText(row.lastName);
  if (given && last) return personNameDisplay(`${given} ${last}`);
  return personNameDisplay(given || last || asText(row.id));
}

export type FirstAidPerson = {
  id: string;
  displayName: string;
  departmentName: string;
  locationLabel: string;
  employeeNumber: string;
  tracksFirstAid: boolean;
  cprExpiresDate: string;
  cprExpiryStatus: FirstAidExpiryStatus;
  firstAidExpiresDate: string;
  firstAidExpiryStatus: FirstAidExpiryStatus;
};

export type FirstAidFilter = "all" | "expiring" | "cpr" | "first-aid";

export function personTracksFirstAid(row: Record<string, unknown>): boolean {
  if (asBool(row.tracksFirstAid)) return true;
  return (
    asIsoDate(row.cprCertificationExpiresDate) !== "" ||
    asIsoDate(row.firstAidCertificationExpiresDate) !== ""
  );
}

export function toFirstAidPerson(
  row: Record<string, unknown>,
  today = new Date(),
): FirstAidPerson | null {
  const id = asText(row.id);
  if (!id || !personTracksFirstAid(row)) return null;
  const cprExpiresDate = asIsoDate(row.cprCertificationExpiresDate);
  const firstAidExpiresDate = asIsoDate(row.firstAidCertificationExpiresDate);
  return {
    id,
    displayName: displayName(row),
    departmentName: asText(row.departmentName) || asText(row.department),
    locationLabel: resolvePersonnelLocationLabel(row) || "Unassigned location",
    employeeNumber: asText(row.employeeNumber),
    tracksFirstAid: asBool(row.tracksFirstAid),
    cprExpiresDate,
    cprExpiryStatus: cprExpiresDate
      ? firstAidExpiryStatus(cprExpiresDate, today, FIRST_AID_EXPIRY_WARNING_DAYS)
      : "none",
    firstAidExpiresDate,
    firstAidExpiryStatus: firstAidExpiresDate
      ? firstAidExpiryStatus(firstAidExpiresDate, today, FIRST_AID_EXPIRY_WARNING_DAYS)
      : "none",
  };
}

export function toFirstAidPeople(items: unknown[], today = new Date()): FirstAidPerson[] {
  const people: FirstAidPerson[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const person = toFirstAidPerson(item as Record<string, unknown>, today);
    if (person) people.push(person);
  }
  return people;
}

export function matchesFirstAidQuery(person: FirstAidPerson, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const haystack = [
    person.displayName,
    person.departmentName,
    person.locationLabel,
    person.employeeNumber,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterFirstAidPeople(
  people: readonly FirstAidPerson[],
  filter: FirstAidFilter,
): FirstAidPerson[] {
  return people.filter((person) => {
    if (filter === "cpr") return person.cprExpiresDate !== "";
    if (filter === "first-aid") return person.firstAidExpiresDate !== "";
    if (filter === "expiring") {
      return (
        person.cprExpiryStatus === "expiring_soon" ||
        person.cprExpiryStatus === "expired" ||
        person.firstAidExpiryStatus === "expiring_soon" ||
        person.firstAidExpiryStatus === "expired"
      );
    }
    return true;
  });
}

/** Primary sort by location, then name. */
export function sortFirstAidPeople(people: readonly FirstAidPerson[]): FirstAidPerson[] {
  return [...people].sort((a, b) => {
    const byLocation = a.locationLabel.localeCompare(b.locationLabel, undefined, {
      sensitivity: "base",
    });
    if (byLocation !== 0) return byLocation;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  });
}

export function personHasFirstAidExpiryAlert(
  record: Record<string, unknown>,
  today = new Date(),
): boolean {
  if (!personTracksFirstAid(record)) return false;
  for (const key of ["cprCertificationExpiresDate", "firstAidCertificationExpiresDate"] as const) {
    const status = firstAidExpiryStatus(record[key], today, FIRST_AID_EXPIRY_WARNING_DAYS);
    if (status === "expiring_soon" || status === "expired") return true;
  }
  return false;
}

export function buildPersonnelFirstAidSummary(
  rows: readonly Record<string, unknown>[],
  today = new Date(),
  warningDays = FIRST_AID_EXPIRY_WARNING_DAYS,
): PersonnelFirstAidSummary {
  let trackedCount = 0;
  let cprExpiringSoon = 0;
  let firstAidExpiringSoon = 0;
  let cprExpired = 0;
  let firstAidExpired = 0;

  for (const row of rows) {
    if (!personTracksFirstAid(row)) continue;
    trackedCount += 1;
    const cprStatus = firstAidExpiryStatus(
      row.cprCertificationExpiresDate,
      today,
      warningDays,
    );
    const faStatus = firstAidExpiryStatus(
      row.firstAidCertificationExpiresDate,
      today,
      warningDays,
    );
    if (cprStatus === "expiring_soon") cprExpiringSoon += 1;
    if (cprStatus === "expired") cprExpired += 1;
    if (faStatus === "expiring_soon") firstAidExpiringSoon += 1;
    if (faStatus === "expired") firstAidExpired += 1;
  }

  return {
    trackedCount,
    cprExpiringSoon,
    firstAidExpiringSoon,
    cprExpired,
    firstAidExpired,
    expiringWithinDays: warningDays,
  };
}

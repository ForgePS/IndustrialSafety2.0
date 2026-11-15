import { sql, type SQL } from "drizzle-orm";
import { industrialPersonnel } from "@forge/database";

/** True when a personnel row should be treated as active (case-insensitive). */
export function isActivePersonnelStatus(status: string | null | undefined): boolean {
  return String(status ?? "")
    .trim()
    .toUpperCase()
    .startsWith("ACTIVE");
}

/** Canonical status for new/updated personnel rows. */
export function normalizePersonnelStatus(status: string | null | undefined): string {
  const raw = String(status ?? "ACTIVE").trim();
  if (raw === "") return "ACTIVE";
  const upper = raw.toUpperCase();
  if (upper.startsWith("ACTIVE")) return "ACTIVE";
  return upper;
}

/** Drizzle condition: personnel status matches `status` (case-insensitive). */
export function personnelStatusMatches(status: string): SQL {
  return sql`upper(btrim(${industrialPersonnel.status})) = upper(btrim(${status}))`;
}

/** Drizzle condition: personnel is active (Active, ACTIVE, etc.). */
export function personnelIsActive(): SQL {
  return sql`upper(btrim(${industrialPersonnel.status})) like 'ACTIVE%'`;
}

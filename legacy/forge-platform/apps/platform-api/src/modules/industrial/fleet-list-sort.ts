/**
 * Shared Fleet Assets / Renewals list ordering helpers.
 */

function renewalDueDate(row: {
  renewalDate: string | null;
  registrationRenewalMonth: number | null;
}): Date | null {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  let due: Date | null = null;
  if (row.renewalDate) {
    due = new Date(`${row.renewalDate}T00:00:00Z`);
  } else if (row.registrationRenewalMonth && row.registrationRenewalMonth >= 1) {
    const month = row.registrationRenewalMonth;
    const year = month < m || (month === m && d > 1) ? y + 1 : y;
    due = new Date(Date.UTC(year, month - 1, 1));
  }
  if (!due || Number.isNaN(due.getTime())) return null;
  return due;
}

export function fleetRenewalBucket(row: {
  renewalDate: string | null;
  registrationRenewalMonth: number | null;
}): string {
  const due = renewalDueDate(row);
  if (!due) return "UNKNOWN";
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  const diffDays = Math.floor((due.getTime() - Date.UTC(y, m - 1, d)) / 86400000);
  if (diffDays < 0) return "OVERDUE";
  if (diffDays <= 30) return "DUE_30";
  if (diffDays <= 60) return "DUE_60";
  if (diffDays <= 90) return "DUE_90";
  return "LATER";
}

/** Empty / missing locations sort after named locations. */
export function compareFleetLocationName(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  if (!left && right) return 1;
  if (left && !right) return -1;
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

export function compareFleetAssetsByLocation(
  a: { locationName?: string | null; assetNumber?: string | null; id?: string },
  b: { locationName?: string | null; assetNumber?: string | null; id?: string },
): number {
  const byLocation = compareFleetLocationName(a.locationName, b.locationName);
  if (byLocation !== 0) return byLocation;
  const aKey = String(a.assetNumber ?? a.id ?? "").trim();
  const bKey = String(b.assetNumber ?? b.id ?? "").trim();
  return aKey.localeCompare(bKey, undefined, { sensitivity: "base" });
}

/** Location first, then soonest renewal due date (unknown dates last). */
export function compareFleetRenewalsByLocationThenSoonest(
  a: {
    locationName?: string | null;
    renewalDate?: string | null;
    registrationRenewalMonth?: number | null;
    assetNumber?: string | null;
    id?: string;
  },
  b: {
    locationName?: string | null;
    renewalDate?: string | null;
    registrationRenewalMonth?: number | null;
    assetNumber?: string | null;
    id?: string;
  },
): number {
  const byLocation = compareFleetLocationName(a.locationName, b.locationName);
  if (byLocation !== 0) return byLocation;
  const aDue = renewalDueDate({
    renewalDate: a.renewalDate ?? null,
    registrationRenewalMonth: a.registrationRenewalMonth ?? null,
  })?.getTime();
  const bDue = renewalDueDate({
    renewalDate: b.renewalDate ?? null,
    registrationRenewalMonth: b.registrationRenewalMonth ?? null,
  })?.getTime();
  const aMs = aDue ?? Number.POSITIVE_INFINITY;
  const bMs = bDue ?? Number.POSITIVE_INFINITY;
  if (aMs !== bMs) return aMs - bMs;
  return compareFleetAssetsByLocation(a, b);
}

/** Split a roster display name into first / last for personnel create. */
export function splitDriverPersonName(raw: string): { firstName: string; lastName: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Unknown", lastName: "Driver" };
  if (parts.length === 1) {
    const only = parts[0] ?? "Driver";
    return { firstName: only, lastName: only };
  }
  const firstName = parts[0] ?? "Unknown";
  return { firstName, lastName: parts.slice(1).join(" ") || firstName };
}

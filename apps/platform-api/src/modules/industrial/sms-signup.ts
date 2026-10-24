/** US/Canada SMS number as 10 digits, or null when not a usable mobile number. */
export function normalizeSmsPhone(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  if (ten[0] === "0" || ten[0] === "1") return null;
  return ten;
}

export function formatSmsPhone(tenDigits: string): string {
  return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
}

export function maskSmsPhone(tenDigits: string): string {
  return `(***) ***-${tenDigits.slice(6)}`;
}

function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Surname candidates for a personnel file: the lastName column, else derived from displayName. */
function surnameCandidates(person: {
  lastName?: string | null;
  displayName?: string | null;
}): string[] {
  const out: string[] = [];
  const add = (value: string) => {
    const folded = foldName(value);
    if (folded.length >= 2 && !out.includes(folded)) out.push(folded);
  };
  const addWithParts = (value: string) => {
    add(value);
    const parts = value.split(/[\s-]+/).filter((p) => !NAME_SUFFIXES.has(foldName(p)));
    if (parts.length > 1) for (const part of parts) add(part);
  };

  const lastName = String(person.lastName ?? "").trim();
  if (lastName) {
    addWithParts(lastName);
    return out;
  }

  const displayName = String(person.displayName ?? "").trim();
  if (!displayName) return out;
  if (displayName.includes(",")) {
    addWithParts(displayName.split(",")[0]!);
    return out;
  }
  const tokens = displayName.split(/\s+/).filter((t) => !NAME_SUFFIXES.has(foldName(t)));
  if (tokens.length > 1) addWithParts(tokens[tokens.length - 1]!);
  return out;
}

/**
 * Case, accent, space, and punctuation-insensitive last name check.
 * Multi-part surnames also match on any single part ("Smith" matches "Smith-Jones").
 */
export function lastNameMatchesPersonnel(
  input: unknown,
  person: { lastName?: string | null; displayName?: string | null },
): boolean {
  const folded = foldName(String(input ?? ""));
  if (folded.length < 2) return false;
  return surnameCandidates(person).includes(folded);
}

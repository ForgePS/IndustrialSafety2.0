/**
 * ISO 3779 VIN check-digit validation (positions 1–17, digit at position 9).
 * Accepts 17-character VINs; rejects I/O/Q and bad check digits.
 */

const VIN_TRANSLITERATION: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
};

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export type VinValidationResult = {
  ok: boolean;
  normalized: string;
  reason?: string;
};

export function normalizeVin(input: string): string {
  return String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
}

export function validateVin(input: string): VinValidationResult {
  const normalized = normalizeVin(input);
  if (!normalized) {
    return { ok: false, normalized, reason: "empty" };
  }
  if (normalized.length !== 17) {
    return { ok: false, normalized, reason: "length" };
  }
  if (/[IOQ]/.test(normalized)) {
    return { ok: false, normalized, reason: "illegal_char" };
  }
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = normalized[i]!;
    const value = VIN_TRANSLITERATION[ch];
    if (value === undefined) {
      return { ok: false, normalized, reason: "illegal_char" };
    }
    sum += value * VIN_WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  if (normalized[8] !== expected) {
    return { ok: false, normalized, reason: "check_digit" };
  }
  return { ok: true, normalized };
}

export function isValidVin(input: string): boolean {
  return validateVin(input).ok;
}

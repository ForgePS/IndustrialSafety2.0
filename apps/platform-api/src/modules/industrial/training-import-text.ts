/** Decode uploaded quiz bank text with Excel/Windows-friendly fallbacks. */
export function decodeTextBuffer(buffer: Buffer): string {
  if (!buffer.length) return "";

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return sanitizeTrainingImportText(decodeUtf8(buffer.subarray(3)));
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return sanitizeTrainingImportText(new TextDecoder("utf-16le").decode(buffer.subarray(2)));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return sanitizeTrainingImportText(new TextDecoder("utf-16be").decode(buffer.subarray(2)));
  }

  const candidates: string[] = [];
  const utf8 = tryDecodeUtf8(buffer);
  if (utf8 != null) candidates.push(utf8);
  const windows = tryDecodeWindows1252(buffer);
  if (windows != null) candidates.push(windows);
  if (!candidates.length) candidates.push(buffer.toString("utf8"));

  const best = candidates.reduce((left, right) =>
    textQualityScore(left) <= textQualityScore(right) ? left : right,
  );
  return sanitizeTrainingImportText(best);
}

function decodeUtf8(buffer: Buffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

function tryDecodeUtf8(buffer: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function tryDecodeWindows1252(buffer: Buffer): string | null {
  try {
    const decoded = new TextDecoder("windows-1252").decode(buffer);
    if (!decoded.includes("\u0096") && !decoded.includes("\u0097")) return decoded;
  } catch {
    // Fall through to manual mapping.
  }
  return decodeWindows1252Manual(buffer);
}

export const CP1252_HIGH_BYTES: Record<number, string> = {
  0x80: "\u20AC",
  0x82: "\u201A",
  0x83: "\u0192",
  0x84: "\u201E",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02C6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017D",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201C",
  0x94: "\u201D",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02DC",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203A",
  0x9c: "\u0153",
  0x9e: "\u017E",
  0x9f: "\u0178",
};

const CP1252_UNICODE_TO_BYTE = new Map<number, number>(
  Object.entries(CP1252_HIGH_BYTES).map(([byte, ch]) => [ch.charCodeAt(0), Number(byte)]),
);

/** Re-encode text that was decoded as Windows-1252 back to raw bytes. */
function encodeWindows1252(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7f) {
      bytes.push(code);
      continue;
    }
    if (code >= 0xa0 && code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const mapped = CP1252_UNICODE_TO_BYTE.get(code);
    bytes.push(mapped ?? code & 0xff);
  }
  return Buffer.from(bytes);
}

function decodeWindows1252Manual(buffer: Buffer): string {
  let out = "";
  for (const byte of buffer) {
    const mapped = byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH_BYTES[byte] : undefined;
    out += mapped ?? String.fromCharCode(byte);
  }
  return out;
}

/** Lower is better — used to pick the best decode/codepage candidate. */
export function textQualityScore(text: string): number {
  let score = 0;
  const replacementCount = (text.match(/\uFFFD/g) ?? []).length;
  score += replacementCount * 1000;
  if (/â€™|â€œ|â€\u009d|â€"|â€"|Ã.|Â[^\s]/.test(text)) score += 200;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x80 && code <= 0x9f) score += 50;
  }
  return score;
}

/** Reverse UTF-8 bytes mis-read as Latin-1 / Windows-1252 (common Excel export issue). */
export function repairUtf8Mojibake(text: string): string {
  if (!text) return "";
  let current = text;
  for (let pass = 0; pass < 2; pass += 1) {
    if (!/[\u00C0-\u00FF]|â|Ã|Â|[\u0080-\u009F]/.test(current) && !current.includes("\uFFFD"))
      break;
    try {
      const bytes = encodeWindows1252(current);
      const candidate = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (candidate && textQualityScore(candidate) < textQualityScore(current)) {
        current = candidate;
        continue;
      }
    } catch {
      // ignore
    }
    try {
      const bytes = Buffer.from(current, "latin1");
      const candidate = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      if (candidate && textQualityScore(candidate) < textQualityScore(current)) {
        current = candidate;
        continue;
      }
    } catch {
      // ignore
    }
    break;
  }
  return current;
}

function mapLegacyControlChars(text: string): string {
  return text.replace(/[\u0080-\u009F]/g, (ch) => CP1252_HIGH_BYTES[ch.charCodeAt(0)] ?? "");
}

/** Normalize punctuation and repair common mojibake from mis-encoded imports. */
export function sanitizeTrainingImportText(text: string): string {
  return repairUtf8Mojibake(text)
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/[\u0080-\u009F]/g, (ch) => CP1252_HIGH_BYTES[ch.charCodeAt(0)] ?? "")
    .replace(/â€™|â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\u009d/g, '"')
    .replace(/â€"/g, "—")
    .replace(/â€"/g, "–")
    .replace(/â€¦/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/Â(?=[\s!?,.)}\]]|$)/g, "")
    .replace(/\uFFFD/g, "")
    .normalize("NFC")
    .trim();
}

export { mapLegacyControlChars };

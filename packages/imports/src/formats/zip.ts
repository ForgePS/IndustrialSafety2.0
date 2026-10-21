import { createHash } from "node:crypto";

export type ZipManifestEntry = {
  path: string;
  sha256?: string;
  required?: boolean;
  contentType?: string;
};

export type ZipManifest = {
  version: string;
  productNeutral: true;
  files: ZipManifestEntry[];
};

export type ZipInventoryItem = {
  path: string;
  compressedSize?: number;
};

export type ZipValidationResult =
  | {
      ok: true;
      inventory: ZipInventoryItem[];
      manifest: ZipManifest;
      verifiedChecksums: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      inventory?: ZipInventoryItem[];
    };

const SUPPORTED_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".xlsx",
  ".xml",
  ".txt",
  ".md",
]);

function listZipCentralDirectory(bytes: Uint8Array): ZipInventoryItem[] {
  const buf = Buffer.from(bytes);
  const items: ZipInventoryItem[] = [];
  let i = 0;
  while (i + 46 < buf.length) {
    const sig = buf.readUInt32LE(i);
    if (sig === 0x02014b50) {
      const nameLen = buf.readUInt16LE(i + 28);
      const extraLen = buf.readUInt16LE(i + 30);
      const commentLen = buf.readUInt16LE(i + 32);
      const compSize = buf.readUInt32LE(i + 20);
      const name = buf.subarray(i + 46, i + 46 + nameLen).toString("utf8");
      if (name && !name.endsWith("/")) {
        items.push({ path: name.replace(/\\/g, "/"), compressedSize: compSize });
      }
      i += 46 + nameLen + extraLen + commentLen;
      continue;
    }
    i += 1;
  }
  return items;
}

/** Reject absolute paths, drive letters, and `..` segments (ZIP Slip). */
export function isUnsafeZipEntryPath(pathName: string): boolean {
  const normalized = String(pathName ?? "").replace(/\\/g, "/").trim();
  if (!normalized) return true;
  if (normalized.startsWith("/") || normalized.startsWith("~")) return true;
  if (/^[a-zA-Z]:/.test(normalized)) return true;
  const segments = normalized.split("/");
  return segments.some((segment) => segment === ".." || segment === "");
}

function extractStoredFile(bytes: Uint8Array, pathName: string): Buffer | null {
  const buf = Buffer.from(bytes);
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString("utf8").replace(/\\/g, "/");
    const dataStart = nameStart + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (name === pathName) {
      if (method !== 0) return null; // only store method for S4 validation helpers
      return Buffer.from(data);
    }
    offset = dataStart + compSize;
  }
  return null;
}

export function parseZipManifest(raw: unknown): ZipManifest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.productNeutral !== true) return null;
  if (typeof obj.version !== "string" || !obj.version.trim()) return null;
  if (!Array.isArray(obj.files) || obj.files.length < 1) return null;
  const files: ZipManifestEntry[] = [];
  for (const entry of obj.files) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.path !== "string" || !e.path.trim()) return null;
    files.push({
      path: e.path.replace(/\\/g, "/"),
      ...(typeof e.sha256 === "string" ? { sha256: e.sha256.toLowerCase() } : {}),
      ...(typeof e.required === "boolean" ? { required: e.required } : {}),
      ...(typeof e.contentType === "string" ? { contentType: e.contentType } : {}),
    });
  }
  return { version: obj.version.trim(), productNeutral: true, files };
}

/**
 * Structure-only ZIP migration bundle validation.
 * Does not execute imports or unpack business rows.
 */
export function validateZipMigrationBundle(input: {
  bytes: Uint8Array;
  allowedExtensions?: Set<string>;
}): ZipValidationResult {
  if (input.bytes.length < 4 || input.bytes[0] !== 0x50 || input.bytes[1] !== 0x4b) {
    return { ok: false, code: "IMPORT_ZIP_INVALID", message: "Archive is not a ZIP package" };
  }
  const inventory = listZipCentralDirectory(input.bytes);
  if (inventory.length === 0) {
    return { ok: false, code: "IMPORT_ZIP_INVALID", message: "ZIP archive inventory is empty or corrupt" };
  }

  for (const item of inventory) {
    if (isUnsafeZipEntryPath(item.path)) {
      return {
        ok: false,
        code: "IMPORT_ZIP_UNSAFE_PATH",
        message: `Archive entry path is not allowed: ${item.path}`,
        inventory,
      };
    }
  }

  const allowed = input.allowedExtensions ?? SUPPORTED_EXTENSIONS;
  for (const item of inventory) {
    if (item.path.toLowerCase() === "manifest.json") continue;
    const lower = item.path.toLowerCase();
    const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
    if (!allowed.has(ext)) {
      return {
        ok: false,
        code: "IMPORT_ZIP_UNSUPPORTED_FILE",
        message: `Unsupported file in archive: ${item.path}`,
        inventory,
      };
    }
  }

  const manifestEntry = inventory.find((i) => i.path.toLowerCase() === "manifest.json");
  if (!manifestEntry) {
    return {
      ok: false,
      code: "IMPORT_ZIP_MANIFEST_MISSING",
      message: "manifest.json is required in ZIP migration bundles",
      inventory,
    };
  }

  const manifestBytes = extractStoredFile(input.bytes, manifestEntry.path);
  if (!manifestBytes) {
    return {
      ok: false,
      code: "IMPORT_ZIP_MANIFEST_INVALID",
      message: "manifest.json must be stored (uncompressed) for Sprint S4 validation",
      inventory,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    return {
      ok: false,
      code: "IMPORT_ZIP_MANIFEST_INVALID",
      message: "manifest.json is not valid JSON",
      inventory,
    };
  }
  const manifest = parseZipManifest(parsed);
  if (!manifest) {
    return {
      ok: false,
      code: "IMPORT_ZIP_MANIFEST_INVALID",
      message: "manifest.json failed schema validation",
      inventory,
    };
  }

  const inventoryPaths = new Set(inventory.map((i) => i.path));
  for (const file of manifest.files) {
    if (file.required !== false && !inventoryPaths.has(file.path)) {
      return {
        ok: false,
        code: "IMPORT_ZIP_MISSING_REQUIRED",
        message: `Required file missing from archive: ${file.path}`,
        inventory,
      };
    }
  }

  const verifiedChecksums: string[] = [];
  for (const file of manifest.files) {
    if (!file.sha256) continue;
    const content = extractStoredFile(input.bytes, file.path);
    if (!content) {
      return {
        ok: false,
        code: "IMPORT_ZIP_CHECKSUM_UNVERIFIED",
        message: `Unable to read stored file for checksum: ${file.path}`,
        inventory,
      };
    }
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== file.sha256.toLowerCase()) {
      return {
        ok: false,
        code: "IMPORT_ZIP_CHECKSUM_MISMATCH",
        message: `Checksum mismatch for ${file.path}`,
        inventory,
      };
    }
    verifiedChecksums.push(file.path);
  }

  return { ok: true, inventory, manifest, verifiedChecksums };
}

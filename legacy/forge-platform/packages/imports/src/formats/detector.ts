import type { DetectedFileMeta, FileDetector } from "../interfaces.js";
import { detectImportFormat } from "./detect.js";

/** Format detection for CSV / XLSX / JSON structure (no row import). */
export class StructureFileDetector implements FileDetector {
  async detect(input: {
    bytes: Uint8Array;
    fileName: string;
    contentType?: string;
  }): Promise<DetectedFileMeta> {
    const result = detectImportFormat(input);
    if (!result.ok) {
      const error = new Error(result.message);
      (error as Error & { code: string }).code = result.code;
      throw error;
    }
    return result.meta;
  }
}

/** @deprecated Prefer StructureFileDetector — retained for package compatibility. */
export class StubFileDetector extends StructureFileDetector {}

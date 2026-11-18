import type { DuplicateCandidate, DuplicateDetector, StagedRow } from "../interfaces.js";
import type { ProductModuleRef } from "../types.js";
import { detectDuplicates, DEFAULT_DUPLICATE_RULES, type ExistingRecord } from "./engine.js";

/**
 * Adapter-facing detector. Callers supply existing entity snapshots;
 * detection never reads or writes product tables directly.
 */
export class ConfigurableDuplicateDetector implements DuplicateDetector {
  constructor(
    private readonly loadExisting: (input: {
      tenantId: string;
      ref: ProductModuleRef;
      rows: StagedRow[];
    }) => Promise<ExistingRecord[]>,
  ) {}

  async detect(
    rows: StagedRow[],
    ref: ProductModuleRef,
    tenantId: string,
  ): Promise<DuplicateCandidate[]> {
    const existing = await this.loadExisting({ tenantId, ref, rows });
    const scored = detectDuplicates({
      incoming: rows.map((row) => ({
        sourceRowKey: row.sourceRowKey,
        fields: (row.mapped ?? row.raw) as Record<string, unknown>,
      })),
      existing,
      rules: DEFAULT_DUPLICATE_RULES,
    });
    return scored.map((item) => ({
      sourceRowKey: item.incomingSourceRowKey,
      matchedEntityId: item.existingEntityId,
      confidence: item.confidence,
      recommendedAction: item.recommendedAction,
      matchFields: item.matchFields,
    }));
  }
}

/** @deprecated Prefer ConfigurableDuplicateDetector */
export class StubDuplicateDetector extends ConfigurableDuplicateDetector {
  constructor() {
    super(async () => []);
  }
}

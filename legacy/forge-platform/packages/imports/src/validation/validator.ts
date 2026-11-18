import type { RowValidationResult, StagedRow, TargetSchema, Validator } from "../interfaces.js";
import { notImplemented } from "../types.js";

/** Reusable validation engine stub — rules listed in VALIDATION_RULE_KINDS. */
export class StubValidator implements Validator {
  async validate(_rows: StagedRow[], _schema: TargetSchema): Promise<RowValidationResult[]> {
    return notImplemented("Validator.validate");
  }
}

import type {
  ColumnMapper,
  ColumnMapping,
  PreviewGenerator,
  PreviewSummary,
  ProgressReporter,
  ProgressSnapshot,
  StagedRow,
  TargetSchema,
} from "../interfaces.js";
import { notImplemented } from "../types.js";

export class StubColumnMapper implements ColumnMapper {
  async suggest(_headers: string[], _schema: TargetSchema): Promise<ColumnMapping[]> {
    return notImplemented("ColumnMapper.suggest");
  }

  async apply(_rows: StagedRow[], _mappings: ColumnMapping[]): Promise<StagedRow[]> {
    return notImplemented("ColumnMapper.apply");
  }
}

export class StubPreviewGenerator implements PreviewGenerator {
  async generate(_input: {
    rows: StagedRow[];
    validations: unknown[];
    duplicates: unknown[];
  }): Promise<PreviewSummary> {
    return notImplemented("PreviewGenerator.generate");
  }
}

export class StubProgressReporter implements ProgressReporter {
  async report(_snapshot: ProgressSnapshot): Promise<void> {
    return notImplemented("ProgressReporter.report");
  }
}

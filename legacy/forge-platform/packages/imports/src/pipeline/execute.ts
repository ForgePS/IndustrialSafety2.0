import type {
  ColumnMapping,
  ExecuteBatchResult,
  ImportExecutor,
  RollbackHandler,
  RollbackResult,
  SchemaLoader,
  StagedRow,
  TargetSchema,
  Transformer,
} from "../interfaces.js";
import type { ProductModuleRef } from "../types.js";
import { notImplemented } from "../types.js";

export class StubSchemaLoader implements SchemaLoader {
  async load(_ref: ProductModuleRef, _tenantId: string): Promise<TargetSchema> {
    return notImplemented("SchemaLoader.load");
  }
}

export class StubTransformer implements Transformer {
  async transform(_rows: StagedRow[], _mappings: ColumnMapping[]): Promise<StagedRow[]> {
    return notImplemented("Transformer.transform");
  }
}

export class StubImportExecutor implements ImportExecutor {
  async executeBatch(_input: {
    tenantId: string;
    jobId: string;
    batchId: string;
    rows: StagedRow[];
    ref: ProductModuleRef;
  }): Promise<ExecuteBatchResult> {
    return notImplemented("ImportExecutor.executeBatch");
  }
}

export class StubRollbackHandler implements RollbackHandler {
  async rollback(_input: {
    tenantId: string;
    jobId: string;
    reason?: string;
  }): Promise<RollbackResult> {
    return notImplemented("RollbackHandler.rollback");
  }
}

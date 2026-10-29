import { Inject, Injectable } from "@nestjs/common";
import {
  nerisValueOptions,
  nerisValueSetHierarchy,
  nerisValueSets,
  nerisSchemaVersions,
  type Database,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { DATABASE } from "../../tokens.js";

@Injectable()
export class NerisValueSetService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listValueSets(input: {
    page?: number;
    pageSize?: number;
    search?: string;
    schemaVersionId?: string;
  }) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
    const offset = (page - 1) * pageSize;
    const versionId = input.schemaVersionId ?? (await this.requirePublishedVersionId());
    const filters = [eq(nerisValueSets.schemaVersionId, versionId)];
    if (input.search) {
      filters.push(
        or(
          ilike(nerisValueSets.sourceKey, `%${input.search}%`),
          ilike(nerisValueSets.name, `%${input.search}%`),
        )!,
      );
    }
    const where = and(...filters);
    const items = await this.db
      .select()
      .from(nerisValueSets)
      .where(where)
      .orderBy(asc(nerisValueSets.sourceKey))
      .limit(pageSize)
      .offset(offset);
    const totalRows = await this.db.select({ total: count() }).from(nerisValueSets).where(where);
    return { items, page, pageSize, total: totalRows[0]?.total ?? 0, schemaVersionId: versionId };
  }

  async getBySourceKey(sourceKey: string, schemaVersionId?: string) {
    const versionId = schemaVersionId ?? (await this.requirePublishedVersionId());
    const [row] = await this.db
      .select()
      .from(nerisValueSets)
      .where(
        and(eq(nerisValueSets.schemaVersionId, versionId), eq(nerisValueSets.sourceKey, sourceKey)),
      )
      .limit(1);
    if (!row) {
      const byName = await this.db
        .select()
        .from(nerisValueSets)
        .where(
          and(eq(nerisValueSets.schemaVersionId, versionId), eq(nerisValueSets.name, sourceKey)),
        );
      if (byName.length === 1) return byName[0]!;
      if (byName.length > 1) {
        throw new ForgeError("CONFLICT", "Ambiguous value-set name; use namespaced source_key", {
          details: [{ sourceKey, matches: byName.map((r) => r.sourceKey) }],
        });
      }
      throw new ForgeError("NOT_FOUND", `Value set not found: ${sourceKey}`);
    }
    return row;
  }

  async listOptions(input: {
    valueSetId: string;
    page?: number;
    pageSize?: number;
    search?: string;
    /** When true (default for new records), inactive options are excluded. */
    activeOnly?: boolean;
    includeInactive?: boolean;
  }) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, input.pageSize ?? 50));
    const offset = (page - 1) * pageSize;
    const activeOnly = input.includeInactive === true ? false : input.activeOnly !== false;
    const filters = [eq(nerisValueOptions.valueSetId, input.valueSetId)];
    if (activeOnly) filters.push(eq(nerisValueOptions.active, true));
    if (input.search) {
      filters.push(
        or(
          ilike(nerisValueOptions.code, `%${input.search}%`),
          ilike(nerisValueOptions.description, `%${input.search}%`),
        )!,
      );
    }
    const where = and(...filters);
    const items = await this.db
      .select()
      .from(nerisValueOptions)
      .where(where)
      .orderBy(asc(nerisValueOptions.ordinal))
      .limit(pageSize)
      .offset(offset);
    const totalRows = await this.db.select({ total: count() }).from(nerisValueOptions).where(where);
    return { items, page, pageSize, total: totalRows[0]?.total ?? 0, activeOnly };
  }

  async listHierarchy(valueSetId: string) {
    return this.db
      .select()
      .from(nerisValueSetHierarchy)
      .where(eq(nerisValueSetHierarchy.valueSetId, valueSetId))
      .orderBy(asc(nerisValueSetHierarchy.level), asc(nerisValueSetHierarchy.parentCode));
  }

  /** Resolve selectable options for new records (active only). */
  async selectableOptions(valueSetId: string, search?: string) {
    const input: {
      valueSetId: string;
      activeOnly: true;
      search?: string;
    } = { valueSetId, activeOnly: true };
    if (search !== undefined) input.search = search;
    return this.listOptions(input);
  }

  private async requirePublishedVersionId(): Promise<string> {
    const [row] = await this.db
      .select()
      .from(nerisSchemaVersions)
      .where(eq(nerisSchemaVersions.state, "PUBLISHED"))
      .orderBy(desc(nerisSchemaVersions.publishedAt))
      .limit(1);
    if (!row) throw new ForgeError("NOT_FOUND", "No published NERIS schema version");
    return row.id;
  }
}

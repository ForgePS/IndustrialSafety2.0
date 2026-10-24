/**
 * Idempotent NERIS schema import (Phase 1).
 *
 * Usage:
 *   pnpm neris:import-schema
 *   node /app/packages/database/dist/neris/import-schema.js   (ECS)
 */
import {
  NERIS_EXPECTED_COUNTS,
  buildHierarchyEdges,
  checksumRegistryFiles,
  getNerisRegistriesDir,
  loadFieldRegistryJson,
  loadValueSetsJson,
  parseConditionExpression,
  parseFieldRegistry,
  parseValueSetsRegistry,
} from "@forge/neris";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { createId } from "../ids.js";
import * as schema from "../schema.js";
import {
  nerisFieldConditions,
  nerisFieldMappings,
  nerisFields,
  nerisModuleGroups,
  nerisModules,
  nerisSchemaImportHistory,
  nerisSchemaPackages,
  nerisSchemaValidationResults,
  nerisSchemaVersions,
  nerisValueOptions,
  nerisValueSetHierarchy,
  nerisValueSets,
} from "../schema.js";

const PACKAGE_CODE = "NERIS_V1";
const PACKAGE_NAME = "NERIS V1 Core and Secondary";
const VERSION_LABEL = "v1.0.0";

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toUpperCase() === "TRUE";
  return false;
}

export interface NerisImportResult {
  outcome: "IMPORTED_PUBLISHED" | "IMPORTED_STAGED" | "SKIPPED_IDENTICAL";
  schemaVersionId: string;
  packageId: string;
  checksumSha256: string;
  moduleCount: number;
  fieldCount: number;
  valueSetCount: number;
  optionCount: number;
  validationErrorCount: number;
  validationWarningCount: number;
}

export async function importNerisSchema(options?: {
  registriesDir?: string;
  databaseUrl?: string;
  publish?: boolean;
  actorUserId?: string | null;
}): Promise<NerisImportResult> {
  const registriesDir = options?.registriesDir ?? getNerisRegistriesDir();
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const databaseUrl = options?.databaseUrl ?? env.DATABASE_URL;
  const publish = options?.publish !== false;

  const checksum = checksumRegistryFiles(registriesDir);
  const fieldRegistry = parseFieldRegistry(loadFieldRegistryJson(registriesDir));
  const valueSetsRegistry = parseValueSetsRegistry(loadValueSetsJson(registriesDir));

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });
  const now = new Date();

  try {
    let [pkg] = await db
      .select()
      .from(nerisSchemaPackages)
      .where(eq(nerisSchemaPackages.code, PACKAGE_CODE))
      .limit(1);
    if (!pkg) {
      const packageId = createId();
      await db.insert(nerisSchemaPackages).values({
        id: packageId,
        code: PACKAGE_CODE,
        name: PACKAGE_NAME,
        description: "Official NERIS V1 schema registries shipped with Forge RMS",
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
      [pkg] = await db
        .select()
        .from(nerisSchemaPackages)
        .where(eq(nerisSchemaPackages.id, packageId))
        .limit(1);
    }
    if (!pkg) throw new Error("Failed to resolve NERIS schema package");

    const [existingVersion] = await db
      .select()
      .from(nerisSchemaVersions)
      .where(
        and(
          eq(nerisSchemaVersions.packageId, pkg.id),
          eq(nerisSchemaVersions.checksumSha256, checksum),
        ),
      )
      .limit(1);

    if (existingVersion) {
      const moduleRows = await db
        .select({ moduleCount: sql<number>`count(*)::int` })
        .from(nerisModules)
        .where(eq(nerisModules.schemaVersionId, existingVersion.id));
      const fieldRows = await db
        .select({ fieldCount: sql<number>`count(*)::int` })
        .from(nerisFields)
        .where(eq(nerisFields.schemaVersionId, existingVersion.id));
      const valueSetRows = await db
        .select({ valueSetCount: sql<number>`count(*)::int` })
        .from(nerisValueSets)
        .where(eq(nerisValueSets.schemaVersionId, existingVersion.id));
      const optionRows = await db
        .select({ optionCount: sql<number>`count(*)::int` })
        .from(nerisValueOptions)
        .innerJoin(nerisValueSets, eq(nerisValueOptions.valueSetId, nerisValueSets.id))
        .where(eq(nerisValueSets.schemaVersionId, existingVersion.id));
      const moduleCount = moduleRows[0]?.moduleCount ?? 0;
      const fieldCount = fieldRows[0]?.fieldCount ?? 0;
      const valueSetCount = valueSetRows[0]?.valueSetCount ?? 0;
      const optionCount = optionRows[0]?.optionCount ?? 0;

      const complete =
        moduleCount === NERIS_EXPECTED_COUNTS.modules &&
        fieldCount === NERIS_EXPECTED_COUNTS.fields &&
        valueSetCount === NERIS_EXPECTED_COUNTS.valueSets &&
        optionCount === NERIS_EXPECTED_COUNTS.options;

      if (complete) {
        await db.insert(nerisSchemaImportHistory).values({
          id: createId(),
          packageId: pkg.id,
          schemaVersionId: existingVersion.id,
          checksumSha256: checksum,
          outcome: "SKIPPED_IDENTICAL",
          moduleCount,
          fieldCount,
          valueSetCount,
          optionCount,
          detailsJson: { message: "Checksum matches existing schema version" },
          actorUserId: options?.actorUserId ?? null,
          createdAt: now,
        });

        return {
          outcome: "SKIPPED_IDENTICAL",
          schemaVersionId: existingVersion.id,
          packageId: pkg.id,
          checksumSha256: checksum,
          moduleCount,
          fieldCount,
          valueSetCount,
          optionCount,
          validationErrorCount: 0,
          validationWarningCount: 0,
        };
      }

      // Incomplete prior import for this checksum — remove and re-import.
      await db.execute(
        sql`delete from neris_schema_validation_results where schema_version_id = ${existingVersion.id}`,
      );
      await db.execute(
        sql`delete from neris_schema_import_history where schema_version_id = ${existingVersion.id}`,
      );
      await db.execute(sql`
        delete from neris_value_set_hierarchy
        where value_set_id in (select id from neris_value_sets where schema_version_id = ${existingVersion.id})
      `);
      await db.execute(sql`
        delete from neris_value_options
        where value_set_id in (select id from neris_value_sets where schema_version_id = ${existingVersion.id})
      `);
      await db.execute(
        sql`delete from neris_value_sets where schema_version_id = ${existingVersion.id}`,
      );
      await db.execute(sql`
        delete from neris_field_mappings
        where field_id in (select id from neris_fields where schema_version_id = ${existingVersion.id})
      `);
      await db.execute(sql`
        delete from neris_field_conditions
        where field_id in (select id from neris_fields where schema_version_id = ${existingVersion.id})
      `);
      await db.execute(
        sql`delete from neris_fields where schema_version_id = ${existingVersion.id}`,
      );
      await db.execute(sql`
        delete from neris_module_groups
        where module_id in (select id from neris_modules where schema_version_id = ${existingVersion.id})
      `);
      await db.execute(
        sql`delete from neris_modules where schema_version_id = ${existingVersion.id}`,
      );
      await db.execute(sql`delete from neris_schema_versions where id = ${existingVersion.id}`);
    }

    // Supersede previously published versions for this package.
    if (publish) {
      await db
        .update(nerisSchemaVersions)
        .set({ state: "SUPERSEDED", updatedAt: now, effectiveTo: now })
        .where(
          and(
            eq(nerisSchemaVersions.packageId, pkg.id),
            eq(nerisSchemaVersions.state, "PUBLISHED"),
          ),
        );
    }

    const schemaVersionId = createId();
    await db.insert(nerisSchemaVersions).values({
      id: schemaVersionId,
      packageId: pkg.id,
      versionLabel: VERSION_LABEL,
      checksumSha256: checksum,
      state: publish ? "PUBLISHED" : "STAGED",
      sourceFieldRegistryPath: path.join(registriesDir, "neris_field_registry.json"),
      sourceValueSetsPath: path.join(registriesDir, "neris_value_sets.json"),
      moduleCount: 0,
      fieldCount: 0,
      valueSetCount: 0,
      optionCount: 0,
      effectiveFrom: publish ? now : null,
      publishedAt: publish ? now : null,
      createdAt: now,
      updatedAt: now,
    });

    let moduleCount = 0;
    let fieldCount = 0;
    let valueSetCount = 0;
    let optionCount = 0;

    // Value sets first so field refs can be validated later.
    const valueSetIdBySourceKey = new Map<string, string>();
    const optionIdBySetAndCode = new Map<string, string>();

    for (const valueSet of valueSetsRegistry.value_sets) {
      const valueSetId = createId();
      valueSetIdBySourceKey.set(valueSet.source_key, valueSetId);
      await db.insert(nerisValueSets).values({
        id: valueSetId,
        schemaVersionId,
        packageId: pkg.id,
        sourceKey: valueSet.source_key,
        name: valueSet.name,
        sourceWorkbook: valueSet.source_workbook ?? null,
        optionCount: valueSet.options.length,
        createdAt: now,
        updatedAt: now,
      });
      valueSetCount += 1;

      for (const [optIndex, option] of valueSet.options.entries()) {
        const optionId = createId();
        optionIdBySetAndCode.set(`${valueSetId}:${option.value}`, optionId);
        const metadata: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(option)) {
          if (
            ![
              "value",
              "active",
              "description",
              "definition",
              "source",
              "ordinal",
              "value_1",
              "value_2",
              "value_3",
              "description_1",
              "description_2",
              "description_3",
            ].includes(key)
          ) {
            metadata[key] = value;
          }
        }
        await db.insert(nerisValueOptions).values({
          id: optionId,
          valueSetId,
          code: option.value,
          active: option.active !== false,
          description: option.description ?? null,
          definition: option.definition ?? null,
          source: option.source ?? null,
          ordinal: option.ordinal ?? optIndex + 1,
          value1: option.value_1 ?? null,
          value2: option.value_2 ?? null,
          value3: option.value_3 ?? null,
          description1: option.description_1 ?? null,
          description2: option.description_2 ?? null,
          description3: option.description_3 ?? null,
          metadataJson: metadata,
          createdAt: now,
          updatedAt: now,
        });
        optionCount += 1;
      }

      const edges = buildHierarchyEdges(valueSet.options);
      for (const edge of edges) {
        await db.insert(nerisValueSetHierarchy).values({
          id: createId(),
          valueSetId,
          parentOptionId: optionIdBySetAndCode.get(`${valueSetId}:${edge.parentCode}`) ?? null,
          childOptionId: optionIdBySetAndCode.get(`${valueSetId}:${edge.childCode}`) ?? null,
          parentCode: edge.parentCode,
          childCode: edge.childCode,
          level: edge.level,
          createdAt: now,
        });
      }
    }

    for (const [moduleIndex, mod] of fieldRegistry.modules.entries()) {
      const moduleId = createId();
      await db.insert(nerisModules).values({
        id: moduleId,
        schemaVersionId,
        moduleKey: mod.key,
        name: mod.name,
        area: mod.area ?? null,
        sourceWorkbook: mod.source_workbook ?? null,
        fieldCount: mod.fields.length,
        ordinal: moduleIndex + 1,
        createdAt: now,
        updatedAt: now,
      });
      moduleCount += 1;

      const groupIdByKey = new Map<string, string>();
      for (const [groupIndex, group] of (mod.groups ?? []).entries()) {
        const groupId = createId();
        groupIdByKey.set(group.key, groupId);
        await db.insert(nerisModuleGroups).values({
          id: groupId,
          moduleId,
          groupKey: group.key,
          ordinal: groupIndex + 1,
          createdAt: now,
        });
      }

      for (const [fieldIndex, field] of mod.fields.entries()) {
        const fieldId = createId();
        const groupKey = field.group ?? null;
        const groupId = groupKey ? (groupIdByKey.get(groupKey) ?? null) : null;
        if (groupKey && !groupId) {
          const createdGroupId = createId();
          groupIdByKey.set(groupKey, createdGroupId);
          await db.insert(nerisModuleGroups).values({
            id: createdGroupId,
            moduleId,
            groupKey,
            ordinal: groupIdByKey.size,
            createdAt: now,
          });
        }

        await db.insert(nerisFields).values({
          id: fieldId,
          schemaVersionId,
          moduleId,
          groupId: groupKey ? groupIdByKey.get(groupKey)! : null,
          fieldKey: field.name,
          dataType: field.type ?? null,
          cardinality: field.cardinality ?? null,
          format: field.format ?? null,
          officialRequired: asBool(field.db_required),
          nerisCore: asBool(field.neris_core),
          nerisCoreAid: asBool(field.neris_core_aid),
          computed: asBool(field.computed),
          computedFrom: field.computed_from ?? null,
          valueSetRef: asBool(field.value_set),
          valueSetLocation: field.value_set_location ?? null,
          valueSetCandidatesJson: field.value_set_candidates ?? [],
          definition: field.definition ?? field.description ?? null,
          exampleJson: field.example ?? null,
          comments: field.comments ?? null,
          ordinal: field.ordinal ?? fieldIndex + 1,
          immutableOfficial: true,
          createdAt: now,
          updatedAt: now,
        });
        fieldCount += 1;

        const possible = parseConditionExpression(field.possible_if ?? null);
        await db.insert(nerisFieldConditions).values({
          id: createId(),
          fieldId,
          conditionKind: "POSSIBLE_IF",
          rawExpression: possible.raw,
          ruleJson: possible.rule,
          parseStatus: possible.status,
          createdAt: now,
          updatedAt: now,
        });
        const coreIf = parseConditionExpression(field.neris_core_if ?? null);
        if (coreIf.status !== "EMPTY") {
          await db.insert(nerisFieldConditions).values({
            id: createId(),
            fieldId,
            conditionKind: "NERIS_CORE_IF",
            rawExpression: coreIf.raw,
            ruleJson: coreIf.rule,
            parseStatus: coreIf.status,
            createdAt: now,
            updatedAt: now,
          });
        }

        await db.insert(nerisFieldMappings).values({
          id: createId(),
          fieldId,
          mapOrmLanding: field.map_orm_landing ?? null,
          mapApp: field.map_app ?? null,
          payloadPath: field.map_app ?? field.map_orm_landing ?? null,
          immutableOfficial: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await db
      .update(nerisSchemaVersions)
      .set({
        moduleCount,
        fieldCount,
        valueSetCount,
        optionCount,
        updatedAt: now,
      })
      .where(eq(nerisSchemaVersions.id, schemaVersionId));

    const importHistoryId = createId();
    await db.insert(nerisSchemaImportHistory).values({
      id: importHistoryId,
      packageId: pkg.id,
      schemaVersionId,
      checksumSha256: checksum,
      outcome: publish ? "IMPORTED_PUBLISHED" : "IMPORTED_STAGED",
      moduleCount,
      fieldCount,
      valueSetCount,
      optionCount,
      detailsJson: {
        expected: NERIS_EXPECTED_COUNTS,
        registriesDir,
      },
      actorUserId: options?.actorUserId ?? null,
      createdAt: now,
    });

    const findings = await runIntegrityValidation({
      schemaVersionId,
      importHistoryId,
      moduleCount,
      fieldCount,
      valueSetCount,
      optionCount,
      fieldRegistry,
      valueSetIdBySourceKey,
      db,
      now,
    });

    return {
      outcome: publish ? "IMPORTED_PUBLISHED" : "IMPORTED_STAGED",
      schemaVersionId,
      packageId: pkg.id,
      checksumSha256: checksum,
      moduleCount,
      fieldCount,
      valueSetCount,
      optionCount,
      validationErrorCount: findings.errors,
      validationWarningCount: findings.warnings,
    };
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function runIntegrityValidation(input: {
  schemaVersionId: string;
  importHistoryId: string;
  moduleCount: number;
  fieldCount: number;
  valueSetCount: number;
  optionCount: number;
  fieldRegistry: ReturnType<typeof parseFieldRegistry>;
  valueSetIdBySourceKey: Map<string, string>;
  db: ReturnType<typeof drizzle<typeof schema>>;
  now: Date;
}): Promise<{ errors: number; warnings: number }> {
  const findings: Array<{
    severity: "ERROR" | "WARNING" | "ADVISORY" | "INFO";
    code: string;
    message: string;
    resourceType?: string;
    resourceKey?: string;
    detailsJson?: Record<string, unknown>;
  }> = [];

  if (input.moduleCount !== NERIS_EXPECTED_COUNTS.modules) {
    findings.push({
      severity: "ERROR",
      code: "MODULE_COUNT_MISMATCH",
      message: `Expected ${NERIS_EXPECTED_COUNTS.modules} modules, imported ${input.moduleCount}`,
    });
  }
  if (input.fieldCount !== NERIS_EXPECTED_COUNTS.fields) {
    findings.push({
      severity: "ERROR",
      code: "FIELD_COUNT_MISMATCH",
      message: `Expected ${NERIS_EXPECTED_COUNTS.fields} fields, imported ${input.fieldCount}`,
    });
  }
  if (input.valueSetCount !== NERIS_EXPECTED_COUNTS.valueSets) {
    findings.push({
      severity: "ERROR",
      code: "VALUE_SET_COUNT_MISMATCH",
      message: `Expected ${NERIS_EXPECTED_COUNTS.valueSets} value sets, imported ${input.valueSetCount}`,
    });
  }
  if (input.optionCount !== NERIS_EXPECTED_COUNTS.options) {
    findings.push({
      severity: "ERROR",
      code: "OPTION_COUNT_MISMATCH",
      message: `Expected ${NERIS_EXPECTED_COUNTS.options} options, imported ${input.optionCount}`,
    });
  }

  const valueSetNames = new Set(
    [...input.valueSetIdBySourceKey.keys()].map((key) => key.split(".").slice(1).join(".") || key),
  );
  for (const key of input.valueSetIdBySourceKey.keys()) {
    valueSetNames.add(key);
  }

  for (const mod of input.fieldRegistry.modules) {
    for (const field of mod.fields) {
      const location = field.value_set_location;
      const candidates = field.value_set_candidates ?? [];
      if (location) {
        const resolved =
          input.valueSetIdBySourceKey.has(location) ||
          [...input.valueSetIdBySourceKey.keys()].some(
            (sourceKey) => sourceKey === location || sourceKey.endsWith(`.${location}`),
          ) ||
          location.startsWith("mod_");
        if (!resolved && asBool(field.value_set)) {
          findings.push({
            severity: "WARNING",
            code: "UNRESOLVED_VALUE_SET",
            message: `Field ${mod.key}.${field.name} references unresolved value set ${location}`,
            resourceType: "field",
            resourceKey: `${mod.key}.${field.name}`,
            detailsJson: { location, candidates },
          });
        }
      }
      for (const candidate of candidates) {
        const resolved = [...input.valueSetIdBySourceKey.keys()].some(
          (sourceKey) => sourceKey === candidate || sourceKey.endsWith(`.${candidate}`),
        );
        if (!resolved) {
          findings.push({
            severity: "WARNING",
            code: "UNRESOLVED_VALUE_SET_CANDIDATE",
            message: `Field ${mod.key}.${field.name} candidate ${candidate} not found`,
            resourceType: "field",
            resourceKey: `${mod.key}.${field.name}`,
          });
        }
      }
    }
  }

  findings.push({
    severity: "INFO",
    code: "IMPORT_COUNTS",
    message: "Import counts recorded",
    detailsJson: {
      modules: input.moduleCount,
      fields: input.fieldCount,
      valueSets: input.valueSetCount,
      options: input.optionCount,
    },
  });

  for (const finding of findings) {
    await input.db.insert(nerisSchemaValidationResults).values({
      id: createId(),
      schemaVersionId: input.schemaVersionId,
      importHistoryId: input.importHistoryId,
      severity: finding.severity,
      code: finding.code,
      message: finding.message,
      resourceType: finding.resourceType ?? null,
      resourceKey: finding.resourceKey ?? null,
      detailsJson: finding.detailsJson ?? {},
      createdAt: input.now,
    });
  }

  return {
    errors: findings.filter((f) => f.severity === "ERROR").length,
    warnings: findings.filter((f) => f.severity === "WARNING").length,
  };
}

async function main(): Promise<void> {
  const result = await importNerisSchema({ publish: true });
  // eslint-disable-next-line no-console -- CLI output
  console.info(JSON.stringify({ ok: true, ...result }, null, 2));
  if (result.validationErrorCount > 0) {
    process.exitCode = 2;
  }
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("import-schema.ts") ||
  process.argv[1]?.endsWith("import-schema.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

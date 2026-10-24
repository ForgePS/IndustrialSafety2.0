#!/usr/bin/env node
/**
 * Classify Phase 1 NERIS schema import WARNINGs (report-only; never deletes rows).
 *
 * Usage:
 *   node scripts/neris-classify-phase1-warnings.mjs
 *   node scripts/neris-classify-phase1-warnings.mjs --json
 *   node scripts/neris-classify-phase1-warnings.mjs --write-doc
 *
 * Prefers DATABASE_URL / FORGE_DATABASE_URL when set (published schema version).
 * Falls back to registry snapshot validation (same rules as import-schema.ts).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const REGISTRIES_DIR = join(REPO_ROOT, "packages/neris/registries");

const CATEGORIES = [
  "expected-source",
  "ambiguous-condition",
  "unsupported-expression",
  "missing-metadata",
  "needs-review",
  "defect",
];

function asBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toUpperCase() === "TRUE";
  return false;
}

function extractLocation(message) {
  const match = /unresolved value set (\S+)/i.exec(message ?? "");
  return match?.[1] ?? null;
}

function extractCandidate(message) {
  const match = /candidate (\S+) not found/i.exec(message ?? "");
  return match?.[1] ?? null;
}

/**
 * @param {{ code: string; message: string; resourceKey?: string | null; detailsJson?: Record<string, unknown> }} warning
 * @param {Set<string>} valueSetKeys
 */
export function classifyWarning(warning, valueSetKeys) {
  const details = warning.detailsJson ?? {};
  const code = warning.code;

  if (code === "UNRESOLVED_VALUE_SET_CANDIDATE") {
    const candidate = extractCandidate(warning.message);
    const nearMatch = candidate
      ? [...valueSetKeys].some(
          (key) =>
            key === candidate ||
            key.endsWith(`.${candidate}`) ||
            key.includes(candidate) ||
            candidate.includes(key.split(".").pop() ?? ""),
        )
      : false;
    if (nearMatch) return "ambiguous-condition";
    return "missing-metadata";
  }

  if (code === "UNRESOLVED_VALUE_SET") {
    const location =
      typeof details.location === "string" ? details.location : extractLocation(warning.message);
    const candidates = Array.isArray(details.candidates) ? details.candidates : [];

    if (location?.startsWith("mod_")) {
      return "expected-source";
    }

    const suffixResolved = location
      ? [...valueSetKeys].some((key) => key === location || key.endsWith(`.${location}`))
      : false;
    if (suffixResolved) {
      return "defect";
    }

    const basename = location?.includes(".") ? location.split(".").pop() : location;
    const basenameHits = basename
      ? [...valueSetKeys].filter((key) => key.endsWith(`.${basename}`) || key === basename)
      : [];
    if (basenameHits.length > 1) {
      return "ambiguous-condition";
    }
    if (basenameHits.length === 1) {
      return "expected-source";
    }

    if (candidates.length > 0) {
      const anyCandidateResolves = candidates.some((candidate) =>
        [...valueSetKeys].some((key) => key === candidate || key.endsWith(`.${candidate}`)),
      );
      if (anyCandidateResolves) return "ambiguous-condition";
      return "missing-metadata";
    }

    if (/^(type_|status_|cause_|mod_)/.test(location ?? "")) {
      return "expected-source";
    }

    if ((location ?? "").includes(".")) {
      return "expected-source";
    }

    return "needs-review";
  }

  if (code.includes("CONDITION") || code.includes("EXPRESSION")) {
    return "unsupported-expression";
  }

  return "needs-review";
}

function loadJson(name) {
  return JSON.parse(readFileSync(join(REGISTRIES_DIR, name), "utf8"));
}

function collectWarningsFromRegistry(registriesDir = REGISTRIES_DIR) {
  const fieldRegistry = loadJson("neris_field_registry.json");
  const valueSetsRegistry = loadJson("neris_value_sets.json");

  const valueSetIdBySourceKey = new Map();
  for (const valueSet of valueSetsRegistry.value_sets ?? []) {
    valueSetIdBySourceKey.set(valueSet.source_key, valueSet.source_key);
  }

  const valueSetKeys = new Set(valueSetIdBySourceKey.keys());
  const warnings = [];

  for (const mod of fieldRegistry.modules ?? []) {
    for (const field of mod.fields ?? []) {
      const location = field.value_set_location;
      const candidates = field.value_set_candidates ?? [];
      if (location) {
        const resolved =
          valueSetIdBySourceKey.has(location) ||
          [...valueSetIdBySourceKey.keys()].some(
            (sourceKey) => sourceKey === location || sourceKey.endsWith(`.${location}`),
          ) ||
          location.startsWith("mod_");
        if (!resolved && asBool(field.value_set)) {
          warnings.push({
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
        const resolved = [...valueSetIdBySourceKey.keys()].some(
          (sourceKey) => sourceKey === candidate || sourceKey.endsWith(`.${candidate}`),
        );
        if (!resolved) {
          warnings.push({
            severity: "WARNING",
            code: "UNRESOLVED_VALUE_SET_CANDIDATE",
            message: `Field ${mod.key}.${field.name} candidate ${candidate} not found`,
            resourceType: "field",
            resourceKey: `${mod.key}.${field.name}`,
            detailsJson: { candidate },
          });
        }
      }
    }
  }

  return { warnings, valueSetKeys, registriesDir };
}

async function loadWarningsFromDatabase(databaseUrl) {
  const postgres = require("postgres");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const versions = await sql`
      SELECT id, version_label, checksum_sha256, state
      FROM neris_schema_versions
      WHERE state = 'PUBLISHED'
      ORDER BY published_at DESC NULLS LAST
      LIMIT 1
    `;
    if (versions.length === 0) {
      return { source: "database", warnings: [], schemaVersion: null, valueSetKeys: new Set() };
    }
    const schemaVersion = versions[0];
    const rows = await sql`
      SELECT severity, code, message, resource_type, resource_key, details_json
      FROM neris_schema_validation_results
      WHERE schema_version_id = ${schemaVersion.id}
        AND severity = 'WARNING'
      ORDER BY code, resource_key
    `;
    const valueSetRows = await sql`
      SELECT source_key FROM neris_value_sets WHERE schema_version_id = ${schemaVersion.id}
    `;
    const valueSetKeys = new Set(valueSetRows.map((row) => row.source_key));
    return {
      source: "database",
      schemaVersion,
      valueSetKeys,
      warnings: rows.map((row) => ({
        severity: row.severity,
        code: row.code,
        message: row.message,
        resourceType: row.resource_type,
        resourceKey: row.resource_key,
        detailsJson: row.details_json ?? {},
      })),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function summarize(classified) {
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  for (const row of classified) {
    byCategory[row.category].push(row);
  }
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, byCategory[c].length]));
  return { byCategory, counts, total: classified.length };
}

function buildReportMarkdown(result) {
  const { source, schemaVersion, counts, byCategory, total } = result;
  const samples = (category, limit = 5) =>
    byCategory[category]
      .slice(0, limit)
      .map(
        (row) =>
          `| \`${row.code}\` | \`${row.resourceKey ?? ""}\` | ${row.message.replace(/\|/g, "\\|")} |`,
      )
      .join("\n");

  return `# Phase 1 NERIS import warning classification

Generated by \`scripts/neris-classify-phase1-warnings.mjs\`.

## Summary

| Metric | Value |
|--------|------:|
| Total WARNINGs | ${total} |
| Data source | ${source} |
| Schema version | ${schemaVersion?.version_label ?? "registry snapshot"} |
| Checksum | ${schemaVersion?.checksum_sha256 ?? "n/a"} |

## Counts by category

| Category | Count | Meaning |
|----------|------:|---------|
| expected-source | ${counts["expected-source"]} | Cross-module or namespaced value-set references present in official NERIS source |
| ambiguous-condition | ${counts["ambiguous-condition"]} | Alternate \`value_set_candidates\` or basename collisions |
| unsupported-expression | ${counts["unsupported-expression"]} | Condition/expression constructs not yet parsed |
| missing-metadata | ${counts["missing-metadata"]} | Candidate or location metadata absent from value-sets registry |
| needs-review | ${counts["needs-review"]} | Unclassified; manual triage |
| defect | ${counts["defect"]} | Importer should have resolved but did not |

## Sample rows

### expected-source

| Code | Resource | Message |
|------|----------|---------|
${samples("expected-source") || "| — | — | — |"}

### ambiguous-condition

| Code | Resource | Message |
|------|----------|---------|
${samples("ambiguous-condition") || "| — | — | — |"}

### missing-metadata

| Code | Resource | Message |
|------|----------|---------|
${samples("missing-metadata") || "| — | — | — |"}

### needs-review

| Code | Resource | Message |
|------|----------|---------|
${samples("needs-review") || "| — | — | — |"}

## Methodology

1. Read WARNING rows from \`neris_schema_validation_results\` for the **published** schema version when \`DATABASE_URL\` or \`FORGE_DATABASE_URL\` is available.
2. Otherwise replay validation rules from \`packages/database/src/neris/import-schema.ts\` against shipped registry JSON (no DB writes).
3. Classify each warning with deterministic heuristics in this script (\`classifyWarning\`). **Warnings are never deleted** — this is a read-only report.
4. After \`pnpm db:migrate\` and \`pnpm neris:import-schema\`, the live database query is authoritative for counts.

## Notes

- Phase 1 import recorded **108** validation WARNINGs with **0** ERRORs (see \`docs/sprints/NERIS-PHASE-1-summary.md\`).
- INFO rows such as \`IMPORT_COUNTS\` are excluded from this classification.
`;
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const writeDoc = process.argv.includes("--write-doc");
  const databaseUrl = process.env.DATABASE_URL ?? process.env.FORGE_DATABASE_URL;

  let loaded;
  if (databaseUrl) {
    try {
      loaded = await loadWarningsFromDatabase(databaseUrl);
      if (loaded.warnings.length === 0) {
        loaded = null;
      }
    } catch (error) {
      console.warn(
        JSON.stringify({
          warn: "database_unavailable",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      loaded = null;
    }
  }

  if (!loaded || loaded.warnings.length === 0) {
    const snapshot = collectWarningsFromRegistry();
    loaded = {
      source: "registry_snapshot",
      schemaVersion: null,
      valueSetKeys: snapshot.valueSetKeys,
      warnings: snapshot.warnings,
    };
  }

  const classified = loaded.warnings.map((warning) => ({
    ...warning,
    category: classifyWarning(warning, loaded.valueSetKeys),
  }));

  const summary = summarize(classified);
  const payload = {
    source: loaded.source,
    schemaVersion: loaded.schemaVersion,
    total: summary.total,
    counts: summary.counts,
    warnings: classified,
  };

  if (writeDoc) {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const docPath = path.join(
      process.cwd(),
      "docs/neris/testing/phase-1-import-warning-classification.md",
    );
    await fs.mkdir(path.dirname(docPath), { recursive: true });
    await fs.writeFile(
      docPath,
      buildReportMarkdown({
        ...summary,
        source: loaded.source,
        schemaVersion: loaded.schemaVersion,
      }),
      "utf8",
    );
    console.info(JSON.stringify({ ok: true, wrote: docPath, counts: summary.counts }, null, 2));
    return;
  }

  if (jsonOut) {
    console.info(JSON.stringify(payload, null, 2));
    return;
  }

  console.info(
    JSON.stringify(
      {
        ok: true,
        source: loaded.source,
        total: summary.total,
        counts: summary.counts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

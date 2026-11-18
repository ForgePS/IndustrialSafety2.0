#!/usr/bin/env node
// Builds the Aurora migration set from 2.0's Supabase migrations.
//
//   node scripts/portability/translate-migrations.cjs [--out <dir>] [--check]
//
// Writes <out>/<version>_<name>.sql for each migration (default out: integration/aurora/build,
// which is git-ignored) plus manifest.json with checksums and every dropped statement.
// --check translates without writing and fails if a migration cannot be translated.
// See docs/INTEGRATION_2X_INTO_1X_PLAN.md.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { translateMigration, DEFAULT_TARGET } = require('./sql.cjs')

const root = path.resolve(__dirname, '..', '..')
const migrationsDir = path.join(root, 'apps', 'web', 'supabase', 'migrations')
const args = process.argv.slice(2)
const check = args.includes('--check')
const outIndex = args.indexOf('--out')
const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(root, 'integration', 'aurora', 'build')

const files = fs.readdirSync(migrationsDir).filter(file => /^\d{14}_.+\.sql$/.test(file)).sort()
const entries = []

if (!check) fs.mkdirSync(outDir, { recursive: true })

for (const file of files) {
  const source = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
  const { sql, dropped } = translateMigration(source, DEFAULT_TARGET)
  const [, version, name] = /^(\d{14})_(.+)\.sql$/.exec(file)
  const body = `-- Translated for Aurora from apps/web/supabase/migrations/${file}. Do not edit; regenerate.\n${sql}`

  entries.push({
    version,
    name,
    file,
    checksum: crypto.createHash('sha256').update(body).digest('hex'),
    dropped: dropped.map(item => ({ reason: item.reason, statement: item.statement.slice(0, 200) }))
  })

  if (!check) fs.writeFileSync(path.join(outDir, file), body)
}

const summary = {
  target: DEFAULT_TARGET,
  migrations: entries
}

if (!check) fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n')

const droppedCount = entries.reduce((total, entry) => total + entry.dropped.length, 0)

console.log(`${entries.length} migrations translated, ${droppedCount} statements dropped (Supabase-only or provided by the shim)${check ? '' : ` -> ${path.relative(root, outDir)}`}`)

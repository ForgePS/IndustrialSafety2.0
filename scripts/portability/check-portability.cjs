#!/usr/bin/env node
// Keeps 2.0 deployable into 1.0's AWS as an update (docs/INTEGRATION_2X_INTO_1X_PLAN.md).
//
//   node scripts/portability/check-portability.cjs            check; exits 1 on a violation
//   node scripts/portability/check-portability.cjs --update   rewrite the code baseline (it may only shrink)
//
// Migrations newer than the baseline's sqlBaselineVersion must stay inside what the Aurora shim
// supports. Code may reach Supabase Auth, Supabase Storage and Vercel only through the platform
// adapters in apps/web/src/lib/platform; existing direct uses are listed in baseline.json and may
// only go down.
const fs = require('fs')
const path = require('path')
const { SHIM_REASON, statements, codeOnly, translateMigration } = require('./sql.cjs')

const root = path.resolve(__dirname, '..', '..')
const baselinePath = path.join(__dirname, 'baseline.json')
const migrationsDir = path.join(root, 'apps', 'web', 'supabase', 'migrations')
const update = process.argv.includes('--update')
const allowIncrease = process.argv.includes('--allow-increase')
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
const failures = []

// ---------------------------------------------------------------------------------------------
// SQL rules for new migrations
// ---------------------------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = new Set(['pgcrypto', 'vector', 'btree_gist'])

const SQL_RULES = [
  {
    id: 'auth-read',
    test: code => /\b(from|join|update|into|delete\s+from)\s+auth\s*\.\s*\w+/i.test(code),
    message: 'reads or writes Supabase Auth tables. Reference auth.users(id) only as a foreign key; read names and emails from public.users'
  },
  {
    id: 'auth-other',
    test: code => /\bauth\s*\.\s*(?!users\b|uid\s*\()\w+/i.test(code),
    message: 'uses an auth.* object other than auth.users(id) and auth.uid(); the Aurora shim provides only those'
  },
  {
    id: 'storage-objects',
    test: code => /\bstorage\s*\.\s*objects\b/i.test(code),
    message: 'adds Supabase Storage policies. On Aurora files are in S3; authorize file access in server code through the storage adapter'
  },
  {
    id: 'storage-bucket',
    test: code => /\bstorage\s*\.\s*buckets\b/i.test(code) && !/^\s*insert\s+into\s+storage\s*\.\s*buckets\b/i.test(code.replace(/^\s*--.*$/gm, '')),
    message: 'changes Supabase Storage buckets other than by creating one (insert into storage.buckets ... on conflict do nothing)'
  },
  {
    id: 'supabase-internal',
    test: code => /\bsupabase_\w+|\bpgsodium\b|\bvault\s*\.|\bgraphql\s*\.|\brealtime\s*\.|\bnet\s*\.\s*http_|\bcron\s*\.\s*schedule|\bpublication\b/i.test(code),
    message: 'uses a Supabase-only service (internal roles, vault, realtime, pg_net, pg_cron, publications)'
  },
  {
    id: 'extension',
    test: code => {
      const match = /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/i.exec(code)

      return match ? !ALLOWED_EXTENSIONS.has(match[1].toLowerCase()) : false
    },
    message: `creates an extension other than ${[...ALLOWED_EXTENSIONS].join(', ')}`
  },
  {
    id: 'schema',
    test: code => /\bcreate\s+schema\b(?!\s+(if\s+not\s+exists\s+)?extensions\b)/i.test(code),
    message: 'creates a schema. 2.0 objects go in public (translated to forge2 on Aurora)'
  },
  {
    id: 'role',
    test: code => /\b(create|alter|drop)\s+(role|user)\b|\bowner\s+to\b|^\s*set\s+(session\s+|local\s+)?role\b/im.test(code),
    message: 'manages roles or ownership. Roles are fixed by integration/aurora/00_platform_shim.sql'
  },
  {
    id: 'unqualified-create',
    test: code =>
      /\bcreate\s+(?:or\s+replace\s+)?(?:table|view|materialized\s+view|function|type|sequence)\s+(?:if\s+not\s+exists\s+(?!public\s*\.|"public"\s*\.)|(?!if\s+not\s+exists\b)(?!public\s*\.|"public"\s*\.))[a-z_"]/i.test(code),
    message: 'creates an object without the public. prefix. Qualify every new table, view, function, type and sequence with public.'
  }
]

const migrationFiles = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort()
let previousVersion = ''

for (const file of migrationFiles) {
  const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(file)

  if (!match) {
    failures.push(`${file}: migration names must be <14-digit timestamp>_<lowercase_name>.sql`)
    continue
  }

  const version = match[1]

  if (version === previousVersion) failures.push(`${file}: duplicate migration version ${version}`)
  previousVersion = version

  if (version <= baseline.sqlBaselineVersion) continue

  const source = fs.readFileSync(path.join(migrationsDir, file), 'utf8')

  statements(source).forEach((statement, index) => {
    const code = codeOnly(statement)

    for (const rule of SQL_RULES) {
      if (rule.test(code)) {
        const line = source.slice(0, source.indexOf(statement.trim())).split('\n').length

        failures.push(`${file}:${line} [${rule.id}] statement ${index + 1} ${rule.message}`)
      }
    }
  })

  const { dropped } = translateMigration(source)

  for (const item of dropped) {
    if (!/^(--[^\n]*\n\s*)*insert\s+into\s+storage\s*\.\s*buckets\b/i.test(item.statement)) {
      failures.push(`${file} [translate] the Aurora translation would drop: ${item.statement.replace(/\s+/g, ' ').slice(0, 120)}`)
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Code rules: direct platform use outside the adapters
// ---------------------------------------------------------------------------------------------

const CODE_ROOTS = ['apps/web/src', 'packages']
const ADAPTER_DIRS = ['apps/web/src/lib/platform/', 'packages/supabase/src/', 'packages/auth/src/']

const CODE_RULES = [
  { id: 'supabase-storage', pattern: /\.storage\s*\.\s*from\s*\(/g },
  { id: 'supabase-auth', pattern: /\.auth\s*\.\s*(?:admin\b|mfa\b|getUser|getSession|getClaims|signIn\w*|signUp|signOut|updateUser|verifyOtp|exchangeCodeForSession|resetPasswordForEmail|refreshSession|setSession|onAuthStateChange|reauthenticate|resend|linkIdentity|unlinkIdentity)/g },
  { id: 'supabase-session', pattern: /\bgetAuthUser\b|\bgetPublicUser\b/g },
  { id: 'vercel', pattern: /\bVERCEL(?:_\w+)?\b|['"]@vercel\//g }
]

const walk = dir => {
  const full = path.join(root, dir)

  if (!fs.existsSync(full)) return []

  return fs.readdirSync(full, { withFileTypes: true }).flatMap(entry => {
    const relative = `${dir}/${entry.name}`

    if (entry.isDirectory()) return ['node_modules', '.next', 'dist', '.turbo'].includes(entry.name) ? [] : walk(relative)

    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [relative] : []
  })
}

const counts = {}

for (const file of CODE_ROOTS.flatMap(walk)) {
  if (ADAPTER_DIRS.some(dir => file.startsWith(dir))) continue

  const text = fs.readFileSync(path.join(root, file), 'utf8')

  for (const rule of CODE_RULES) {
    const hits = (text.match(rule.pattern) || []).length

    if (hits) {
      counts[rule.id] ??= {}
      counts[rule.id][file] = hits
    }
  }
}

const shrunk = []

for (const rule of CODE_RULES) {
  const allowed = baseline.code[rule.id] || {}
  const found = counts[rule.id] || {}

  for (const [file, hits] of Object.entries(found)) {
    const limit = allowed[file] || 0

    if (hits > limit && !(update && allowIncrease)) {
      failures.push(`${file} [${rule.id}] ${hits} direct use(s), ${limit} allowed. Go through apps/web/src/lib/platform instead`)
    }
  }

  for (const [file, limit] of Object.entries(allowed)) {
    if ((found[file] || 0) < limit) shrunk.push(`${file} [${rule.id}] ${limit} -> ${found[file] || 0}`)
  }
}

if (update) {
  if (failures.length) {
    console.error('Not updating the baseline while there are violations:\n' + failures.map(item => '  ' + item).join('\n'))
    process.exit(1)
  }

  const code = {}

  for (const rule of CODE_RULES) code[rule.id] = Object.fromEntries(Object.entries(counts[rule.id] || {}).sort())

  fs.writeFileSync(baselinePath, JSON.stringify({ ...baseline, code }, null, 2) + '\n')
  console.log(`baseline updated (${shrunk.length} entries shrank)`)
  process.exit(0)
}

if (shrunk.length) {
  console.log('Direct platform use went down; run with --update to lock it in:\n' + shrunk.map(item => '  ' + item).join('\n'))
}

if (failures.length) {
  console.error(`Portability check failed (${failures.length}):\n` + failures.map(item => '  ' + item).join('\n'))
  console.error('See docs/INTEGRATION_2X_INTO_1X_PLAN.md, "Guards in 2.0 CI".')
  process.exit(1)
}

console.log(`Portability check passed: ${migrationFiles.length} migrations, code within baseline.`)

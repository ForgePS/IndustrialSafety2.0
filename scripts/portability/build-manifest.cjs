#!/usr/bin/env node
// Builds integration/manifest.json: what this 2.0 release adds to 1.0 (modules, permissions, menu
// entries, routes). 1.0 reads it at deploy time to register them (docs/INTEGRATION_2X_INTO_1X_PLAN.md).
//
//   node scripts/portability/build-manifest.cjs           write the manifest
//   node scripts/portability/build-manifest.cjs --check   fail if the committed manifest is out of date
//
// Needs a database with all migrations applied (local Supabase, or SUPABASE_DB_URL in CI). Registry
// rows come from migrations only; seed data (tenants, demo records) is never read.
const fs = require('fs')
const path = require('path')
const { query } = require('./db.cjs')

const root = path.resolve(__dirname, '..', '..')
const manifestPath = path.join(root, 'integration', 'manifest.json')
const appDir = path.join(root, 'apps', 'web', 'src', 'app')
const check = process.argv.includes('--check')

// json_agg separates elements with newlines, which would split the psql row; JSON text never holds
// a raw newline (strings escape it), so removing them is safe.
const json = sql => {
  const rows = query(`select replace(coalesce(json_agg(t), '[]'::json)::text, E'\\n', '') from (${sql}) t`)

  return JSON.parse(rows[0][0])
}

const features = json(`
  select feature_key as key, name, category, feature_type as type, platform_state as state,
         requires_entitlement as "requiresEntitlement", tenant_configurable as "tenantConfigurable"
  from public.forge_feature_registry order by feature_key`)

const permissions = json(`
  select permission_key as key, feature_key as feature, permission_group as "group", action,
         scope_options as scopes, default_scope as "defaultScope", tenant_assignable as "tenantAssignable",
         is_sensitive as sensitive
  from public.forge_permission_registry order by permission_key`)

// The sidebar reads menu entries from forge_experience_elements (src/lib/forgeExperience.ts).
const navigation = json(`
  select e.element_key as key, p.element_key as parent, coalesce(e.default_label, e.name) as label, e.route,
         f.feature_key as feature, e.category, e.sort_order as "sortOrder", e.platform_enabled as enabled,
         coalesce((e.settings->>'route_live')::boolean, false) as "routeLive"
  from public.forge_experience_elements e
  left join public.forge_experience_elements p on p.id = e.parent_id
  left join public.forge_feature_registry f on f.id = e.feature_id
  where e.element_type = 'menu'
  order by e.element_key`)

// Every page and API route, with route groups like (back) removed.
const routes = { pages: [], api: [] }

const walk = (dir, segments) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_')) continue
      walk(path.join(dir, entry.name), /^\(.*\)$/.test(entry.name) ? segments : [...segments, entry.name])
      continue
    }

    const route = '/' + segments.join('/')

    if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) routes.pages.push(route)
    if (/^route\.(tsx|ts|js)$/.test(entry.name)) (route.startsWith('/api/') ? routes.api : routes.pages).push(route)
  }
}

walk(appDir, [])
routes.pages.sort()
routes.api.sort()

const webPackage = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'web', 'package.json'), 'utf8'))
const migrations = fs.readdirSync(path.join(root, 'apps', 'web', 'supabase', 'migrations')).filter(file => /^\d{14}_/.test(file)).sort()

const manifest = {
  product: 'forge-industrial-safety-2.0',
  version: webPackage.version,
  basePath: '/v2',
  schemaVersion: migrations[migrations.length - 1].slice(0, 14),
  database: { schema: 'forge2', ledger: 'forge2.schema_migrations' },
  modules: features,
  permissions,
  navigation,
  routes,
  // Frequencies as documented: docs/PORT_S2_WORKERS_COMP.md, docs/FIS_HD_01_HELP_DESK_SPRINT.md,
  // docs/FORGE_AI_COMMAND_CENTER_DISCOVERY.md. Each job takes a bearer secret.
  scheduledJobs: [
    { key: 'workers-comp', method: 'POST', path: '/api/workers-comp/cron', secret: 'FORGE_CRON_SECRET', schedule: 'rate(1 hour)' },
    { key: 'helpdesk', method: 'POST', path: '/api/helpdesk/cron', secret: 'HELPDESK_CRON_SECRET', schedule: 'rate(5 minutes)' },
    { key: 'forge-ai-watch', method: 'POST', path: '/api/forge-ai/watch/cron', secret: 'FORGE_AI_CRON_SECRET', schedule: 'rate(1 day)' },
    { key: 'corrective-actions', method: 'POST', path: '/api/corrective-actions/cron', secret: 'FORGE_CRON_SECRET', schedule: 'rate(1 hour)' }
  ]
}

const text = JSON.stringify(manifest, null, 2) + '\n'

if (check) {
  const current = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8').replace(/\r\n/g, '\n') : ''

  if (current !== text) {
    console.error('integration/manifest.json is out of date. Run: node scripts/portability/build-manifest.cjs')
    process.exit(1)
  }

  console.log('integration/manifest.json is up to date.')
} else {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, text)
  console.log(`wrote integration/manifest.json: ${features.length} modules/features, ${permissions.length} permissions, ${navigation.length} menu entries, ${routes.pages.length} pages, ${routes.api.length} API routes`)
}

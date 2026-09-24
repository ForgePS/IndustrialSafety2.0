// Validate every Forge AI strict function schema without an API key.
const fs = require('node:fs')
const path = require('node:path')
const ts = require(require.resolve('typescript', { paths: [path.resolve('apps/web')] }))

const sourcePath = path.resolve('apps/web/src/lib/forgeAiTools.ts')
const source = fs.readFileSync(sourcePath, 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText
const moduleShim = { exports: {} }
new Function('require', 'module', 'exports', output)(
  () => ({}), moduleShim, moduleShim.exports
)

const definitions = source
  .split('const definitions: Record<string, any> = {')[1]
  .split('\nexport const getForgeAiToolDefinitions')[0]
const keys = [...definitions.matchAll(/^  ([a-z_]+): \{/gm)].map(match => match[1])
const capabilities = keys.map(capability_key => ({ capability_key, capability_type: 'read' }))
capabilities.push({ capability_key: 'prepare_action', capability_type: 'action' })
const tools = moduleShim.exports.getForgeAiToolDefinitions(capabilities, [{ action_key: 'test_action' }])
const names = new Set(tools.map(tool => tool.name))

for (const key of [...keys, 'prepare_action']) {
  if (!names.has(key)) throw new Error('Tool definition missing: ' + key)
}

for (const tool of tools) {
  if (tool.strict !== true) throw new Error('Tool is not strict: ' + tool.name)
  const check = (schema, location) => {
    if (!schema || typeof schema !== 'object') return
    if (schema.type === 'object' || (Array.isArray(schema.type) && schema.type.includes('object'))) {
      const fields = Object.keys(schema.properties || {})
      if (schema.additionalProperties !== false ||
          !Array.isArray(schema.required) ||
          fields.some(field => !schema.required.includes(field)) ||
          schema.required.some(field => !fields.includes(field))) {
        throw new Error('Invalid strict schema at ' + location)
      }
      for (const [field, property] of Object.entries(schema.properties || {})) {
        check(property, location + '.' + field)
      }
    }
    if (schema.items) check(schema.items, location + '[]')
  }
  check(tool.parameters, tool.name)
}
console.log('Validated ' + tools.length + ' strict Forge AI tool schemas.')

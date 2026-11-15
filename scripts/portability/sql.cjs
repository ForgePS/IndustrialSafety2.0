// Shared SQL helpers for the portability tools: a small lexer that splits migration text into
// statements and tells code apart from comments and string literals, and the Supabase → Aurora
// translation rules. See docs/INTEGRATION_2X_INTO_1X_PLAN.md.

// Splits SQL into segments of { kind: 'code' | 'comment' | 'string' | 'dollar', text }.
// Dollar-quoted bodies (functions, DO blocks) are SQL code, so callers translate them like code.
const lex = sql => {
  const out = []
  let i = 0
  let start = 0

  const push = (kind, end) => {
    if (end > start) out.push({ kind, text: sql.slice(start, end) })
    start = end
  }

  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]

    if (c === '-' && next === '-') {
      push('code', i)
      const end = sql.indexOf('\n', i)

      i = end === -1 ? sql.length : end
      push('comment', i)
      continue
    }

    if (c === '/' && next === '*') {
      push('code', i)
      const end = sql.indexOf('*/', i + 2)

      i = end === -1 ? sql.length : end + 2
      push('comment', i)
      continue
    }

    if (c === "'") {
      push('code', i)
      i++

      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2
        else if (sql[i] === "'") break
        else i++
      }

      i++
      push('string', i)
      continue
    }

    if (c === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))

      if (tag) {
        push('code', i)
        const end = sql.indexOf(tag[0], i + tag[0].length)

        i = end === -1 ? sql.length : end + tag[0].length
        push('dollar', i)
        continue
      }
    }

    i++
  }

  push('code', sql.length)

  return out
}

// Splits into top-level statements; a statement keeps its trailing semicolon.
const statements = sql => {
  const result = []
  let current = ''

  for (const segment of lex(sql)) {
    if (segment.kind !== 'code') {
      current += segment.text
      continue
    }

    const parts = segment.text.split(';')

    parts.forEach((part, index) => {
      current += part

      if (index < parts.length - 1) {
        result.push(current + ';')
        current = ''
      }
    })
  }

  if (current.trim()) result.push(current)

  return result
}

// Text of a statement with comments and string literals blanked out, so pattern checks see code only.
// Dollar bodies are kept, recursively stripped.
const codeOnly = sql =>
  lex(sql)
    .map(segment => {
      if (segment.kind === 'code') return segment.text
      if (segment.kind === 'dollar') {
        const tag = /^\$[A-Za-z_]*\$/.exec(segment.text)[0]

        return tag + codeOnly(segment.text.slice(tag.length, segment.text.length - tag.length)) + tag
      }

      return segment.kind === 'string' ? "''" : ' '
    })
    .join('')

const DEFAULT_TARGET = {
  schema: 'forge2',
  authSchema: 'forge2_auth',
  extensionSchema: 'forge2_ext',
  roles: { anon: 'forge2_anon', authenticated: 'forge2_authenticated', service_role: 'forge2_service' }
}

// Statements that only make sense on Supabase. On Aurora files live in S3 and Supabase's own
// service roles do not exist, so these are dropped rather than translated.
const SHIM_REASON = 'provided by the platform shim'

const SUPABASE_ONLY = [
  { pattern: /\bstorage\s*\.\s*(objects|buckets)\b/i, reason: 'Supabase Storage (files move to S3)' },
  { pattern: /\bsupabase_\w+/i, reason: 'Supabase internal role' },
  { pattern: /\bauth\s*\.\s*role\s*\(/i, reason: 'Supabase Storage policy helper' },

  // The shim creates 2.0's schemas and allowed extensions; forge2_migrator may create neither.
  { pattern: /^\s*create\s+schema\s+if\s+not\s+exists\s+"?(public|auth|extensions)"?\s*;?\s*$/i, reason: SHIM_REASON },
  { pattern: /^\s*create\s+extension\s+if\s+not\s+exists\s+"?(pgcrypto|vector|btree_gist)"?(\s+with\s+schema\s+"?\w+"?)?\s*;?\s*$/i, reason: SHIM_REASON }
]

const supabaseOnlyReason = statement => {
  const code = codeOnly(statement)
  const hit = SUPABASE_ONLY.find(rule => rule.pattern.test(code))

  return hit ? hit.reason : null
}

const translateCode = (text, target) => {
  const { schema, authSchema, extensionSchema, roles } = target
  const schemas = { public: schema, auth: authSchema, extensions: extensionSchema }

  return (
    text
      // search_path lists: SET search_path = public, auth / search_path TO 'public'
      .replace(/(search_path\s*(?:=|\bto\b)\s*)((?:'?[A-Za-z_]+'?\s*,\s*)*'?[A-Za-z_]+'?)/gi, (match, lead, list) =>
        lead + list.replace(/'?([A-Za-z_]+)'?/g, (name, bare) => (schemas[bare.toLowerCase()] ? name.replace(bare, schemas[bare.toLowerCase()]) : name))
      )
      // Schema-qualified names, quoted or not: public.x, "public"."x", auth.uid(), extensions.vector
      .replace(/(^|[^\w."])(public|auth|extensions)(\s*\.)/gi, (match, lead, name, dot) => lead + schemas[name.toLowerCase()] + dot)
      .replace(/"(public|auth|extensions)"(\s*\.)/gi, (match, name, dot) => `"${schemas[name.toLowerCase()]}"${dot}`)
      // create schema / with schema extensions
      .replace(/(\bschema\s+(?:if\s+not\s+exists\s+)?)(extensions|auth)\b/gi, (match, lead, name) => lead + schemas[name.toLowerCase()])
      // Supabase API roles become this deployment's PostgREST roles.
      .replace(/(^|[^\w."])(anon|authenticated|service_role)\b(?!\s*\.)/g, (match, lead, role) => lead + roles[role])
  )
}

// Inside string literals only qualified names are translated ('public.forge_x'::regclass);
// a bare 'public' is data (a visibility value), and stays. format() templates count too:
// 'public.%I', 'public."x"'.
const translateString = (text, target) =>
  text.replace(/\b(public|auth|extensions)\.(?=[\w%"])/g, (match, name) => ({ public: target.schema, auth: target.authSchema, extensions: target.extensionSchema })[name] + '.')

const translateSegments = (sql, target) =>
  lex(sql)
    .map(segment => {
      if (segment.kind === 'code') return translateCode(segment.text, target)
      if (segment.kind === 'string') return translateString(segment.text, target)
      if (segment.kind === 'dollar') {
        const tag = /^\$[A-Za-z_]*\$/.exec(segment.text)[0]
        const body = segment.text.slice(tag.length, segment.text.length - tag.length)

        return tag + translateSegments(body, target) + tag
      }

      return segment.text
    })
    .join('')

// search_path values written as a quoted list ('public') sit in string segments; fix them up after.
const translateQuotedSearchPath = (sql, target) =>
  sql.replace(/(search_path\s+to\s+)'(public|auth|extensions)'/gi, (match, lead, name) => `${lead}'${{ public: target.schema, auth: target.authSchema, extensions: target.extensionSchema }[name.toLowerCase()]}'`)

// Translates one migration. Returns { sql, dropped: [{ reason, statement }] }.
const translateMigration = (sql, target = DEFAULT_TARGET) => {
  const dropped = []
  const kept = statements(sql).map(statement => {
    const reason = supabaseOnlyReason(statement)

    if (!reason) return translateQuotedSearchPath(translateSegments(statement, target), target)

    dropped.push({ reason, statement: statement.trim() })

    return `\n-- [portability] dropped (${reason})\n`
  })

  return { sql: kept.join(''), dropped }
}

module.exports = { SHIM_REASON, lex, statements, codeOnly, translateMigration, supabaseOnlyReason, DEFAULT_TARGET }

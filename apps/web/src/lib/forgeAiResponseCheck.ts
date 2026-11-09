// Forge AI response checks, run on every answer before it is stored or shown:
//  - source attribution: records and knowledge excerpts the answer relies on, taken from tool
//    results (never from the model's own claims);
//  - reference verification: record numbers the answer cites must appear in a tool result, the
//    user's own message or the authorised record context; anything else is flagged to the user;
//  - identifier redaction: internal UUIDs never reach the user.
// Plus a scanner for instruction-like text in untrusted document content (prompt injection).
// Pure module, so Node tests can load it.

export type ForgeAiSource =
  | { kind: 'record'; recordType: string; reference: string; id: string | null; title: string | null }
  | { kind: 'knowledge'; title: string; section: string | null; reference: string | null; sourceType: string | null }

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

// Forge human references look like INC-2026-000013, CAPA-2026-0004, AST-CBM-0042, RSK-12.
const REFERENCE = /\b[A-Z]{2,6}(?:-[A-Z0-9]{1,8})*-\d{2,}\b/g

const REFERENCE_FIELDS: Record<string, string> = {
  incident_number: 'incident',
  inspection_number: 'inspection',
  finding_number: 'inspection_finding',
  observation_number: 'observation',
  capa_number: 'corrective_action',
  corrective_action_number: 'corrective_action',
  risk_number: 'risk',
  jsa_number: 'jsa',
  asset_number: 'asset',
  asset_tag: 'asset',
  procedure_number: 'loto',
  task_number: 'task',
  employee_number: 'personnel',
  course_code: 'training_course',
  alert_number: 'watch_alert'
}

const walk = (value: unknown, visit: (node: Record<string, unknown>) => void, depth = 0) => {
  if (depth > 8 || value == null) return

  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1)

    return
  }

  if (typeof value === 'object') {
    visit(value as Record<string, unknown>)
    for (const child of Object.values(value as Record<string, unknown>)) walk(child, visit, depth + 1)
  }
}

const collectStrings = (value: unknown, out: string[] = [], depth = 0): string[] => {
  if (depth > 8 || value == null) return out
  if (typeof value === 'string') out.push(value)
  else if (typeof value === 'number') out.push(String(value))
  else if (Array.isArray(value)) value.forEach(item => collectStrings(item, out, depth + 1))
  else if (typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(item => collectStrings(item, out, depth + 1))

  return out
}

// Records and knowledge excerpts present in tool results.
export const extractSources = (toolResults: Array<{ tool: string; result: unknown }>) => {
  const records = new Map<string, ForgeAiSource>()
  const knowledge = new Map<string, ForgeAiSource>()

  for (const { tool, result } of toolResults) {
    walk(result, node => {
      if (tool === 'knowledge_search' || tool === 'search_help_articles') {
        const title = (node.source_title || node.title) as string | undefined

        if (typeof title === 'string' && (node.content || node.summary || node.excerpt)) {
          const section = typeof node.section_title === 'string' ? node.section_title : null
          const reference = typeof node.source_reference === 'string' ? node.source_reference : typeof node.slug === 'string' ? node.slug : null
          const key = title + '|' + (section || '') + '|' + (reference || '')

          if (!knowledge.has(key)) {
            knowledge.set(key, {
              kind: 'knowledge',
              title,
              section,
              reference,
              sourceType: typeof node.source_type === 'string' ? node.source_type : tool === 'search_help_articles' ? 'help_article' : null
            })
          }
        }

        return
      }

      for (const [field, recordType] of Object.entries(REFERENCE_FIELDS)) {
        const reference = node[field]

        if (typeof reference === 'string' && reference.trim() && !records.has(reference)) {
          const rawType = typeof node.record_type === 'string' ? node.record_type : recordType

          records.set(reference, {
            kind: 'record',
            recordType: rawType,
            reference,
            id: typeof node.id === 'string' ? node.id : null,
            title: typeof node.summary === 'string' ? node.summary : typeof node.title === 'string' ? node.title : typeof node.name === 'string' ? node.name : null
          })
          break
        }
      }
    })
  }

  return { records: [...records.values()], knowledge: [...knowledge.values()] }
}

export type ResponseCheck = {
  text: string
  sources: ForgeAiSource[]
  unverifiedReferences: string[]
  redactedIdentifiers: number
}

export const checkAssistantResponse = ({
  text,
  toolResults,
  trustedText = []
}: {
  text: string
  toolResults: Array<{ tool: string; result: unknown }>
  // The user's own messages and the server-authorised record context.
  trustedText?: string[]
}): ResponseCheck => {
  const { records, knowledge } = extractSources(toolResults)
  const evidence = [...collectStrings(toolResults.map(item => item.result)), ...trustedText].join('\n')

  let redactedIdentifiers = 0
  const redacted = text.replace(UUID, () => {
    redactedIdentifiers += 1

    return '[internal id]'
  })

  const cited = [...new Set(redacted.match(REFERENCE) || [])]
  const unverifiedReferences = cited.filter(reference => !evidence.includes(reference))

  // Only records the answer actually cites count as its sources; knowledge excerpts all count
  // because the model was handed them for this answer.
  const citedRecords = records.filter(source => source.kind === 'record' && redacted.includes(source.reference))

  let finalText = redacted

  if (unverifiedReferences.length) {
    finalText +=
      '\n\n> Forge could not match ' +
      (unverifiedReferences.length === 1 ? 'this reference' : 'these references') +
      ' to a record retrieved for this answer: ' +
      unverifiedReferences.join(', ') +
      '. Verify ' +
      (unverifiedReferences.length === 1 ? 'it' : 'them') +
      ' in Forge before relying on ' +
      (unverifiedReferences.length === 1 ? 'it' : 'them') +
      '.'
  }

  return { text: finalText, sources: [...citedRecords, ...knowledge], unverifiedReferences, redactedIdentifiers }
}

// Instruction-like phrasing that has no business inside a policy, SOP or record. Matching text is
// still returned (it may be legitimate), but flagged so the model and the audit trail know.
const INJECTION_PATTERNS: Array<[string, RegExp]> = [
  ['override_instructions', /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|all|earlier|system)\b[^.\n]{0,20}\b(instructions?|rules?|prompts?|directions?)\b/i],
  ['role_change', /\byou are (now|no longer)\b|\bact as (an?|the) (?!competent|qualified|authorized)[a-z]+/i],
  ['prompt_exfiltration', /\b(reveal|print|show|repeat|output)\b[^.\n]{0,30}\b(system prompt|hidden prompt|instructions|api key|secret)/i],
  ['tool_coercion', /\b(call|invoke|run|use) (the )?(tool|function)\b|\bprepare_action\b|\bfunction_call\b/i],
  ['authority_claim', /\b(this (message|document) (is|comes) from|as (the )?(system|administrator|developer)),?/i],
  ['delimiter_spoof', /\[\/?(system|assistant|end forge[^\]]*)\]|<\/?(system|assistant)>/i]
]

export const scanUntrustedText = (text: string) => {
  const hits = INJECTION_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)

  return { instructionLike: hits.length > 0, patterns: hits }
}

// Wraps a retrieved excerpt for the model: content is labelled as untrusted data and flagged when
// it contains instruction-like text. Fence markers inside the excerpt are neutralised.
export const fenceUntrustedExcerpt = (content: string) => {
  const scan = scanUntrustedText(content)
  const neutralised = content.replace(/\[(\/?)(system|assistant|end forge[^\]]*)\]/gi, '($1$2)')

  return {
    untrusted_content: neutralised,
    instruction_like: scan.instructionLike,
    ...(scan.instructionLike ? { injection_patterns: scan.patterns } : {})
  }
}

// Forge AI provider layer. Every model call goes through a ForgeAiProvider, so retries, timeouts,
// tool allowlisting, argument validation and structured-output checks behave the same for every
// provider. Server-only: keys come from the server environment and never reach the browser.
// Uses relative .ts imports (no path aliases) so Node tests can load it with an injected fetch.

import {
  ForgeAiProviderError,
  addUsage,
  emptyUsage,
  postJsonWithRetry,
  type ForgeAiUsage,
  type RetryOptions
} from './forgeAiReliability.ts'
import { parseModelJson, validateStrictJson } from './forgeAiJsonSchema.ts'

export type ForgeAiToolDefinition = {
  type: 'function'
  name: string
  description: string
  strict: true
  parameters: Record<string, unknown>
}

export type ForgeAiProviderMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ForgeAiToolCall = {
  call_id: string
  name: string
  arguments: string

  // Parsed and schema-validated arguments. Tools receive only calls that passed validation.
  args: Record<string, unknown>
}

export type ForgeAiReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export type ForgeAiChatRequest = {
  model: string
  reasoningEffort: ForgeAiReasoningEffort
  maxOutputTokens: number
  maxToolCalls: number
  maxRounds?: number
  instructions: string
  messages: ForgeAiProviderMessage[]
  tools: ForgeAiToolDefinition[]
  executeTool: (call: ForgeAiToolCall) => Promise<unknown>
  safetyIdentifier: string
  timeoutMs?: number
  maxAttempts?: number
  responseFormat?: { name: string; schema: Record<string, unknown> }
}

export type ForgeAiChatResult = {
  text: string
  responseId: string | null
  usage: ForgeAiUsage
  toolCalls: number
  rejectedToolCalls: number
  rounds: number
  attempts: number
}

export interface ForgeAiProvider {
  readonly name: string
  runChat(request: ForgeAiChatRequest): Promise<ForgeAiChatResult>
}

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_ATTEMPTS = 3
const DEFAULT_ROUNDS = 5

// Checks a model's tool call against the tools offered in this request. Unknown tools and invalid
// arguments are refused here and reported back to the model; they never reach Forge tool code.
export const vetToolCall = (
  tools: ForgeAiToolDefinition[],
  call: { name: string; arguments: string }
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string; details: string[] } => {
  const tool = tools.find(item => item.name === call.name)

  if (!tool) return { ok: false, error: 'tool_not_allowed', details: [`${call.name} is not available in this request`] }

  const parsed = parseModelJson<Record<string, unknown>>(call.arguments, tool.parameters)

  if (!parsed.ok) return { ok: false, error: 'invalid_arguments', details: parsed.errors }

  return { ok: true, args: parsed.value }
}

const extractOutputText = (response: any) => {
  const parts: string[] = []

  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue

    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text)
    }
  }

  return parts.join('\n').trim()
}

const normalizeUsage = (response: any): ForgeAiUsage => ({
  inputTokens: Number(response?.usage?.input_tokens || 0),
  outputTokens: Number(response?.usage?.output_tokens || 0),
  reasoningTokens: Number(response?.usage?.output_tokens_details?.reasoning_tokens || 0),
  totalTokens: Number(response?.usage?.total_tokens || 0)
})

export class OpenAiForgeProvider implements ForgeAiProvider {
  readonly name = 'openai'
  private apiKey: string | undefined
  private fetchImpl: RetryOptions['fetchImpl']
  private sleep: RetryOptions['sleep']

  constructor(options: { apiKey?: string; fetchImpl?: RetryOptions['fetchImpl']; sleep?: RetryOptions['sleep'] } = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
    this.fetchImpl = options.fetchImpl
    this.sleep = options.sleep
  }

  async runChat(request: ForgeAiChatRequest): Promise<ForgeAiChatResult> {
    if (!this.apiKey) throw new ForgeAiProviderError('config', 'OPENAI_API_KEY is not configured on the Forge server.')

    const input: any[] = request.messages.map(message => ({ role: message.role, content: message.content }))
    const maxRounds = request.maxRounds ?? DEFAULT_ROUNDS
    let usage = emptyUsage()
    let toolCalls = 0
    let rejectedToolCalls = 0
    let attempts = 0
    let responseId: string | null = null

    for (let round = 1; round <= maxRounds; round += 1) {
      const body: Record<string, unknown> = {
        model: request.model,
        instructions: request.instructions,
        input,
        tools: request.tools,
        tool_choice: request.tools.length ? 'auto' : 'none',
        parallel_tool_calls: false,
        store: false,
        max_output_tokens: request.maxOutputTokens,
        truncation: 'auto',
        safety_identifier: request.safetyIdentifier,
        include: ['reasoning.encrypted_content']
      }

      if (request.reasoningEffort !== 'none') body.reasoning = { effort: request.reasoningEffort }

      if (request.responseFormat) {
        body.text = {
          format: {
            type: 'json_schema',
            name: request.responseFormat.name,
            schema: request.responseFormat.schema,
            strict: true
          }
        }
      }

      const { payload, attempts: used } = await postJsonWithRetry(
        'https://api.openai.com/v1/responses',
        {
          headers: { Authorization: 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        },
        {
          timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          maxAttempts: request.maxAttempts ?? DEFAULT_ATTEMPTS,
          fetchImpl: this.fetchImpl,
          sleep: this.sleep
        }
      )

      attempts += used
      responseId = payload?.id || responseId
      usage = addUsage(usage, normalizeUsage(payload))

      if (!Array.isArray(payload?.output)) {
        throw new ForgeAiProviderError('invalid_response', 'The AI provider response had no output.', { attempts })
      }

      const calls = payload.output
        .filter((item: any) => item?.type === 'function_call')
        .map((item: any) => ({
          call_id: String(item.call_id || ''),
          name: String(item.name || ''),
          arguments: String(item.arguments || '{}')
        }))

      if (!calls.length) {
        return {
          text: extractOutputText(payload),
          responseId,
          usage,
          toolCalls,
          rejectedToolCalls,
          rounds: round,
          attempts
        }
      }

      if (toolCalls + calls.length > request.maxToolCalls) {
        throw new ForgeAiProviderError('limit', 'Forge AI reached the tenant tool-call limit for this request.', {
          attempts
        })
      }

      for (const item of payload.output) input.push(item)

      for (const call of calls) {
        toolCalls += 1
        const vetted = vetToolCall(request.tools, call)
        let output: unknown

        if (vetted.ok) {
          output = await request.executeTool({ ...call, args: vetted.args })
        } else {
          rejectedToolCalls += 1
          output = { error: vetted.error, details: vetted.details }
        }

        input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) })
      }
    }

    throw new ForgeAiProviderError('limit', 'Forge AI exceeded the maximum reasoning/tool rounds for one request.', {
      attempts
    })
  }
}

// ---------------------------------------------------------------------------
// Test provider: deterministic, for automated tests of the Forge pipeline (routing, tool
// allowlisting, validation, failure handling, logging). It is refused unless the server sets
// FORGE_AI_TEST_PROVIDER=1 and is not a production deployment. It never fabricates tenant data:
// it only calls Forge tools and reports what they returned.
//
// Directives in the last user message:
//   [[forge-test:fail:<kind>]]          throw a ForgeAiProviderError of that kind
//   [[forge-test:tool:<name> <json>]]   call a tool with raw JSON arguments (may be invalid on purpose)
//   [[forge-test:json <raw>]]           return raw text as the structured output (may be invalid)
// ---------------------------------------------------------------------------

const sampleFromSchema = (schema: any): unknown => {
  const type = Array.isArray(schema?.type) ? schema.type.find((item: string) => item !== 'null') : schema?.type

  if (Array.isArray(schema?.enum) && schema.enum.length) return schema.enum[0]

  if (type === 'object') {
    return Object.fromEntries(
      Object.entries(schema.properties || {}).map(([key, child]) => [key, sampleFromSchema(child)])
    )
  }

  if (type === 'array') return []
  if (type === 'integer' || type === 'number') return schema.minimum ?? 0
  if (type === 'boolean') return false
  if (type === 'string') return 'test'

  return null
}

export class TestForgeProvider implements ForgeAiProvider {
  readonly name = 'test'

  async runChat(request: ForgeAiChatRequest): Promise<ForgeAiChatResult> {
    const last = [...request.messages].reverse().find(message => message.role === 'user')?.content || ''

    const usage = {
      inputTokens: Math.ceil((request.instructions.length + last.length) / 4),
      outputTokens: 20,
      reasoningTokens: 0,
      totalTokens: 0
    }

    usage.totalTokens = usage.inputTokens + usage.outputTokens

    const fail = last.match(/\[\[forge-test:fail:(\w+)\]\]/)

    if (fail)
      throw new ForgeAiProviderError(fail[1] as any, 'Test provider simulated a ' + fail[1] + ' failure.', {
        attempts: 1
      })

    const outputs: string[] = []
    let toolCalls = 0
    let rejectedToolCalls = 0

    for (const match of last.matchAll(/\[\[forge-test:tool:([\w.]+) (.*?)\]\]/g)) {
      if (toolCalls + 1 > request.maxToolCalls)
        throw new ForgeAiProviderError('limit', 'Forge AI reached the tenant tool-call limit for this request.', {
          attempts: 1
        })
      toolCalls += 1
      const call = { call_id: 'test_' + toolCalls, name: match[1], arguments: match[2] }
      const vetted = vetToolCall(request.tools, call)

      if (!vetted.ok) {
        rejectedToolCalls += 1
        outputs.push(`${call.name}: refused (${vetted.error})`)
        continue
      }

      const result = await request.executeTool({ ...call, args: vetted.args })

      outputs.push(`${call.name}: ${JSON.stringify(result).slice(0, 600)}`)
    }

    let text: string
    const raw = last.match(/\[\[forge-test:json (.*?)\]\]/)

    if (request.responseFormat) {
      text = raw ? raw[1] : JSON.stringify(sampleFromSchema(request.responseFormat.schema))
    } else {
      text = outputs.length ? 'Forge test provider tool results:\n' + outputs.join('\n') : 'Forge test provider reply.'
    }

    return {
      text,
      responseId: 'test-response',
      usage,
      toolCalls,
      rejectedToolCalls,
      rounds: 1 + (toolCalls ? 1 : 0),
      attempts: 1
    }
  }
}

export const testProviderAllowed = (env: Record<string, string | undefined> = process.env) =>
  env.FORGE_AI_TEST_PROVIDER === '1' && env.VERCEL_ENV !== 'production' && env.FORGE_DEPLOY_ENV !== 'production'

// Resolves the provider for a request. FORGE_AI_PROVIDER_OVERRIDE=test lets the automated test
// stack run the full pipeline without a model key; it is ignored where the test provider is refused.
export const getForgeAiProvider = (
  name: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): ForgeAiProvider => {
  const requested = env.FORGE_AI_PROVIDER_OVERRIDE === 'test' && testProviderAllowed(env) ? 'test' : name || 'openai'

  if (requested === 'test') {
    if (!testProviderAllowed(env))
      throw new ForgeAiProviderError('config', 'The Forge test AI provider is disabled on this server.')

    return new TestForgeProvider()
  }

  if (requested === 'openai') return new OpenAiForgeProvider({ apiKey: env.OPENAI_API_KEY })

  throw new ForgeAiProviderError('config', 'Unsupported Forge AI provider: ' + requested)
}

// Structured generation: the model must return JSON matching the schema. Output that fails
// validation is rejected with kind invalid_output, never passed on.
export const runStructured = async <T>(
  provider: ForgeAiProvider,
  request: Omit<ForgeAiChatRequest, 'responseFormat' | 'tools' | 'executeTool'> & {
    schemaName: string
    schema: Record<string, unknown>
  }
): Promise<{ value: T; result: ForgeAiChatResult }> => {
  const result = await provider.runChat({
    ...request,
    tools: [],
    executeTool: async () => ({ error: 'tool_not_allowed' }),
    responseFormat: { name: request.schemaName, schema: request.schema }
  })

  const parsed = parseModelJson<T>(result.text, request.schema)

  if (!parsed.ok) {
    throw new ForgeAiProviderError(
      'invalid_output',
      'Structured AI output failed validation: ' + parsed.errors.slice(0, 5).join('; '),
      {
        attempts: result.attempts
      }
    )
  }

  return { value: parsed.value, result }
}

export { validateStrictJson }

// Backward-compatible entry point used by Help Desk. Now gets timeouts, retries and tool vetting.
export const runOpenAiForgeAssistant = async (
  request: Omit<ForgeAiChatRequest, 'executeTool'> & {
    executeTool: (call: ForgeAiToolCall) => Promise<unknown>
  }
) => getForgeAiProvider('openai').runChat(request)

// Provider-neutral reliability helpers for Forge AI: typed errors, timeouts, bounded retries
// and cost estimates. Pure: no Next, Supabase or path-alias imports, so Node tests can load it.

export type ForgeAiErrorKind =
  | 'config' // provider or key missing, model not allowed
  | 'timeout' // request exceeded the per-attempt timeout
  | 'rate_limited' // provider returned 429
  | 'unavailable' // provider 5xx or network failure
  | 'rejected' // provider 4xx other than 429 (bad request, auth)
  | 'invalid_response' // provider replied with something Forge cannot use
  | 'invalid_output' // model output failed Forge schema validation
  | 'limit' // tenant tool-call or round limit reached

export class ForgeAiProviderError extends Error {
  kind: ForgeAiErrorKind
  status: number | null
  retryable: boolean
  attempts: number

  constructor(kind: ForgeAiErrorKind, message: string, options: { status?: number | null; attempts?: number } = {}) {
    super(message)
    this.name = 'ForgeAiProviderError'
    this.kind = kind
    this.status = options.status ?? null
    this.retryable = kind === 'timeout' || kind === 'rate_limited' || kind === 'unavailable'
    this.attempts = options.attempts ?? 0
  }
}

export const isForgeAiProviderError = (value: unknown): value is ForgeAiProviderError =>
  value instanceof Error && (value as any).name === 'ForgeAiProviderError' && typeof (value as any).kind === 'string'

export const classifyHttpStatus = (status: number): ForgeAiErrorKind => {
  if (status === 408) return 'timeout'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'unavailable'

  return 'rejected'
}

// Message safe to show a Forge user. Provider wording can include request ids or account detail.
export const userFacingAiError = (error: unknown) => {
  const kind = isForgeAiProviderError(error) ? error.kind : 'unavailable'

  switch (kind) {
    case 'config':
      return 'Forge AI is not configured on this server. Ask your Forge administrator.'
    case 'timeout':
      return 'The AI provider took too long to respond. Try again.'
    case 'rate_limited':
      return 'The AI provider is busy right now. Try again in a moment.'
    case 'invalid_response':
    case 'invalid_output':
      return 'The AI provider returned a response Forge could not verify, so it was discarded.'
    case 'limit':
      return 'This request reached the Forge AI tool-call limit for your tenant. Try a narrower question.'
    case 'rejected':
      return 'The AI provider rejected the request.'
    default:
      return 'The AI provider is unavailable. Try again shortly.'
  }
}

// Exponential backoff with full jitter; a Retry-After header (seconds or HTTP date) wins when shorter than the cap.
export const computeBackoffMs = (
  attempt: number,
  retryAfter: string | null = null,
  { baseMs = 500, capMs = 8000, random = Math.random }: { baseMs?: number; capMs?: number; random?: () => number } = {}
) => {
  if (retryAfter) {
    const seconds = Number(retryAfter)
    const fromHeader = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()

    if (Number.isFinite(fromHeader) && fromHeader >= 0) return Math.min(fromHeader, capMs)
  }

  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1))

  return Math.round(ceiling * random())
}

type FetchLike = (
  url: string,
  init: Record<string, unknown>
) => Promise<{
  ok: boolean
  status: number
  headers: { get: (name: string) => string | null }
  json: () => Promise<any>
}>

export type RetryOptions = {
  timeoutMs: number
  maxAttempts: number
  fetchImpl?: FetchLike
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// POST JSON with a per-attempt timeout. Retries timeouts, 429 and 5xx; never retries other 4xx.
export const postJsonWithRetry = async (
  url: string,
  init: { headers: Record<string, string>; body: string },
  { timeoutMs, maxAttempts, fetchImpl, sleep = defaultSleep, random }: RetryOptions
): Promise<{ payload: any; attempts: number }> => {
  const doFetch: FetchLike = fetchImpl || (globalThis.fetch as unknown as FetchLike)
  let lastError: ForgeAiProviderError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let retryAfter: string | null = null

    try {
      const response = await doFetch(url, {
        method: 'POST',
        headers: init.headers,
        body: init.body,
        cache: 'no-store',
        signal: controller.signal
      })

      let payload: any = null

      try {
        payload = await response.json()
      } catch {
        payload = null
      }

      if (response.ok) {
        if (!payload || typeof payload !== 'object') {
          throw new ForgeAiProviderError('invalid_response', 'The AI provider returned a non-JSON response.', {
            status: response.status,
            attempts: attempt
          })
        }

        return { payload, attempts: attempt }
      }

      retryAfter = response.headers.get('retry-after')
      const detail = typeof payload?.error?.message === 'string' ? payload.error.message : 'HTTP ' + response.status

      lastError = new ForgeAiProviderError(classifyHttpStatus(response.status), detail, {
        status: response.status,
        attempts: attempt
      })
    } catch (error) {
      if (isForgeAiProviderError(error)) {
        lastError = error
      } else if ((error as any)?.name === 'AbortError') {
        lastError = new ForgeAiProviderError(
          'timeout',
          'The AI provider did not respond within ' + timeoutMs + ' ms.',
          { attempts: attempt }
        )
      } else {
        lastError = new ForgeAiProviderError(
          'unavailable',
          (error as Error)?.message || 'Network error reaching the AI provider.',
          { attempts: attempt }
        )
      }
    } finally {
      clearTimeout(timer)
    }

    if (!lastError.retryable || attempt === maxAttempts) break
    await sleep(computeBackoffMs(attempt, retryAfter, { random }))
  }

  throw lastError || new ForgeAiProviderError('unavailable', 'The AI provider request failed.')
}

export type ForgeAiUsage = {
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
}

export const emptyUsage = (): ForgeAiUsage => ({ inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 })

export const addUsage = (total: ForgeAiUsage, next: ForgeAiUsage): ForgeAiUsage => ({
  inputTokens: total.inputTokens + next.inputTokens,
  outputTokens: total.outputTokens + next.outputTokens,
  reasoningTokens: total.reasoningTokens + next.reasoningTokens,
  totalTokens: total.totalTokens + next.totalTokens
})

// Returns null when the registry has no confirmed price: Forge does not guess costs.
export const estimateCostCents = (
  usage: Pick<ForgeAiUsage, 'inputTokens' | 'outputTokens'>,
  pricing: {
    input_cost_per_million_cents: number | string | null
    output_cost_per_million_cents: number | string | null
  } | null
) => {
  if (!pricing || pricing.input_cost_per_million_cents == null || pricing.output_cost_per_million_cents == null)
    return null

  const cents =
    (usage.inputTokens * Number(pricing.input_cost_per_million_cents) +
      usage.outputTokens * Number(pricing.output_cost_per_million_cents)) /
    1_000_000

  return Math.round(cents * 10000) / 10000
}

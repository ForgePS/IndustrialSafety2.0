// Forge AI execution service: the single path for model requests. It resolves the provider and
// model from the platform registry, records an agent run (prompt version, attempts, outcome),
// records usage with a cost estimate when the model has confirmed pricing, and writes AI audit
// events. A provider failure is contained here: it is logged and returned as a typed error.
import { createServiceRoleClient } from '@repo/supabase/server'

import {
  getForgeAiProvider,
  type ForgeAiChatRequest,
  type ForgeAiChatResult,
  type ForgeAiProvider
} from '@/lib/forgeAiProvider'
import { ForgeAiProviderError, estimateCostCents, isForgeAiProviderError } from '@/lib/forgeAiReliability'
import type { ResolvedForgeAiPrompt } from '@/lib/forgeAiPrompts'

const db = () => createServiceRoleClient() as any

export type ForgeAiModelRegistryRow = {
  provider: string
  model_key: string
  enabled: boolean
  request_timeout_ms: number
  max_attempts: number
  input_cost_per_million_cents: number | null
  output_cost_per_million_cents: number | null
}

export const resolveForgeAiModel = async (providerName: string, model: string) => {
  const { data } = await db()
    .from('forge_ai_model_registry')
    .select(
      'provider, model_key, enabled, request_timeout_ms, max_attempts, input_cost_per_million_cents, output_cost_per_million_cents'
    )
    .eq('provider', providerName)
    .eq('model_key', model)
    .maybeSingle()

  const row = (data || null) as ForgeAiModelRegistryRow | null

  // The test provider's registry row is disabled for tenant selection; the server-side test guard governs it.
  if (row && !row.enabled && providerName !== 'test') {
    throw new ForgeAiProviderError('config', `The AI model ${model} is disabled on this Forge platform.`)
  }

  return row
}

export const recordForgeAiAudit = async (event: {
  organizationId: string | null
  actorUserId?: string | null
  actorType?: 'user' | 'system' | 'ai'
  eventType: string
  resourceType?: string | null
  resourceId?: string | null
  agentRunId?: string | null
  detail?: Record<string, unknown>
}) => {
  const { error } = await db()
    .from('forge_ai_audit_events')
    .insert({
      organization_id: event.organizationId,
      actor_user_id: event.actorUserId ?? null,
      actor_type: event.actorType ?? 'user',
      event_type: event.eventType,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      agent_run_id: event.agentRunId ?? null,
      detail: event.detail ?? {}
    })

  if (error) console.error('[forge-ai] audit write failed', error.message)
}

export type ForgeAiRunMeta = {
  organizationId: string
  userId: string | null
  conversationId?: string | null
  requestKind?: 'chat' | 'structured' | 'watch' | 'system'
  intent?: string | null
  agentKey?: string
  prompt: Pick<ResolvedForgeAiPrompt, 'key' | 'version' | 'hash'>
  providerName: string
  metadata?: Record<string, unknown>
}

export type ForgeAiRunOutcome<T> =
  | {
      ok: true
      agentRunId: string | null
      result: ForgeAiChatResult
      value: T
      provider: ForgeAiProvider
      model: string
    }
  | { ok: false; agentRunId: string | null; error: ForgeAiProviderError }

// Run one provider request with full logging. `invoke` receives the resolved provider, the
// registry-backed timeout and attempt limits, and the agent run id (for tool-run linkage).
export const executeForgeAiRun = async <T = ForgeAiChatResult>(
  meta: ForgeAiRunMeta,
  model: string,
  invoke: (args: {
    provider: ForgeAiProvider
    limits: Pick<ForgeAiChatRequest, 'timeoutMs' | 'maxAttempts'>
    agentRunId: string | null
  }) => Promise<{ result: ForgeAiChatResult; value: T }>
): Promise<ForgeAiRunOutcome<T>> => {
  const supabase = db()
  const startedAt = Date.now()
  let agentRunId: string | null = null
  let providerName = meta.providerName

  try {
    const provider = getForgeAiProvider(meta.providerName)

    providerName = provider.name
    const registry = await resolveForgeAiModel(provider.name, model)

    const { data: run, error: runError } = await supabase
      .from('forge_ai_agent_runs')
      .insert({
        organization_id: meta.organizationId,
        user_id: meta.userId,
        conversation_id: meta.conversationId ?? null,
        request_kind: meta.requestKind ?? 'chat',
        intent: meta.intent ?? null,
        agent_key: meta.agentKey ?? 'general',
        prompt_key: meta.prompt.key,
        prompt_version: meta.prompt.version,
        prompt_hash: meta.prompt.hash,
        provider: provider.name,
        model,
        status: 'running',
        metadata: { ...(meta.metadata || {}), model_registered: Boolean(registry) }
      })
      .select('id')
      .single()

    if (runError) console.error('[forge-ai] agent run insert failed', runError.message)
    agentRunId = run?.id ?? null

    const { result, value } = await invoke({
      provider,
      limits: {
        timeoutMs: registry?.request_timeout_ms ?? undefined,
        maxAttempts: registry?.max_attempts ?? undefined
      },
      agentRunId
    })

    const durationMs = Date.now() - startedAt
    const cost = estimateCostCents(result.usage, registry)

    await Promise.all([
      agentRunId &&
        supabase
          .from('forge_ai_agent_runs')
          .update({
            status: 'completed',
            attempts: result.attempts,
            rounds: result.rounds,
            tool_calls: result.toolCalls,
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
            total_tokens: result.usage.totalTokens,
            duration_ms: durationMs,
            metadata: {
              ...(meta.metadata || {}),
              model_registered: Boolean(registry),
              rejected_tool_calls: result.rejectedToolCalls
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', agentRunId),
      supabase.from('forge_ai_usage_events').insert({
        organization_id: meta.organizationId,
        user_id: meta.userId,
        conversation_id: meta.conversationId ?? null,
        agent_run_id: agentRunId,
        provider: provider.name,
        model,
        provider_response_id: result.responseId,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        reasoning_tokens: result.usage.reasoningTokens,
        total_tokens: result.usage.totalTokens,
        tool_calls: result.toolCalls,
        duration_ms: durationMs,
        estimated_cost_cents: cost
      })
    ])

    if (result.rejectedToolCalls > 0) {
      await recordForgeAiAudit({
        organizationId: meta.organizationId,
        actorUserId: meta.userId,
        actorType: 'ai',
        eventType: 'tool_call.refused',
        agentRunId,
        detail: { refused: result.rejectedToolCalls, agent_key: meta.agentKey ?? 'general' }
      })
    }

    return { ok: true, agentRunId, result, value, provider, model }
  } catch (caught) {
    const error = isForgeAiProviderError(caught)
      ? caught
      : new ForgeAiProviderError('unavailable', caught instanceof Error ? caught.message : 'Forge AI request failed.')

    const status =
      error.kind === 'timeout'
        ? 'timeout'
        : error.kind === 'invalid_output' || error.kind === 'invalid_response'
          ? 'invalid_output'
          : 'failed'

    if (agentRunId) {
      await supabase
        .from('forge_ai_agent_runs')
        .update({
          status,
          attempts: error.attempts,
          duration_ms: Date.now() - startedAt,
          error_kind: error.kind,
          error_message: error.message.slice(0, 1000),
          completed_at: new Date().toISOString()
        })
        .eq('id', agentRunId)
    } else {
      // The run row could not be created (e.g. provider refused before start); still leave a trace.
      await recordForgeAiAudit({
        organizationId: meta.organizationId,
        actorUserId: meta.userId,
        actorType: 'system',
        eventType: 'agent_run.failed_to_start',
        detail: { provider: providerName, model, error_kind: error.kind, message: error.message.slice(0, 500) }
      })
    }

    console.error('[forge-ai] provider request failed', error.kind, error.message)

    return { ok: false, agentRunId, error }
  }
}

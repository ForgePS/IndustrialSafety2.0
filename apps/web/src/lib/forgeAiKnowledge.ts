import { createHash } from 'crypto'
import { createServiceRoleClient } from '@repo/supabase/server'

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const MAX_SOURCE_CHARS = 500_000
const MAX_CHUNKS = 250
const TARGET_CHUNK_CHARS = 3_500
const CHUNK_OVERLAP_CHARS = 400

const normalizeKnowledgeText = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()

const hashText = (value: string) =>
  createHash('sha256').update(value).digest('hex')

const splitLongParagraph = (paragraph: string, maxLength: number) => {
  const parts: string[] = []
  let remaining = paragraph.trim()

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(' ', maxLength)
    if (splitAt < Math.floor(maxLength * 0.6)) splitAt = maxLength
    parts.push(remaining.slice(0, splitAt).trim())
    remaining = remaining.slice(splitAt).trim()
  }

  if (remaining) parts.push(remaining)
  return parts
}

export const chunkForgeKnowledge = (input: string) => {
  const normalized = normalizeKnowledgeText(input)

  if (!normalized) return []
  if (normalized.length > MAX_SOURCE_CHARS) {
    throw new Error('Knowledge source exceeds the current 500,000 character indexing limit.')
  }

  const rawParagraphs = normalized
    .split(/\n{2,}/)
    .flatMap(paragraph => splitLongParagraph(paragraph, TARGET_CHUNK_CHARS))
    .filter(Boolean)

  const chunks: Array<{ content: string; sectionTitle: string | null }> = []
  let current = ''
  let currentSection: string | null = null

  const flush = () => {
    const content = current.trim()
    if (!content) return

    chunks.push({ content, sectionTitle: currentSection })

    if (content.length > CHUNK_OVERLAP_CHARS) {
      current = content.slice(-CHUNK_OVERLAP_CHARS)
    } else {
      current = ''
    }
  }

  for (const paragraph of rawParagraphs) {
    const headingMatch = paragraph.match(/^(#{1,6}\s+.+|[A-Z][A-Z0-9 &/()\-]{5,80})$/)
    if (headingMatch && paragraph.length < 120) {
      if (current.trim()) flush()
      currentSection = paragraph.replace(/^#{1,6}\s+/, '').trim()
      current = paragraph
      continue
    }

    const next = current ? current + '\n\n' + paragraph : paragraph
    if (next.length > TARGET_CHUNK_CHARS && current.trim()) flush()
    current = current ? current + '\n\n' + paragraph : paragraph
  }

  if (current.trim()) {
    chunks.push({ content: current.trim(), sectionTitle: currentSection })
  }

  if (chunks.length > MAX_CHUNKS) {
    throw new Error('Knowledge source produces too many chunks. Split this document into smaller sources.')
  }

  return chunks
}

const requestEmbeddings = async (inputs: string[]) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured on the Forge server.')

  const model = process.env.FORGE_AI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: inputs,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: 'float'
    }),
    cache: 'no-store'
  })

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(
      String(payload?.error?.message || payload?.error || 'OpenAI embedding request failed.')
    )
  }

  const embeddings = (payload?.data || [])
    .sort((a: any, b: any) => Number(a.index) - Number(b.index))
    .map((item: any) => item.embedding)

  if (embeddings.length !== inputs.length) {
    throw new Error('Embedding provider returned an unexpected number of vectors.')
  }

  return {
    model,
    embeddings,
    usageTokens: Number(payload?.usage?.total_tokens || payload?.usage?.prompt_tokens || 0)
  }
}

export const indexForgeAiKnowledgeSource = async ({
  organizationId,
  sourceId,
  actorUserId
}: {
  organizationId: string
  sourceId: string
  actorUserId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: source } = await supabase
    .from('forge_ai_knowledge_sources')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', sourceId)
    .maybeSingle()

  if (!source) throw new Error('Knowledge source not found.')

  const content = normalizeKnowledgeText(String(source.content_text || ''))
  if (!content) throw new Error('Knowledge source does not contain indexable text.')

  const chunks = chunkForgeKnowledge(content)
  if (!chunks.length) throw new Error('Knowledge source did not produce any indexable chunks.')

  await supabase
    .from('forge_ai_knowledge_sources')
    .update({
      status: 'processing',
      index_error: null,
      updated_by: actorUserId,
      updated_at: new Date().toISOString()
    })
    .eq('id', sourceId)

  try {
    const embeddedChunks: Array<{
      content: string
      sectionTitle: string | null
      embedding: number[]
    }> = []
    let totalEmbeddingTokens = 0
    let embeddingModel = process.env.FORGE_AI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL

    for (let offset = 0; offset < chunks.length; offset += 50) {
      const batch = chunks.slice(offset, offset + 50)
      const result = await requestEmbeddings(
        batch.map(chunk => source.title + '\n\n' + chunk.content)
      )

      embeddingModel = result.model
      totalEmbeddingTokens += result.usageTokens

      batch.forEach((chunk, index) => {
        embeddedChunks.push({
          ...chunk,
          embedding: result.embeddings[index]
        })
      })
    }

    const { error: deleteError } = await supabase
      .from('forge_ai_knowledge_chunks')
      .delete()
      .eq('organization_id', organizationId)
      .eq('source_id', sourceId)

    if (deleteError) throw new Error(deleteError.message)

    const { error: insertError } = await supabase
      .from('forge_ai_knowledge_chunks')
      .insert(
        embeddedChunks.map((chunk, index) => ({
          organization_id: organizationId,
          source_id: sourceId,
          chunk_index: index,
          section_title: chunk.sectionTitle,
          content: chunk.content,
          content_hash: hashText(chunk.content),
          token_count: Math.max(1, Math.ceil(chunk.content.length / 4)),
          embedding: chunk.embedding,
          metadata: {}
        }))
      )

    if (insertError) throw new Error(insertError.message)

    const indexedAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('forge_ai_knowledge_sources')
      .update({
        status: 'active',
        content_hash: hashText(content),
        chunk_count: embeddedChunks.length,
        indexed_at: indexedAt,
        index_error: null,
        embedding_model: embeddingModel,
        updated_by: actorUserId,
        updated_at: indexedAt
      })
      .eq('id', sourceId)

    if (updateError) throw new Error(updateError.message)

    await Promise.all([
      supabase.from('forge_creator_audit_log').insert({
        actor_user_id: actorUserId,
        organization_id: organizationId,
        action: 'forge_ai.knowledge_indexed',
        entity_type: 'forge_ai_knowledge_source',
        entity_id: sourceId,
        after_value: {
          title: source.title,
          chunks: embeddedChunks.length,
          embedding_model: embeddingModel
        }
      }),
      supabase.from('forge_ai_usage_events').insert({
        organization_id: organizationId,
        user_id: actorUserId,
        provider: 'openai',
        model: embeddingModel,
        input_tokens: totalEmbeddingTokens,
        output_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: totalEmbeddingTokens,
        tool_calls: 0,
        metadata: {
          usage_type: 'knowledge_embedding',
          source_id: sourceId,
          chunk_count: embeddedChunks.length
        }
      })
    ])

    return {
      chunkCount: embeddedChunks.length,
      embeddingModel,
      indexedAt
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knowledge indexing failed.'

    await supabase
      .from('forge_ai_knowledge_sources')
      .update({
        status: 'failed',
        index_error: message.slice(0, 2000),
        updated_by: actorUserId,
        updated_at: new Date().toISOString()
      })
      .eq('id', sourceId)

    throw error
  }
}

export const searchForgeAiKnowledge = async ({
  organizationId,
  query,
  limit = 8,
  includeRestricted = false
}: {
  organizationId: string
  query: string
  limit?: number
  includeRestricted?: boolean
}) => {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  const embeddingResult = await requestEmbeddings([normalizedQuery])
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase.rpc('match_forge_ai_knowledge', {
    p_organization_id: organizationId,
    p_query_embedding: embeddingResult.embeddings[0],
    p_match_count: Math.min(Math.max(limit, 1), 20),
    p_include_restricted: includeRestricted
  })

  if (error) throw new Error('Unable to search Forge AI knowledge: ' + error.message)

  return (data || [])
    .filter((item: any) => Number(item.similarity || 0) >= 0.2)
    .map((item: any) => ({
      source_id: item.source_id,
      source_title: item.source_title,
      source_type: item.source_type,
      sensitivity: item.sensitivity,
      source_reference: item.source_reference,
      section_title: item.section_title,
      page_number: item.page_number,
      content: item.content,
      similarity: Number(item.similarity || 0)
    }))
}

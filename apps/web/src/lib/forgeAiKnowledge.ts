import { createHash } from 'crypto'
import { createServiceRoleClient } from '@repo/supabase/server'
import { recordForgeAiAudit } from '@/lib/forgeAiExecution'
import { fuseKnowledgeResults, pageForOffset } from '@/lib/forgeAiDocuments'
import { postJsonWithRetry } from '@/lib/forgeAiReliability'

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

// Embeddings are optional: without an embedding provider, sources are indexed for full-text
// retrieval only ('lexical'), and search still works. With one, retrieval is 'hybrid'.
export const knowledgeEmbeddingsAvailable = () =>
  Boolean(process.env.OPENAI_API_KEY) && process.env.FORGE_AI_PROVIDER_OVERRIDE !== 'test'

const requestEmbeddings = async (inputs: string[]) => {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured on the Forge server.')

  const model = process.env.FORGE_AI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL

  const { payload } = await postJsonWithRetry(
    'https://api.openai.com/v1/embeddings',
    {
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: inputs, dimensions: EMBEDDING_DIMENSIONS, encoding_format: 'float' })
    },
    { timeoutMs: 30_000, maxAttempts: 3 }
  )

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

const PAGE_MARKER = /\[\[page (\d+)\]\]\n?/g

// Records a new numbered version of a source's content and makes it current. Indexing is a
// separate step, so a source can be reviewed before its new version becomes searchable.
export const createForgeAiKnowledgeVersion = async ({
  organizationId,
  sourceId,
  actorUserId,
  contentText,
  origin,
  file,
  changeNote
}: {
  organizationId: string
  sourceId: string
  actorUserId: string | null
  contentText: string
  origin: 'manual' | 'upload'
  file?: { name: string; mime: string | null; sizeBytes: number; sha256: string; extractor: string; pageCount: number | null } | null
  changeNote?: string | null
}) => {
  const supabase = createServiceRoleClient() as any
  const content = normalizeKnowledgeText(contentText)
  const contentHash = hashText(content)

  // One locked transaction: the next number, the version row and the source's current text.
  const { data, error } = await supabase.rpc('forge_ai_save_knowledge_version', {
    p_organization_id: organizationId,
    p_source_id: sourceId,
    p_actor_user_id: actorUserId,
    p_content_text: content,
    p_content_hash: contentHash,
    p_origin: origin,
    p_file: file
      ? { name: file.name, mime: file.mime, sizeBytes: file.sizeBytes, sha256: file.sha256, extractor: file.extractor, pageCount: file.pageCount }
      : null,
    p_change_note: changeNote || null
  })

  if (error) throw new Error(error.code === 'P0002' ? 'Knowledge source not found.' : error.message)

  const row = Array.isArray(data) ? data[0] : data

  return { versionNumber: Number(row.version_number), created: Boolean(row.created) }
}

export const indexForgeAiKnowledgeSource = async ({
  organizationId,
  sourceId,
  actorUserId,
  actorType = 'user'
}: {
  organizationId: string
  sourceId: string
  actorUserId: string | null
  actorType?: 'user' | 'system'
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: source } = await supabase
    .from('forge_ai_knowledge_sources')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', sourceId)
    .maybeSingle()

  if (!source) throw new Error('Knowledge source not found.')
  if (source.status === 'archived') throw new Error('Archived knowledge sources cannot be indexed.')

  const fullText = normalizeKnowledgeText(String(source.content_text || ''))

  if (!fullText) throw new Error('Knowledge source does not contain indexable text.')

  // Page markers (from PDFs) give each chunk a page number; they are removed from chunk text.
  const chunks = chunkForgeKnowledge(fullText).map(chunk => {
    const offset = fullText.indexOf(chunk.content.slice(0, 80))
    const ownMarker = chunk.content.match(/\[\[page (\d+)\]\]/)
    const pageNumber = offset >= 0 ? pageForOffset(fullText, offset) : ownMarker ? Number(ownMarker[1]) : null

    return { ...chunk, content: chunk.content.replace(PAGE_MARKER, '').trim(), pageNumber }
  }).filter(chunk => chunk.content)

  if (!chunks.length) throw new Error('Knowledge source did not produce any indexable chunks.')

  // A source written outside Forge (for example imported data) has no version yet: keep its text as v1.
  let versionNumber = Number(source.current_version || 0) || null

  if (!versionNumber) {
    versionNumber = (await createForgeAiKnowledgeVersion({ organizationId, sourceId, actorUserId, contentText: fullText, origin: 'manual' })).versionNumber
  }
  const mode: 'hybrid' | 'lexical' = knowledgeEmbeddingsAvailable() ? 'hybrid' : 'lexical'

  await supabase
    .from('forge_ai_knowledge_sources')
    .update({ status: 'processing', index_error: null, updated_by: actorUserId, updated_at: new Date().toISOString() })
    .eq('id', sourceId)

  try {
    const embeddings: Array<number[] | null> = chunks.map(() => null)
    let totalEmbeddingTokens = 0
    let embeddingModel: string | null = null

    if (mode === 'hybrid') {
      for (let offset = 0; offset < chunks.length; offset += 50) {
        const batch = chunks.slice(offset, offset + 50)
        const result = await requestEmbeddings(batch.map(chunk => source.title + '\n\n' + chunk.content))

        embeddingModel = result.model
        totalEmbeddingTokens += result.usageTokens
        result.embeddings.forEach((embedding: number[], index: number) => {
          embeddings[offset + index] = embedding
        })
      }
    }

    const { error: deleteError } = await supabase
      .from('forge_ai_knowledge_chunks')
      .delete()
      .eq('organization_id', organizationId)
      .eq('source_id', sourceId)

    if (deleteError) throw new Error(deleteError.message)

    const { error: insertError } = await supabase.from('forge_ai_knowledge_chunks').insert(
      chunks.map((chunk, index) => ({
        organization_id: organizationId,
        source_id: sourceId,
        chunk_index: index,
        version_number: versionNumber,
        section_title: chunk.sectionTitle,
        page_number: chunk.pageNumber,
        content: chunk.content,
        content_hash: hashText(chunk.content),
        token_count: Math.max(1, Math.ceil(chunk.content.length / 4)),
        embedding: embeddings[index],
        metadata: {}
      }))
    )

    if (insertError) throw new Error(insertError.message)

    const indexedAt = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('forge_ai_knowledge_sources')
      .update({
        status: 'active',
        content_hash: hashText(fullText),
        chunk_count: chunks.length,
        indexed_at: indexedAt,
        indexed_version: versionNumber,
        retrieval_mode: mode,
        index_error: null,
        embedding_model: embeddingModel,
        updated_by: actorUserId,
        updated_at: indexedAt
      })
      .eq('id', sourceId)

    if (updateError) throw new Error(updateError.message)

    await Promise.all([
      recordForgeAiAudit({
        organizationId,
        actorUserId,
        actorType,
        eventType: 'knowledge.indexed',
        resourceType: 'forge_ai_knowledge_source',
        resourceId: sourceId,
        detail: { title: source.title, version: versionNumber, chunks: chunks.length, retrieval_mode: mode, embedding_model: embeddingModel }
      }),
      totalEmbeddingTokens > 0 &&
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
          metadata: { usage_type: 'knowledge_embedding', source_id: sourceId, chunk_count: chunks.length }
        })
    ])

    return { chunkCount: chunks.length, embeddingModel, indexedAt, retrievalMode: mode, versionNumber }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knowledge indexing failed.'

    await supabase
      .from('forge_ai_knowledge_sources')
      .update({ status: 'failed', index_error: message.slice(0, 2000), updated_by: actorUserId, updated_at: new Date().toISOString() })
      .eq('id', sourceId)

    throw error
  }
}

// Re-indexes sources whose current version is not yet indexed (new uploads, edits, or sources
// indexed full-text-only before an embedding provider was configured).
export const reindexStaleForgeAiKnowledge = async ({
  organizationId,
  actorUserId = null,
  limit = 10
}: {
  organizationId: string
  actorUserId?: string | null
  limit?: number
}) => {
  const supabase = createServiceRoleClient() as any
  const { data: sources } = await supabase
    .from('forge_ai_knowledge_sources')
    .select('id, status, current_version, indexed_version, retrieval_mode')
    .eq('organization_id', organizationId)
    .in('status', ['draft', 'active', 'failed'])
    .not('content_text', 'is', null)

  const wantHybrid = knowledgeEmbeddingsAvailable()
  const stale = (sources || [])
    .filter(
      (source: any) =>
        // Only sources indexed before: a draft nobody has published stays out of AI search.
        source.indexed_version != null &&
        (Number(source.indexed_version) < Number(source.current_version) || (wantHybrid && source.retrieval_mode === 'lexical'))
    )
    .slice(0, limit)

  const results: Array<{ sourceId: string; ok: boolean; error?: string }> = []

  for (const source of stale) {
    try {
      await indexForgeAiKnowledgeSource({ organizationId, sourceId: source.id, actorUserId, actorType: actorUserId ? 'user' : 'system' })
      results.push({ sourceId: source.id, ok: true })
    } catch (error) {
      results.push({ sourceId: source.id, ok: false, error: error instanceof Error ? error.message : 'Indexing failed.' })
    }
  }

  return results
}

const mapHit = (item: any) => ({
  chunk_id: item.chunk_id,
  source_id: item.source_id,
  source_title: item.source_title,
  source_type: item.source_type,
  sensitivity: item.sensitivity,
  source_reference: item.source_reference,
  section_title: item.section_title,
  page_number: item.page_number,
  content: item.content
})

// Hybrid retrieval within one tenant: Postgres full-text always, plus vector similarity when
// embeddings are available. Restricted sources are included only when the caller says the user
// may see them. A failing embedding provider degrades to full-text instead of failing the search.
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
  const normalizedQuery = query.trim().slice(0, 1000)

  if (!normalizedQuery) return []

  const supabase = createServiceRoleClient() as any
  const matchCount = Math.min(Math.max(limit, 1), 20)

  const { data: lexical, error: lexicalError } = await supabase.rpc('search_forge_ai_knowledge_text', {
    p_organization_id: organizationId,
    p_query: normalizedQuery,
    p_match_count: matchCount,
    p_include_restricted: includeRestricted
  })

  if (lexicalError) throw new Error('Unable to search Forge AI knowledge: ' + lexicalError.message)

  let semantic: any[] = []

  if (knowledgeEmbeddingsAvailable()) {
    try {
      const embeddingResult = await requestEmbeddings([normalizedQuery])
      const { data, error } = await supabase.rpc('match_forge_ai_knowledge', {
        p_organization_id: organizationId,
        p_query_embedding: embeddingResult.embeddings[0],
        p_match_count: matchCount,
        p_include_restricted: includeRestricted
      })

      if (error) throw new Error(error.message)
      semantic = (data || []).filter((item: any) => Number(item.similarity || 0) >= 0.2)
    } catch (error) {
      console.error('[forge-ai] semantic knowledge search unavailable; using full-text only', error instanceof Error ? error.message : error)
    }
  }

  return fuseKnowledgeResults((lexical || []).map(mapHit), semantic.map(mapHit), matchCount)
}

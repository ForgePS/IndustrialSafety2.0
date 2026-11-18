import { createServiceRoleClient } from '@repo/supabase/server'

import { isUuid } from '@/lib/forgeHelpdeskAccess'

const db = () => createServiceRoleClient() as any

export type KnowledgeSearchResult = {
  id: string
  slug: string
  title: string
  summary: string
  category_id: string
  visibility: string
  organization_id: string | null
  status: string
  published_at: string | null
  updated_at: string
  rank: number
  snippet: string
}

export const searchKnowledge = async ({
  query,
  audience,
  organizationId,
  userId,
  categoryId,
  limit = 10,
  includeDrafts = false,
  source
}: {
  query: string
  audience: 'customer' | 'staff'
  organizationId: string | null
  userId: string | null
  categoryId?: string | null
  limit?: number
  includeDrafts?: boolean
  source: 'help_center' | 'ask_forge' | 'console' | 'forge_ai'
}): Promise<KnowledgeSearchResult[]> => {
  const text = (query || '').trim().slice(0, 300)

  const { data, error } = await db().rpc('forge_support_search_knowledge', {
    p_query: text,
    p_audience: audience,
    p_organization_id: organizationId,
    p_product_id: null,
    p_category_id: isUuid(categoryId) ? categoryId : null,
    p_limit: limit,
    p_include_drafts: includeDrafts
  })

  if (error) {
    console.error('[helpdesk] knowledge search', error.message)
    throw new Error('Knowledge search is unavailable right now.')
  }

  if (text) {
    await db()
      .from('forge_support_knowledge_searches')
      .insert({ organization_id: organizationId, user_id: userId, query: text, result_count: (data || []).length, source })
  }

  return data || []
}

export const listKnowledgeCategories = async () => {
  const { data, error } = await db().from('forge_support_knowledge_categories').select('id,category_key,name,description,sort_order').eq('is_active', true).order('sort_order')

  if (error) throw new Error('Unable to load help categories.')

  return data || []
}

const customerVisibleFilter = (organizationId: string) =>
  `visibility.in.(public_customer,authenticated_users),and(visibility.eq.tenant_only,organization_id.eq.${organizationId})`

export const listCustomerArticles = async ({ organizationId, categoryId, limit = 8, order = 'popular' }: { organizationId: string; categoryId?: string | null; limit?: number; order?: 'popular' | 'recent' }) => {
  let query = db()
    .from('forge_support_knowledge_articles')
    .select('id,slug,title,summary,category_id,published_at,updated_at,view_count')
    .eq('status', 'published')
    .or(customerVisibleFilter(organizationId))
    .order(order === 'popular' ? 'view_count' : 'published_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (isUuid(categoryId)) query = query.eq('category_id', categoryId)
  const { data, error } = await query

  if (error) throw new Error('Unable to load help articles.')

  return data || []
}

export const countCustomerArticlesByCategory = async (organizationId: string) => {
  const { data } = await db().from('forge_support_knowledge_articles').select('category_id').eq('status', 'published').or(customerVisibleFilter(organizationId))
  const counts = new Map<string, number>()

  for (const row of data || []) counts.set(row.category_id, (counts.get(row.category_id) || 0) + 1)

  return counts
}

export const getCustomerArticle = async (slug: string, organizationId: string) => {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null

  const { data, error } = await db()
    .from('forge_support_knowledge_articles')
    .select('id,slug,title,summary,body,category_id,visibility,organization_id,status,published_at,updated_at,version,helpful_count,not_helpful_count,category:forge_support_knowledge_categories(name,category_key),module:forge_support_product_areas(label)')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (error) throw new Error('Unable to load the article.')
  if (!data) return null

  const visible =
    data.visibility === 'public_customer' ||
    data.visibility === 'authenticated_users' ||
    (data.visibility === 'tenant_only' && data.organization_id === organizationId)

  if (!visible) return null
  await db().rpc('forge_support_record_article_view', { p_article_id: data.id })

  const { data: attachments } = await db()
    .from('forge_support_knowledge_attachments')
    .select('id,file_name,mime_type,byte_size')
    .eq('article_id', data.id)
    .is('deleted_at', null)

  return { ...data, attachments: attachments || [] }
}

export const getArticleFeedbackForUser = async (articleId: string, userId: string) => {
  const { data } = await db().from('forge_support_knowledge_feedback').select('helpful,comment').eq('article_id', articleId).eq('user_id', userId).maybeSingle()

  return data || null
}

export const listStaffArticles = async ({ status, q }: { status?: string; q?: string }) => {
  let query = db()
    .from('forge_support_knowledge_articles')
    .select('id,slug,title,status,visibility,organization_id,version,view_count,helpful_count,not_helpful_count,updated_at,published_at,category:forge_support_knowledge_categories(name),organization:organizations(name)')
    .order('updated_at', { ascending: false })
    .limit(300)

  if (status && ['draft', 'review', 'published', 'archived'].includes(status)) query = query.eq('status', status)
  const term = (q || '').trim().slice(0, 100)

  if (term) query = query.textSearch('search_vector', term, { type: 'websearch', config: 'english' })
  const { data, error } = await query

  if (error) throw new Error('Unable to load articles.')

  return data || []
}

export const getStaffArticle = async (id: string) => {
  if (!isUuid(id)) return null

  const [article, revisions, feedback, attachments] = await Promise.all([
    db().from('forge_support_knowledge_articles').select('*,category:forge_support_knowledge_categories(id,name),organization:organizations(id,name)').eq('id', id).maybeSingle(),
    db().from('forge_support_knowledge_revisions').select('id,version,title,status_at_save,change_note,edited_by,created_at').eq('article_id', id).order('version', { ascending: false }),
    db().from('forge_support_knowledge_feedback').select('helpful,comment,created_at').eq('article_id', id).not('comment', 'is', null).order('created_at', { ascending: false }).limit(20),
    db().from('forge_support_knowledge_attachments').select('id,file_name,mime_type,byte_size,created_at').eq('article_id', id).is('deleted_at', null)
  ])

  if (article.error) throw new Error('Unable to load the article.')
  if (!article.data) return null
  const editorIds = [...new Set((revisions.data || []).map((r: any) => r.edited_by).filter(Boolean))]
  const { data: editors } = editorIds.length ? await db().from('users').select('user_id,name,email').in('user_id', editorIds) : { data: [] }
  const editorName = (uid: string | null) => (editors || []).find((e: any) => e.user_id === uid)?.name || 'Forge staff'

  return {
    article: article.data,
    revisions: (revisions.data || []).map((r: any) => ({ ...r, edited_by_name: editorName(r.edited_by) })),
    feedback: feedback.data || [],
    attachments: attachments.data || []
  }
}

export const getKnowledgeSearchAnalytics = async (sinceDays = 30) => {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString()
  const { data } = await db().from('forge_support_knowledge_searches').select('query,result_count').gte('created_at', since).limit(5000)
  const counts = new Map<string, { count: number; zero: number }>()

  for (const row of data || []) {
    const key = String(row.query).toLowerCase().trim()
    const entry = counts.get(key) || { count: 0, zero: 0 }

    entry.count += 1
    if (!row.result_count) entry.zero += 1
    counts.set(key, entry)
  }

  const sorted = [...counts.entries()].map(([query, v]) => ({ query, ...v })).sort((a, b) => b.count - a.count)

  return { top: sorted.slice(0, 15), zeroResults: sorted.filter(s => s.zero > 0).slice(0, 15), total: (data || []).length }
}

export { parseKnowledgeBody, type KnowledgeBlock } from '@/lib/forgeHelpdesk'

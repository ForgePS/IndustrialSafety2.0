import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'

import { isUuid, requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { getHelpdeskCatalog } from '@/lib/forgeHelpdeskData'
import { listKnowledgeCategories } from '@/lib/forgeHelpdeskKnowledge'
import { listTenantOptions } from '@/lib/forgeHelpdeskConsoleData'
import ArticleEditor from '../ArticleEditor'

export const metadata: Metadata = { title: 'New Article' }

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)

const NewArticlePage = async ({ searchParams }: { searchParams: Promise<{ suggestion?: string }> }) => {
  const staff = await requireHelpdeskStaff('helpdesk.knowledge.create')
  const { suggestion } = await searchParams
  const [categories, catalog, tenants] = await Promise.all([listKnowledgeCategories(), getHelpdeskCatalog(), listTenantOptions()])
  let initial = { title: '', slug: '', summary: '', body: '', sourceTicketId: null as string | null }

  if (isUuid(suggestion)) {
    const db = createServiceRoleClient() as any
    const { data } = await db.from('forge_support_ai_suggestions').select('suggestion_type,status,output,output_text,final_output,ticket_id').eq('id', suggestion).maybeSingle()

    if (data?.suggestion_type === 'knowledge_draft' && data.status === 'accepted') {
      const title = String(data.output?.title || '').slice(0, 200)

      initial = { title, slug: slugify(title), summary: '', body: data.final_output || data.output_text || '', sourceTicketId: data.ticket_id }
    }
  }

  return (
    <ArticleEditor
      basePath={process.env.BASEPATH || ''}
      article={null}
      initial={initial}
      categories={categories.map((c: any) => ({ id: c.id, name: c.name }))}
      areas={catalog.areas.map((a: any) => ({ id: a.id, label: a.label }))}
      tenants={tenants.map(t => ({ id: t.id, name: t.name }))}
      permissions={[...staff.permissions]}
      revisions={[]}
      feedback={[]}
      attachments={[]}
    />
  )
}

export default NewArticlePage

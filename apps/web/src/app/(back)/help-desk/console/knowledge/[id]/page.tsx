import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { getHelpdeskCatalog } from '@/lib/forgeHelpdeskData'
import { getStaffArticle, listKnowledgeCategories } from '@/lib/forgeHelpdeskKnowledge'
import { listTenantOptions } from '@/lib/forgeHelpdeskConsoleData'
import ArticleEditor from '../ArticleEditor'

export const metadata: Metadata = { title: 'Edit Article' }

const EditArticlePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const staff = await requireHelpdeskStaff()
  const { id } = await params
  const [data, categories, catalog, tenants] = await Promise.all([getStaffArticle(id), listKnowledgeCategories(), getHelpdeskCatalog(), listTenantOptions()])

  if (!data) notFound()
  const { article } = data

  return (
    <ArticleEditor
      basePath={process.env.BASEPATH || ''}
      article={JSON.parse(JSON.stringify(article))}
      initial={{ title: article.title, slug: article.slug, summary: article.summary, body: article.body, sourceTicketId: article.source_ticket_id }}
      categories={categories.map((c: any) => ({ id: c.id, name: c.name }))}
      areas={catalog.areas.map((a: any) => ({ id: a.id, label: a.label }))}
      tenants={tenants.map(t => ({ id: t.id, name: t.name }))}
      permissions={[...staff.permissions]}
      revisions={JSON.parse(JSON.stringify(data.revisions))}
      feedback={JSON.parse(JSON.stringify(data.feedback))}
      attachments={JSON.parse(JSON.stringify(data.attachments))}
    />
  )
}

export default EditArticlePage

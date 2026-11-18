import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TbArrowLeft, TbPaperclip } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import { requireHelpdeskCustomer } from '@/lib/forgeHelpdeskAccess'
import { getArticleFeedbackForUser, getCustomerArticle } from '@/lib/forgeHelpdeskKnowledge'
import KnowledgeBody from '@/components/helpdesk/KnowledgeBody'
import ArticleFeedback from './ArticleFeedback'

export const metadata: Metadata = { title: 'Help Article' }

const ArticlePage = async ({ params }: { params: Promise<{ slug: string }> }) => {
  const access = await requireHelpdeskCustomer('helpdesk.knowledge.view')
  const { slug } = await params
  const article = await getCustomerArticle(slug, access.organizationId)

  if (!article) notFound()
  const feedback = await getArticleFeedbackForUser(article.id, access.user.id)
  const basePath = process.env.BASEPATH || ''

  return (
    <div className='mx-auto flex w-full max-w-3xl flex-col gap-6'>
      <div>
        <Link href={`/help-desk/articles?category=${article.category_id}`} className='text-primary flex items-center gap-1 text-sm'>
          <TbArrowLeft />
          {article.category?.name || 'Help articles'}
        </Link>
        <h1 className='text-textPrimary mt-2 text-3xl font-bold'>{article.title}</h1>
        <div className='text-textSecondary mt-2 flex flex-wrap items-center gap-2 text-sm'>
          <span>Updated {new Date(article.updated_at).toLocaleDateString()}</span>
          {article.module?.label ? <Badge size='sm' variant='outline'>{article.module.label}</Badge> : null}
          {article.visibility === 'tenant_only' ? <Badge size='sm' variant='secondary'>For {access.organizationName}</Badge> : null}
        </div>
      </div>
      {article.summary ? <p className='text-textSecondary text-lg'>{article.summary}</p> : null}
      <Card>
        <CardContent className='p-6'>
          <KnowledgeBody body={article.body} />
          {article.attachments.length ? (
            <div className='mt-6 flex flex-col gap-2 border-t pt-4'>
              {article.attachments.map((file: any) => (
                <a key={file.id} href={`${basePath}/api/helpdesk/knowledge/media/${file.id}`} target='_blank' rel='noreferrer' className='text-primary flex items-center gap-2 text-sm underline'>
                  <TbPaperclip />
                  {file.file_name}
                </a>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <ArticleFeedback articleId={article.id} initial={feedback} canTicket={access.has('helpdesk.ticket.create')} />
    </div>
  )
}

export default ArticlePage

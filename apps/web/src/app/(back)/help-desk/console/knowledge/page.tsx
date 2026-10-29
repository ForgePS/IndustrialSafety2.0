import type { Metadata } from 'next'
import Link from 'next/link'
import Form from 'next/form'
import { TbBook, TbPlus } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'

import { knowledgeStatusLabels, knowledgeVisibilityLabels, label } from '@/lib/forgeHelpdesk'
import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { getKnowledgeSearchAnalytics, listStaffArticles } from '@/lib/forgeHelpdeskKnowledge'

export const metadata: Metadata = { title: 'Knowledge Base' }

const STATUS_FILTERS = ['all', 'draft', 'review', 'published', 'archived']

const KnowledgeAdminPage = async ({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) => {
  const staff = await requireHelpdeskStaff()
  const params = await searchParams
  const status = STATUS_FILTERS.includes(params.status || '') ? params.status! : 'all'
  const [articles, searches] = await Promise.all([listStaffArticles({ status: status === 'all' ? undefined : status, q: params.q }), getKnowledgeSearchAnalytics(30)])

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbBook />
            Knowledge base
          </h1>
          <p className='text-textSecondary mt-1'>Draft, review, publish and retire help articles. Every save creates a version.</p>
        </div>
        {staff.has('helpdesk.knowledge.create') ? (
          <Button asChild>
            <Link href='/help-desk/console/knowledge/new'>
              <TbPlus />
              New article
            </Link>
          </Button>
        ) : null}
      </div>

      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-wrap gap-2'>
          {STATUS_FILTERS.map(s => (
            <Button key={s} asChild size='sm' variant={status === s ? 'tonal' : 'outline'}>
              <Link href={`/help-desk/console/knowledge?status=${s}${params.q ? '&q=' + encodeURIComponent(params.q) : ''}`}>{s === 'all' ? 'All' : label(knowledgeStatusLabels, s)}</Link>
            </Button>
          ))}
        </div>
        <Form action='/help-desk/console/knowledge' className='flex gap-2'>
          <input type='hidden' name='status' value={status} />
          <Input name='q' defaultValue={params.q || ''} placeholder='Search articles' aria-label='Search articles' maxLength={100} className='sm:w-64' />
          <Button type='submit' variant='outline'>
            Search
          </Button>
        </Form>
      </div>

      <div className='grid gap-6 xl:grid-cols-3'>
        <Card className='min-w-0 xl:col-span-2'>
          <CardContent className='flex flex-col divide-y p-0'>
            {articles.map((a: any) => (
              <Link key={a.id} href={`/help-desk/console/knowledge/${a.id}`} className='hover:bg-muted/40 flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between'>
                <div className='min-w-0'>
                  <p className='truncate font-medium'>{a.title}</p>
                  <p className='text-textSecondary text-xs'>
                    {a.category?.name} · {label(knowledgeVisibilityLabels, a.visibility)}
                    {a.organization?.name ? ' · ' + a.organization.name : ''} · v{a.version} · {a.view_count} views · {a.helpful_count} helpful / {a.not_helpful_count} not helpful
                  </p>
                </div>
                <Badge size='sm' variant={a.status === 'published' ? 'tonalSuccess' : a.status === 'review' ? 'accent' : 'outline'}>
                  {label(knowledgeStatusLabels, a.status)}
                </Badge>
              </Link>
            ))}
            {!articles.length ? <p className='text-textSecondary p-6 text-sm'>No articles match.</p> : null}
          </CardContent>
        </Card>

        <div className='flex flex-col gap-6'>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Top searches (30 days)</CardTitle>
            </CardHeader>
            <CardContent className='text-sm'>
              {searches.top.length ? (
                <ol className='flex flex-col gap-1'>
                  {searches.top.map(s => (
                    <li key={s.query} className='flex justify-between gap-2'>
                      <span className='truncate'>{s.query}</span>
                      <span className='text-textSecondary'>{s.count}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className='text-textSecondary'>No searches yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Searches with no results</CardTitle>
            </CardHeader>
            <CardContent className='text-sm'>
              {searches.zeroResults.length ? (
                <ol className='flex flex-col gap-1'>
                  {searches.zeroResults.map(s => (
                    <li key={s.query} className='flex justify-between gap-2'>
                      <span className='truncate'>{s.query}</span>
                      <span className='text-textSecondary'>{s.zero}×</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className='text-textSecondary'>Every search found something.</p>
              )}
              <p className='text-textSecondary mt-2 text-xs'>Content gaps: write articles for these queries.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default KnowledgeAdminPage

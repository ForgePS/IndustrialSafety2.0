import type { Metadata } from 'next'
import Link from 'next/link'
import Form from 'next/form'
import { TbArrowLeft, TbMessageQuestion, TbSearch, TbTicket } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'

import { isUuid, requireHelpdeskCustomer } from '@/lib/forgeHelpdeskAccess'
import { listCustomerArticles, listKnowledgeCategories, searchKnowledge } from '@/lib/forgeHelpdeskKnowledge'

export const metadata: Metadata = { title: 'Help Articles' }

const Snippet = ({ text }: { text: string }) => (
  <>
    {text.split(/(\[\[.*?\]\])/g).map((part, i) =>
      part.startsWith('[[') ? (
        <mark key={i} className='bg-primary/15 text-textPrimary rounded px-0.5'>
          {part.slice(2, -2)}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    )}
  </>
)

const ArticlesPage = async ({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) => {
  const access = await requireHelpdeskCustomer('helpdesk.knowledge.view')
  const { q = '', category } = await searchParams
  const query = q.trim().slice(0, 300)
  const categoryId = isUuid(category) ? category : null
  const categories = await listKnowledgeCategories()
  const activeCategory = categories.find((c: any) => c.id === categoryId)

  const results = query
    ? (await searchKnowledge({ query, audience: 'customer', organizationId: access.organizationId, userId: access.user.id, categoryId, limit: 25, source: 'help_center' })).map(r => ({ ...r, snippetText: r.snippet }))
    : (await listCustomerArticles({ organizationId: access.organizationId, categoryId, limit: 50, order: 'recent' })).map((r: any) => ({ ...r, snippetText: r.summary }))

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/help-desk' className='text-primary flex items-center gap-1 text-sm'>
          <TbArrowLeft />
          Help Center
        </Link>
        <h1 className='text-textPrimary mt-2 text-3xl font-bold'>{query ? `Results for "${query}"` : activeCategory ? activeCategory.name : 'All help articles'}</h1>
      </div>
      <Form action='/help-desk/articles' role='search' className='flex max-w-2xl flex-col gap-3 sm:flex-row'>
        {categoryId ? <input type='hidden' name='category' value={categoryId} /> : null}
        <div className='relative flex-1'>
          <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
          <Input name='q' defaultValue={query} aria-label='Search help articles' placeholder='Search help articles' className='pl-10' maxLength={300} />
        </div>
        <Button type='submit'>Search</Button>
      </Form>
      <div className='flex flex-wrap gap-2'>
        <Button asChild size='sm' variant={categoryId ? 'outline' : 'tonal'}>
          <Link href={query ? `/help-desk/articles?q=${encodeURIComponent(query)}` : '/help-desk/articles'}>All topics</Link>
        </Button>
        {categories.map((c: any) => (
          <Button key={c.id} asChild size='sm' variant={c.id === categoryId ? 'tonal' : 'outline'}>
            <Link href={`/help-desk/articles?category=${c.id}${query ? `&q=${encodeURIComponent(query)}` : ''}`}>{c.name}</Link>
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className='flex flex-col divide-y p-0'>
          {results.length ? (
            results.map((article: any) => (
              <Link key={article.id} href={`/help-desk/articles/${article.slug}`} className='hover:bg-muted/40 block p-5'>
                <p className='text-primary font-semibold'>{article.title}</p>
                <p className='text-textSecondary mt-1 text-sm'>
                  <Snippet text={article.snippetText || ''} />
                </p>
              </Link>
            ))
          ) : (
            <div className='flex flex-col items-start gap-3 p-6'>
              <p className='font-medium'>No articles matched{query ? ` "${query}"` : ''}.</p>
              <p className='text-textSecondary text-sm'>Try different words, ask Forge, or send the support team a ticket.</p>
              <div className='flex flex-wrap gap-2'>
                <Button asChild size='sm' variant='tonal'>
                  <Link href={`/help-desk/ask${query ? `?q=${encodeURIComponent(query)}` : ''}`}>
                    <TbMessageQuestion />
                    Ask Forge
                  </Link>
                </Button>
                {access.has('helpdesk.ticket.create') ? (
                  <Button asChild size='sm' variant='outline'>
                    <Link href='/help-desk/tickets/new'>
                      <TbTicket />
                      Submit a ticket
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ArticlesPage

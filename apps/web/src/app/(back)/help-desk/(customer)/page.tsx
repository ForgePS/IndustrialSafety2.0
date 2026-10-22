import type { Metadata } from 'next'
import Link from 'next/link'
import Form from 'next/form'
import { TbAlertTriangle, TbArrowRight, TbLifebuoy, TbMessageQuestion, TbSearch, TbTicket } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'

import { requireHelpdeskCustomer } from '@/lib/forgeHelpdeskAccess'
import { getServiceStatus, listCustomerAnnouncements, listCustomerTickets } from '@/lib/forgeHelpdeskData'
import { countCustomerArticlesByCategory, listCustomerArticles, listKnowledgeCategories } from '@/lib/forgeHelpdeskKnowledge'
import { announcementTypeLabels, incidentStatusLabels, label } from '@/lib/forgeHelpdesk'
import { StatusBadge } from '@/components/helpdesk/HelpdeskBadges'

export const metadata: Metadata = { title: 'Help Center' }

const HelpCenterPage = async () => {
  const access = await requireHelpdeskCustomer('helpdesk.knowledge.view')
  const canTicket = access.has('helpdesk.ticket.view_own')

  const [categories, counts, popular, status, announcements, tickets] = await Promise.all([
    listKnowledgeCategories(),
    countCustomerArticlesByCategory(access.organizationId),
    listCustomerArticles({ organizationId: access.organizationId, limit: 6 }),
    access.has('helpdesk.status.view') ? getServiceStatus() : Promise.resolve(null),
    access.has('helpdesk.status.view') ? listCustomerAnnouncements(access, { limit: 3 }) : Promise.resolve([]),
    canTicket ? listCustomerTickets(access, { status: 'active', mineOnly: true }) : Promise.resolve({ tickets: [], canSeeOthers: false })
  ])

  const visibleCategories = categories.filter((c: any) => counts.get(c.id))

  return (
    <div className='flex flex-col gap-6'>
      <section className='bg-card rounded-xl border p-6 sm:p-10'>
        <p className='text-primary flex items-center gap-2 text-sm font-semibold'>
          <TbLifebuoy />
          Need Help?
        </p>
        <h1 className='text-textPrimary mt-2 text-3xl font-bold sm:text-4xl'>How can we help?</h1>
        <p className='text-textSecondary mt-2 max-w-2xl'>Search guides for {access.organizationName}, ask Forge a question, or contact the Forge support team.</p>
        <Form action='/help-desk/articles' role='search' className='mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row'>
          <div className='relative flex-1'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input name='q' aria-label='Search help articles' placeholder='Search for answers, e.g. "assign training"' className='h-11 pl-10' maxLength={300} />
          </div>
          <Button type='submit' size='lg'>
            Search
          </Button>
        </Form>
        <div className='mt-6 flex flex-wrap gap-3'>
          <Button asChild variant='tonal'>
            <Link href='/help-desk/ask'>
              <TbMessageQuestion />
              Ask Forge
            </Link>
          </Button>
          {access.has('helpdesk.ticket.create') ? (
            <Button asChild variant='outline'>
              <Link href='/help-desk/tickets/new'>
                <TbTicket />
                Submit a ticket
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      {status && status.activeIncidents.length ? (
        <Card className='border-destructive/40'>
          <CardContent className='flex flex-col gap-3 p-5'>
            {status.activeIncidents.map((incident: any) => (
              <div key={incident.id} className='flex flex-wrap items-start gap-3'>
                <TbAlertTriangle className='text-destructive mt-0.5 shrink-0 text-xl' />
                <div className='min-w-0 flex-1'>
                  <p className='font-semibold'>
                    {incident.title} <Badge size='sm' variant='destructive'>{label(incidentStatusLabels, incident.status)}</Badge>
                  </p>
                  <p className='text-textSecondary text-sm'>{incident.public_message}</p>
                </div>
                <Button asChild size='sm' variant='outline'>
                  <Link href='/help-desk/status'>Service status</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className='grid gap-6 lg:grid-cols-3'>
        <div className='flex flex-col gap-6 lg:col-span-2'>
          <Card>
            <CardHeader>
              <CardTitle>Browse by topic</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
              {visibleCategories.length ? (
                visibleCategories.map((category: any) => (
                  <Link key={category.id} href={`/help-desk/articles?category=${category.id}`} className='hover:border-primary rounded-lg border p-4 transition-colors'>
                    <p className='font-semibold'>{category.name}</p>
                    <p className='text-textSecondary text-xs'>
                      {counts.get(category.id)} article{counts.get(category.id) === 1 ? '' : 's'}
                    </p>
                  </Link>
                ))
              ) : (
                <p className='text-textSecondary text-sm'>No help articles are published yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Popular articles</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col divide-y'>
              {popular.length ? (
                popular.map((article: any) => (
                  <Link key={article.id} href={`/help-desk/articles/${article.slug}`} className='group flex items-center justify-between gap-3 py-3'>
                    <div className='min-w-0'>
                      <p className='group-hover:text-primary font-medium'>{article.title}</p>
                      <p className='text-textSecondary line-clamp-1 text-sm'>{article.summary}</p>
                    </div>
                    <TbArrowRight className='text-textSecondary shrink-0' />
                  </Link>
                ))
              ) : (
                <p className='text-textSecondary text-sm'>No help articles are published yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className='flex flex-col gap-6'>
          {canTicket ? (
            <Card>
              <CardHeader>
                <CardTitle>My open tickets</CardTitle>
                <CardDescription>Tickets you submitted that are still in progress.</CardDescription>
              </CardHeader>
              <CardContent className='flex flex-col gap-3'>
                {tickets.tickets.slice(0, 5).map((ticket: any) => (
                  <Link key={ticket.id} href={`/help-desk/tickets/${ticket.id}`} className='hover:border-primary rounded-lg border p-3 transition-colors'>
                    <p className='line-clamp-1 font-medium'>{ticket.subject}</p>
                    <div className='mt-1 flex flex-wrap items-center gap-2'>
                      <span className='text-textSecondary text-xs'>{ticket.ticket_number}</span>
                      <StatusBadge status={ticket.status} audience='customer' />
                    </div>
                  </Link>
                ))}
                {!tickets.tickets.length ? <p className='text-textSecondary text-sm'>You have no open tickets.</p> : null}
                <Button asChild variant='outline' size='sm'>
                  <Link href='/help-desk/tickets'>View all tickets</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {announcements.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Announcements</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-4'>
                {announcements.map((a: any) => (
                  <div key={a.id}>
                    <Badge size='sm' variant='secondary'>
                      {label(announcementTypeLabels, a.announcement_type)}
                    </Badge>
                    <p className='mt-1 font-medium'>{a.title}</p>
                    <p className='text-textSecondary line-clamp-3 text-sm'>{a.body}</p>
                  </div>
                ))}
                <Button asChild variant='ghost' size='sm'>
                  <Link href='/help-desk/announcements'>All announcements</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default HelpCenterPage

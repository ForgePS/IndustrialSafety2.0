import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { evaluateSlaIfStale, findSimilarTickets, getConsoleReferenceData, getConsoleTicketDetail, getHelpdeskCatalog } from '@/lib/forgeHelpdeskData'
import { listConfiguredDevelopmentProviders } from '@/lib/forgeHelpdeskDevelopment'
import TicketWorkspace from './TicketWorkspace'

export const metadata: Metadata = { title: 'Ticket Workspace' }

const ConsoleTicketPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const staff = await requireHelpdeskStaff()
  const { id } = await params

  await evaluateSlaIfStale()
  const detail = await getConsoleTicketDetail(id)

  if (!detail) notFound()

  const [reference, catalog, similar] = await Promise.all([
    getConsoleReferenceData(),
    getHelpdeskCatalog(),
    findSimilarTickets(detail.ticket)
  ])

  const me = reference.staff.find((s: any) => s.user_id === staff.user.id)

  return (
    <TicketWorkspace
      basePath={process.env.BASEPATH || ''}
      detail={JSON.parse(JSON.stringify(detail))}
      reference={JSON.parse(JSON.stringify(reference))}
      catalog={JSON.parse(JSON.stringify(catalog))}
      similar={JSON.parse(JSON.stringify(similar.filter((t: any) => !['resolved', 'closed'].includes(t.status))))}
      permissions={[...staff.permissions]}
      currentUser={{ id: staff.user.id, name: me?.name || 'Forge Support' }}
      developmentProviders={listConfiguredDevelopmentProviders().map(p => ({ key: p.key, label: p.label }))}
    />
  )
}

export default ConsoleTicketPage

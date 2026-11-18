import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireHelpdeskCustomer } from '@/lib/forgeHelpdeskAccess'
import { getCustomerTicketDetail } from '@/lib/forgeHelpdeskData'
import CustomerTicketView from './CustomerTicketView'

export const metadata: Metadata = { title: 'Support Ticket' }

const CustomerTicketPage = async ({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; upload_failed?: string }> }) => {
  const access = await requireHelpdeskCustomer('helpdesk.ticket.view_own')
  const [{ id }, query] = await Promise.all([params, searchParams])
  const detail = await getCustomerTicketDetail(access, id)

  if (!detail) notFound()

  return (
    <CustomerTicketView
      basePath={process.env.BASEPATH || ''}
      detail={JSON.parse(JSON.stringify(detail))}
      currentUserId={access.user.id}
      justCreated={query.created === '1'}
      uploadFailures={Number(query.upload_failed || 0)}
    />
  )
}

export default CustomerTicketPage

import { redirect } from 'next/navigation'

import { getHelpdeskStaffAccess, isUuid } from '@/lib/forgeHelpdeskAccess'

const LegacySupportTicketPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  if (!isUuid(id)) redirect('/help-desk/tickets')
  const staff = await getHelpdeskStaffAccess()

  redirect(staff?.has('helpdesk.support.view') ? `/help-desk/console/tickets/${id}` : `/help-desk/tickets/${id}`)
}

export default LegacySupportTicketPage

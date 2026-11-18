import { redirect } from 'next/navigation'

import { isUuid } from '@/lib/forgeHelpdeskAccess'

const LegacyCreatorSupportTicketPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params

  redirect(isUuid(id) ? `/help-desk/console/tickets/${id}` : '/help-desk/console')
}

export default LegacyCreatorSupportTicketPage

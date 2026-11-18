import type { Metadata } from 'next'

import { requireHelpdeskCustomer } from '@/lib/forgeHelpdeskAccess'
import { getHelpdeskCatalog, getHelpdeskSettings } from '@/lib/forgeHelpdeskData'
import AskForge from './AskForge'

export const metadata: Metadata = { title: 'Ask Forge' }

const AskForgePage = async ({ searchParams }: { searchParams: Promise<{ q?: string }> }) => {
  const access = await requireHelpdeskCustomer('helpdesk.knowledge.view')
  const [{ areas }, settings, { q }] = await Promise.all([getHelpdeskCatalog(), getHelpdeskSettings(), searchParams])

  return (
    <AskForge
      initialQuestion={(q || '').slice(0, 4000)}
      areas={areas.map((a: any) => ({ id: a.id, label: a.label }))}
      canTicket={access.has('helpdesk.ticket.create')}
      aiEnabled={settings.ai_answer_mode !== 'disabled'}
    />
  )
}

export default AskForgePage

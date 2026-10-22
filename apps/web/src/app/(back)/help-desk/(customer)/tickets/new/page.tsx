import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'

import { isUuid, requireHelpdeskCustomer } from '@/lib/forgeHelpdeskAccess'
import { getHelpdeskCatalog, getHelpdeskSettings } from '@/lib/forgeHelpdeskData'
import NewTicketForm from './NewTicketForm'

export const metadata: Metadata = { title: 'Submit a Ticket' }

const NewTicketPage = async ({ searchParams }: { searchParams: Promise<{ assist?: string; module?: string; error?: string }> }) => {
  const access = await requireHelpdeskCustomer('helpdesk.ticket.create')
  const params = await searchParams
  const db = createServiceRoleClient() as any

  const [catalog, settings, locations, assist] = await Promise.all([
    getHelpdeskCatalog(),
    getHelpdeskSettings(),
    (() => {
      let query = db.from('locations').select('id,name').eq('organization_id', access.organizationId).eq('is_active', true).order('name')

      if (!access.has('helpdesk.ticket.view_tenant')) query = query.in('id', access.locationIds.length ? access.locationIds : ['00000000-0000-0000-0000-000000000000'])

      return query.then((r: any) => r.data || [])
    })(),
    isUuid(params.assist)
      ? db
          .from('forge_support_assist_sessions')
          .select('id,question,answer,module_id')
          .eq('id', params.assist)
          .eq('organization_id', access.organizationId)
          .eq('user_id', access.user.id)
          .is('ticket_id', null)
          .maybeSingle()
          .then((r: any) => r.data)
      : Promise.resolve(null)
  ])

  return (
    <NewTicketForm
      basePath={process.env.BASEPATH || ''}
      categories={catalog.categories.map((c: any) => ({ id: c.id, key: c.category_key, label: c.label, description: c.description }))}
      areas={catalog.areas.map((a: any) => ({ id: a.id, key: a.area_key, label: a.label }))}
      locations={locations}
      captureTechnicalContext={settings.capture_technical_context}
      limits={{ attachmentMaxMb: settings.attachment_max_mb, videoMaxMb: settings.video_max_mb }}
      assist={assist ? { id: assist.id, question: assist.question, answer: assist.answer, moduleId: assist.module_id } : null}
      initialModuleId={isUuid(params.module) ? params.module : null}
      clientErrorId={(params.error || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120) || null}
    />
  )
}

export default NewTicketPage

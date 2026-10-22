import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { getServiceStatus } from '@/lib/forgeHelpdeskData'
import { getIncidentDetail, listTenantOptions } from '@/lib/forgeHelpdeskConsoleData'
import IncidentWorkspace from './IncidentWorkspace'

export const metadata: Metadata = { title: 'Platform Incident' }

const IncidentPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const staff = await requireHelpdeskStaff()
  const { id } = await params
  const detail = await getIncidentDetail(id)

  if (!detail) notFound()
  const [status, tenants] = await Promise.all([getServiceStatus({ includeInternal: true }), listTenantOptions()])

  return (
    <IncidentWorkspace
      detail={JSON.parse(JSON.stringify(detail))}
      components={status.components.map((c: any) => ({ id: c.id, name: c.name }))}
      tenants={tenants.map(t => ({ id: t.id, name: t.name }))}
      canManage={staff.has('helpdesk.admin.incidents')}
      canLink={staff.has('helpdesk.support.link_incident')}
    />
  )
}

export default IncidentPage

import type { Metadata } from 'next'
import Link from 'next/link'
import { TbAlertTriangle } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { incidentImpactLabels, incidentStatusLabels, label } from '@/lib/forgeHelpdesk'
import { isUuid, requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { getServiceStatus } from '@/lib/forgeHelpdeskData'
import { listConsoleAnnouncements, listIncidents, listTenantOptions } from '@/lib/forgeHelpdeskConsoleData'
import DeclareIncidentForm from './DeclareIncidentForm'
import ComponentStatusList from './ComponentStatusList'
import AnnouncementManager from './AnnouncementManager'

export const metadata: Metadata = { title: 'Incidents & Status' }

const IncidentList = ({ incidents, empty }: { incidents: any[]; empty: string }) =>
  incidents.length ? (
    <div className='flex flex-col divide-y'>
      {incidents.map(i => (
        <Link key={i.id} href={`/help-desk/console/incidents/${i.id}`} className='hover:bg-muted/40 flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='font-medium'>
              <span className='text-textSecondary mr-2 font-mono text-sm'>{i.incident_number}</span>
              {i.title}
            </p>
            <p className='text-textSecondary text-xs'>
              Started {new Date(i.started_at).toLocaleString()} · {i.linked_tickets} linked ticket(s) · {i.all_tenants_affected ? 'all tenants' : 'selected tenants'}
              {i.is_public ? '' : ' · internal only'}
            </p>
          </div>
          <div className='flex gap-2'>
            <Badge size='sm' variant={i.status === 'resolved' ? 'tonalSuccess' : 'destructive'}>
              {label(incidentStatusLabels, i.status)}
            </Badge>
            <Badge size='sm' variant='outline'>
              {label(incidentImpactLabels, i.impact)}
            </Badge>
          </div>
        </Link>
      ))}
    </div>
  ) : (
    <p className='text-textSecondary px-6 pb-6 text-sm'>{empty}</p>
  )

const IncidentsPage = async ({ searchParams }: { searchParams: Promise<{ declare?: string; ticket?: string }> }) => {
  const staff = await requireHelpdeskStaff()
  const params = await searchParams

  const [incidents, status, tenants, announcements] = await Promise.all([
    listIncidents(),
    getServiceStatus({ includeInternal: true }),
    listTenantOptions(),
    staff.has('helpdesk.admin.announcements') ? listConsoleAnnouncements() : Promise.resolve([])
  ])

  const active = incidents.filter((i: any) => i.status !== 'resolved')
  const resolved = incidents.filter((i: any) => i.status === 'resolved')

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbAlertTriangle />
          Incidents & service status
        </h1>
        <p className='text-textSecondary mt-1'>Declare platform incidents, keep the public status page current, and publish announcements.</p>
      </div>

      {staff.has('helpdesk.admin.incidents') ? (
        <DeclareIncidentForm
          components={status.components.map((c: any) => ({ id: c.id, name: c.name }))}
          tenants={tenants.map(t => ({ id: t.id, name: t.name }))}
          defaultOpen={params.declare === '1'}
          linkTicketId={isUuid(params.ticket) ? params.ticket : null}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Active incidents</CardTitle>
        </CardHeader>
        <IncidentList incidents={active} empty='No active platform incidents.' />
      </Card>

      <ComponentStatusList components={JSON.parse(JSON.stringify(status.components))} canEdit={staff.has('helpdesk.admin.status')} />

      {staff.has('helpdesk.admin.announcements') ? (
        <AnnouncementManager announcements={JSON.parse(JSON.stringify(announcements))} tenants={tenants.map(t => ({ id: t.id, name: t.name }))} incidents={active.map((i: any) => ({ id: i.id, label: `${i.incident_number} ${i.title}` }))} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Resolved incidents</CardTitle>
        </CardHeader>
        <IncidentList incidents={resolved} empty='No resolved incidents yet.' />
      </Card>
    </div>
  )
}

export default IncidentsPage

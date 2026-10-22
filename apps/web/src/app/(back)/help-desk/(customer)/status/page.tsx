import type { Metadata } from 'next'
import { TbActivityHeartbeat, TbCircleCheck } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { componentStatusLabels, incidentImpactLabels, incidentStatusLabels, label } from '@/lib/forgeHelpdesk'
import { requireHelpdeskCustomer } from '@/lib/forgeHelpdeskAccess'
import { getServiceStatus } from '@/lib/forgeHelpdeskData'
import { ComponentStatusBadge } from '@/components/helpdesk/HelpdeskBadges'

export const metadata: Metadata = { title: 'Service Status' }

const IncidentCard = ({ incident }: { incident: any }) => (
  <Card>
    <CardHeader>
      <div className='flex flex-wrap items-center gap-2'>
        <CardTitle className='text-lg'>{incident.title}</CardTitle>
        <Badge size='sm' variant={incident.status === 'resolved' ? 'tonalSuccess' : 'destructive'}>
          {label(incidentStatusLabels, incident.status)}
        </Badge>
        <Badge size='sm' variant='outline'>
          {label(incidentImpactLabels, incident.impact)} impact
        </Badge>
      </div>
      <CardDescription>
        {incident.incident_number} · Started {new Date(incident.started_at).toLocaleString()}
        {incident.resolved_at ? ' · Resolved ' + new Date(incident.resolved_at).toLocaleString() : ''}
      </CardDescription>
    </CardHeader>
    <CardContent className='flex flex-col gap-3 text-sm'>
      {incident.public_message ? <p>{incident.public_message}</p> : null}
      {incident.components?.length ? (
        <p className='text-textSecondary'>Affected: {incident.components.map((c: any) => c.component?.name).filter(Boolean).join(', ')}</p>
      ) : null}
      {incident.updates?.length ? (
        <ol className='flex flex-col gap-3 border-l pl-4'>
          {incident.updates.map((u: any, index: number) => (
            <li key={index}>
              <p className='font-semibold'>
                {label(incidentStatusLabels, u.status)} <span className='text-textSecondary font-normal'>· {new Date(u.created_at).toLocaleString()}</span>
              </p>
              <p className='whitespace-pre-wrap'>{u.message}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </CardContent>
  </Card>
)

const StatusPage = async () => {
  await requireHelpdeskCustomer('helpdesk.status.view')
  const status = await getServiceStatus()

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbActivityHeartbeat />
          Service status
        </h1>
        <p className='text-textSecondary mt-1'>Live health of Forge services and any active platform incidents.</p>
      </div>

      <Card className={status.overall === 'operational' ? 'border-success/40' : 'border-destructive/40'}>
        <CardContent className='flex items-center gap-3 p-5'>
          <TbCircleCheck className={status.overall === 'operational' ? 'text-success text-2xl' : 'text-destructive text-2xl'} />
          <p className='text-lg font-semibold'>{status.overall === 'operational' ? 'All systems operational' : label(componentStatusLabels, status.overall)}</p>
        </CardContent>
      </Card>

      {status.activeIncidents.length ? (
        <section className='flex flex-col gap-3'>
          <h2 className='text-xl font-semibold'>Active incidents</h2>
          {status.activeIncidents.map((incident: any) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </section>
      ) : null}

      {status.maintenance.length ? (
        <section className='flex flex-col gap-3'>
          <h2 className='text-xl font-semibold'>Planned maintenance</h2>
          {status.maintenance.map((m: any) => (
            <Card key={m.id}>
              <CardContent className='p-4 text-sm'>
                <p className='font-semibold'>{m.title}</p>
                <p className='text-textSecondary'>
                  {new Date(m.starts_at).toLocaleString()}
                  {m.ends_at ? ' – ' + new Date(m.ends_at).toLocaleString() : ''}
                </p>
                <p className='mt-2 whitespace-pre-wrap'>{m.body}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col divide-y p-0'>
          {status.components.map((c: any) => (
            <div key={c.id} className='flex items-center justify-between gap-3 px-6 py-3'>
              <div>
                <p className='font-medium'>{c.name}</p>
                {c.description ? <p className='text-textSecondary text-xs'>{c.description}</p> : null}
              </div>
              <ComponentStatusBadge status={c.current_status} />
            </div>
          ))}
        </CardContent>
      </Card>

      <section className='flex flex-col gap-3'>
        <h2 className='text-xl font-semibold'>Past 14 days</h2>
        {status.recentIncidents.length ? (
          status.recentIncidents.map((incident: any) => <IncidentCard key={incident.id} incident={incident} />)
        ) : (
          <p className='text-textSecondary text-sm'>No incidents reported in the past 14 days.</p>
        )}
      </section>
    </div>
  )
}

export default StatusPage

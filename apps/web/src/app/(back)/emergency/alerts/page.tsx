import type { Metadata } from 'next'
import Link from 'next/link'
import { TbAlertTriangle } from 'react-icons/tb'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { alertTabs } from '@/components/emergency/tabs'
import { alertsAwaitingMe, grantOf, listAlerts, requireMember } from '@/lib/forgeEmergency'
import { alertTypeLabel, severityLabel } from '@/lib/forgeEmergencyRules'

export const metadata: Metadata = { title: 'Emergency Alerts' }

const SEVERITY_CLASS: Record<string, string> = { extreme: 'text-error font-bold', severe: 'text-error font-semibold', moderate: 'text-warning font-semibold', minor: '' }

/** Port slice 14: active alerts and history. Everyone sees the alerts sent to them; viewers see their scope. */
const EmergencyAlertsPage = async () => {
  const context = await requireMember()
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const [alerts, awaiting] = await Promise.all([listAlerts({ organizationId, userId, access: context.access }), alertsAwaitingMe(organizationId, userId)])
  const canSend = Boolean(grantOf(context.access, 'emergency_alerts.send') || grantOf(context.access, 'emergency_alerts.run_drills'))
  const canManageTemplates = Boolean(grantOf(context.access, 'emergency_alerts.manage_templates'))
  const active = alerts.filter((alert: any) => alert.status === 'active')
  const history = alerts.filter((alert: any) => alert.status !== 'active')

  const table = (rows: any[], label: string) => (
    <Card>
      <CardContent className='overflow-x-auto p-0'>
        <table className='w-full border-collapse text-sm' data-emergency-alerts={label}>
          <thead>
            <tr className='border-b text-left'>
              <th className='px-4 py-2 font-semibold'>Alert</th>
              <th className='px-4 py-2 font-semibold'>Type</th>
              <th className='px-4 py-2 font-semibold'>Severity</th>
              <th className='px-4 py-2 font-semibold'>Sent</th>
              <th className='px-4 py-2 font-semibold'>People</th>
              <th className='px-4 py-2 font-semibold'>{label === 'active' ? 'Status' : 'Cleared'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(alert => (
              <tr key={alert.id} className='border-b last:border-0' data-emergency-alert={alert.headline}>
                <td className='px-4 py-2'>
                  <Link href={'/emergency/alerts/' + alert.id} className='text-primary font-medium hover:underline'>
                    {alert.is_drill ? '[DRILL] ' : ''}
                    {alert.headline}
                  </Link>
                  <div className='text-textSecondary text-xs'>{alert.alert_number}</div>
                </td>
                <td className='px-4 py-2'>{alertTypeLabel(alert.alert_type)}</td>
                <td className={'px-4 py-2 ' + (SEVERITY_CLASS[alert.severity] || '')}>{severityLabel(alert.severity)}</td>
                <td className='px-4 py-2'>{new Date(alert.sent_at).toLocaleString()}</td>
                <td className='px-4 py-2'>{alert.recipient_count}</td>
                <td className='px-4 py-2'>{label === 'active' ? 'Active' : alert.cleared_at ? new Date(alert.cleared_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbAlertTriangle />
          Emergency Alerts
        </h1>
        <p className='text-textSecondary mt-2'>Alerts sent to you and, if you manage them, the alerts for your locations with who has said they are safe.</p>
      </div>
      <EmergencyTabs tabs={alertTabs({ canSend, canManageTemplates })} current='alerts' label='Emergency alerts' />
      {awaiting.length ? (
        <div className='border-error bg-error/10 flex flex-col gap-2 rounded-md border p-4' data-emergency-awaiting>
          <span className='text-error font-semibold'>Tell us you&apos;re safe</span>
          {awaiting.map((alert: any) => (
            <Link key={alert.id} href={'/emergency/alerts/' + alert.id} className='text-primary font-medium hover:underline'>
              {alert.is_drill ? '[DRILL] ' : ''}
              {alert.headline}
            </Link>
          ))}
        </div>
      ) : null}
      <section className='flex flex-col gap-3'>
        <h2 className='text-lg font-semibold'>Active</h2>
        {active.length ? table(active, 'active') : <p className='text-textSecondary text-sm'>No active alerts.</p>}
      </section>
      <section className='flex flex-col gap-3'>
        <h2 className='text-lg font-semibold'>History</h2>
        {history.length ? table(history, 'history') : <p className='text-textSecondary text-sm'>No past alerts.</p>}
      </section>
    </div>
  )
}

export default EmergencyAlertsPage

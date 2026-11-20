import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import ManageAlertPanel from '@/components/emergency/ManageAlertPanel'
import RespondPanel from '@/components/emergency/RespondPanel'
import { alertRecipients, alertResponses, alertUpdates, loadAlert, myResponse, requireMember } from '@/lib/forgeEmergency'
import { alertTypeLabel, rollCall, severityLabel } from '@/lib/forgeEmergencyRules'

export const metadata: Metadata = { title: 'Emergency alert' }

const KIND: Record<string, string> = { issued: 'Sent', update: 'Update', all_clear: 'All clear' }
const STATUS: Record<string, string> = { safe: 'Safe', need_help: 'Needs help', no_response: 'No response' }

/**
 * Port slice 14: one alert. Recipients answer here; people who can see it in their scope get the roll call;
 * people who can send it get update and all-clear.
 */
const AlertPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireMember()
  const { id } = await params
  const found = await loadAlert({ organizationId: context.activeOrganization.id, userId: context.user.id, access: context.access, id })

  if (!found) notFound()

  const { alert, isRecipient, canSeeAll, canManage } = found

  const [updates, mine, recipients, responses] = await Promise.all([
    alertUpdates(alert.id),
    isRecipient ? myResponse(alert.id, context.user.id) : Promise.resolve(null),
    canSeeAll ? alertRecipients(alert.id) : Promise.resolve([]),
    canSeeAll ? alertResponses(alert.id) : Promise.resolve([])
  ])

  const roll = canSeeAll ? rollCall(recipients, responses) : null
  const active = alert.status === 'active'

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/emergency/alerts' className='text-textSecondary text-sm hover:underline'>
          ← Emergency alerts
        </Link>
        <div className={'mt-2 rounded-md border p-4 ' + (active ? (alert.is_drill ? 'border-warning bg-warning/10' : 'border-error bg-error/10') : '')} data-emergency-alert-status={alert.status}>
          <div className='text-xs font-semibold tracking-wide uppercase'>
            {alert.is_drill ? 'Drill · ' : ''}
            {alertTypeLabel(alert.alert_type)} · {severityLabel(alert.severity)} · {active ? 'Active' : 'All clear'}
          </div>
          <h1 className='text-textPrimary mt-1 text-2xl font-bold'>{alert.headline}</h1>
          <p className='mt-2 whitespace-pre-line'>{alert.message}</p>
          {alert.instructions ? <p className='mt-2 font-medium whitespace-pre-line'>{alert.instructions}</p> : null}
          <p className='text-textSecondary mt-3 text-xs'>
            {alert.alert_number} · sent {new Date(alert.sent_at).toLocaleString()} to {alert.recipient_count} {alert.recipient_count === 1 ? 'person' : 'people'}
            {alert.cleared_at ? ' · cleared ' + new Date(alert.cleared_at).toLocaleString() : ''}
          </p>
        </div>
      </div>

      {isRecipient && active && alert.requires_response ? (
        <Card>
          <CardContent className='p-4'>
            <RespondPanel alertId={alert.id} current={mine} />
          </CardContent>
        </Card>
      ) : null}

      {canManage && active ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Manage this alert</CardTitle>
          </CardHeader>
          <CardContent>
            <ManageAlertPanel alert={alert} />
          </CardContent>
        </Card>
      ) : null}

      {roll && alert.requires_response ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Roll call</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <p className='text-sm' data-emergency-roll-counts>
              <strong>{roll.accountedPercent}%</strong> accounted for · <span className='text-success font-semibold'>{roll.counts.safe} safe</span> ·{' '}
              <span className='text-error font-semibold'>{roll.counts.need_help} need help</span> · {roll.counts.no_response} no response
            </p>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm' data-emergency-roll-call>
                <thead>
                  <tr className='border-b text-left'>
                    <th className='py-2 pe-4 font-semibold'>Person</th>
                    <th className='py-2 pe-4 font-semibold'>Status</th>
                    <th className='py-2 pe-4 font-semibold'>Note</th>
                    <th className='py-2 font-semibold'>When</th>
                  </tr>
                </thead>
                <tbody>
                  {roll.rows.map(row => (
                    <tr key={row.userId} className='border-b last:border-0' data-roll-row={row.name}>
                      <td className='py-2 pe-4'>{row.name}</td>
                      <td className={'py-2 pe-4 ' + (row.status === 'need_help' ? 'text-error font-semibold' : row.status === 'safe' ? 'text-success' : 'text-textSecondary')}>{STATUS[row.status]}</td>
                      <td className='py-2 pe-4'>{row.note || ''}</td>
                      <td className='py-2'>{row.respondedAt ? new Date(row.respondedAt).toLocaleTimeString() : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className='flex flex-col gap-3 text-sm' data-emergency-timeline>
            {updates.map((update: any) => (
              <li key={update.id} className='border-s-2 ps-3'>
                <div className='text-xs font-semibold'>
                  {KIND[update.kind]} · {new Date(update.created_at).toLocaleString()}
                </div>
                <div className='font-medium'>{update.headline}</div>
                <div className='whitespace-pre-line'>{update.message}</div>
                {update.instructions ? <div className='text-textSecondary whitespace-pre-line'>{update.instructions}</div> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

export default AlertPage

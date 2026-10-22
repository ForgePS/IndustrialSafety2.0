import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import WcSettingsForm from './WcSettingsForm'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getWeeklyStatusReport, wcTodayIso } from '@/lib/forgeWorkersComp'
import { buildWeeklyStatusEmail, reportWeekOf } from '@/lib/forgeWorkersCompEmail'
import { WC_STAGE_LABELS, WC_WORK_STATUS_LABELS } from '@/lib/forgeWorkersCompRules'
import type { WcStage, WcWorkStatus } from '@/lib/forgeWorkersCompRules'

export const metadata: Metadata = { title: 'Workers\' Comp Settings' }

const WcSettingsPage = async () => {
  const context = await requireTenantPermission('workers_comp.configure')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: settings } = await supabase.from('forge_wc_settings').select('*').eq('organization_id', organizationId).maybeSingle()

  // The email goes to the whole company list, so the preview uses organization scope.
  const weekOf = reportWeekOf(wcTodayIso())

  const rows = await getWeeklyStatusReport({
    organizationId,
    userId: context.user.id,
    permission: { ...context.permission, scope: 'organization' },
    weekOf
  })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

  const email = buildWeeklyStatusEmail({
    organizationName: context.activeOrganization.name,
    weekOf,
    rows: rows.map((row: any) => ({
      caseNumber: row.case_number,
      employeeName: row.employee_name,
      injuryDate: row.injury_date,
      location: row.locations?.name || '',
      stage: WC_STAGE_LABELS[row.stage as WcStage],
      workStatus: row.current_work_status ? WC_WORK_STATUS_LABELS[row.current_work_status as WcWorkStatus] : 'No work status',
      daysAway: row.daysAway,
      restrictedDays: row.restrictedDays,
      claim: row.is_self_pay ? 'Self pay' : row.claim_number || 'Claim number missing',
      carrier: row.forge_wc_carriers?.name || '',
      note: row.weekly_update?.notes || null,
      link: `${appUrl}/workers-comp/${row.id}`
    }))
  })

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Workers&apos; Comp</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Settings</h1>
        </div>
        <Button variant='tonalDefault' asChild><Link href='/workers-comp'>Back</Link></Button>
      </div>

      <WcSettingsForm
        timeZone={settings?.time_zone || 'America/Chicago'}
        initial={{
          enabled: Boolean(settings?.weekly_email_enabled),
          recipients: (settings?.weekly_email_recipients || []).join(', '),
          weekday: settings?.weekly_email_weekday ?? 5,
          hour: settings?.weekly_email_hour ?? 7
        }}
      />

      <Card className='min-w-0 [contain:inline-size]' data-testid='wc-email-preview'>
        <CardHeader>
          <CardTitle>Preview: week of {weekOf}</CardTitle>
          <CardDescription data-testid='wc-email-subject'>{email.subject}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Rendered in an isolated frame: the email is static HTML and gets no scripts or same-origin access. */}
          <iframe title='Weekly status email preview' sandbox='' srcDoc={email.html} className='h-[480px] w-full rounded-md border bg-white' />
        </CardContent>
      </Card>
    </div>
  )
}

export default WcSettingsPage

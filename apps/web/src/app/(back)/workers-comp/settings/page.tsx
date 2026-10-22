import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import WcSettingsForm from './WcSettingsForm'
import { renderNotificationEmail } from '@/lib/forgeNotifications'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { wcTodayIso } from '@/lib/forgeWorkersComp'
import { WC_WEEKLY_NOTICE_LINK, reportWeekOf } from '@/lib/forgeWorkersCompEmail'
import { buildWcWeeklyNoticeFor, getWcRecipientCandidates, wcViewPermissionFor } from '@/lib/forgeWorkersCompNotify'

export const metadata: Metadata = { title: 'Workers\' Comp Settings' }

const WcSettingsPage = async () => {
  const context = await requireTenantPermission('workers_comp.configure')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: settings }, candidates, viewPermission] = await Promise.all([
    supabase.from('forge_wc_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    getWcRecipientCandidates(organizationId),
    wcViewPermissionFor(organizationId, context.user.id)
  ])

  const selected: string[] = settings?.weekly_email_recipient_ids || []
  const candidateIds = new Set(candidates.map(item => item.userId))

  // Saved recipients who lost access are listed so they can be removed. The sweep already skips them.
  const lostAccess = selected.filter(id => !candidateIds.has(id))
  const { data: lostUsers } = lostAccess.length ? await supabase.from('users').select('user_id, name, email').in('user_id', lostAccess) : { data: [] }

  const weekOf = reportWeekOf(wcTodayIso())

  // Each recipient gets their own scope; the preview shows what the viewer would receive.
  const preview = viewPermission
    ? await buildWcWeeklyNoticeFor({ organizationId, organizationName: context.activeOrganization.name, userId: context.user.id, permission: viewPermission, weekOf })
    : null

  const email = preview ? renderNotificationEmail({ title: preview.title, body: preview.body, link_path: WC_WEEKLY_NOTICE_LINK }) : null

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
        candidates={candidates}
        lostAccess={lostAccess.map(id => {
          const user = (lostUsers || []).find((row: any) => row.user_id === id)

          return { userId: id, name: user?.name || user?.email || 'Former member' }
        })}
        initial={{
          enabled: Boolean(settings?.weekly_email_enabled),
          recipientIds: selected,
          weekday: settings?.weekly_email_weekday ?? 5,
          hour: settings?.weekly_email_hour ?? 7
        }}
      />

      <Card className='min-w-0 [contain:inline-size]' data-testid='wc-email-preview'>
        <CardHeader>
          <CardTitle>Preview: week of {weekOf}</CardTitle>
          <CardDescription data-testid='wc-email-subject'>
            {email ? email.subject : 'You need workers\' comp view access to preview the notice.'}
          </CardDescription>
        </CardHeader>
        {email ? (
          <CardContent className='flex flex-col gap-3'>
            <p className='text-textSecondary text-sm'>
              This is the notice you would get. Each recipient sees only the cases in their own workers&apos; comp scope. It appears in their Forge notifications and is emailed.
            </p>
            {/* Rendered in an isolated frame: the email is static HTML and gets no scripts or same-origin access. */}
            <iframe title='Weekly status notice preview' sandbox='' srcDoc={email.html} className='h-[420px] w-full rounded-md border bg-white' />
          </CardContent>
        ) : null}
      </Card>
    </div>
  )
}

export default WcSettingsPage

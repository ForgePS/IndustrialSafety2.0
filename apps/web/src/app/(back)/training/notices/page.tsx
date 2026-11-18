import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'

import NoticeSettingsForm from './NoticeSettingsForm'
import { getTrainingNoticeSettings } from '@/lib/forgeTrainingNotify'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Training Notices' }

const TrainingNoticesPage = async () => {
  const context = await requireTenantPermission('training.manage_groups')
  const organizationId = context.activeOrganization.id
  const settings = await getTrainingNoticeSettings(organizationId)

  const { count } = await (createServiceRoleClient() as any)
    .from('forge_training_notice_log')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Notices &amp; Retraining</h1>
          <p className='text-textSecondary mt-2'>
            Reminders and retraining run hourly. {count || 0} notice{count === 1 ? '' : 's'} sent in the last 7 days.
            {settings.last_auto_retrain_on ? ` Retraining last ran ${settings.last_auto_retrain_on}.` : ''}
          </p>
        </div>
        <Button variant='tonalDefault' asChild>
          <Link href='/training'>Back to Training</Link>
        </Button>
      </div>

      <NoticeSettingsForm
        initial={{
          notify_on_assign: settings.notify_on_assign,
          due_reminder_days: settings.due_reminder_days,
          overdue_notices: settings.overdue_notices,
          expiring_notice_days: settings.expiring_notice_days,
          auto_retrain: settings.auto_retrain,
          retrain_due_days: settings.retrain_due_days
        }}
      />
    </div>
  )
}

export default TrainingNoticesPage

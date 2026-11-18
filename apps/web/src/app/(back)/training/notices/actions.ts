'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type TrainingNoticeValues = {
  notify_on_assign: boolean
  due_reminder_days: number
  overdue_notices: boolean
  expiring_notice_days: number
  auto_retrain: boolean
  retrain_due_days: number
}

const whole = (value: unknown, min: number, max: number) => {
  const number = Number(value)

  return Number.isInteger(number) && number >= min && number <= max ? number : null
}

export const saveTrainingNoticeSettings = async (values: TrainingNoticeValues) => {
  const context = await requireTenantPermission('training.manage_groups')
  const organizationId = context.activeOrganization.id
  const dueDays = whole(values.due_reminder_days, 0, 30)
  const expiringDays = whole(values.expiring_notice_days, 0, 120)
  const retrainDays = whole(values.retrain_due_days, 1, 180)

  if (dueDays === null) return { error: 'Due-soon reminders are 0 to 30 days before the due date.' }
  if (expiringDays === null) return { error: 'Expiring notices are 0 to 120 days before expiry.' }
  if (retrainDays === null) return { error: 'Retraining is due 1 to 180 days after it is assigned.' }

  const row = {
    organization_id: organizationId,
    notify_on_assign: Boolean(values.notify_on_assign),
    due_reminder_days: dueDays,
    overdue_notices: Boolean(values.overdue_notices),
    expiring_notice_days: expiringDays,
    auto_retrain: Boolean(values.auto_retrain),
    retrain_due_days: retrainDays,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await (createServiceRoleClient() as any).from('forge_training_settings').upsert(row, { onConflict: 'organization_id' })

  if (error) return { error: 'Unable to save the notice settings.' }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'training.notice_settings_saved', entityType: 'training_settings', entityId: organizationId, afterValue: row })
  revalidatePath('/training/notices')

  return { message: 'Notice settings saved.' }
}

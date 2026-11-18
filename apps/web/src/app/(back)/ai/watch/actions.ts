'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { runForgeAiWatch } from '@/lib/forgeAiWatch'
import { getScopedForgeAiWatchAlerts } from '@/lib/forgeAiWatchAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const ruleSchema = z.object({
  ruleId: z.string().uuid(),
  enabled: z.boolean(),
  severityOverride: z.enum(['info','warning','high','critical']).nullable(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  notificationMode: z.enum(['in_app','none'])
})

const getViewableAlert = async (alertId: string) => {
  const context = await requireTenantPermission('forge_ai.view_alerts')
  const access = await getEffectiveTenantAccess({
    organizationId: context.activeOrganization.id,
    userId: context.user.id
  })

  const permissionByKey = new Map(
    access.effective.map(item => [item.permissionKey, item])
  )

  const alerts = await getScopedForgeAiWatchAlerts({
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    alertPermission: context.permission,
    permissionByKey
  })

  return {
    context,
    alert: alerts.find((item: any) => item.id === alertId) || null
  }
}

export const runForgeAiWatchNow = async () => {
  const context = await requireTenantPermission('forge_ai.manage_watchers')

  try {
    const result = await runForgeAiWatch({
      organizationId: context.activeOrganization.id,
      triggerType: 'manual',
      startedBy: context.user.id
    })

    revalidatePath('/ai/watch')
    return {
      message:
        'AI Watch completed: ' +
        result.alertsCreated +
        ' new, ' +
        result.alertsRefreshed +
        ' refreshed, ' +
        result.alertsResolved +
        ' resolved.'
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Forge AI Watch failed.'
    }
  }
}

export const saveForgeAiWatchRule = async (
  input: z.infer<typeof ruleSchema>
) => {
  const context = await requireTenantPermission('forge_ai.manage_watchers')
  const parsed = ruleSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid AI Watch rule.' }
  }

  const data = parsed.data
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_ai_watch_rules')
    .select('*, forge_ai_watch_rule_templates(*)')
    .eq('organization_id', organizationId)
    .eq('id', data.ruleId)
    .maybeSingle()

  if (!before) return { error: 'AI Watch rule not found.' }

  const { data: after, error } = await supabase
    .from('forge_ai_watch_rules')
    .update({
      enabled: data.enabled,
      severity_override: data.severityOverride,
      config: data.config,
      notification_mode: data.notificationMode,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', data.ruleId)
    .select('*')
    .single()

  if (error || !after) {
    return { error: error?.message || 'Unable to save AI Watch rule.' }
  }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'forge_ai.watch_rule_updated',
    entity_type: 'forge_ai_watch_rule',
    entity_id: data.ruleId,
    before_value: before,
    after_value: after
  })

  revalidatePath('/ai/watch')
  return {
    message: (before.forge_ai_watch_rule_templates?.name || 'AI Watch rule') + ' saved.'
  }
}

export const acknowledgeForgeAiWatchAlert = async (alertId: string) => {
  const { context, alert } = await getViewableAlert(alertId)
  if (!alert) return { error: 'AI Watch alert not found in your access scope.' }

  if (!['open','acknowledged'].includes(alert.status)) {
    return { error: 'This alert is no longer open.' }
  }

  const supabase = createServiceRoleClient() as any
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('forge_ai_watch_alerts')
    .update({
      status: 'acknowledged',
      acknowledged_at: now,
      acknowledged_by: context.user.id,
      updated_at: now
    })
    .eq('id', alertId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: context.activeOrganization.id,
    action: 'forge_ai.watch_alert_acknowledged',
    entity_type: 'forge_ai_watch_alert',
    entity_id: alertId,
    before_value: {
      status: alert.status
    },
    after_value: {
      status: 'acknowledged'
    }
  })

  revalidatePath('/ai/watch')
  return { message: 'Alert acknowledged.' }
}

export const dismissForgeAiWatchAlert = async (alertId: string) => {
  const { context, alert } = await getViewableAlert(alertId)
  if (!alert) return { error: 'AI Watch alert not found in your access scope.' }

  if (!['open','acknowledged'].includes(alert.status)) {
    return { error: 'This alert is no longer active.' }
  }

  const supabase = createServiceRoleClient() as any
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('forge_ai_watch_alerts')
    .update({
      status: 'dismissed',
      dismissed_at: now,
      dismissed_by: context.user.id,
      updated_at: now
    })
    .eq('id', alertId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: context.activeOrganization.id,
    action: 'forge_ai.watch_alert_dismissed',
    entity_type: 'forge_ai_watch_alert',
    entity_id: alertId,
    before_value: {
      status: alert.status
    },
    after_value: {
      status: 'dismissed'
    }
  })

  revalidatePath('/ai/watch')
  return { message: 'Alert dismissed.' }
}

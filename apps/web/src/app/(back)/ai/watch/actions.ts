'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { recordForgeAiAudit } from '@/lib/forgeAiExecution'
import { runForgeAiMonitoringCycle } from '@/lib/forgeAiWatchNotify'
import { getScopedForgeAiWatchAlerts } from '@/lib/forgeAiWatchAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const ruleSchema = z.object({
  ruleId: z.string().uuid(),
  enabled: z.boolean(),
  severityOverride: z.enum(['info','warning','high','critical']).nullable(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string().max(40)).max(20)])),
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
    const cycle = await runForgeAiMonitoringCycle({
      organizationId: context.activeOrganization.id,
      triggerType: 'manual',
      actorUserId: context.user.id
    })
    const result = cycle.watch

    revalidatePath('/ai/watch')
    return {
      message:
        'AI Watch completed: ' +
        result.alertsCreated +
        ' new, ' +
        result.alertsRefreshed +
        ' refreshed, ' +
        result.alertsResolved +
        ' resolved, ' +
        cycle.notified.deliveries +
        ' notification(s) sent.'
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

const routeSchema = z.object({
  ruleKey: z.string().regex(/^[a-z_.]+$/).nullable(),
  minSeverity: z.enum(['info', 'warning', 'high', 'critical']),
  recipientType: z.enum(['tenant_role', 'user']),
  recipientId: z.string().uuid(),
  channel: z.enum(['in_app', 'email'])
})

// Add an alert route. Recipients must belong to this tenant; they still only receive alerts
// they are allowed to open.
export const saveForgeAiAlertRoute = async (input: z.infer<typeof routeSchema>) => {
  const context = await requireTenantPermission('forge_ai.manage_watchers')
  const parsed = routeSchema.safeParse(input)

  if (!parsed.success) return { error: 'Invalid alert route.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const data = parsed.data

  if (data.recipientType === 'tenant_role') {
    const { data: role } = await supabase.from('forge_tenant_roles').select('id').eq('organization_id', organizationId).eq('id', data.recipientId).maybeSingle()

    if (!role) return { error: 'Role not found in this company.' }
  } else {
    const { data: member } = await supabase
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', data.recipientId)
      .eq('is_active', true)
      .maybeSingle()

    if (!member) return { error: 'User is not an active member of this company.' }
  }

  if (data.ruleKey) {
    const { data: template } = await supabase.from('forge_ai_watch_rule_templates').select('id').eq('rule_key', data.ruleKey).maybeSingle()

    if (!template) return { error: 'Unknown Watch rule.' }
  }

  const { data: route, error } = await supabase
    .from('forge_ai_alert_routes')
    .insert({
      organization_id: organizationId,
      rule_key: data.ruleKey,
      min_severity: data.minSeverity,
      recipient_type: data.recipientType,
      tenant_role_id: data.recipientType === 'tenant_role' ? data.recipientId : null,
      user_id: data.recipientType === 'user' ? data.recipientId : null,
      channel: data.channel,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('id')
    .single()

  if (error || !route) return { error: error?.message || 'Unable to save the alert route.' }

  await recordForgeAiAudit({
    organizationId,
    actorUserId: context.user.id,
    eventType: 'watch.route_created',
    resourceType: 'forge_ai_alert_route',
    resourceId: route.id,
    detail: data
  })

  revalidatePath('/ai/watch')

  return { message: 'Alert route added.' }
}

export const deleteForgeAiAlertRoute = async (routeId: string) => {
  const context = await requireTenantPermission('forge_ai.manage_watchers')

  if (!z.string().uuid().safeParse(routeId).success) return { error: 'Invalid alert route.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const { data: removed, error } = await supabase
    .from('forge_ai_alert_routes')
    .delete()
    .eq('organization_id', organizationId)
    .eq('id', routeId)
    .select('id, rule_key, min_severity, recipient_type, tenant_role_id, user_id, channel')

  if (error) return { error: error.message }
  if (!removed?.length) return { error: 'Alert route not found.' }

  await recordForgeAiAudit({
    organizationId,
    actorUserId: context.user.id,
    eventType: 'watch.route_deleted',
    resourceType: 'forge_ai_alert_route',
    resourceId: routeId,
    detail: removed[0]
  })

  revalidatePath('/ai/watch')

  return { message: 'Alert route removed.' }
}

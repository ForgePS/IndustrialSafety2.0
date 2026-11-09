import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { TbRadar } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import ForgeAiWatchPanel from './ForgeAiWatchPanel'
import AlertRoutesCard, { type AlertRoute } from './AlertRoutesCard'
import { DEFAULT_ALERT_ROLE_KEYS } from '@/lib/forgeAiWatchNotify'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getScopedForgeAiWatchAlerts } from '@/lib/forgeAiWatchAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forge AI Watch' }

const ForgeAiWatchPage = async () => {
  const context = await requireTenantPermission('forge_ai.view_alerts')
  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({
    organizationId,
    userId: context.user.id
  })

  const permissionByKey = new Map(
    access.effective.map(item => [item.permissionKey, item])
  )

  const canManage = Boolean(
    permissionByKey.get('forge_ai.manage_watchers')?.allowed
  )

  const supabase = createServiceRoleClient() as any

  const [alerts, { data: rules }] = await Promise.all([
    getScopedForgeAiWatchAlerts({
      organizationId,
      userId: context.user.id,
      alertPermission: context.permission,
      permissionByKey
    }),
    canManage
      ? supabase
          .from('forge_ai_watch_rules')
          .select('*, forge_ai_watch_rule_templates(*)')
          .eq('organization_id', organizationId)
          .order('created_at')
      : Promise.resolve({ data: [] })
  ])

  if (!context.activeOrganization) redirect('/dashboard')

  // Routing data is only loaded for people who manage Watch.
  const [{ data: routes }, { data: roles }, { data: memberships }] = canManage
    ? await Promise.all([
        supabase
          .from('forge_ai_alert_routes')
          .select('id, rule_key, min_severity, recipient_type, tenant_role_id, user_id, channel')
          .eq('organization_id', organizationId)
          .eq('enabled', true)
          .order('created_at'),
        supabase.from('forge_tenant_roles').select('id, name, role_key').eq('organization_id', organizationId).order('name'),
        supabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true)
      ])
    : [{ data: [] }, { data: [] }, { data: [] }]

  const memberIds = (memberships || []).map((row: any) => row.user_id)
  const { data: people } = memberIds.length
    ? await supabase
        .from('forge_personnel')
        .select('auth_user_id, first_name, last_name')
        .eq('organization_id', organizationId)
        .in('auth_user_id', memberIds)
    : { data: [] }
  const nameOf = new Map((people || []).map((row: any) => [row.auth_user_id, [row.first_name, row.last_name].filter(Boolean).join(' ')]))
  const members = memberIds
    .map((id: string) => ({ id, label: nameOf.get(id) || 'Member without a personnel record' }))
    .sort((a: any, b: any) => a.label.localeCompare(b.label))

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 flex items-center gap-3 text-3xl font-bold'><TbRadar />AI Watch</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Proactive monitoring of incidents, recurring patterns and trends, inspections and findings, corrective actions, training, equipment, risks and facility risk indicators. Alerts are routed to the people responsible.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' asChild><Link href='/ai/actions'>AI Actions</Link></Button>
          <Button variant='outline' asChild><Link href='/ai'>Back to Forge AI</Link></Button>
        </div>
      </div>

      <ForgeAiWatchPanel
        alerts={alerts}
        rules={(rules || []) as any}
        canManage={canManage}
      />

      {canManage ? (
        <AlertRoutesCard
          routes={(routes || []) as AlertRoute[]}
          roles={(roles || []).map((role: any) => ({ id: role.id, label: role.name }))}
          members={members}
          rules={(rules || []).map((rule: any) => ({ rule_key: rule.forge_ai_watch_rule_templates.rule_key, name: rule.forge_ai_watch_rule_templates.name }))}
          defaultRoleNames={(roles || []).filter((role: any) => DEFAULT_ALERT_ROLE_KEYS.includes(role.role_key)).map((role: any) => role.name)}
        />
      ) : null}
    </div>
  )
}

export default ForgeAiWatchPage

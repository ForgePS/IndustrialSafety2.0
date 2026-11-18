import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { TbRadar } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import ForgeAiWatchPanel from './ForgeAiWatchPanel'
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

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 flex items-center gap-3 text-3xl font-bold'><TbRadar />AI Watch</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Proactive monitoring of overdue training, open inspection findings, equipment conditions, due maintenance, and incidents awaiting review.
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
    </div>
  )
}

export default ForgeAiWatchPage

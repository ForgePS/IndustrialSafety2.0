import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { TbGauge } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'

import ForgeAiRiskPanel from './ForgeAiRiskPanel'
import { getScopedForgeAiRiskAssessments } from '@/lib/forgeAiRisk'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { commandCenterAvailable } from '@/lib/forgeFeatureAvailability'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forge AI Risk Indicators' }

const ForgeAiRiskPage = async () => {
  const context = await requireTenantPermission('forge_ai.view_risk')

  if (!commandCenterAvailable(context.access.effective)) redirect('/ai')

  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })
  const permissionByKey = new Map(access.effective.map(item => [item.permissionKey, item]))

  const assessments = await getScopedForgeAiRiskAssessments({
    organizationId,
    userId: context.user.id,
    permission: context.permission,
    permissionByKey
  })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 flex items-center gap-3 text-3xl font-bold'>
            <TbGauge />
            Risk Indicators
          </h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            A 0-100 indicator for each facility and division, calculated from its own incidents, open findings, overdue corrective actions,
            overdue training and open high risks. It ranks where attention is needed; it is not a probability of injury. Scopes without
            enough records are not scored.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' asChild>
            <Link href='/ai/watch'>AI Watch</Link>
          </Button>
          <Button variant='outline' asChild>
            <Link href='/ai'>Back to Forge AI</Link>
          </Button>
        </div>
      </div>

      <ForgeAiRiskPanel
        assessments={assessments as any}
        canRecalculate={Boolean(permissionByKey.get('forge_ai.manage_watchers')?.allowed)}
      />
    </div>
  )
}

export default ForgeAiRiskPage

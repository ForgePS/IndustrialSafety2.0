import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { TbBulb } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'

import ForgeAiRecommendationsPanel from './ForgeAiRecommendationsPanel'
import { getScopedForgeAiRecommendations } from '@/lib/forgeAiRecommendations'
import { commandCenterAvailable } from '@/lib/forgeFeatureAvailability'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forge AI Recommendations' }

const ForgeAiRecommendationsPage = async () => {
  const context = await requireTenantPermission('forge_ai.view_recommendations')

  if (!commandCenterAvailable(context.access.effective)) redirect('/ai')

  const organizationId = context.activeOrganization.id
  const permissionByKey = new Map(context.access.effective.map(item => [item.permissionKey, item]))
  const allowed = (key: string) => Boolean(permissionByKey.get(key)?.allowed)

  const recommendations = await getScopedForgeAiRecommendations({
    organizationId,
    userId: context.user.id,
    permissionByKey,
    includeEvents: true
  })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 flex items-center gap-3 text-3xl font-bold'>
            <TbBulb />
            Recommendations
          </h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Suggested next steps built from open AI Watch alerts and the factors driving Elevated or High risk indicators. Each one cites its
            records. Nothing changes in Forge until a person accepts it, and any proposed action still goes through approval with your
            normal permissions. Finished work is verified against the same records.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' asChild>
            <Link href='/ai/watch'>AI Watch</Link>
          </Button>
          <Button variant='outline' asChild>
            <Link href='/ai/risk'>Risk Indicators</Link>
          </Button>
          <Button variant='outline' asChild>
            <Link href='/ai'>Back to Forge AI</Link>
          </Button>
        </div>
      </div>

      <ForgeAiRecommendationsPanel
        recommendations={recommendations as any}
        canReview={allowed('forge_ai.review_recommendations')}
        canSubmit={allowed('forge_ai.review_recommendations') && allowed('forge_ai.run_actions')}
        canApprove={allowed('forge_ai.review_recommendations') && allowed('forge_ai.approve_actions')}
      />
    </div>
  )
}

export default ForgeAiRecommendationsPage

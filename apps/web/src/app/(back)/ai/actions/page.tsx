import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import AiActionQueue from './AiActionQueue'
import { getForgeAiRuntimeContext } from '@/lib/forgeAiRuntime'

export const metadata: Metadata = { title: 'Forge AI Actions' }

const ForgeAiActionsPage = async () => {
  const runtime = await getForgeAiRuntimeContext()
  if ('error' in runtime) redirect('/dashboard')

  const canRun = runtime.access.effective.some(
    item => item.permissionKey === 'forge_ai.run_actions' && item.allowed
  )
  const canApprove = runtime.access.effective.some(
    item => item.permissionKey === 'forge_ai.approve_actions' && item.allowed
  )

  if (!canRun && !canApprove) redirect('/ai')

  const organizationId = runtime.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_ai_action_approvals')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (!canApprove) {
    query = query.eq('requested_by', runtime.user.id)
  }

  const [{ data: approvals }, { data: registry }, { data: inspections }, { data: assets }] = await Promise.all([
    query,
    supabase.from('forge_ai_action_registry').select('*'),
    supabase.from('forge_inspections').select('id, inspection_number').eq('organization_id', organizationId),
    supabase.from('forge_assets').select('id, asset_number, name').eq('organization_id', organizationId)
  ])

  const actionByKey = new Map<string, any>((registry || []).map((item: any) => [item.action_key, item]))
  const inspectionById = new Map<string, any>((inspections || []).map((item: any) => [item.id, item]))
  const assetById = new Map<string, any>((assets || []).map((item: any) => [item.id, item]))

  const hydrated = (approvals || []).map((approval: any) => {
    const action = actionByKey.get(approval.action_key)
    let targetReference: string | null = null

    if (approval.target_type === 'inspection') {
      targetReference = inspectionById.get(approval.target_id)?.inspection_number || null
    }

    if (approval.target_type === 'asset') {
      const asset = assetById.get(approval.target_id)
      targetReference = asset ? asset.asset_number + ' · ' + asset.name : null
    }

    return {
      ...approval,
      actionName: action?.name || approval.action_key,
      actionDescription: action?.description || null,
      riskLevel: action?.risk_level || 'normal',
      targetReference
    }
  })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{runtime.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>AI Actions</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Review changes prepared by Forge AI. Approval revalidates both the requesting user's and approver's normal Forge permission and record scope before execution.
          </p>
        </div>
        <Button variant='outline' asChild><Link href='/ai'>Back to Forge AI</Link></Button>
      </div>

      <AiActionQueue
        approvals={hydrated}
        currentUserId={runtime.user.id}
        canApprove={canApprove}
      />
    </div>
  )
}

export default ForgeAiActionsPage

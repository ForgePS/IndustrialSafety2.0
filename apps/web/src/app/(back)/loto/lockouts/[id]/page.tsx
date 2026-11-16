import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'

import LockoutRunner from '../LockoutRunner'
import { getLockHolderOptions, getLockoutDetail, getUserNames, lotoProcedureWithinScope } from '@/lib/forgeLoto'
import { LOCKOUT_STATUS_LABELS, LOTO_DEFAULT_RESTORATION_CHECK, isOpenLockout, type LockoutStatus } from '@/lib/forgeLotoRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Lockout' }

const LockoutPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('loto.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const lockout = await getLockoutDetail({ organizationId, lockoutId: id })

  if (!lockout) notFound()

  const procedureRef = { organization_id: organizationId, asset_id: lockout.asset_id }

  const mayView = await lotoProcedureWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, procedure: procedureRef })

  if (!mayView) notFound()

  const allowed = (key: string) => context.access.effective.find(item => item.permissionKey === key && item.allowed)
  const executePermission = allowed('loto.execute')

  const canExecute = executePermission
    ? await lotoProcedureWithinScope({ organizationId, userId: context.user.id, scope: executePermission.scope, procedure: procedureRef })
    : false

  const canCreateCapa = Boolean(allowed('corrective_actions.create'))
  const open = isOpenLockout(lockout.status)

  const [holders, names] = await Promise.all([
    canExecute && open && executePermission
      ? getLockHolderOptions({ organizationId, userId: context.user.id, permission: executePermission as any })
      : Promise.resolve({ options: [], trainingRequired: null }),
    getUserNames({
      organizationId,
      userIds: [
        lockout.started_by,
        lockout.verified_by,
        lockout.completed_by,
        lockout.canceled_by,
        ...(lockout.forge_loto_application_locks || []).flatMap((lock: any) => [lock.applied_by, lock.removed_by])
      ]
    })
  ])

  const snapshot = lockout.procedure_snapshot || null
  const restorationChecks = snapshot?.restoration_checks?.length ? snapshot.restoration_checks : [LOTO_DEFAULT_RESTORATION_CHECK]

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
          {context.activeOrganization.name} / <Link href='/loto/lockouts'>Lockouts</Link>
        </p>
        <div className='mt-1 flex flex-wrap items-center gap-3'>
          <h1 className='text-textPrimary text-3xl font-bold'>{lockout.lockout_number || 'Lockout'}</h1>
          <Badge size='sm' variant={lockout.status === 'completed' ? 'tonalSuccess' : lockout.status === 'canceled' ? 'secondary' : 'destructive'}>
            {LOCKOUT_STATUS_LABELS[lockout.status as LockoutStatus] || lockout.status}
          </Badge>
        </div>
        <p className='text-textSecondary mt-2'>
          {lockout.forge_assets?.asset_number} · {lockout.forge_assets?.name}
          {lockout.forge_assets?.locations?.name ? ' · ' + lockout.forge_assets.locations.name : ''}
          {' · '}
          <Link href={'/loto/' + lockout.procedure_id} className='hover:underline'>
            {lockout.forge_loto_procedures?.procedure_number} Rev {lockout.revision_number || lockout.forge_loto_procedures?.revision_number}
          </Link>
        </p>
      </div>

      <LockoutRunner
        lockout={{
          id: lockout.id,
          status: lockout.status,
          workDescription: lockout.work_description,
          affectedEmployees: lockout.affected_employees,
          tryStartRequired: lockout.try_start_required,
          tryStartCompleted: lockout.try_start_completed,
          zeroEnergyConfirmed: lockout.zero_energy_confirmed,
          stepChecks: lockout.step_checks || {},
          restorationChecksDone: lockout.restoration_checks_done || [],
          verificationNotes: lockout.verification_notes,
          notes: lockout.notes,
          cancelReason: lockout.cancel_reason,
          startedAt: lockout.started_at,
          startedBy: names[lockout.started_by] || null,
          verifiedAt: lockout.verified_at,
          verifiedBy: names[lockout.verified_by] || null,
          closedAt: lockout.completed_at || lockout.canceled_at,
          closedBy: names[lockout.completed_by || lockout.canceled_by] || null
        }}
        snapshot={{
          procedure: snapshot?.procedure || null,
          energySources: snapshot?.energy_sources || [],
          steps: snapshot?.steps || [],
          restorationChecks
        }}
        locks={(lockout.forge_loto_application_locks || []).map((lock: any) => ({
          id: lock.id,
          holderName: lock.holder_name,
          lockTagId: lock.lock_tag_id,
          appliedAt: lock.applied_at,
          appliedBy: names[lock.applied_by] || null,
          removedAt: lock.removed_at,
          removedBy: names[lock.removed_by] || null,
          removalNote: lock.removal_note
        }))}
        canExecute={Boolean(canExecute)}
        canCreateCapa={canCreateCapa}
        personnel={holders.options}
        trainingRequired={holders.trainingRequired}
      />
    </div>
  )
}

export default LockoutPage

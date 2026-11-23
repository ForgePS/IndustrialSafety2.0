import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import { archiveSpace } from '@/app/(back)/permits/actions'
import ActionButton from '@/components/emergency/ActionButton'
import { Detail, hazardLabels } from '@/components/permits/PermitDetails'
import PermitTabs from '@/components/permits/PermitTabs'
import { formatDate, formatWhen } from '@/components/permits/format'
import { companyLocations, companyTimeZone, covers, listPermits, loadSpace, permitRights, userNameMap, viewGrant } from '@/lib/forgePermitAccess'
import type { PermitStatus } from '@/lib/forgePermitRules'
import { isExpired, PERMIT_STATUS_LABELS, permitPath, permitStatusTone } from '@/lib/forgePermitRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Confined space' }

/** Port slice 18: one confined space, with its permits and history. */
const SpacePage = async ({ params }: { params: Promise<{ type: string; spaceId: string }> }) => {
  const { type, spaceId } = await params

  if (type !== 'confined-space') notFound()

  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const rights = await permitRights(organizationId, context.user.id, context.access)
  const space = await loadSpace(organizationId, spaceId)

  if (!space || !covers(viewGrant(rights), space.location_id)) notFound()

  const canManage = covers(rights.manage, space.location_id)

  const [permits, locations, timeZone, activityResult] = await Promise.all([
    listPermits({ organizationId, rights, type: 'confined_space', spaceId: space.id }),
    companyLocations(organizationId),
    companyTimeZone(organizationId),
    (createServiceRoleClient() as any)
      .from('forge_permit_activity')
      .select('id, action, detail, actor_user_id, created_at')
      .eq('organization_id', organizationId)
      .eq('space_id', space.id)
      .order('created_at')
      .order('id')
  ])

  const activity = (activityResult.data || []) as any[]
  const users = await userNameMap(activity.map(row => row.actor_user_id))
  const now = new Date()

  return (
    <div className='flex flex-col gap-6' data-space-page={space.name}>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href='/permits/confined-space/spaces' className='text-primary text-sm hover:underline'>
            ← Confined spaces
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>
            {space.space_code ? space.space_code + ' ' : ''}
            {space.name}
          </h1>
          <div className='mt-2 flex flex-wrap gap-3 text-sm'>
            <span className='rounded-full border px-3 py-0.5 font-medium'>{space.permit_required ? 'Permit required' : 'Non-permit space'}</span>
            {space.archived_at ? (
              <span className='text-textSecondary' data-space-archived>
                Archived
              </span>
            ) : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canManage && !space.archived_at ? (
            <Button asChild variant='outline'>
              <Link href={`/permits/confined-space/spaces/${space.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {canManage ? (
            <ActionButton
              run={archiveSpace.bind(null, space.id, !space.archived_at)}
              label={space.archived_at ? 'Restore' : 'Archive'}
              confirm={space.archived_at ? undefined : 'Archive this space? New permits cannot be written for it.'}
            />
          ) : null}
        </div>
      </div>
      <PermitTabs active='spaces' canManage={Boolean(rights.manage)} />

      <Card>
        <CardHeader>
          <CardTitle>The space</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <dl className='grid gap-4 md:grid-cols-3'>
            <Detail label='Location'>{locations.find(item => item.id === space.location_id)?.name}</Detail>
            <Detail label='Hazards'>{hazardLabels(space.hazards)}</Detail>
            <Detail label='Last evaluated'>{formatDate(space.last_evaluated_on)}</Detail>
          </dl>
          <dl className='grid gap-4 md:grid-cols-2'>
            <Detail label='Description'>{space.description}</Detail>
            <Detail label='Entry points'>{space.entry_points}</Detail>
            <Detail label='Isolation'>{space.isolation_notes}</Detail>
            <Detail label='Rescue plan'>{space.rescue_plan}</Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entry permits</CardTitle>
        </CardHeader>
        <CardContent>
          {permits.length ? (
            <ul className='flex flex-col gap-2 text-sm' data-space-permits>
              {(permits as any[]).map(permit => (
                <li key={permit.id} className='flex flex-wrap items-center gap-2'>
                  <Link href={permitPath('confined_space', permit.id)} className='text-primary font-medium hover:underline'>
                    {permit.permit_number}
                  </Link>
                  {permit.title}
                  <Badge variant={permitStatusTone(permit.status, isExpired(permit, now))}>{PERMIT_STATUS_LABELS[permit.status as PermitStatus] || permit.status}</Badge>
                  <span className='text-textSecondary text-xs'>{formatWhen(permit.valid_from, timeZone)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No permits for this space yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length ? (
            <ul className='flex flex-col gap-1 text-sm'>
              {activity.map(row => (
                <li key={row.id}>
                  <span className='text-textSecondary'>{formatWhen(row.created_at, timeZone)}</span> · {users.get(row.actor_user_id) || 'System'} · <span className='font-medium'>{row.action}</span>
                  {row.detail ? `: ${row.detail}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>Nothing yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default SpacePage

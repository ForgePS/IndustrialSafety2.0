import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { archivePermit } from '@/app/(back)/environmental/actions'
import ActionButton from '@/components/emergency/ActionButton'
import ObligationTable from '@/components/environmental/ObligationTable'
import { companyLocations, envRights, loadPermit, todayIso } from '@/lib/forgeEnvironmental'
import { PERMIT_STATE_LABELS, permitState, permitStatusLabel, permitTypeLabel } from '@/lib/forgeEnvironmentalRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Environmental permit' }

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className='text-textSecondary text-xs font-medium uppercase'>{label}</dt>
    <dd className='text-sm whitespace-pre-wrap'>{children || '—'}</dd>
  </div>
)

/** Port slice 17: one permit with its obligations. */
const PermitPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('environmental.view')
  const organizationId = context.activeOrganization.id
  const rights = await envRights(organizationId, context.user.id, context.access)
  const found = await loadPermit({ organizationId, rights, id })

  if (!found) notFound()

  const { permit, canManage } = found
  const editable = canManage && !permit.archived_at
  const state = permitState(permit, todayIso())
  const locations = await companyLocations(organizationId)

  return (
    <div className='flex flex-col gap-6' data-permit-page>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href='/environmental/permits' className='text-primary text-sm hover:underline'>
            ← Permits
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{permit.title}</h1>
          <div className='mt-2 flex flex-wrap gap-3 text-sm'>
            <span className='rounded-full border px-3 py-0.5 font-medium' data-permit-state={state}>
              {PERMIT_STATE_LABELS[state]}
            </span>
            {permit.archived_at ? <span className='text-textSecondary'>Archived</span> : null}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {editable ? (
            <Button asChild variant='outline'>
              <Link href={`/environmental/permits/${permit.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {canManage ? (
            <ActionButton
              run={archivePermit.bind(null, permit.id, !permit.archived_at)}
              label={permit.archived_at ? 'Restore' : 'Archive'}
              confirm={permit.archived_at ? undefined : 'Archive this permit? Its obligations will be paused.'}
            />
          ) : null}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Permit</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-4 md:grid-cols-3'>
            <Detail label='Type'>{permitTypeLabel(permit.permit_type)}</Detail>
            <Detail label='Number'>{permit.permit_number}</Detail>
            <Detail label='Agency'>{permit.agency}</Detail>
            <Detail label='Location'>{locations.find(item => item.id === permit.location_id)?.name}</Detail>
            <Detail label='Status'>{permitStatusLabel(permit.status)}</Detail>
            <Detail label='Issued'>{permit.issued_on}</Detail>
            <Detail label='Effective'>{permit.effective_on}</Detail>
            <Detail label='Expires'>{permit.expires_on}</Detail>
            <Detail label='Document'>
              {found.document ? (
                <Link href={'/documents/' + found.document.id} className='text-primary hover:underline'>
                  {found.document.document_number} {found.document.name}
                </Link>
              ) : null}
            </Detail>
          </dl>
          {permit.notes ? <p className='mt-4 text-sm whitespace-pre-wrap'>{permit.notes}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <CardTitle>Obligations</CardTitle>
          {editable ? (
            <Button asChild size='sm'>
              <Link href={`/environmental/obligations/new?permit=${permit.id}`}>Add obligation</Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <ObligationTable obligations={found.obligations} empty='No obligations for this permit yet.' />
        </CardContent>
      </Card>
    </div>
  )
}

export default PermitPage

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { archiveWorker, deleteQualification } from '@/app/(back)/contractors/actions'
import QualificationForm from '@/components/contractors/QualificationForm'
import StandingBadge, { ProblemList } from '@/components/contractors/StandingBadge'
import WorkerForm from '@/components/contractors/WorkerForm'
import ActionButton from '@/components/emergency/ActionButton'
import { expiryState } from '@/lib/forgeContractorRules'
import { contractorRights, loadSettings, loadWorker, todayIso, workerName } from '@/lib/forgeContractors'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Contractor worker' }

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

/** Port slice 15: one contractor worker with orientation, qualifications, standing and site visits. */
const WorkerPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('contractor_safety.view')
  const organizationId = context.activeOrganization.id
  const rights = await contractorRights(organizationId, context.user.id, context.access)
  const found = await loadWorker({ organizationId, rights, id })

  if (!found || found.worker.archived_at) notFound()

  const { worker, company, standing, qualifications, visits } = found
  const editable = found.canManage && !company.archived_at
  const settings = await loadSettings(organizationId)
  const today = todayIso()

  return (
    <div className='flex flex-col gap-6' data-contractor-worker-page>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <Link href={'/contractors/' + company.id} className='text-primary text-sm hover:underline'>
            ← {company.name}
          </Link>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{workerName(worker)}</h1>
          <div className='mt-2 flex flex-wrap items-center gap-3 text-sm'>
            <StandingBadge standing={standing} />
            {standing.orientationExpiresOn ? <span className='text-textSecondary'>Orientation good until {standing.orientationExpiresOn}</span> : null}
          </div>
        </div>
        {editable ? <ActionButton run={archiveWorker.bind(null, worker.id)} label='Remove worker' confirm='Remove this worker? Their visit history stays.' goTo={'/contractors/' + company.id} /> : null}
      </div>

      {standing.problems.length || standing.warnings.length ? (
        <Card>
          <CardContent className='p-4'>
            <ProblemList standing={standing} />
          </CardContent>
        </Card>
      ) : null}

      {editable ? (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkerForm
              id={worker.id}
              initial={{
                firstName: worker.first_name,
                lastName: worker.last_name,
                email: worker.email || '',
                phone: worker.phone || '',
                trade: worker.trade || '',
                badgeNumber: worker.badge_number || '',
                orientationCompletedOn: worker.orientation_completed_on || '',
                active: worker.active
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='grid gap-2 p-4 text-sm md:grid-cols-3'>
            <span>Badge: {worker.badge_number || '—'}</span>
            <span>Trade: {worker.trade || '—'}</span>
            <span>Orientation: {worker.orientation_completed_on || 'Not done'}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Training and certifications</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {qualifications.length ? (
            <table className='w-full border-collapse text-sm' data-contractor-qualifications>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4 font-semibold'>Name</th>
                  <th className='py-2 pr-4 font-semibold'>Issued</th>
                  <th className='py-2 pr-4 font-semibold'>Expires</th>
                  <th className='py-2 pr-4 font-semibold'>Required</th>
                  <th className='py-2 font-semibold' />
                </tr>
              </thead>
              <tbody>
                {qualifications.map((item: any) => {
                  const state = item.expires_on ? expiryState(item.expires_on, today, settings.warningDays) : null

                  return (
                    <tr key={item.id} className='border-b last:border-0' data-contractor-qualification={item.name}>
                      <td className='py-2 pr-4'>{item.name}</td>
                      <td className='py-2 pr-4'>{item.issued_on || '—'}</td>
                      <td className={'py-2 pr-4 ' + (state === 'expired' ? 'text-error font-semibold' : state === 'expiring' ? 'text-warning font-semibold' : '')}>{item.expires_on || 'No expiry'}</td>
                      <td className='py-2 pr-4'>{item.required ? 'Yes' : 'No'}</td>
                      <td className='py-2 text-right'>{editable ? <ActionButton run={deleteQualification.bind(null, worker.id, item.id)} label='Remove' confirm='Remove this qualification?' /> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary text-sm'>None recorded.</p>
          )}
          {editable ? <QualificationForm workerId={worker.id} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Site visits</CardTitle>
        </CardHeader>
        <CardContent>
          {visits.length ? (
            <table className='w-full border-collapse text-sm' data-contractor-visits>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4 font-semibold'>Location</th>
                  <th className='py-2 pr-4 font-semibold'>Signed in</th>
                  <th className='py-2 pr-4 font-semibold'>Signed out</th>
                  <th className='py-2 font-semibold'>Override</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit: any) => (
                  <tr key={visit.id} className='border-b last:border-0'>
                    <td className='py-2 pr-4'>{visit.locations?.name || '—'}</td>
                    <td className='py-2 pr-4'>{when(visit.signed_in_at)}</td>
                    <td className='py-2 pr-4'>{visit.signed_out_at ? when(visit.signed_out_at) : 'On site'}</td>
                    <td className='py-2'>{visit.override_reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary text-sm'>No visits yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default WorkerPage

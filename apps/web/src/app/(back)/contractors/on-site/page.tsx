import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { signOut } from '@/app/(back)/contractors/actions'
import SignInForm from '@/components/contractors/SignInForm'
import { contractorTabs } from '@/components/contractors/tabs'
import ActionButton from '@/components/emergency/ActionButton'
import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { companyLocations, contractorRights, onSiteNow, signInCandidates, workerName } from '@/lib/forgeContractors'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Contractors on site' }

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

/** Port slice 15: sign contractors in and out, and see who is on site now. */
const OnSitePage = async () => {
  const context = await requireTenantPermission('contractor_safety.sign_in')
  const organizationId = context.activeOrganization.id
  const rights = await contractorRights(organizationId, context.user.id, context.access)
  const desk = rights.signIn?.locations ?? null

  const [allLocations, workers, onSite] = await Promise.all([companyLocations(organizationId), signInCandidates({ organizationId, rights }), onSiteNow(organizationId, desk)])
  const locations = desk === null ? allLocations : allLocations.filter(location => desk.includes(location.id))
  const manage = rights.manage
  const canOverride = Boolean(manage) && (manage!.locations === null || locations.some(location => manage!.locations!.includes(location.id)))

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Contractor Safety</h1>
      <EmergencyTabs tabs={contractorTabs({ canSignIn: true, canSettings: rights.settings })} current='on-site' label='Contractor Safety' />
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          {workers.length && locations.length ? (
            <SignInForm workers={workers} locations={locations} canOverride={canOverride} />
          ) : (
            <p className='text-textSecondary text-sm'>{locations.length ? 'No contractor workers to sign in yet.' : "You aren't assigned to a location."}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>On site now ({onSite.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {onSite.length ? (
            <table className='w-full border-collapse text-sm' data-contractors-on-site>
              <thead>
                <tr className='border-b text-left'>
                  <th className='py-2 pr-4 font-semibold'>Worker</th>
                  <th className='py-2 pr-4 font-semibold'>Company</th>
                  <th className='py-2 pr-4 font-semibold'>Location</th>
                  <th className='py-2 pr-4 font-semibold'>Host</th>
                  <th className='py-2 pr-4 font-semibold'>Since</th>
                  <th className='py-2 font-semibold' />
                </tr>
              </thead>
              <tbody>
                {onSite.map((visit: any) => {
                  const name = visit.forge_contractor_workers ? workerName(visit.forge_contractor_workers) : 'Unknown'

                  return (
                    <tr key={visit.id} className='border-b last:border-0' data-on-site={name}>
                      <td className='py-2 pr-4'>
                        <Link href={'/contractors/workers/' + visit.worker_id} className='text-primary font-medium hover:underline'>
                          {name}
                        </Link>
                        {visit.override_reason ? (
                          <span className='text-warning block text-xs' data-override>
                            Override: {visit.override_reason}
                          </span>
                        ) : null}
                      </td>
                      <td className='py-2 pr-4'>{visit.forge_contractor_companies?.name}</td>
                      <td className='py-2 pr-4'>{visit.locations?.name}</td>
                      <td className='py-2 pr-4'>{visit.host_name || '—'}</td>
                      <td className='py-2 pr-4'>{when(visit.signed_in_at)}</td>
                      <td className='py-2 text-right'>
                        <ActionButton run={signOut.bind(null, visit.id)} label='Sign out' data-sign-out={name} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className='text-textSecondary text-sm'>No one is signed in.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default OnSitePage

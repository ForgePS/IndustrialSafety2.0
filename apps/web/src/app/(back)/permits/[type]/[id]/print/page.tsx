import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@repo/supabase/server'

import PrintButton from '@/components/common/PrintButton'
import { detailRows, hazardLabels } from '@/components/permits/PermitDetails'
import { formatDate, formatWhen } from '@/components/permits/format'
import { companyLocations, loadPermit, loadPermitBundle, loadSpace, permitRights } from '@/lib/forgePermitAccess'
import type { PermitStatus } from '@/lib/forgePermitRules'
import { mergeCheckDefinitions, PERMIT_ROLE_LABELS, PERMIT_ROLES, PERMIT_STATUS_LABELS, PERMIT_TYPE_INFO, permitPath, permitTypeFromSlug, personLabel } from '@/lib/forgePermitRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Print permit' }

const PRINT_CSS = `@page { size: letter; margin: 0.5in; }
@media print {
  body * { visibility: hidden !important; }
  [data-permit-print], [data-permit-print] * { visibility: visible !important; }
  [data-permit-print] { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; padding: 0; border: 0; box-shadow: none; color: #111827; background: #fff; font-size: 10pt; }
  [data-print-hide] { display: none !important; }
  [data-permit-print] section { break-inside: avoid; }
}
[data-permit-print] table { width: 100%; border-collapse: collapse; }
[data-permit-print] th, [data-permit-print] td { border: 1px solid #9ca3af; padding: 3px 6px; text-align: left; vertical-align: top; }
[data-permit-print] .sig { display: block; min-height: 2em; border-bottom: 1px solid #374151; }`

const ANSWERS: Record<string, string> = { yes: 'Yes', no: 'No', na: 'N/A' }

const num = (value: unknown) => (value === null || value === undefined ? '' : String(Number(value)))

/** Port slice 18: a clean permit to post at the job: the work, people, checklist, gas tests, entries and signature lines. */
const PermitPrintPage = async ({ params }: { params: Promise<{ type: string; id: string }> }) => {
  const { type: slug, id } = await params
  const type = permitTypeFromSlug(slug)

  if (!type) notFound()

  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const rights = await permitRights(organizationId, context.user.id, context.access)
  const permit = await loadPermit(organizationId, rights, id, type)

  if (!permit) notFound()

  const supabase = createServiceRoleClient() as any

  const [bundle, locations, space, asset, contractor] = await Promise.all([
    loadPermitBundle(organizationId, permit),
    companyLocations(organizationId),
    permit.space_id ? loadSpace(organizationId, permit.space_id) : Promise.resolve(null),
    permit.asset_id ? supabase.from('forge_assets').select('asset_number, name').eq('organization_id', organizationId).eq('id', permit.asset_id).maybeSingle() : Promise.resolve({ data: null }),
    permit.contractor_company_id
      ? supabase.from('forge_contractor_companies').select('name').eq('organization_id', organizationId).eq('id', permit.contractor_company_id).maybeSingle()
      : Promise.resolve({ data: null })
  ])

  const { timeZone } = bundle
  const user = (value: string | null | undefined) => (value ? bundle.users.get(value) || '' : '')
  const answers = new Map(bundle.answers.map(answer => [answer.check_key, answer]))
  const current = bundle.people.filter(person => !person.removed_at)
  const nameOf = new Map(bundle.people.map(person => [person.id, personLabel(person, bundle.names.personnel, bundle.names.workers)]))

  const rows = [
    { label: 'Location', value: locations.find(item => item.id === permit.location_id)?.name || '' },
    { label: 'Work area', value: permit.work_area || '' },
    ...(space ? [{ label: 'Confined space', value: `${space.space_code ? space.space_code + ' ' : ''}${space.name}` }] : []),
    { label: 'Equipment', value: asset.data ? `${asset.data.asset_number} ${asset.data.name}` : '' },
    { label: 'Contractor', value: contractor.data?.name || '' },
    { label: 'Valid from', value: formatWhen(permit.valid_from, timeZone) },
    { label: 'Valid until', value: formatWhen(permit.valid_until, timeZone) },
    { label: 'Status', value: PERMIT_STATUS_LABELS[permit.status as PermitStatus] || permit.status },
    ...detailRows(type, permit.details || {})
  ]

  return (
    <div className='flex flex-col gap-4'>
      <style>{PRINT_CSS}</style>
      <div className='flex items-center gap-3' data-print-hide>
        <Link href={permitPath(type, permit.id)} className='text-primary text-sm hover:underline'>
          ← Back to the permit
        </Link>
        <PrintButton />
      </div>
      <article className='bg-background mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-md border p-6 text-sm' data-permit-print>
        <header className='flex flex-wrap items-start justify-between gap-2 border-b pb-2'>
          <div>
            <p className='text-xs uppercase'>{context.activeOrganization.name}</p>
            <h1 className='text-2xl font-bold'>{PERMIT_TYPE_INFO[type].label} Permit</h1>
            <p className='text-lg font-semibold'>
              {permit.permit_number}: {permit.title}
            </p>
          </div>
          <p className='text-right text-xs'>
            Printed {formatWhen(new Date(), timeZone)}
            <br />
            Post at the job until the permit is closed.
          </p>
        </header>

        <section>
          <table>
            <tbody>
              {rows.map(row => (
                <tr key={row.label}>
                  <th className='w-1/3'>{row.label}</th>
                  <td className='whitespace-pre-wrap'>{row.value}</td>
                </tr>
              ))}
              <tr>
                <th>Work description</th>
                <td className='whitespace-pre-wrap'>{permit.work_description}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {space ? (
          <section>
            <h2 className='mb-1 font-semibold'>Space hazards and rescue</h2>
            <table>
              <tbody>
                <tr>
                  <th className='w-1/3'>Hazards</th>
                  <td>{hazardLabels(space.hazards)}</td>
                </tr>
                <tr>
                  <th>Isolation</th>
                  <td className='whitespace-pre-wrap'>{space.isolation_notes}</td>
                </tr>
                <tr>
                  <th>Rescue plan</th>
                  <td className='whitespace-pre-wrap'>{space.rescue_plan}</td>
                </tr>
                <tr>
                  <th>Last evaluated</th>
                  <td>{formatDate(space.last_evaluated_on)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : null}

        <section>
          <h2 className='mb-1 font-semibold'>People</h2>
          <table data-print-people>
            <thead>
              <tr>
                <th>Role</th>
                <th>Name</th>
                <th className='w-1/3'>Signature</th>
              </tr>
            </thead>
            <tbody>
              {PERMIT_ROLES[type].flatMap(role => {
                const holders = current.filter(person => person.role === role)

                return (holders.length ? holders : [null]).map((person, index) => (
                  <tr key={role + (person?.id || index)}>
                    <td>{PERMIT_ROLE_LABELS[role]}</td>
                    <td>{person ? nameOf.get(person.id) : ''}</td>
                    <td>
                      <span className='sig' />
                    </td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className='mb-1 font-semibold'>Checklist</h2>
          <table data-print-checklist>
            <thead>
              <tr>
                <th>Item</th>
                <th className='w-16'>Answer</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {mergeCheckDefinitions(bundle.definitions).map(item => {
                const answer = answers.get(item.check_key)

                return (
                  <tr key={item.check_key}>
                    <td>
                      {item.label}
                      {item.required ? '' : ' (optional)'}
                    </td>
                    <td>{answer ? ANSWERS[answer.answer] : ''}</td>
                    <td>{answer?.note || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {type === 'confined_space' || type === 'hot_work' ? (
          <section>
            <h2 className='mb-1 font-semibold'>
              Gas tests (limits: O2 {bundle.settings.o2_min}–{bundle.settings.o2_max}%, LEL under {type === 'hot_work' ? bundle.settings.hot_work_lel_max : bundle.settings.lel_max}%, H2S under{' '}
              {bundle.settings.h2s_max} ppm, CO under {bundle.settings.co_max} ppm)
            </h2>
            <table data-print-gas-tests>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>O2 %</th>
                  <th>LEL %</th>
                  <th>H2S ppm</th>
                  <th>CO ppm</th>
                  <th>Other</th>
                  <th>Result</th>
                  <th>Tested by</th>
                </tr>
              </thead>
              <tbody>
                {bundle.gasTests.map(test => (
                  <tr key={test.id}>
                    <td>{formatWhen(test.tested_at, timeZone)}</td>
                    <td>{num(test.o2_pct)}</td>
                    <td>{num(test.lel_pct)}</td>
                    <td>{num(test.h2s_ppm)}</td>
                    <td>{num(test.co_ppm)}</td>
                    <td>{test.other_gas ? `${test.other_gas} ${num(test.other_value)}` : ''}</td>
                    <td>{test.passed ? 'Pass' : 'FAIL'}</td>
                    <td>{user(test.tested_by)}</td>
                  </tr>
                ))}
                {[0, 1, 2, 3].map(index => (
                  <tr key={'blank' + index}>
                    {Array.from({ length: 8 }, (_, cell) => (
                      <td key={cell}>&nbsp;</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {type === 'confined_space' ? (
          <section>
            <h2 className='mb-1 font-semibold'>Entry log</h2>
            <table data-print-entries>
              <thead>
                <tr>
                  <th>Who</th>
                  <th>In</th>
                  <th>Out</th>
                </tr>
              </thead>
              <tbody>
                {[...bundle.entries].reverse().map(entry => (
                  <tr key={entry.id}>
                    <td>{nameOf.get(entry.person_id) || ''}</td>
                    <td>{formatWhen(entry.entered_at, timeZone)}</td>
                    <td>{entry.exited_at ? formatWhen(entry.exited_at, timeZone) : 'Still inside'}</td>
                  </tr>
                ))}
                {[0, 1, 2, 3, 4].map(index => (
                  <tr key={'blank' + index}>
                    <td>&nbsp;</td>
                    <td />
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <section>
          <h2 className='mb-1 font-semibold'>Sign-off</h2>
          <table>
            <tbody>
              {[
                { label: 'Requested by', name: user(permit.requested_by), at: permit.requested_at },
                { label: 'Approved by', name: user(permit.approved_by), at: permit.approved_at },
                { label: 'Issued by', name: user(permit.issued_by), at: permit.issued_at },
                ...(type === 'hot_work' ? [{ label: 'Work complete; fire watch started', name: user(permit.work_completed_by), at: permit.work_completed_at }] : []),
                { label: 'Closed by', name: user(permit.closed_by), at: permit.closed_at }
              ].map(row => (
                <tr key={row.label}>
                  <th className='w-1/4'>{row.label}</th>
                  <td className='w-1/4'>{row.name}</td>
                  <td className='w-1/4'>{row.at ? formatWhen(row.at, timeZone) : ''}</td>
                  <td className='w-1/4'>
                    <span className='sig' />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </article>
    </div>
  )
}

export default PermitPrintPage

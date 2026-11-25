import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import PrintButton from '@/components/common/PrintButton'
import { formatWhen } from '@/components/permits/format'
import { companyTimeZone, forkliftRights, loadCheck, loadTruck, locationNames, rightsAt, userNameMap } from '@/lib/forgeForkliftAccess'
import { SECTION_LABELS, truckSummary } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Pre-shift check' }

const PRINT_CSS = `@page { size: letter; margin: 0.5in; }
@media print {
  body * { visibility: hidden !important; }
  [data-check-print], [data-check-print] * { visibility: visible !important; }
  [data-check-print] { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; padding: 0; border: 0; box-shadow: none; color: #111827; background: #fff; font-size: 10pt; }
  [data-print-hide] { display: none !important; }
  [data-check-print] section { break-inside: avoid; }
}
[data-check-print] table { width: 100%; border-collapse: collapse; }
[data-check-print] th, [data-check-print] td { border: 1px solid #9ca3af; padding: 3px 6px; text-align: left; vertical-align: top; }`

const ANSWERS: Record<string, string> = { ok: 'OK', defect: 'DEFECT', na: 'N/A' }

/** Port slice 19: one pre-shift check, read-only, laid out to print. */
const CheckViewPage = async ({ params }: { params: Promise<{ checkId: string }> }) => {
  const { checkId } = await params
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const check = await loadCheck(organizationId, checkId)

  if (!check) notFound()
  const truck = await loadTruck(organizationId, rights, check.forklift_id)

  if (!truck && !rightsAt(rights, check.location_id).view) notFound()

  const [timeZone, locations, users] = await Promise.all([companyTimeZone(organizationId), locationNames(organizationId), userNameMap([check.performed_by_user_id])])
  const answers = (Array.isArray(check.answers) ? check.answers : []) as { item_id: string; label: string; section: string; critical: boolean; answer: string; note: string | null }[]
  const defects = answers.filter(answer => answer.answer === 'defect')
  const pass = check.result === 'pass'

  return (
    <div className='flex flex-col gap-4'>
      <style>{PRINT_CSS}</style>
      <div className='flex flex-wrap items-center gap-3' data-print-hide>
        <Link href={truck ? '/forklifts/trucks/' + truck.id : '/forklifts/checks'} className='text-primary text-sm hover:underline'>
          ← {truck ? truck.asset.name : 'Pre-shift checks'}
        </Link>
        <PrintButton />
      </div>
      <div
        className={'rounded-md border-2 p-4 ' + (pass ? 'border-success text-success bg-success/10' : 'border-error text-error bg-error/10')}
        data-print-hide
        data-check-outcome={pass ? 'pass' : check.took_out_of_service ? 'out-of-service' : 'fail'}
      >
        <p className='text-lg font-bold'>
          {pass ? 'Passed. The forklift may be used.' : check.took_out_of_service ? 'Failed. The forklift was taken out of service. Do not use it.' : `Failed with ${defects.length} non-critical defect${defects.length === 1 ? '' : 's'}. The forklift stays in service.`}
        </p>
      </div>
      <article className='bg-background mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-md border p-6 text-sm' data-check-print>
        <header className='flex flex-wrap items-start justify-between gap-2 border-b pb-2'>
          <div>
            <p className='text-xs uppercase'>{context.activeOrganization.name}</p>
            <h1 className='text-2xl font-bold'>Forklift Pre-Shift Check</h1>
            <p className='text-lg font-semibold'>{truck ? `${truck.asset.asset_number} ${truck.asset.name}` : 'Forklift'}</p>
            {truck ? <p className='text-xs'>{truckSummary(truck)}</p> : null}
          </div>
          <p className='text-right text-xs'>
            Printed {formatWhen(new Date(), timeZone)}
            <br />
            OSHA 1910.178(q)(7)
          </p>
        </header>
        <section>
          <table>
            <tbody>
              <tr>
                <th className='w-1/3'>Performed</th>
                <td>{formatWhen(check.performed_at, timeZone)}</td>
              </tr>
              <tr>
                <th>Operator</th>
                <td data-check-operator-name>{check.operator_name}</td>
              </tr>
              <tr>
                <th>Recorded by</th>
                <td>{users.get(check.performed_by_user_id) || ''}</td>
              </tr>
              <tr>
                <th>Location</th>
                <td>{locations.get(check.location_id || '') || ''}</td>
              </tr>
              <tr>
                <th>Hour meter</th>
                <td>{check.hour_meter === null ? '' : Number(check.hour_meter).toLocaleString('en-US')}</td>
              </tr>
              <tr>
                <th>Result</th>
                <td data-check-print-result className='font-semibold'>
                  {pass ? 'PASS' : 'FAIL'}
                  {check.took_out_of_service ? ': taken out of service' : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        {['visual', 'operational'].map(section =>
          answers.some(answer => answer.section === section) ? (
            <section key={section}>
              <h2 className='mb-1 font-semibold'>{SECTION_LABELS[section]}</h2>
              <table data-check-answers={section}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className='w-20'>Answer</th>
                    <th className='w-1/3'>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {answers
                    .filter(answer => answer.section === section)
                    .map(answer => (
                      <tr key={answer.item_id} data-check-answer={answer.label}>
                        <td>
                          {answer.label}
                          {answer.critical ? ' (critical)' : ''}
                        </td>
                        <td className={answer.answer === 'defect' ? 'text-error font-semibold' : ''}>{ANSWERS[answer.answer] || answer.answer}</td>
                        <td>{answer.note || ''}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          ) : null
        )}
        {check.notes ? (
          <section>
            <h2 className='mb-1 font-semibold'>Notes</h2>
            <p className='whitespace-pre-wrap'>{check.notes}</p>
          </section>
        ) : null}
        <section>
          <table>
            <tbody>
              <tr>
                <th className='w-1/3'>Operator signature</th>
                <td className='h-10' />
              </tr>
            </tbody>
          </table>
        </section>
      </article>
    </div>
  )
}

export default CheckViewPage

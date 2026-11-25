import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import PrintButton from '@/components/common/PrintButton'
import { forkliftRights, loadOperator } from '@/lib/forgeForkliftAccess'
import { operatorStandings } from '@/lib/forgeForkliftOperators'
import type { TruckClass } from '@/lib/forgeForkliftRules'
import { canOperate, formatDate, STANDING_LABELS, TRUCK_CLASS_INFO } from '@/lib/forgeForkliftRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forklift operator card' }

// A CR80 wallet card (3.375 x 2.125 in), front and back, printed at actual size.
const PRINT_CSS = `@page { size: letter; margin: 0.5in; }
@media print {
  body * { visibility: hidden !important; }
  [data-wallet-print], [data-wallet-print] * { visibility: visible !important; }
  [data-wallet-print] { position: absolute; inset: 0 auto auto 0; gap: 0.25in; }
  [data-print-hide] { display: none !important; }
}
[data-wallet-print] .wallet { width: 3.375in; height: 2.125in; box-sizing: border-box; border: 1px solid #374151; border-radius: 0.125in; padding: 0.12in 0.15in;
  background: #fff; color: #111827; font-size: 7.5pt; line-height: 1.25; overflow: hidden; display: flex; flex-direction: column; break-inside: avoid; }
[data-wallet-print] .wallet h2 { font-size: 10pt; font-weight: 700; margin: 0; }
[data-wallet-print] .wallet .label { font-size: 6pt; text-transform: uppercase; color: #4b5563; }
[data-wallet-print] .wallet .void { border: 1px solid #b91c1c; color: #b91c1c; font-weight: 700; text-align: center; padding: 1px; margin-top: 2px; }`

/** Port slice 19: a printable wallet card proving the operator's authorization (1910.178(l)(6) certification). */
const OperatorCardPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)
  const operator = await loadOperator(organizationId, rights, id)

  if (!operator) notFound()

  const { standings } = await operatorStandings(organizationId, [operator])
  const standing = standings.get(operator.id) || 'none'
  const valid = canOperate(standing)

  return (
    <div className='flex flex-col gap-4'>
      <style>{PRINT_CSS}</style>
      <div className='flex flex-wrap items-center gap-3' data-print-hide>
        <Link href={`/forklifts/operators/${operator.id}`} className='text-primary text-sm hover:underline'>
          ← Back to {operator.person.name}
        </Link>
        <PrintButton />
        {!valid ? (
          <span className='text-error text-sm font-semibold' data-card-invalid>
            This authorization is not valid today ({STANDING_LABELS[standing]}). The card prints marked NOT VALID.
          </span>
        ) : null}
      </div>
      <div className='flex flex-wrap gap-4' data-wallet-print>
        <section className='wallet' data-wallet-front>
          <p className='label'>{context.activeOrganization.name}</p>
          <h2>Powered Industrial Truck Operator</h2>
          <p className='mt-1 text-[9pt] font-semibold' data-card-name>
            {operator.person.name}
          </p>
          {operator.person.employeeNumber ? <p data-card-employee>Employee # {operator.person.employeeNumber}</p> : null}
          <p className='mt-1'>
            <span className='label'>Classes </span>
            <span data-card-classes>{operator.truck_classes.join(', ')}</span>
          </p>
          <div className='mt-auto flex justify-between gap-2'>
            <p>
              <span className='label block'>Evaluated</span>
              <span data-card-evaluated>{formatDate(operator.evaluated_on)}</span>
            </p>
            <p className='text-right'>
              <span className='label block'>Expires</span>
              <span className='font-semibold' data-card-expires>
                {formatDate(operator.expires_on)}
              </span>
            </p>
          </div>
          {!valid ? <p className='void'>NOT VALID: {STANDING_LABELS[standing].toUpperCase()}</p> : null}
        </section>
        <section className='wallet' data-wallet-back>
          <p className='label'>Authorized truck classes</p>
          <ul>
            {operator.truck_classes.map(value => (
              <li key={value}>
                {TRUCK_CLASS_INFO[value as TruckClass]?.label || value}: {TRUCK_CLASS_INFO[value as TruckClass]?.description}
              </li>
            ))}
          </ul>
          <p className='mt-1'>
            <span className='label'>Restrictions </span>
            <span data-card-restrictions>{operator.restrictions || 'None'}</span>
          </p>
          <p className='mt-auto'>
            <span className='label'>Evaluator </span>
            <span data-card-evaluator>{operator.evaluator_name}</span>
          </p>
          <p className='label'>Trained and evaluated per OSHA 29 CFR 1910.178(l). Carry while operating.</p>
        </section>
      </div>
    </div>
  )
}

export default OperatorCardPage

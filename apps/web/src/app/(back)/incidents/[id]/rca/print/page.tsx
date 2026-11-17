import type { ReactNode } from 'react'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'

import { incidentWithinScope } from '@/lib/forgeIncidents'
import { RCA_ACTION_STATUS_LABELS, formatRcaDate, rcaFromRow } from '@/lib/forgeIncidentRcaRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import PrintRcaButton from './PrintRcaButton'

export const metadata: Metadata = { title: 'Root Cause Analysis' }

// Port of 1.0's printable RCA (platform-api industrial/rca-print.ts), letter size.
const PRINT_CSS = `@page { size: letter; margin: 0.6in; }
@media print {
  body * { visibility: hidden !important; }
  [data-rca-print], [data-rca-print] * { visibility: visible !important; }
  [data-rca-print] { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; padding: 0; color: #111827; font-size: 10.5pt; }
  [data-print-hide] { display: none !important; }
  [data-rca-print] section { break-inside: avoid; }
  [data-rca-print] h2 { break-after: avoid; }
}
[data-rca-print] table { width: 100%; border-collapse: collapse; }
[data-rca-print] th, [data-rca-print] td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; vertical-align: top; }
[data-rca-print] th { background: #f3f4f6; color: #111827; font-weight: 600; }`

const Heading = ({ children }: { children: ReactNode }) => (
  <h2 className='mb-2 border-b pb-1 text-sm font-bold uppercase tracking-wide'>{children}</h2>
)

const Paragraph = ({ value, empty = 'Not recorded.' }: { value: string; empty?: string }) =>
  value ? <p className='whitespace-pre-wrap'>{value}</p> : <p className='text-textSecondary italic'>{empty}</p>

const List = ({ items, empty }: { items: string[]; empty: string }) =>
  items.length ? (
    <ul className='list-disc ps-5'>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className='text-textSecondary italic'>{empty}</p>
  )

const IncidentRcaPrintPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('incidents.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: incident } = await supabase
    .from('forge_incidents')
    .select('*, locations(name, code), divisions(name, code)')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()

  if (!incident) notFound()

  const mayView = await incidentWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, incident })

  if (!mayView) notFound()

  const { data: row, error } = await supabase
    .from('forge_incident_rca')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('incident_id', id)
    .maybeSingle()

  if (error) throw new Error('Unable to load the root-cause analysis: ' + error.message)

  const rca = rcaFromRow(row, incident)
  const whys = rca.fiveWhys.map((why, index) => ({ n: index + 1, ...why })).filter(why => why.answer)
  const actions = rca.actions.filter(item => item.action)

  const reference: Array<[string, string]> = [
    ['Incident', `${incident.incident_number} · ${incident.summary}`],
    ['Event date', formatRcaDate(rca.eventDate)],
    ['Incident type', String(incident.incident_type || '').replaceAll('_', ' ')],
    ['Location', [incident.locations?.name, incident.divisions?.name].filter(Boolean).join(' · ')],
    ['Incident status', incident.status],
    ['Analysis conducted by', rca.conductedBy],
    ['Analysis date', formatRcaDate(rca.conductedAt)]
  ]

  return (
    <div data-rca-print className='bg-card mx-auto flex w-full max-w-4xl flex-col gap-5 rounded-lg p-6 text-sm'>
      <style>{PRINT_CSS}</style>
      <div data-print-hide className='flex flex-wrap items-center gap-3'>
        <PrintRcaButton />
        <Link className='text-primary underline' href={`/incidents/${incident.id}`}>
          Back to incident
        </Link>
      </div>

      <header className='flex flex-wrap items-end justify-between gap-3 border-b-2 pb-3'>
        <div className='font-semibold'>{context.activeOrganization.name}</div>
        <div className='text-end'>
          <h1 className='text-2xl font-bold'>Root Cause Analysis</h1>
          <div className='text-textSecondary'>5 Why investigation report</div>
        </div>
      </header>

      <dl className='grid grid-cols-[170px_minmax(0,1fr)] gap-x-3 gap-y-1'>
        {reference.map(([label, value]) => (
          <div key={label} className='contents'>
            <dt className='font-semibold'>{label}</dt>
            <dd>{value || '—'}</dd>
          </div>
        ))}
      </dl>

      <section>
        <Heading>Analysis team</Heading>
        <List items={rca.participants} empty='No team members listed.' />
      </section>

      <section className='flex flex-col gap-2'>
        <Heading>Incident review</Heading>
        <h3 className='font-semibold'>Problem statement / incident summary</h3>
        <Paragraph value={rca.problemStatement} />
        <h3 className='font-semibold'>Immediate action taken</h3>
        <Paragraph value={rca.immediateActions} />
        <h3 className='font-semibold'>Contributing factors</h3>
        <List items={rca.contributingFactors} empty='None recorded.' />
      </section>

      <section>
        <Heading>5 Why analysis</Heading>
        {whys.length ? (
          <table>
            <thead>
              <tr>
                <th style={{ width: 56 }}>Why</th>
                <th style={{ width: '38%' }}>Question</th>
                <th>Answer</th>
              </tr>
            </thead>
            <tbody>
              {whys.map(why => (
                <tr key={why.n}>
                  <td>{why.n}</td>
                  <td>{why.question || '—'}</td>
                  <td data-testid='rca-print-why'>{why.answer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className='text-textSecondary italic'>The 5 Why analysis has not been completed.</p>
        )}
      </section>

      <section>
        <Heading>Root cause</Heading>
        <Paragraph value={rca.rootCause} empty='Root cause not yet identified.' />
      </section>

      <section>
        <Heading>Corrective and preventive actions</Heading>
        {actions.length ? (
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Action</th>
                <th style={{ width: '18%' }}>Assigned to</th>
                <th style={{ width: '12%' }}>Due date</th>
                <th style={{ width: '12%' }}>Status</th>
                <th style={{ width: '12%' }}>CAPA</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((item, index) => (
                <tr key={item.key}>
                  <td>{index + 1}</td>
                  <td>{item.action}</td>
                  <td>{item.ownerName || '—'}</td>
                  <td>{formatRcaDate(item.dueDate) || '—'}</td>
                  <td>{RCA_ACTION_STATUS_LABELS[item.status]}</td>
                  <td>{item.capaNumber || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className='text-textSecondary italic'>No corrective actions recorded.</p>
        )}
      </section>

      <div className='mt-6 grid gap-8 md:grid-cols-2 print:grid-cols-2'>
        <div className='flex justify-between border-t pt-1'>
          <span>Conducted by{rca.conductedBy ? `: ${rca.conductedBy}` : ''}</span>
          <span>Date</span>
        </div>
        <div className='flex justify-between border-t pt-1'>
          <span>Reviewed and approved by</span>
          <span>Date</span>
        </div>
      </div>
      <div className='text-textSecondary flex justify-between border-t pt-2 text-xs'>
        <span>
          {context.activeOrganization.name} · {incident.incident_number}
        </span>
        <span>Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>
    </div>
  )
}

export default IncidentRcaPrintPage

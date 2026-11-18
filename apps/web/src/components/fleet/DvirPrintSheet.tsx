import type { DvirItemAnswer, DvirSection } from '@/lib/forgeFleetRules'
import { DVIR_ITEMS, vehicleDisplayName } from '@/lib/forgeFleetRules'

/**
 * Port slice 11 (piece B): the classic paper DVIR (1.0 dvir-print.ts), letter size: header, the three
 * checklists with Yes / No / N/A boxes, remarks, and all three signatures (driver, mechanic, next driver).
 * Rendered inside the app; the print CSS hides the app chrome (same approach as FormPrintSheet).
 */

export const DVIR_PRINT_CSS = `@page { size: letter; margin: 0.4in; }
@media print {
  body * { visibility: hidden !important; }
  [data-dvir-print], [data-dvir-print] * { visibility: visible !important; }
  [data-dvir-print] { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; padding: 0; margin: 0; color: #111827; background: #fff; font-size: 9pt; }
  [data-print-hide] { display: none !important; }
  [data-dvir-print] .dvir-sheet + .dvir-sheet { break-before: page; }
  [data-dvir-print] .dvir-sheet { border: 0 !important; box-shadow: none !important; padding: 0 !important; }
}
[data-dvir-print] .dvir-box { display: inline-block; width: 0.85em; height: 0.85em; border: 1px solid #374151; text-align: center; line-height: 0.85em; font-size: 0.8em; vertical-align: -0.1em; margin-inline-end: 0.3em; }
[data-dvir-print] .dvir-line { border-bottom: 1px solid #6b7280; min-height: 1.4em; }
[data-dvir-print] .dvir-sig { max-height: 60px; max-width: 240px; }`

type Signature = { image?: string; signedAt?: string; signedByName?: string } | null

export type DvirPrintRecord = {
  id: string
  dvir_number: string
  trip_type: string
  inspection_date: string
  odometer: number | null
  trailer_numbers: string | null
  items: DvirItemAnswer[]
  remarks: string | null
  condition_satisfactory: boolean
  status: string
  driver_name: string
  driver_signature: Signature
  mechanic_action: string | null
  mechanic_name: string | null
  mechanic_notes: string | null
  mechanic_signature: Signature
  review_name: string | null
  review_signature: Signature
  vehicle: { vehicle_number: string; unit_number?: string | null; year?: number | null; make?: string | null; model?: string | null; license_plate?: string | null; license_state?: string | null } | null
  locations?: { name?: string | null } | null
}

const Box = ({ checked }: { checked: boolean }) => (
  <span className='dvir-box' aria-hidden='true'>
    {checked ? '✕' : ''}
  </span>
)

const safeImage = (value: unknown) => (typeof value === 'string' && /^data:image\/png;base64,/.test(value) ? value : '')

const day = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString('en-US') : '')

const SECTION_TITLES: Record<DvirSection, string> = { truck: 'Truck / Tractor', safety: 'Emergency equipment', trailer: 'Trailer(s)' }

const Section = ({ section, items }: { section: DvirSection; items: Map<string, DvirItemAnswer> }) => (
  <table className='w-full border-collapse text-[0.95em]'>
    <thead>
      <tr className='border-b border-gray-500'>
        <th className='py-0.5 text-left'>{SECTION_TITLES[section]}</th>
        <th className='w-8 text-center'>OK</th>
        <th className='w-8 text-center'>Def.</th>
        <th className='w-8 text-center'>N/A</th>
      </tr>
    </thead>
    <tbody>
      {DVIR_ITEMS.filter(entry => entry.section === section).map(entry => {
        const answer = items.get(entry.id)

        return (
          <tr key={entry.id} className='border-b border-gray-200 align-top' data-print-item={entry.id} data-answer={answer?.answer || ''}>
            <td className='py-0.5 pr-1'>
              {entry.label}
              {answer?.answer === 'no' && answer.notes ? <div className='text-[0.9em] italic'>{answer.notes}</div> : null}
            </td>
            <td className='text-center'>
              <Box checked={answer?.answer === 'yes'} />
            </td>
            <td className='text-center'>
              <Box checked={answer?.answer === 'no'} />
            </td>
            <td className='text-center'>
              <Box checked={answer?.answer === 'na'} />
            </td>
          </tr>
        )
      })}
    </tbody>
  </table>
)

const SignatureLine = ({ role, signature, name }: { role: string; signature: Signature; name: string | null }) => {
  const image = safeImage(signature?.image)

  return (
    <div className='flex flex-col gap-1' data-testid='print-signature' data-role={role} data-signed={image ? 'true' : 'false'}>
      <div className='flex min-h-[64px] items-end'>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={`${role} signature`} className='dvir-sig' />
        ) : null}
      </div>
      <div className='dvir-line' />
      <div className='flex justify-between gap-2 text-[0.9em]'>
        <span>
          <strong>{role}</strong>
          {name || signature?.signedByName ? `: ${name || signature?.signedByName}` : ''}
        </span>
        <span>Date: {day(signature?.signedAt) || '__________'}</span>
      </div>
    </div>
  )
}

export const DvirPrintSheet = ({ dvir, companyName }: { dvir: DvirPrintRecord; companyName: string }) => {
  const items = new Map((dvir.items || []).map(entry => [entry.id, entry]))
  const vehicle = dvir.vehicle

  return (
    <article className='dvir-sheet bg-backgroundPaper flex flex-col gap-3 rounded-lg border p-6 text-gray-900' data-dvir-sheet={dvir.dvir_number}>
      <header className='flex flex-wrap items-start justify-between gap-2 border-b-2 border-gray-800 pb-2'>
        <div>
          <div className='text-[0.9em] font-semibold uppercase'>{companyName}</div>
          <h2 className='text-xl font-extrabold uppercase tracking-wide'>Driver&apos;s Vehicle Inspection Report</h2>
          <div className='text-[0.85em]'>Check any defective item and give details under the item. 49 CFR 396.11 / 396.13.</div>
        </div>
        <div className='text-right text-[0.9em]'>
          <div className='font-bold'>{dvir.dvir_number}</div>
          <div>
            <Box checked={dvir.trip_type === 'pre_trip'} />
            Pre-trip <Box checked={dvir.trip_type === 'post_trip'} />
            Post-trip
          </div>
        </div>
      </header>

      <div className='grid grid-cols-2 gap-x-6 gap-y-1 text-[0.95em] md:grid-cols-4'>
        <div>
          <strong>Date:</strong> {dvir.inspection_date}
        </div>
        <div>
          <strong>Truck / tractor no.:</strong> {vehicle ? vehicle.unit_number || vehicle.vehicle_number : ''}
        </div>
        <div>
          <strong>Odometer:</strong> {dvir.odometer != null ? dvir.odometer.toLocaleString() : ''}
        </div>
        <div>
          <strong>Trailer no(s).:</strong> {dvir.trailer_numbers || ''}
        </div>
        <div className='col-span-2'>
          <strong>Vehicle:</strong> {vehicle ? vehicleDisplayName(vehicle) : ''}
          {vehicle?.license_plate ? ` · ${vehicle.license_plate}${vehicle.license_state ? ` (${vehicle.license_state})` : ''}` : ''}
        </div>
        <div className='col-span-2'>
          <strong>Location:</strong> {dvir.locations?.name || ''}
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-3 print:grid-cols-3'>
        <Section section='truck' items={items} />
        <div className='flex flex-col gap-3'>
          <Section section='safety' items={items} />
          <div>
            <strong>Remarks:</strong>
            <p className='min-h-[3em] whitespace-pre-wrap border-b border-gray-500'>{dvir.remarks || ''}</p>
          </div>
        </div>
        <Section section='trailer' items={items} />
      </div>

      <div className='flex flex-col gap-3 border-t-2 border-gray-800 pt-2'>
        <div>
          <Box checked={dvir.condition_satisfactory} />
          Condition of the above vehicle is satisfactory
        </div>
        <SignatureLine role='Driver' signature={dvir.driver_signature} name={dvir.driver_name} />
        <div className='flex flex-wrap gap-x-6'>
          <span>
            <Box checked={dvir.mechanic_action === 'corrected'} />
            Above defects corrected
          </span>
          <span>
            <Box checked={dvir.mechanic_action === 'not_needed'} />
            Above defects need not be corrected for safe operation of vehicle
          </span>
        </div>
        {dvir.mechanic_notes ? <div className='text-[0.9em]'>Mechanic notes: {dvir.mechanic_notes}</div> : null}
        <SignatureLine role='Mechanic' signature={dvir.mechanic_signature} name={dvir.mechanic_name} />
        <SignatureLine role='Driver review' signature={dvir.review_signature} name={dvir.review_name} />
      </div>
    </article>
  )
}

import type { DvirAnswer, DvirItemAnswer, DvirSection } from '@/lib/forgeFleetRules'
import { DVIR_ITEMS, DVIR_SECTION_LABELS } from '@/lib/forgeFleetRules'
import type { MechanicAction } from '@/lib/forgeFleetDvirRules'
import { DVIR_ANSWER_LABELS, MECHANIC_ACTION_LABELS } from '@/lib/forgeFleetDvirRules'

type Signature = { image?: string; signedAt?: string; signedByName?: string } | null

const SECTIONS: DvirSection[] = ['truck', 'safety', 'trailer']

const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '')

const safeImage = (value: unknown) => (typeof value === 'string' && /^data:image\/png;base64,/.test(value) ? value : '')

const answerClass = (answer: DvirAnswer | undefined) =>
  answer === 'no' ? 'font-bold text-red-700 dark:text-red-400' : answer === 'yes' ? 'text-green-700 dark:text-green-400' : 'text-textSecondary'

/** Port slice 11 (piece B): read-only checklist of a submitted DVIR (1.0 dvir-readonly-view.tsx). */
export const DvirChecklistView = ({ items }: { items: DvirItemAnswer[] }) => {
  const byId = new Map(items.map(entry => [entry.id, entry]))

  return (
    <div className='grid gap-4 lg:grid-cols-3' data-testid='dvir-checklist-view'>
      {SECTIONS.map(section => (
        <div key={section} className='flex flex-col gap-1'>
          <h3 className='text-textPrimary font-semibold'>{DVIR_SECTION_LABELS[section]}</h3>
          <ul className='divide-y rounded-md border text-sm'>
            {DVIR_ITEMS.filter(entry => entry.section === section).map(entry => {
              const answer = byId.get(entry.id)

              return (
                <li key={entry.id} className={'flex flex-col px-3 py-1.5 ' + (answer?.answer === 'no' ? 'bg-red-50 dark:bg-red-950/30' : '')} data-dvir-view-item={entry.id} data-answer={answer?.answer || ''}>
                  <div className='flex justify-between gap-3'>
                    <span>{entry.label}</span>
                    <span className={answerClass(answer?.answer)}>{answer ? DVIR_ANSWER_LABELS[answer.answer] : '—'}</span>
                  </div>
                  {answer?.notes ? <span className='text-textSecondary text-xs'>{answer.notes}</span> : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

const SignatureEntry = ({ testId, role, signature, name, detail }: { testId: string; role: string; signature: Signature; name: string | null; detail?: string | null }) => {
  const image = safeImage(signature?.image)

  return (
    <li className='flex flex-col gap-1 rounded-md border p-3' data-testid={testId} data-signed={signature ? 'true' : 'false'}>
      <div className='text-textSecondary text-xs font-semibold uppercase tracking-wide'>{role}</div>
      {signature ? (
        <>
          <div className='font-medium'>{name || signature.signedByName}</div>
          <div className='text-textSecondary text-xs'>Signed {when(signature.signedAt)}</div>
          {detail ? <div className='text-sm'>{detail}</div> : null}
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={`${role} signature`} className='mt-1 h-16 w-auto self-start rounded border bg-white p-1' />
          ) : null}
        </>
      ) : (
        <div className='text-textSecondary text-sm'>Not signed yet.</div>
      )}
    </li>
  )
}

/** Who signed what, in order: driver, mechanic, next driver. */
export const DvirSignatureHistory = ({
  dvir
}: {
  dvir: {
    driver_name: string
    driver_signature: Signature
    submitted_via: string
    qr?: { qr_number?: string | null } | null
    mechanic_name: string | null
    mechanic_action: string | null
    mechanic_notes: string | null
    mechanic_signature: Signature
    review_name: string | null
    review_signature: Signature
  }
}) => (
  <ul className='grid gap-3 md:grid-cols-3' data-testid='dvir-signatures'>
    <SignatureEntry
      testId='dvir-sig-driver'
      role='Driver'
      signature={dvir.driver_signature}
      name={dvir.driver_name}
      detail={dvir.submitted_via === 'scan' ? `Submitted from a QR scan${dvir.qr?.qr_number ? ` (${dvir.qr.qr_number})` : ''}.` : dvir.submitted_via === 'import' ? 'Imported.' : 'Submitted in the office.'}
    />
    <SignatureEntry
      testId='dvir-sig-mechanic'
      role='Mechanic'
      signature={dvir.mechanic_signature}
      name={dvir.mechanic_name}
      detail={[dvir.mechanic_action ? MECHANIC_ACTION_LABELS[dvir.mechanic_action as MechanicAction] : null, dvir.mechanic_notes].filter(Boolean).join(' — ') || null}
    />
    <SignatureEntry testId='dvir-sig-review' role='Next driver review' signature={dvir.review_signature} name={dvir.review_name} />
  </ul>
)

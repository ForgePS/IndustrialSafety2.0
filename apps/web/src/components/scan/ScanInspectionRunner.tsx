'use client'

import { useMemo, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@repo/ui/components/ui/button'

import { completeScanInspection, saveScanInspectionAnswer } from '@/app/scan/[token]/inspect/actions'
import type { ScanAnswer } from '@/lib/forgeScanInspectionRules'
import { SCAN_CHOICE_OPTIONS, answerNeedsNotes, validateScanAnswers } from '@/lib/forgeScanInspectionRules'

type RunnerItem = {
  id: string
  item_key: string
  section_label: string
  prompt: string
  guidance: string | null
  response_type: string
  is_required: boolean
  finding_on: string[]
  response_value: string | null
  notes: string | null
}

const choiceClass = (selected: boolean, value: string) => {
  if (!selected) return 'border bg-backgroundPaper text-textPrimary'
  if (value === 'fail' || value === 'no') return 'border-red-600 bg-red-600 text-white'
  if (value === 'na') return 'border-slate-600 bg-slate-600 text-white'

  return 'border-green-700 bg-green-700 text-white'
}

/**
 * Port slice 10: the mobile checklist for an employee's scan inspection (1.0 scan-inspection-runner). Each
 * answer is saved as it is given; an answer that raises a finding needs a note; Finish re-checks everything on
 * the server.
 */
const ScanInspectionRunner = ({
  token,
  frequency,
  resumed,
  inspection,
  outOfServiceOnFailure
}: {
  token: string
  frequency: string
  resumed: boolean
  inspection: { id: string; number: string; templateName: string | null; items: RunnerItem[] }
  outOfServiceOnFailure: boolean
}) => {
  const router = useRouter()

  const [answers, setAnswers] = useState<Record<string, ScanAnswer>>(() =>
    Object.fromEntries(inspection.items.map(item => [item.id, { value: item.response_value, notes: item.notes }]))
  )

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
  const [completing, startCompleting] = useTransition()

  const answered = useMemo(() => inspection.items.filter(item => answers[item.id]?.value).length, [answers, inspection.items])

  const save = async (itemId: string, answer: ScanAnswer) => {
    setSaving(current => ({ ...current, [itemId]: 'saving' }))

    const response = await saveScanInspectionAnswer(token, { inspectionId: inspection.id, itemId, value: answer.value, notes: answer.notes })

    setSaving(current => ({ ...current, [itemId]: 'error' in response ? 'error' : 'saved' }))
    if ('error' in response) setMessage(response.error)
  }

  const update = (itemId: string, patch: Partial<ScanAnswer>, persist: boolean) => {
    const next = { ...(answers[itemId] || { value: null, notes: null }), ...patch }

    setAnswers(current => ({ ...current, [itemId]: next }))
    setErrors(current => {
      if (!current[itemId]) return current

      const rest = { ...current }

      delete rest[itemId]

      return rest
    })
    if (persist) void save(itemId, next)
  }

  const finish = () => {
    setMessage(null)

    const found = validateScanAnswers(inspection.items, answers)

    if (Object.keys(found).length) {
      setErrors(found)
      setMessage(`${Object.keys(found).length} item(s) need attention before you can finish.`)
      document.querySelector(`[data-scan-item-id="${Object.keys(found)[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

      return
    }

    startCompleting(async () => {
      const response = await completeScanInspection(token, { inspectionId: inspection.id, answers })

      if ('error' in response) {
        setErrors(response.itemErrors || {})
        setMessage(response.error)

        return
      }

      router.replace(`/scan/${token}/inspect/${frequency}?result=${response.inspectionId}`)
      router.refresh()
    })
  }

  let lastSection = ''

  return (
    <section className='flex flex-col gap-4' data-testid='scan-inspection-runner' data-inspection-id={inspection.id}>
      <div className='text-textSecondary text-sm'>
        <p>
          <span className='text-textPrimary font-semibold'>{inspection.templateName || 'Checklist'}</span> · {inspection.number}
        </p>
        <p>
          {answered} of {inspection.items.length} answered.{resumed ? ' Picking up where you left off.' : ''}
        </p>
      </div>

      {inspection.items.map(item => {
        const answer = answers[item.id] || { value: null, notes: null }
        const needsNotes = answerNeedsNotes(item, answer.value)
        const choices = SCAN_CHOICE_OPTIONS[item.response_type as 'pass_fail_na' | 'yes_no_na']
        const showSection = item.section_label && item.section_label !== lastSection

        lastSection = item.section_label

        return (
          <div key={item.id} className='flex flex-col gap-2'>
            {showSection ? <h3 className='text-textSecondary text-xs font-bold uppercase tracking-wide'>{item.section_label}</h3> : null}
            <div
              className={'bg-backgroundPaper rounded-lg border p-4 ' + (errors[item.id] ? 'border-red-500' : '')}
              data-scan-item={item.item_key}
              data-scan-item-id={item.id}
            >
              <p className='text-textPrimary font-semibold'>
                {item.prompt}
                {item.is_required ? <span className='text-red-600'> *</span> : null}
              </p>
              {item.guidance ? <p className='text-textSecondary mt-1 text-sm'>{item.guidance}</p> : null}

              {choices ? (
                <div className='mt-3 grid grid-cols-3 gap-2' role='group' aria-label={item.prompt}>
                  {choices.map(option => {
                    const selected = answer.value === option.value

                    return (
                      <button
                        key={option.value}
                        type='button'
                        aria-pressed={selected}
                        data-answer={option.value}
                        disabled={completing}
                        className={'min-h-12 rounded-lg px-2 py-3 text-base font-bold ' + choiceClass(selected, option.value)}
                        onClick={() => update(item.id, { value: option.value }, true)}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              ) : item.response_type === 'number' ? (
                <input
                  type='text'
                  inputMode='decimal'
                  aria-label={item.prompt}
                  data-scan-input={item.item_key}
                  className='bg-background text-textPrimary mt-3 w-full rounded-lg border px-3 py-3 text-base'
                  value={answer.value || ''}
                  disabled={completing}
                  onChange={event => update(item.id, { value: event.target.value }, false)}
                  onBlur={() => void save(item.id, answers[item.id] || answer)}
                />
              ) : (
                <textarea
                  aria-label={item.prompt}
                  data-scan-input={item.item_key}
                  rows={2}
                  maxLength={2000}
                  className='bg-background text-textPrimary mt-3 w-full rounded-lg border px-3 py-2 text-base'
                  value={answer.value || ''}
                  disabled={completing}
                  onChange={event => update(item.id, { value: event.target.value }, false)}
                  onBlur={() => void save(item.id, answers[item.id] || answer)}
                />
              )}

              {needsNotes || answer.notes ? (
                <label className='mt-3 flex flex-col gap-1 text-sm'>
                  <span className={needsNotes ? 'font-semibold text-red-700' : 'text-textSecondary'}>
                    {needsNotes ? 'What is wrong? (required)' : 'Notes'}
                  </span>
                  <textarea
                    data-scan-notes={item.item_key}
                    rows={3}
                    maxLength={2000}
                    placeholder='Describe the problem'
                    className='bg-background text-textPrimary w-full rounded-lg border px-3 py-2 text-base'
                    value={answer.notes || ''}
                    disabled={completing}
                    onChange={event => update(item.id, { notes: event.target.value }, false)}
                    onBlur={() => void save(item.id, answers[item.id] || answer)}
                  />
                </label>
              ) : null}

              {errors[item.id] ? (
                <p className='mt-2 text-sm font-semibold text-red-700' data-scan-item-error={item.item_key}>
                  {errors[item.id]}
                </p>
              ) : saving[item.id] === 'error' ? (
                <p className='mt-2 text-sm text-red-700'>Not saved. Check your connection.</p>
              ) : null}
            </div>
          </div>
        )
      })}

      {outOfServiceOnFailure ? (
        <p className='text-textSecondary text-sm'>If a problem is found, this equipment will be taken out of service when you finish.</p>
      ) : null}

      {message ? (
        <p className='rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800' role='alert' data-testid='scan-inspection-error'>
          {message}
        </p>
      ) : null}

      <Button type='button' size='lg' className='w-full' disabled={completing} onClick={finish} data-testid='scan-inspection-complete'>
        {completing ? 'Finishing…' : 'Finish inspection'}
      </Button>
    </section>
  )
}

export default ScanInspectionRunner

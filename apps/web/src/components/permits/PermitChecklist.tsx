'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { savePermitChecklist } from '@/app/(back)/permits/workflowActions'

type Item = { check_key: string; label: string; required: boolean; allow_na: boolean }

type Answer = { check_key: string; answer: 'yes' | 'no' | 'na'; note: string | null }

type Draft = Record<string, { answer: '' | 'yes' | 'no' | 'na'; note: string }>

const ANSWER_LABELS = { yes: 'Yes', no: 'No', na: 'N/A' } as const

/** Port slice 18: the permit's pre-issue checklist. Required items must be yes (or N/A with a note where allowed). */
const PermitChecklist = ({ permitId, items, answers, canEdit }: { permitId: string; items: Item[]; answers: Answer[]; canEdit: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const initial = (): Draft =>
    Object.fromEntries(
      items.map(item => {
        const answer = answers.find(row => row.check_key === item.check_key)

        return [item.check_key, { answer: answer?.answer || '', note: answer?.note || '' }]
      })
    )

  const [draft, setDraft] = useState<Draft>(initial)
  const set = (key: string, patch: Partial<Draft[string]>) => setDraft(current => ({ ...current, [key]: { ...current[key], ...patch } }))
  const answered = items.filter(item => draft[item.check_key]?.answer).length
  const notReady = items.filter(item => draft[item.check_key]?.answer === 'no').length

  const save = () =>
    startTransition(async () => {
      const result = await savePermitChecklist(
        permitId,
        items.map(item => ({ check_key: item.check_key, answer: draft[item.check_key]?.answer || null, note: draft[item.check_key]?.note || null }))
      )

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Saved.')
      router.refresh()
    })

  if (!items.length) return <p className='text-muted-foreground text-sm'>No checklist items for this kind of permit.</p>

  return (
    <div className='flex flex-col gap-3' data-permit-checklist>
      <p className='text-muted-foreground text-sm'>
        {answered} of {items.length} answered{notReady ? `, ${notReady} not ready` : ''}.
      </p>
      <ul className='flex flex-col divide-y rounded-md border'>
        {items.map(item => {
          const value = draft[item.check_key] || { answer: '', note: '' }
          const choices = (item.allow_na ? (['yes', 'no', 'na'] as const) : (['yes', 'no'] as const)).slice()

          return (
            <li key={item.check_key} className='flex flex-col gap-2 p-3' data-check={item.check_key}>
              <div className='flex flex-wrap items-start justify-between gap-2'>
                <span className='text-sm'>
                  {item.label}
                  {item.required ? '' : <span className='text-muted-foreground'> (optional)</span>}
                </span>
                {canEdit ? (
                  <span className='flex gap-3 text-sm' role='radiogroup' aria-label={item.label}>
                    {choices.map(choice => (
                      <label key={choice} className='flex items-center gap-1'>
                        <input
                          type='radio'
                          name={`check-${item.check_key}`}
                          value={choice}
                          checked={value.answer === choice}
                          onChange={() => set(item.check_key, { answer: choice })}
                        />
                        {ANSWER_LABELS[choice]}
                      </label>
                    ))}
                  </span>
                ) : (
                  <span className={'text-sm font-medium ' + (value.answer === 'no' ? 'text-destructive' : '')}>{value.answer ? ANSWER_LABELS[value.answer] : 'Not answered'}</span>
                )}
              </div>
              {canEdit && (value.answer === 'na' || value.answer === 'no' || value.note) ? (
                <input
                  type='text'
                  name={`note-${item.check_key}`}
                  maxLength={1000}
                  placeholder={value.answer === 'na' ? 'Why it does not apply (needed)' : 'Note'}
                  value={value.note}
                  onChange={event => set(item.check_key, { note: event.target.value })}
                  className='bg-background rounded-md border px-3 py-1.5 text-sm'
                />
              ) : !canEdit && value.note ? (
                <span className='text-muted-foreground text-sm'>{value.note}</span>
              ) : null}
            </li>
          )
        })}
      </ul>
      {canEdit ? (
        <div>
          <Button type='button' disabled={pending} onClick={save} data-save-checklist>
            {pending ? 'Saving...' : 'Save checklist'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default PermitChecklist

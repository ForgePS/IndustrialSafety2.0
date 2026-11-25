'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { toast } from '@repo/ui/utils/toast'

import { operatorProblemForCheck, recordCheck } from '@/app/(back)/forklifts/actions'
import type { CheckAnswerValue, CheckItem } from '@/lib/forgeForkliftRules'
import { checkAnswersProblem, checkOutcome, SECTION_LABELS } from '@/lib/forgeForkliftRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Answer = { answer: CheckAnswerValue | ''; note: string }

const CHOICES: { value: CheckAnswerValue; label: string }[] = [
  { value: 'ok', label: 'OK' },
  { value: 'defect', label: 'Defect' },
  { value: 'na', label: 'N/A' }
]

/**
 * Port slice 19: the pre-shift check. Items grouped by section, each OK / Defect / N/A (N/A only where the item
 * allows it); a defect needs a note. The operator is the signed-in person unless they manage forklifts here.
 */
const CheckForm = ({
  forkliftId,
  items,
  canPick,
  own,
  operators,
  initialProblem,
  criticalOutOfService,
  lastHours
}: {
  forkliftId: string
  items: CheckItem[]
  canPick: boolean
  own: { id: string; name: string } | null
  operators: { id: string; name: string }[]
  initialProblem: string | null
  criticalOutOfService: boolean
  lastHours: number | null
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [operatorId, setOperatorId] = useState(own?.id || '')
  const [problem, setProblem] = useState<string | null>(initialProblem)
  const [checking, setChecking] = useState(false)
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(items.map(item => [item.id, { answer: '', note: '' }])))
  const [hourMeter, setHourMeter] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = items.map(item => ({ item_id: item.id, answer: answers[item.id]?.answer || null, note: answers[item.id]?.note || '' }))
  const outcome = checkOutcome(items, list, criticalOutOfService)
  const sections = ['visual', 'operational'].filter(section => items.some(item => item.section === section))

  const setAnswer = (itemId: string, patch: Partial<Answer>) => setAnswers(current => ({ ...current, [itemId]: { ...current[itemId], ...patch } }))

  const pickOperator = (id: string) => {
    setOperatorId(id)
    setProblem(null)
    if (!id) return
    setChecking(true)
    operatorProblemForCheck(forkliftId, id)
      .then(result => setProblem(result.error || result.problem || null))
      .finally(() => setChecking(false))
  }

  const blocked = !operatorId || Boolean(problem) || checking

  return (
    <form
      className='flex flex-col gap-4'
      data-check-form
      onSubmit={event => {
        event.preventDefault()
        const found = checkAnswersProblem(items, list)

        setError(found)
        if (found) return void toast('error', found)
        startTransition(async () => {
          const result = await recordCheck(forkliftId, { operatorPersonnelId: operatorId, hourMeter, answers: list, notes })

          if (result.error) {
            setError(result.error)

            return void toast('error', result.error)
          }

          toast(result.result === 'pass' ? 'success' : 'error', result.message || 'Check recorded.')
          router.push('/forklifts/checks/' + result.id)
        })
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Operator</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          {canPick ? (
            <label className='flex max-w-md flex-col gap-1 text-sm font-medium'>
              Who is doing the check
              <select name='operator' value={operatorId} onChange={event => pickOperator(event.target.value)} className={field}>
                <option value=''>Pick the operator</option>
                {operators.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.id === own?.id ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className='text-sm' data-check-operator>
              {own ? own.name : 'Your login is not linked to a personnel record, so you cannot do a pre-shift check.'}
            </p>
          )}
          {problem ? (
            <p className='border-error text-error rounded-md border p-3 text-sm font-semibold' data-operator-problem>
              {problem} Do not operate this forklift.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <fieldset disabled={pending || blocked} className='flex flex-col gap-4'>
        {sections.map(section => (
          <Card key={section} data-check-section={section}>
            <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-2'>
              <CardTitle>{SECTION_LABELS[section]}</CardTitle>
              <Button
                type='button'
                size='sm'
                variant='outline'
                data-all-ok={section}
                onClick={() => setAnswers(current => ({ ...current, ...Object.fromEntries(items.filter(item => item.section === section).map(item => [item.id, { ...current[item.id], answer: 'ok' as const }])) }))}
              >
                All OK
              </Button>
            </CardHeader>
            <CardContent>
              <ul className='flex flex-col divide-y'>
                {items
                  .filter(item => item.section === section)
                  .map(item => {
                    const value = answers[item.id]

                    return (
                      <li key={item.id} className='flex flex-col gap-2 py-3' data-check-item={item.label}>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <span className='text-sm'>
                            {item.label}
                            {item.critical ? <span className='text-error ml-1 text-xs font-semibold'>critical</span> : null}
                          </span>
                          <span className='flex gap-3 text-sm'>
                            {CHOICES.filter(choice => choice.value !== 'na' || item.allow_na).map(choice => (
                              <label key={choice.value} className='flex items-center gap-1'>
                                <input
                                  type='radio'
                                  name={'answer-' + item.id}
                                  value={choice.value}
                                  checked={value?.answer === choice.value}
                                  onChange={() => setAnswer(item.id, { answer: choice.value })}
                                />
                                {choice.label}
                              </label>
                            ))}
                          </span>
                        </div>
                        {value?.answer === 'defect' ? (
                          <input
                            name={'note-' + item.id}
                            aria-label={'Describe the defect: ' + item.label}
                            placeholder='Describe the defect'
                            maxLength={1000}
                            value={value.note}
                            onChange={event => setAnswer(item.id, { note: event.target.value })}
                            className={field}
                          />
                        ) : null}
                      </li>
                    )
                  })}
              </ul>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardContent className='flex flex-col gap-4 pt-6'>
            <label className='flex max-w-xs flex-col gap-1 text-sm font-medium'>
              Hour meter
              <input name='hourMeter' type='number' min={lastHours ?? 0} step={0.1} value={hourMeter} onChange={event => setHourMeter(event.target.value)} className={field} />
              {lastHours !== null ? <span className='text-textSecondary text-xs font-normal'>Last reading {lastHours.toLocaleString('en-US')} hours</span> : null}
            </label>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Notes
              <textarea name='notes' rows={3} maxLength={4000} value={notes} onChange={event => setNotes(event.target.value)} className={field} />
            </label>
            {outcome.defects ? (
              <p className={'text-sm font-semibold ' + (outcome.outOfService ? 'text-error' : 'text-warning')} data-check-preview>
                {outcome.outOfService
                  ? `${outcome.criticalDefects} critical defect${outcome.criticalDefects === 1 ? '' : 's'}: the forklift will be taken out of service.`
                  : `${outcome.defects} defect${outcome.defects === 1 ? '' : 's'} will be reported. The forklift stays in service.`}
              </p>
            ) : null}
            {error ? (
              <p className='text-error text-sm' data-check-error>
                {error}
              </p>
            ) : null}
            <div>
              <Button type='submit'>{pending ? 'Saving...' : 'Submit check'}</Button>
            </div>
          </CardContent>
        </Card>
      </fieldset>
    </form>
  )
}

export default CheckForm

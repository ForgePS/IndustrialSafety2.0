'use client'

import { useMemo, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { authorizeOperator } from '@/app/(back)/forklifts/operators/actions'
import type { ForkliftSettings } from '@/lib/forgeForkliftRules'
import { addMonths, authorizationProblems, formatDate, TRUCK_CLASS_INFO, TRUCK_CLASSES } from '@/lib/forgeForkliftRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

export type AuthorizePerson = { id: string; name: string; employeeNumber: string | null; operatorId: string | null; trained: boolean | null }

export type AuthorizeValues = {
  personnelId: string
  truckClasses: string[]
  trainingCompletedOn: string
  evaluatedOn: string
  evaluatorPersonnelId: string
  evaluatorName: string
  evaluationNotes: string
  restrictions: string
}

/**
 * Port slice 19: authorize an operator, or record a new evaluation (person fixed). Shows the expiry the evaluation
 * gives and, when the company requires a course, whether the person has it. The same rules run again on the server
 * and in the database.
 */
const AuthorizeOperatorForm = ({
  people,
  evaluators,
  initial,
  settings,
  today,
  courseTitle,
  fixedPerson
}: {
  people: AuthorizePerson[]
  evaluators: { id: string; name: string }[]
  initial: AuthorizeValues
  settings: ForkliftSettings
  today: string
  courseTitle: string | null
  fixedPerson?: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<AuthorizeValues>(initial)
  const [tried, setTried] = useState(false)
  const set = (key: keyof AuthorizeValues) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  const person = people.find(item => item.id === values.personnelId) || null
  const alreadyOperator = !fixedPerson && person?.operatorId ? person.operatorId : null
  const evaluatorName = values.evaluatorPersonnelId ? evaluators.find(item => item.id === values.evaluatorPersonnelId)?.name || '' : values.evaluatorName

  const problems = useMemo(
    () =>
      authorizationProblems(
        {
          personnel_id: values.personnelId,
          truck_classes: values.truckClasses,
          training_completed_on: values.trainingCompletedOn,
          evaluated_on: values.evaluatedOn,
          evaluator_name: evaluatorName,
          evaluator_personnel_id: values.evaluatorPersonnelId || null
        },
        settings,
        today
      ),
    [values, evaluatorName, settings, today]
  )

  const expires = values.evaluatedOn ? addMonths(values.evaluatedOn, settings.evaluation_months) : null

  const toggleClass = (value: string, on: boolean) =>
    setValues(current => ({ ...current, truckClasses: on ? [...new Set([...current.truckClasses, value])] : current.truckClasses.filter(item => item !== value) }))

  return (
    <form
      className='flex max-w-3xl flex-col gap-6'
      data-authorize-form
      noValidate
      onSubmit={event => {
        event.preventDefault()
        setTried(true)
        if (alreadyOperator) return void toast('error', 'This person is already an operator. Record a new evaluation on their page.')
        if (problems.length) return void toast('error', problems[0])
        startTransition(async () => {
          const result = await authorizeOperator({ ...values, evaluatorName })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.push(`/forklifts/operators/${result.id}`)
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <legend className='mb-2 text-lg font-semibold'>Operator</legend>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Person
          <select name='personnelId' value={values.personnelId} onChange={set('personnelId')} className={field} disabled={fixedPerson}>
            <option value=''>Choose a person</option>
            {people.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.employeeNumber ? ` (${item.employeeNumber})` : ''}
                {item.operatorId && !fixedPerson ? ' · already an operator' : ''}
              </option>
            ))}
          </select>
        </label>
        {alreadyOperator ? (
          <p className='border-warning text-warning rounded-md border p-3 text-sm' data-already-operator>
            {person?.name} is already an operator.{' '}
            <Link href={`/forklifts/operators/${alreadyOperator}`} className='text-primary font-medium hover:underline'>
              Open their authorization
            </Link>{' '}
            to record a new evaluation.
          </p>
        ) : null}
        {courseTitle && person ? (
          <p className={'text-sm ' + (person.trained ? 'text-textSecondary' : 'text-error font-semibold')} data-training-status={person.trained ? 'current' : 'missing'}>
            {person.trained
              ? `${person.name} has current ${courseTitle} training.`
              : `${person.name} has no current ${courseTitle} training. The company requires it, so the authorization will be refused until it is recorded.`}
          </p>
        ) : null}
      </fieldset>

      <fieldset disabled={pending} className='flex flex-col gap-2' data-truck-classes>
        <legend className='mb-2 text-lg font-semibold'>Truck classes</legend>
        <p className='text-textSecondary text-sm'>Authorize only the classes the person was trained and evaluated on (1910.178(l)(3)).</p>
        {TRUCK_CLASSES.map(value => (
          <label key={value} className='flex items-start gap-2 text-sm'>
            <input type='checkbox' name='truckClasses' value={value} checked={values.truckClasses.includes(value)} onChange={event => toggleClass(value, event.target.checked)} className='mt-1' />
            <span>
              <span className='font-medium'>{TRUCK_CLASS_INFO[value].label}</span>
              <span className='text-textSecondary'> · {TRUCK_CLASS_INFO[value].description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <legend className='mb-2 text-lg font-semibold'>Training and evaluation</legend>
        <div className='grid gap-4 md:grid-cols-2'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Training completed on
            <input type='date' name='trainingCompletedOn' max={today} value={values.trainingCompletedOn} onChange={set('trainingCompletedOn')} className={field} />
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Evaluated on
            <input type='date' name='evaluatedOn' max={today} value={values.evaluatedOn} onChange={set('evaluatedOn')} className={field} />
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Evaluator
            <select name='evaluatorPersonnelId' value={values.evaluatorPersonnelId} onChange={set('evaluatorPersonnelId')} className={field}>
              <option value=''>Someone else (type the name)</option>
              {evaluators.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {values.evaluatorPersonnelId ? null : (
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Evaluator name
              <input name='evaluatorName' maxLength={200} value={values.evaluatorName} onChange={set('evaluatorName')} placeholder='Name and company of the evaluator' className={field} />
            </label>
          )}
        </div>
        <p className='text-sm' data-computed-expiry={expires || ''}>
          {expires ? (
            <>
              Authorization expires on <span className='font-semibold'>{formatDate(expires)}</span> ({settings.evaluation_months} months after the evaluation).
            </>
          ) : (
            <span className='text-textSecondary'>Enter the evaluation date to see when the authorization expires.</span>
          )}
        </p>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Evaluation notes
          <textarea name='evaluationNotes' rows={3} maxLength={4000} value={values.evaluationNotes} onChange={set('evaluationNotes')} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Restrictions
          <textarea
            name='restrictions'
            rows={2}
            maxLength={1000}
            value={values.restrictions}
            onChange={set('restrictions')}
            placeholder='For example: no attachments, warehouse only'
            className={field}
          />
        </label>
      </fieldset>

      {tried && problems.length ? (
        <ul className='border-error text-error list-disc rounded-md border p-3 pl-8 text-sm' data-authorize-problems>
          {problems.map(problem => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      <div className='flex gap-2'>
        <Button type='submit' disabled={pending} data-authorize-submit>
          {pending ? 'Saving...' : fixedPerson ? 'Record evaluation' : 'Authorize'}
        </Button>
        <Button type='button' variant='outline' disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default AuthorizeOperatorForm

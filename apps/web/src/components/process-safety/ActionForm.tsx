'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { addAction } from '@/app/(back)/process-safety/actions'
import { ACTION_PHASES } from '@/lib/forgeProcessSafetyRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

/** Port slice 16: add an MOC action or a PHA recommendation; each one opens a Corrective Action. */
const ActionForm = ({
  kind,
  parentId,
  personnel,
  phases = ACTION_PHASES.map(item => item.key)
}: {
  kind: 'moc' | 'pha'
  parentId: string
  personnel: { id: string; name: string }[]
  phases?: string[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const empty = { title: '', description: '', ownerPersonnelId: '', dueOn: '', phase: phases.length === 1 ? phases[0] : '' }
  const [values, setValues] = useState<Record<string, string>>(empty)
  const set = (key: string) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  return (
    <form
      className='flex flex-col gap-3 border-t pt-4'
      data-psm-action-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await addAction(kind, parentId, values)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Added.')
          setValues(empty)
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-3'>
        <p className='text-sm font-medium'>{kind === 'moc' ? 'Add an action' : 'Add a recommendation'}</p>
        <input name='title' aria-label='What needs to be done' placeholder='What needs to be done' required maxLength={200} value={values.title} onChange={set('title')} className={field} />
        <textarea name='description' aria-label='Details' placeholder='Details (optional)' rows={2} maxLength={5000} value={values.description} onChange={set('description')} className={field} />
        <div className='grid gap-3 md:grid-cols-3'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Owner
            <select name='ownerPersonnelId' required value={values.ownerPersonnelId} onChange={set('ownerPersonnelId')} className={field}>
              <option value=''>Pick one</option>
              {personnel.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Due
            <input type='date' name='dueOn' required value={values.dueOn} onChange={set('dueOn')} className={field} />
          </label>
          {kind === 'moc' ? (
            <label className='flex flex-col gap-1 text-sm font-medium'>
              When
              <select name='phase' required value={values.phase} onChange={set('phase')} className={field}>
                <option value=''>Pick one</option>
                {ACTION_PHASES.filter(item => phases.includes(item.key)).map(item => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div>
          <Button type='submit' size='sm'>
            {pending ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export default ActionForm

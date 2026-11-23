'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { addChecklistItem, addTrainingRequirement, archiveChecklistItem, removeTrainingRequirement, savePermitSettings } from '@/app/(back)/permits/actions'
import { SETTINGS_FIELDS } from '@/components/permits/settingsFields'
import type { PermitType } from '@/lib/forgePermitRules'
import { PERMIT_ROLE_LABELS, PERMIT_ROLES, PERMIT_TYPE_INFO, PERMIT_TYPES } from '@/lib/forgePermitRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Result = { error?: string; message?: string }

const useRun = () => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (work: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const result = await work()

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Saved.')
      after?.()
      router.refresh()
    })

  return { pending, run }
}

/** Port slice 18: company limits for permits (time, gas, fire watch) and approval rules. */
export const PermitSettingsForm = ({ initial, canEdit }: { initial: Record<string, number | boolean>; canEdit: boolean }) => {
  const { pending, run } = useRun()

  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, typeof value === 'boolean' ? value : String(value)]))
  )

  const groups = [...new Set(SETTINGS_FIELDS.map(item => item.group))]

  return (
    <form
      className='flex flex-col gap-6'
      data-permit-settings-form
      onSubmit={event => {
        event.preventDefault()
        run(() => savePermitSettings(values))
      }}
    >
      <fieldset disabled={pending || !canEdit} className='flex flex-col gap-6'>
        {groups.map(group => (
          <div key={group} className='flex flex-col gap-3'>
            <h3 className='font-semibold'>{group}</h3>
            <div className='grid gap-4 md:grid-cols-2'>
              {SETTINGS_FIELDS.filter(item => item.group === group).map(item =>
                item.kind === 'boolean' ? (
                  <label key={item.key} className='flex items-center gap-2 text-sm font-medium md:col-span-2'>
                    <input type='checkbox' name={item.key} checked={values[item.key] === true} onChange={event => setValues(current => ({ ...current, [item.key]: event.target.checked }))} />
                    {item.label}
                  </label>
                ) : (
                  <label key={item.key} className='flex flex-col gap-1 text-sm font-medium'>
                    {item.label}
                    <input
                      type='number'
                      name={item.key}
                      required
                      min={item.min}
                      max={item.max}
                      step={item.integer ? 1 : item.step || 'any'}
                      value={String(values[item.key] ?? '')}
                      onChange={event => setValues(current => ({ ...current, [item.key]: event.target.value }))}
                      className={field}
                    />
                    {item.help ? <span className='text-textSecondary text-xs font-normal'>{item.help}</span> : null}
                  </label>
                )
              )}
            </div>
          </div>
        ))}
        {canEdit ? (
          <div>
            <Button type='submit'>{pending ? 'Saving...' : 'Save settings'}</Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  )
}

type Requirement = { id: string; permit_type: PermitType; role: string; course_title: string }

/** Port slice 18: training a person must hold for a role on a permit type. */
export const TrainingRequirementsPanel = ({ requirements, courses, canEdit }: { requirements: Requirement[]; courses: { id: string; name: string }[]; canEdit: boolean }) => {
  const { pending, run } = useRun()
  const [type, setType] = useState<PermitType>('confined_space')
  const [role, setRole] = useState(PERMIT_ROLES.confined_space[0])
  const [courseId, setCourseId] = useState('')

  return (
    <div className='flex flex-col gap-4' data-training-requirements>
      {requirements.length ? (
        <ul className='flex flex-col gap-2 text-sm'>
          {requirements.map(item => (
            <li key={item.id} className='flex items-center justify-between gap-2' data-training-requirement={`${item.permit_type}:${item.role}:${item.course_title}`}>
              <span>
                {PERMIT_TYPE_INFO[item.permit_type]?.short}, {PERMIT_ROLE_LABELS[item.role] || item.role}: <span className='font-medium'>{item.course_title}</span>
              </span>
              {canEdit ? (
                <Button type='button' size='sm' variant='outline' disabled={pending} onClick={() => run(() => removeTrainingRequirement(item.id))}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-textSecondary text-sm'>No training is required yet.</p>
      )}
      {canEdit ? (
        <form
          className='flex flex-wrap items-end gap-2'
          onSubmit={event => {
            event.preventDefault()
            run(() => addTrainingRequirement(type, role, courseId), () => setCourseId(''))
          }}
        >
          <label className='flex flex-col gap-1 text-xs font-medium'>
            Permit type
            <select
              name='requirementType'
              value={type}
              onChange={event => {
                const next = event.target.value as PermitType

                setType(next)
                setRole(PERMIT_ROLES[next][0])
              }}
              className={field}
            >
              {PERMIT_TYPES.map(item => (
                <option key={item} value={item}>
                  {PERMIT_TYPE_INFO[item].short}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-xs font-medium'>
            Role
            <select name='requirementRole' value={role} onChange={event => setRole(event.target.value)} className={field}>
              {PERMIT_ROLES[type].map(item => (
                <option key={item} value={item}>
                  {PERMIT_ROLE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-xs font-medium'>
            Course
            <select name='requirementCourse' required value={courseId} onChange={event => setCourseId(event.target.value)} className={field}>
              <option value=''>Pick a course</option>
              {courses.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <Button type='submit' size='sm' disabled={pending || !courseId}>
            Add requirement
          </Button>
        </form>
      ) : null}
    </div>
  )
}

type ChecklistItem = { id: string; check_key: string; label: string; required: boolean; allow_na: boolean; builtIn: boolean }

/** Port slice 18: a permit type's checklist: built-in items plus the company's own. */
export const ChecklistItemsPanel = ({ type, items, canEdit }: { type: PermitType; items: ChecklistItem[]; canEdit: boolean }) => {
  const { pending, run } = useRun()
  const [label, setLabel] = useState('')
  const [required, setRequired] = useState(true)
  const [allowNa, setAllowNa] = useState(false)

  return (
    <div className='flex flex-col gap-3' data-checklist-items={type}>
      <ul className='flex flex-col gap-1 text-sm'>
        {items.map(item => (
          <li key={item.id} className='flex items-center justify-between gap-2' data-checklist-item={item.label}>
            <span>
              {item.label}
              <span className='text-textSecondary text-xs'>
                {' '}
                ({item.builtIn ? 'built in' : 'company'}
                {item.required ? '' : ', optional'}
                {item.allow_na ? ', N/A allowed' : ''})
              </span>
            </span>
            {canEdit && !item.builtIn ? (
              <Button type='button' size='sm' variant='outline' disabled={pending} onClick={() => run(() => archiveChecklistItem(item.id))}>
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className='flex flex-wrap items-center gap-2'
          onSubmit={event => {
            event.preventDefault()
            run(
              () => addChecklistItem(type, { label, required, allowNa }),
              () => setLabel('')
            )
          }}
        >
          <input aria-label={`New ${PERMIT_TYPE_INFO[type].short} checklist item`} required maxLength={300} value={label} onChange={event => setLabel(event.target.value)} placeholder='New checklist item' className={field + ' max-w-md'} />
          <label className='flex items-center gap-1 text-sm'>
            <input type='checkbox' checked={required} onChange={event => setRequired(event.target.checked)} />
            Required
          </label>
          <label className='flex items-center gap-1 text-sm'>
            <input type='checkbox' checked={allowNa} onChange={event => setAllowNa(event.target.checked)} />
            N/A allowed
          </label>
          <Button type='submit' size='sm' disabled={pending || !label.trim()}>
            Add item
          </Button>
        </form>
      ) : null}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { saveCheckItem, saveForkliftSettings, setCheckItemArchived } from '@/app/(back)/forklifts/actions'
import type { CheckItemInput } from '@/app/(back)/forklifts/actions'
import type { CheckItem, ForkliftSettings } from '@/lib/forgeForkliftRules'
import { POWER_SOURCE_LABELS, POWER_SOURCES, SECTION_LABELS } from '@/lib/forgeForkliftRules'

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

/** Port slice 19: company forklift settings (operator rules, training, defects, reminders). */
export const ForkliftSettingsForm = ({ initial, courses, canEdit }: { initial: ForkliftSettings; courses: { id: string; title: string }[]; canEdit: boolean }) => {
  const { pending, run } = useRun()
  const [values, setValues] = useState({ ...initial, evaluation_months: String(initial.evaluation_months), expiry_notice_days: String(initial.expiry_notice_days), training_course_id: initial.training_course_id || '' })

  const check = (key: 'require_authorized_operator' | 'require_training' | 'critical_defect_out_of_service', label: string) => (
    <label className='flex items-center gap-2 text-sm font-medium'>
      <input type='checkbox' name={key} checked={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.checked }))} />
      {label}
    </label>
  )

  return (
    <form
      className='flex flex-col gap-4'
      data-forklift-settings-form
      onSubmit={event => {
        event.preventDefault()
        run(() => saveForkliftSettings(values))
      }}
    >
      <fieldset disabled={pending || !canEdit} className='flex flex-col gap-4'>
        <div className='grid gap-4 md:grid-cols-2'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Re-evaluate operators every (months)
            <input
              type='number'
              name='evaluation_months'
              required
              min={6}
              max={36}
              step={1}
              value={values.evaluation_months}
              onChange={event => setValues(current => ({ ...current, evaluation_months: event.target.value }))}
              className={field}
            />
            <span className='text-textSecondary text-xs font-normal'>OSHA requires an evaluation at least every 3 years (1910.178(l)(4)(iii)).</span>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Remind before re-evaluation is due (days)
            <input
              type='number'
              name='expiry_notice_days'
              required
              min={1}
              max={120}
              step={1}
              value={values.expiry_notice_days}
              onChange={event => setValues(current => ({ ...current, expiry_notice_days: event.target.value }))}
              className={field}
            />
          </label>
        </div>
        {check('require_authorized_operator', 'Only authorized operators may do pre-shift checks')}
        {check('require_training', 'Operators need a current completion of a training course')}
        <label className='flex max-w-md flex-col gap-1 text-sm font-medium'>
          Training course
          <select name='training_course_id' value={values.training_course_id} onChange={event => setValues(current => ({ ...current, training_course_id: event.target.value }))} className={field}>
            <option value=''>None</option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
        {check('critical_defect_out_of_service', 'A critical defect takes the forklift out of service (1910.178(q)(7))')}
        {canEdit ? (
          <div>
            <Button type='submit'>{pending ? 'Saving...' : 'Save settings'}</Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  )
}

type Item = CheckItem & { builtIn: boolean }

const blank: Required<CheckItemInput> = { section: 'visual', label: '', power_sources: [], critical: true, allow_na: false, sort_order: '500' }

const ItemFields = ({ values, onChange }: { values: Required<CheckItemInput>; onChange: (next: Required<CheckItemInput>) => void }) => (
  <div className='flex flex-col gap-2'>
    <div className='flex flex-wrap items-end gap-2'>
      <label className='flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium'>
        Item
        <input name='itemLabel' required maxLength={300} value={values.label} onChange={event => onChange({ ...values, label: event.target.value })} placeholder='New checklist item' className={field} />
      </label>
      <label className='flex flex-col gap-1 text-xs font-medium'>
        Section
        <select name='itemSection' value={values.section} onChange={event => onChange({ ...values, section: event.target.value })} className={field}>
          {Object.entries(SECTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className='flex w-24 flex-col gap-1 text-xs font-medium'>
        Order
        <input name='itemOrder' type='number' min={0} max={10000} step={1} value={String(values.sort_order)} onChange={event => onChange({ ...values, sort_order: event.target.value })} className={field} />
      </label>
    </div>
    <div className='flex flex-wrap items-center gap-3 text-sm'>
      <label className='flex items-center gap-1'>
        <input type='checkbox' name='itemCritical' checked={values.critical} onChange={event => onChange({ ...values, critical: event.target.checked })} />
        Critical
      </label>
      <label className='flex items-center gap-1'>
        <input type='checkbox' name='itemAllowNa' checked={values.allow_na} onChange={event => onChange({ ...values, allow_na: event.target.checked })} />
        N/A allowed
      </label>
      <span className='text-textSecondary text-xs'>Only for (none = every truck):</span>
      {POWER_SOURCES.map(power => (
        <label key={power} className='flex items-center gap-1 text-xs'>
          <input
            type='checkbox'
            name='itemPower'
            value={power}
            checked={values.power_sources.includes(power)}
            onChange={event => onChange({ ...values, power_sources: event.target.checked ? [...values.power_sources, power] : values.power_sources.filter(item => item !== power) })}
          />
          {POWER_SOURCE_LABELS[power]}
        </label>
      ))}
    </div>
  </div>
)

const describe = (item: Item) =>
  [
    item.builtIn ? 'built in' : 'company',
    item.critical ? 'critical' : 'not critical',
    item.allow_na ? 'N/A allowed' : null,
    item.power_sources?.length ? item.power_sources.map(power => POWER_SOURCE_LABELS[power as keyof typeof POWER_SOURCE_LABELS] || power).join(', ') : null,
    item.archived_at ? 'archived' : null
  ]
    .filter(Boolean)
    .join(', ')

/** Port slice 19: the pre-shift checklist: built-in items (read-only) and the company's own (add, edit, archive). */
export const CheckItemsPanel = ({ items, canEdit }: { items: Item[]; canEdit: boolean }) => {
  const { pending, run } = useRun()
  const [adding, setAdding] = useState<Required<CheckItemInput>>(blank)
  const [editing, setEditing] = useState<{ id: string; values: Required<CheckItemInput> } | null>(null)

  return (
    <div className='flex flex-col gap-4' data-forklift-checklist>
      {['visual', 'operational'].map(section => (
        <div key={section} className='flex flex-col gap-1'>
          <h3 className='font-semibold'>{SECTION_LABELS[section]}</h3>
          <ul className='flex flex-col gap-1 text-sm'>
            {items
              .filter(item => item.section === section)
              .map(item =>
                editing?.id === item.id ? (
                  <li key={item.id} className='rounded-md border p-3' data-checklist-item={item.label}>
                    <form
                      className='flex flex-col gap-2'
                      onSubmit={event => {
                        event.preventDefault()
                        run(() => saveCheckItem(item.id, editing.values), () => setEditing(null))
                      }}
                    >
                      <ItemFields values={editing.values} onChange={values => setEditing({ id: item.id, values })} />
                      <div className='flex gap-2'>
                        <Button type='submit' size='sm' disabled={pending}>
                          Save item
                        </Button>
                        <Button type='button' size='sm' variant='outline' onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </li>
                ) : (
                  <li key={item.id} className={'flex items-center justify-between gap-2' + (item.archived_at ? ' opacity-60' : '')} data-checklist-item={item.label}>
                    <span>
                      {item.label}
                      <span className='text-textSecondary text-xs'> ({describe(item)})</span>
                    </span>
                    {canEdit && !item.builtIn ? (
                      <span className='flex gap-2'>
                        {!item.archived_at ? (
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={pending}
                            onClick={() =>
                              setEditing({
                                id: item.id,
                                values: { section: item.section, label: item.label, power_sources: item.power_sources || [], critical: item.critical, allow_na: item.allow_na, sort_order: String(item.sort_order) }
                              })
                            }
                          >
                            Edit
                          </Button>
                        ) : null}
                        <Button type='button' size='sm' variant='outline' disabled={pending} onClick={() => run(() => setCheckItemArchived(item.id, !item.archived_at))}>
                          {item.archived_at ? 'Restore' : 'Archive'}
                        </Button>
                      </span>
                    ) : null}
                  </li>
                )
              )}
          </ul>
        </div>
      ))}
      {canEdit ? (
        <form
          className='flex flex-col gap-2 rounded-md border p-3'
          data-add-checklist-item
          onSubmit={event => {
            event.preventDefault()
            run(
              () => saveCheckItem(null, adding),
              () => setAdding(blank)
            )
          }}
        >
          <ItemFields values={adding} onChange={setAdding} />
          <div>
            <Button type='submit' size='sm' disabled={pending || !adding.label.trim()}>
              Add item
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

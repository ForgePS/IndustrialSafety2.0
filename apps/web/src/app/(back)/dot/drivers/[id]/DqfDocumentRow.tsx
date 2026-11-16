'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { toast } from '@repo/ui/utils/toast'

import DotStatusPill, { type DotTone } from '@/components/dot/DotStatusPill'
import type { DotDocumentDef } from '@/lib/forgeDotRules'
import { saveDqfDocument } from '../../actions'

type Values = { placedOn: string; onFile: string; textValues: Record<string, string> }

/** One DQF document: status, date placed, on-file answer, extra fields and uploaded copies. */
const DqfDocumentRow = ({
  fileId,
  def,
  tone,
  statusText,
  initial,
  canEdit,
  uploads
}: {
  fileId: string
  def: DotDocumentDef
  tone: DotTone
  statusText: string
  initial: Values
  canEdit: boolean
  uploads: React.ReactNode
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Values>(initial)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div id={'dqf-' + def.key} className='flex flex-col gap-2 py-3' data-worksheet-item={def.key}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <span className='font-medium'>{def.label}</span>
          {def.cite ? <span className='text-textSecondary text-xs'>{def.cite}</span> : null}
        </div>
        <DotStatusPill tone={tone}>{statusText}</DotStatusPill>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          type='date'
          aria-label={def.label + ' date placed'}
          className='w-44'
          max={today}
          value={values.placedOn}
          disabled={!canEdit || pending}
          onChange={event => setValues(current => ({ ...current, placedOn: event.target.value }))}
        />
        <select
          aria-label={def.label + ' on file'}
          className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'
          value={values.onFile}
          disabled={!canEdit || pending}
          onChange={event => setValues(current => ({ ...current, onFile: event.target.value }))}
        >
          <option value=''>On file?</option>
          <option value='yes'>Yes</option>
          <option value='no'>No</option>
          <option value='na'>N/A</option>
        </select>
        {(def.textFields || []).map(field => (
          <Input
            key={field.key}
            aria-label={field.label}
            placeholder={field.label}
            className='w-56'
            value={values.textValues[field.key] || ''}
            disabled={!canEdit || pending}
            onChange={event => setValues(current => ({ ...current, textValues: { ...current.textValues, [field.key]: event.target.value } }))}
          />
        ))}
        {canEdit && dirty ? (
          <Button
            size='sm'
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveDqfDocument({ fileId, documentType: def.key, ...values })

                if (result.error) toast('error', result.error)
                else router.refresh()
              })
            }
          >
            {pending ? 'Saving...' : 'Save'}
          </Button>
        ) : null}
      </div>
      {uploads}
    </div>
  )
}

export default DqfDocumentRow

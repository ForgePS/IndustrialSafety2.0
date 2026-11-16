'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbPlus, TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import {
  LOTO_DEFAULT_PRECAUTIONS,
  LOTO_DEFAULT_PRINT_ENFORCEMENT,
  LOTO_DEFAULT_PRINT_PURPOSE,
  LOTO_DEFAULT_PRINT_SCOPE,
  LOTO_DEFAULT_RESTORATION_CHECK,
  LOTO_DEFAULT_RESTORE_SEQUENCE,
  LOTO_DEFAULT_SHUTDOWN_SEQUENCE,
  type LotoPrecaution,
  type LotoRestorationCheck,
  type LotoSequenceStep
} from '@/lib/forgeLotoRules'
import { updateLotoContent } from './content-actions'

const SequenceEditor = ({
  title,
  rows,
  defaults,
  disabled,
  onChange
}: {
  title: string
  rows: LotoSequenceStep[]
  defaults: LotoSequenceStep[]
  disabled: boolean
  onChange: (rows: LotoSequenceStep[]) => void
}) => (
  <div className='flex flex-col gap-2'>
    <div className='flex flex-wrap items-center justify-between gap-2'>
      <Label>{title}</Label>
      {!disabled ? (
        <div className='flex gap-2'>
          <Button size='sm' variant='outline' onClick={() => onChange(defaults.map(row => ({ ...row })))}>Use standard text</Button>
          <Button size='sm' variant='outline' onClick={() => onChange([...rows, { step: '', description: '' }])}><TbPlus />Row</Button>
        </div>
      ) : null}
    </div>
    {rows.length ? (
      rows.map((row, index) => (
        <div key={index} className='grid grid-cols-1 gap-2 rounded-lg border p-2 md:grid-cols-12'>
          <Input
            className='md:col-span-3'
            value={row.step}
            placeholder='Step'
            disabled={disabled}
            onChange={event => onChange(rows.map((item, i) => (i === index ? { ...item, step: event.target.value } : item)))}
          />
          <Textarea
            className='md:col-span-8'
            rows={2}
            value={row.description}
            placeholder='What to do'
            disabled={disabled}
            onChange={event => onChange(rows.map((item, i) => (i === index ? { ...item, description: event.target.value } : item)))}
          />
          {!disabled ? (
            <Button size='sm' variant='outline' className='md:col-span-1' aria-label='Remove row' onClick={() => onChange(rows.filter((_, i) => i !== index))}>
              <TbTrash />
            </Button>
          ) : null}
        </div>
      ))
    ) : (
      <p className='text-textSecondary text-sm'>Empty: the printed sheet uses the standard OSHA-based text ({defaults.length} steps).</p>
    )}
  </div>
)

const LotoContentForm = ({
  procedureId,
  editable,
  initial
}: {
  procedureId: string
  editable: boolean
  initial: {
    precautions: LotoPrecaution[]
    printPurpose: string
    printScope: string
    printEnforcement: string
    shutdownSequence: LotoSequenceStep[]
    restoreSequence: LotoSequenceStep[]
    restorationChecks: LotoRestorationCheck[]
  }
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [precautions, setPrecautions] = useState(initial.precautions)
  const [custom, setCustom] = useState('')
  const [printPurpose, setPrintPurpose] = useState(initial.printPurpose)
  const [printScope, setPrintScope] = useState(initial.printScope)
  const [printEnforcement, setPrintEnforcement] = useState(initial.printEnforcement)
  const [shutdownSequence, setShutdownSequence] = useState(initial.shutdownSequence)
  const [restoreSequence, setRestoreSequence] = useState(initial.restoreSequence)
  const [restorationChecks, setRestorationChecks] = useState(initial.restorationChecks)
  const disabled = !editable || pending

  const selected = new Set(precautions.map(item => item.key))
  const categories = Array.from(new Set(LOTO_DEFAULT_PRECAUTIONS.map(item => item.category)))
  const customItems = precautions.filter(item => !LOTO_DEFAULT_PRECAUTIONS.some(standard => standard.key === item.key))

  const toggle = (item: (typeof LOTO_DEFAULT_PRECAUTIONS)[number], on: boolean) =>
    setPrecautions(current =>
      on ? [...current, { key: item.key, category: item.category, text: item.text }] : current.filter(entry => entry.key !== item.key)
    )

  const save = () => {
    startTransition(async () => {
      const result = await updateLotoContent({
        procedureId,
        precautions,
        printPurpose,
        printScope,
        printEnforcement,
        shutdownSequence,
        restoreSequence,
        restorationChecks
      })

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Precautions & Printed Sheet</CardTitle>
        <CardDescription>
          Precautions print in the NOTE box. Purpose, scope, enforcement and the two sequences print on page 2. Restoration checks must all be ticked before a lockout returns the equipment to service.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        <div className='flex flex-col gap-3'>
          <Label>Precautions</Label>
          {editable ? (
            <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              {categories.map(category => (
                <div key={category} className='rounded-lg border p-3'>
                  <div className='mb-2 text-xs font-semibold uppercase tracking-wide'>{category}</div>
                  {LOTO_DEFAULT_PRECAUTIONS.filter(item => item.category === category).map(item => (
                    <label key={item.key} className='mb-2 flex items-start gap-2 text-sm'>
                      <input type='checkbox' className='mt-1' checked={selected.has(item.key)} disabled={disabled} onChange={event => toggle(item, event.target.checked)} />
                      <span>
                        <span className='font-medium'>{item.shortName}.</span> {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          ) : precautions.length ? (
            <ul className='list-disc pl-5 text-sm'>
              {precautions.map(item => (
                <li key={item.key}>{item.text}</li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No precautions selected.</p>
          )}
          {editable ? (
            <>
              {customItems.map(item => (
                <div key={item.key} className='flex items-start gap-2 rounded-lg border p-2 text-sm'>
                  <span className='flex-1'>{item.text}</span>
                  <Button size='sm' variant='outline' disabled={disabled} aria-label='Remove precaution' onClick={() => setPrecautions(current => current.filter(entry => entry.key !== item.key))}>
                    <TbTrash />
                  </Button>
                </div>
              ))}
              <div className='flex gap-2'>
                <Input value={custom} placeholder='Add your own precaution' disabled={disabled} onChange={event => setCustom(event.target.value)} />
                <Button
                  variant='outline'
                  disabled={disabled || !custom.trim()}
                  onClick={() => {
                    setPrecautions(current => [...current, { key: 'custom-' + Date.now(), category: 'Custom', text: custom.trim() }])
                    setCustom('')
                  }}
                >
                  <TbPlus />Add
                </Button>
              </div>
            </>
          ) : null}
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <div>
            <Label>Purpose</Label>
            <Textarea className='mt-2' rows={4} value={printPurpose} placeholder={LOTO_DEFAULT_PRINT_PURPOSE} disabled={disabled} onChange={event => setPrintPurpose(event.target.value)} />
          </div>
          <div>
            <Label>Scope</Label>
            <Textarea className='mt-2' rows={4} value={printScope} placeholder={LOTO_DEFAULT_PRINT_SCOPE} disabled={disabled} onChange={event => setPrintScope(event.target.value)} />
          </div>
          <div>
            <Label>Enforcement</Label>
            <Textarea className='mt-2' rows={4} value={printEnforcement} placeholder={LOTO_DEFAULT_PRINT_ENFORCEMENT} disabled={disabled} onChange={event => setPrintEnforcement(event.target.value)} />
          </div>
        </div>
        <p className='text-textSecondary -mt-4 text-xs'>Leave a box empty to print the standard text shown in grey.</p>

        <SequenceEditor title='Shutdown, lock, tag & test sequence' rows={shutdownSequence} defaults={LOTO_DEFAULT_SHUTDOWN_SEQUENCE} disabled={disabled} onChange={setShutdownSequence} />
        <SequenceEditor title='Restore to service sequence' rows={restoreSequence} defaults={LOTO_DEFAULT_RESTORE_SEQUENCE} disabled={disabled} onChange={setRestoreSequence} />

        <div className='flex flex-col gap-2'>
          <div className='flex items-center justify-between'>
            <Label>Restoration checks</Label>
            {editable ? (
              <Button size='sm' variant='outline' disabled={disabled} onClick={() => setRestorationChecks([...restorationChecks, { key: '', label: '' }])}>
                <TbPlus />Check
              </Button>
            ) : null}
          </div>
          {restorationChecks.length ? (
            restorationChecks.map((check, index) => (
              <div key={index} className='flex gap-2'>
                <Input
                  value={check.label}
                  placeholder='e.g. Guards replaced and secured'
                  disabled={disabled}
                  onChange={event => setRestorationChecks(restorationChecks.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))}
                />
                {editable ? (
                  <Button size='sm' variant='outline' disabled={disabled} aria-label='Remove check' onClick={() => setRestorationChecks(restorationChecks.filter((_, i) => i !== index))}>
                    <TbTrash />
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <p className='text-textSecondary text-sm'>Empty: lockouts use one check, &ldquo;{LOTO_DEFAULT_RESTORATION_CHECK.label}&rdquo;</p>
          )}
        </div>

        {editable ? (
          <div>
            <Button onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save precautions & sheet'}</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default LotoContentForm

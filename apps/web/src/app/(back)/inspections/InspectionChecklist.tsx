'use client'

import { useMemo, useState, useTransition } from 'react'
import { TbAlertTriangle, TbCheck, TbPlus } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { createInspectionFinding, saveInspectionItem } from './actions'

type Item = {
  id: string
  section_key: string
  section_label: string
  prompt: string
  guidance: string | null
  response_type: string
  sort_order: number
  is_required: boolean
  finding_on: string[]
  response_value: string | null
  notes: string | null
}

const InspectionChecklist = ({
  inspectionId,
  items,
  editable,
  severityOptions
}: {
  inspectionId: string
  items: Item[]
  editable: boolean
  severityOptions: Array<{ key: string; label: string }>
}) => {
  const [pending, startTransition] = useTransition()
  const [drafts, setDrafts] = useState<Record<string, { response: string; notes: string }>>(
    Object.fromEntries(items.map(item => [
      item.id,
      { response: item.response_value || '', notes: item.notes || '' }
    ]))
  )
  const [findingItemId, setFindingItemId] = useState<string | null>(null)
  const [findingTitle, setFindingTitle] = useState('')
  const [findingDescription, setFindingDescription] = useState('')
  const [findingSeverity, setFindingSeverity] = useState('moderate')
  const [findingDueDate, setFindingDueDate] = useState('')

  const sections = useMemo(() => {
    const map = new Map<string, { label: string; items: Item[] }>()
    for (const item of items) {
      if (!map.has(item.section_key)) map.set(item.section_key, { label: item.section_label, items: [] })
      map.get(item.section_key)?.items.push(item)
    }
    return Array.from(map.entries())
  }, [items])

  const saveItem = (item: Item) => {
    const draft = drafts[item.id]
    startTransition(async () => {
      const result = await saveInspectionItem({
        inspectionId,
        itemId: item.id,
        responseValue: draft.response,
        notes: draft.notes
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save checklist item.')
        return
      }

      toast('success', result.message)
    })
  }

  const createFinding = () => {
    if (!findingItemId) return

    startTransition(async () => {
      const result = await createInspectionFinding({
        inspectionId,
        itemId: findingItemId,
        title: findingTitle,
        description: findingDescription,
        severity: findingSeverity,
        dueDate: findingDueDate || null
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to create finding.')
        return
      }

      toast('success', result.message)
      setFindingItemId(null)
      setFindingTitle('')
      setFindingDescription('')
      setFindingSeverity('moderate')
      setFindingDueDate('')
      window.location.reload()
    })
  }

  const renderResponse = (item: Item) => {
    const draft = drafts[item.id]

    if (item.response_type === 'pass_fail_na' || item.response_type === 'yes_no_na') {
      const options = item.response_type === 'pass_fail_na'
        ? [['pass','Pass'],['fail','Fail'],['na','N/A']]
        : [['yes','Yes'],['no','No'],['na','N/A']]

      return (
        <div className='flex flex-wrap gap-2'>
          {options.map(([value, label]) => (
            <Button
              key={value}
              type='button'
              size='sm'
              variant={draft.response === value ? 'default' : 'outline'}
              disabled={!editable || pending}
              onClick={() => setDrafts(current => ({
                ...current,
                [item.id]: { ...current[item.id], response: value }
              }))}
            >
              {label}
            </Button>
          ))}
        </div>
      )
    }

    if (item.response_type === 'number') {
      return (
        <Input
          type='number'
          value={draft.response}
          disabled={!editable || pending}
          onChange={event => setDrafts(current => ({
            ...current,
            [item.id]: { ...current[item.id], response: event.target.value }
          }))}
        />
      )
    }

    return (
      <Input
        value={draft.response}
        disabled={!editable || pending}
        onChange={event => setDrafts(current => ({
          ...current,
          [item.id]: { ...current[item.id], response: event.target.value }
        }))}
      />
    )
  }

  return (
    <div className='flex flex-col gap-6'>
      {sections.map(([sectionKey, section]) => (
        <Card key={sectionKey}>
          <CardHeader>
            <CardTitle>{section.label}</CardTitle>
            <CardDescription>{editable ? 'Complete and save each checklist item.' : 'Checklist responses are read-only.'}</CardDescription>
          </CardHeader>
          <CardContent className='divide-y'>
            {section.items.map((item, index) => {
              const draft = drafts[item.id]
              const responseRequiresFinding = item.finding_on?.includes(draft.response)

              return (
                <div key={item.id} className='py-5 first:pt-0 last:pb-0'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='max-w-3xl'>
                      <div className='flex items-center gap-2'>
                        <span className='text-textSecondary text-sm'>{index + 1}.</span>
                        <span className='text-textPrimary font-semibold'>{item.prompt}</span>
                        {item.is_required ? <Badge size='sm' variant='outline'>Required</Badge> : null}
                      </div>
                      {item.guidance ? <p className='text-textSecondary mt-1 text-sm'>{item.guidance}</p> : null}
                    </div>
                    {draft.response ? (
                      <Badge size='sm' variant={responseRequiresFinding ? 'destructive' : 'tonalSuccess'}>
                        {responseRequiresFinding ? <TbAlertTriangle /> : <TbCheck />}
                        {draft.response.toUpperCase()}
                      </Badge>
                    ) : null}
                  </div>

                  <div className='mt-4 grid gap-4 lg:grid-cols-[280px_1fr_auto] lg:items-end'>
                    <div>
                      <Label>Response</Label>
                      <div className='mt-2'>{renderResponse(item)}</div>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Input
                        className='mt-2'
                        value={draft.notes}
                        disabled={!editable || pending}
                        placeholder='Optional notes...'
                        onChange={event => setDrafts(current => ({
                          ...current,
                          [item.id]: { ...current[item.id], notes: event.target.value }
                        }))}
                      />
                    </div>
                    {editable ? (
                      <div className='flex gap-2'>
                        <Button size='sm' variant='outline' onClick={() => saveItem(item)} disabled={pending}>Save</Button>
                        <Button
                          size='sm'
                          variant={responseRequiresFinding ? 'destructive' : 'outline'}
                          onClick={() => {
                            setFindingItemId(item.id)
                            setFindingTitle(item.prompt)
                            setFindingDescription(draft.notes)
                          }}
                          disabled={pending}
                        >
                          <TbPlus />
                          Finding
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {findingItemId === item.id ? (
                    <div className='mt-4 rounded-lg border p-4'>
                      <div className='text-textPrimary font-semibold'>Create Finding</div>
                      <div className='mt-4 grid gap-4 md:grid-cols-2'>
                        <div>
                          <Label>Title</Label>
                          <Input className='mt-2' value={findingTitle} onChange={event => setFindingTitle(event.target.value)} />
                        </div>
                        <div>
                          <Label>Severity</Label>
                          <select
                            className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                            value={findingSeverity}
                            onChange={event => setFindingSeverity(event.target.value)}
                          >
                            {severityOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
                          </select>
                        </div>
                        <div className='md:col-span-2'>
                          <Label>Description</Label>
                          <Textarea className='mt-2' rows={3} value={findingDescription} onChange={event => setFindingDescription(event.target.value)} />
                        </div>
                        <div>
                          <Label>Due Date</Label>
                          <Input className='mt-2' type='date' value={findingDueDate} onChange={event => setFindingDueDate(event.target.value)} />
                        </div>
                      </div>
                      <div className='mt-4 flex gap-2'>
                        <Button onClick={createFinding} disabled={pending || !findingTitle.trim()}>Create Finding</Button>
                        <Button variant='outline' onClick={() => setFindingItemId(null)} disabled={pending}>Cancel</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default InspectionChecklist

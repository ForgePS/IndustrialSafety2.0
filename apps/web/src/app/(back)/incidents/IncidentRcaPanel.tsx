'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { RCA_ACTION_STATUSES, RCA_ACTION_STATUS_LABELS, emptyRcaAction } from '@/lib/forgeIncidentRcaRules'
import type { IncidentRca, RcaAction, RcaActionStatus } from '@/lib/forgeIncidentRcaRules'
import { createCapaForRcaAction, saveIncidentRca } from './rcaActions'

const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'

const IncidentRcaPanel = ({
  incidentId,
  initial,
  saved,
  canEdit,
  canViewCapa,
  capaStatuses,
  people
}: {
  incidentId: string
  initial: IncidentRca
  saved: boolean
  canEdit: boolean
  canViewCapa: boolean
  capaStatuses: Record<string, string>
  people: Array<{ id: string; label: string }>
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rca, setRca] = useState<IncidentRca>(initial)
  const [dirty, setDirty] = useState(false)
  const [persistedKeys, setPersistedKeys] = useState<Set<string>>(() => new Set(saved ? initial.actions.map(item => item.key) : []))
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const update = (patch: Partial<IncidentRca>) => {
    setRca(current => ({ ...current, ...patch }))
    setDirty(true)
    setMessage(null)
  }

  const updateAction = (key: string, patch: Partial<RcaAction>) =>
    update({ actions: rca.actions.map(item => (item.key === key ? { ...item, ...patch } : item)) })

  const save = () => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await saveIncidentRca(incidentId, rca)

      if ('error' in result) {
        setError(result.error)

        return
      }

      const actions = rca.actions.filter(item => item.action.trim() || item.capaId)

      setRca(current => ({ ...current, actions }))
      setPersistedKeys(new Set(actions.map(item => item.key)))
      setDirty(false)
      setMessage('Root-cause analysis saved.')
      router.refresh()
    })
  }

  const createCapa = (key: string) => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await createCapaForRcaAction(incidentId, key)

      if ('error' in result) {
        setError(result.error)

        return
      }

      setRca(current => ({
        ...current,
        actions: current.actions.map(item => (item.key === key ? { ...item, capaId: result.capaId || null, capaNumber: result.capaNumber || null } : item))
      }))
      setMessage(`CAPA ${result.capaNumber} ${result.existing ? 'is already open' : 'created'} for this action.`)
      router.refresh()
    })
  }

  const readOnly = !canEdit || pending

  return (
    <Card data-testid='incident-rca-panel'>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
        <div>
          <CardTitle>Root-Cause Analysis</CardTitle>
          <CardDescription>5 Whys analysis, contributing factors and corrective actions. Open a CAPA for each action.</CardDescription>
        </div>
        <Link className='text-primary text-sm font-semibold hover:underline' href={`/incidents/${incidentId}/rca/print`} target='_blank'>
          Print RCA
        </Link>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        <section className='grid gap-4 md:grid-cols-2'>
          <div className='md:col-span-2'>
            <Label htmlFor='rca-problem'>Problem statement / incident summary</Label>
            <Textarea id='rca-problem' className='mt-2' rows={3} disabled={readOnly} value={rca.problemStatement} onChange={event => update({ problemStatement: event.target.value })} />
          </div>
          <div className='md:col-span-2'>
            <Label htmlFor='rca-immediate'>Immediate actions taken</Label>
            <Textarea id='rca-immediate' className='mt-2' rows={2} disabled={readOnly} value={rca.immediateActions} onChange={event => update({ immediateActions: event.target.value })} />
          </div>
          <div>
            <Label htmlFor='rca-event-date'>Event date</Label>
            <Input id='rca-event-date' type='date' className='mt-2' disabled={readOnly} value={rca.eventDate} onChange={event => update({ eventDate: event.target.value })} />
          </div>
          <div>
            <Label htmlFor='rca-conducted-at'>Analysis date</Label>
            <Input id='rca-conducted-at' type='date' className='mt-2' disabled={readOnly} value={rca.conductedAt} onChange={event => update({ conductedAt: event.target.value })} />
          </div>
          <div>
            <Label htmlFor='rca-conducted-by'>Analysis conducted by</Label>
            <Input id='rca-conducted-by' className='mt-2' disabled={readOnly} value={rca.conductedBy} onChange={event => update({ conductedBy: event.target.value })} />
          </div>
          <div>
            <Label htmlFor='rca-participants'>Analysis team (one per line)</Label>
            <Textarea
              id='rca-participants'
              className='mt-2'
              rows={2}
              disabled={readOnly}
              value={rca.participants.join('\n')}
              onChange={event => update({ participants: event.target.value.split('\n') })}
            />
          </div>
        </section>

        <section className='flex flex-col gap-2'>
          <Label>Contributing factors</Label>
          {rca.contributingFactors.map((factor, index) => (
            <div key={index} className='flex gap-2'>
              <Input
                aria-label={`Contributing factor ${index + 1}`}
                disabled={readOnly}
                value={factor}
                onChange={event => update({ contributingFactors: rca.contributingFactors.map((item, i) => (i === index ? event.target.value : item)) })}
              />
              {canEdit ? (
                <Button type='button' variant='outline' disabled={pending} onClick={() => update({ contributingFactors: rca.contributingFactors.filter((_, i) => i !== index) })}>
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          {!rca.contributingFactors.length && !canEdit ? <p className='text-textSecondary text-sm'>None recorded.</p> : null}
          {canEdit ? (
            <div>
              <Button type='button' variant='outline' size='sm' disabled={pending} onClick={() => update({ contributingFactors: [...rca.contributingFactors, ''] })}>
                Add factor
              </Button>
            </div>
          ) : null}
        </section>

        <section className='flex flex-col gap-3'>
          <h3 className='font-semibold'>5 Why analysis</h3>
          {rca.fiveWhys.map((why, index) => (
            <div key={index} className='grid gap-2 rounded-lg border p-3 md:grid-cols-2'>
              <div>
                <Label htmlFor={`rca-why-q-${index}`}>Why {index + 1}: question</Label>
                <Input
                  id={`rca-why-q-${index}`}
                  className='mt-2'
                  disabled={readOnly}
                  value={why.question}
                  onChange={event => update({ fiveWhys: rca.fiveWhys.map((item, i) => (i === index ? { ...item, question: event.target.value } : item)) })}
                />
              </div>
              <div>
                <Label htmlFor={`rca-why-a-${index}`}>Why {index + 1}: answer</Label>
                <Textarea
                  id={`rca-why-a-${index}`}
                  className='mt-2'
                  rows={2}
                  placeholder='Because…'
                  disabled={readOnly}
                  value={why.answer}
                  onChange={event => update({ fiveWhys: rca.fiveWhys.map((item, i) => (i === index ? { ...item, answer: event.target.value } : item)) })}
                />
              </div>
            </div>
          ))}
        </section>

        <section>
          <Label htmlFor='rca-root-cause'>Root cause</Label>
          <Textarea
            id='rca-root-cause'
            className='mt-2'
            rows={3}
            placeholder='The fundamental cause identified through analysis…'
            disabled={readOnly}
            value={rca.rootCause}
            onChange={event => update({ rootCause: event.target.value })}
          />
        </section>

        <section className='flex flex-col gap-3'>
          <h3 className='font-semibold'>Corrective actions</h3>
          {rca.actions.map((action, index) => {
            const ownerMissing = action.ownerPersonnelId && !people.some(person => person.id === action.ownerPersonnelId)
            const canCreate = canEdit && !action.capaId && !dirty && persistedKeys.has(action.key) && Boolean(action.action.trim())

            return (
              <div key={action.key} data-rca-action={index} className='grid gap-3 rounded-lg border p-3 md:grid-cols-12'>
                <div className='md:col-span-12'>
                  <Label htmlFor={`rca-action-${index}`}>Action {index + 1}</Label>
                  <Textarea
                    id={`rca-action-${index}`}
                    className='mt-2'
                    rows={2}
                    disabled={readOnly}
                    value={action.action}
                    onChange={event => updateAction(action.key, { action: event.target.value })}
                  />
                </div>
                <div className='md:col-span-4'>
                  <Label htmlFor={`rca-action-owner-${index}`}>Owner</Label>
                  <select
                    id={`rca-action-owner-${index}`}
                    className={selectClass}
                    disabled={readOnly}
                    value={action.ownerPersonnelId || ''}
                    onChange={event => updateAction(action.key, { ownerPersonnelId: event.target.value || null })}
                  >
                    <option value=''>Unassigned</option>
                    {ownerMissing ? <option value={action.ownerPersonnelId || ''}>{action.ownerName || 'Current owner'}</option> : null}
                    {people.map(person => (
                      <option key={person.id} value={person.id}>
                        {person.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='md:col-span-3'>
                  <Label htmlFor={`rca-action-due-${index}`}>Due date</Label>
                  <Input
                    id={`rca-action-due-${index}`}
                    type='date'
                    className='mt-2'
                    disabled={readOnly}
                    value={action.dueDate}
                    onChange={event => updateAction(action.key, { dueDate: event.target.value })}
                  />
                </div>
                <div className='md:col-span-2'>
                  <Label htmlFor={`rca-action-status-${index}`}>Status</Label>
                  <select
                    id={`rca-action-status-${index}`}
                    className={selectClass}
                    disabled={readOnly}
                    value={action.status}
                    onChange={event => updateAction(action.key, { status: event.target.value as RcaActionStatus })}
                  >
                    {RCA_ACTION_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {RCA_ACTION_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='flex flex-wrap items-end gap-2 md:col-span-3'>
                  {action.capaId ? (
                    <div className='flex items-center gap-2 pb-2' data-testid='rca-action-capa'>
                      {canViewCapa ? (
                        <Link className='text-primary font-semibold hover:underline' href={`/corrective-actions/${action.capaId}`}>
                          {action.capaNumber || 'View CAPA'}
                        </Link>
                      ) : (
                        <span className='font-semibold'>{action.capaNumber}</span>
                      )}
                      {capaStatuses[action.capaId] ? (
                        <Badge size='sm' variant='secondary'>
                          {capaStatuses[action.capaId].replaceAll('_', ' ')}
                        </Badge>
                      ) : null}
                    </div>
                  ) : canEdit ? (
                    <>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={pending || !canCreate}
                        title={canCreate ? undefined : 'Save the analysis with a described action first.'}
                        onClick={() => createCapa(action.key)}
                      >
                        Create CAPA
                      </Button>
                      <Button type='button' variant='ghost' disabled={pending} onClick={() => update({ actions: rca.actions.filter(item => item.key !== action.key) })}>
                        Remove
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })}
          {!rca.actions.length && !canEdit ? <p className='text-textSecondary text-sm'>No corrective actions recorded.</p> : null}
          {canEdit ? (
            <div>
              <Button type='button' variant='outline' size='sm' disabled={pending} onClick={() => update({ actions: [...rca.actions, emptyRcaAction()] })}>
                Add action
              </Button>
            </div>
          ) : null}
        </section>

        {error ? <p className='text-destructive text-sm'>{error}</p> : null}
        {message ? (
          <p className='text-success text-sm' role='status'>
            {message}
          </p>
        ) : null}

        {canEdit ? (
          <div className='flex flex-wrap items-center gap-3'>
            <Button type='button' disabled={pending || !dirty} onClick={save}>
              {pending ? 'Saving...' : 'Save analysis'}
            </Button>
            {dirty ? <span className='text-textSecondary text-sm'>Unsaved changes. Save before creating CAPAs.</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default IncidentRcaPanel

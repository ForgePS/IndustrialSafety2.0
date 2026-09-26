'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  addRiskControlAction,
  addRiskTreatmentAction,
  assessInherentRiskAction,
  assessResidualRiskAction
} from './actions'

type Option = { key: string; label: string }
type PersonOption = { id: string; label: string }

export const RiskAssessmentPanel = ({
  riskId,
  rowVersion,
  canAssess,
  inherent,
  residual,
  likelihoodOptions,
  severityOptions
}: {
  riskId: string
  rowVersion: number
  canAssess: boolean
  inherent: {
    likelihoodKey: string | null
    severityKey: string | null
    score: number | null
    bandKey: string | null
  }
  residual: {
    likelihoodKey: string | null
    severityKey: string | null
    score: number | null
    bandKey: string | null
  }
  likelihoodOptions: Option[]
  severityOptions: Option[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [inherentLikelihood, setInherentLikelihood] = useState(inherent.likelihoodKey || '')
  const [inherentSeverity, setInherentSeverity] = useState(inherent.severityKey || '')
  const [residualLikelihood, setResidualLikelihood] = useState(residual.likelihoodKey || '')
  const [residualSeverity, setResidualSeverity] = useState(residual.severityKey || '')

  const assessInherent = () => {
    startTransition(async () => {
      const result = await assessInherentRiskAction({
        riskId,
        expectedRowVersion: rowVersion,
        likelihoodKey: inherentLikelihood,
        severityKey: inherentSeverity
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to assess inherent risk.')
        if (result.conflict) router.refresh()
        return
      }
      toast('success', result.message)
      router.refresh()
    })
  }

  const assessResidual = () => {
    startTransition(async () => {
      const result = await assessResidualRiskAction({
        riskId,
        expectedRowVersion: rowVersion,
        likelihoodKey: residualLikelihood,
        severityKey: residualSeverity
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to assess residual risk.')
        if (result.conflict) router.refresh()
        return
      }
      toast('success', result.message)
      router.refresh()
    })
  }

  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle>Inherent Risk</CardTitle>
          <CardDescription>
            {inherent.bandKey
              ? inherent.bandKey + (inherent.score != null ? ' · score ' + inherent.score : '')
              : 'Not assessed'}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          <div>
            <Label htmlFor='inherent-likelihood'>Likelihood</Label>
            <select
              id='inherent-likelihood'
              value={inherentLikelihood}
              disabled={!canAssess || pending}
              onChange={event => setInherentLikelihood(event.target.value)}
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
            >
              <option value=''>Select...</option>
              {likelihoodOptions.map(option => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor='inherent-severity'>Severity</Label>
            <select
              id='inherent-severity'
              value={inherentSeverity}
              disabled={!canAssess || pending}
              onChange={event => setInherentSeverity(event.target.value)}
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
            >
              <option value=''>Select...</option>
              {severityOptions.map(option => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {canAssess ? (
            <Button onClick={assessInherent} disabled={pending || !inherentLikelihood || !inherentSeverity}>
              {pending ? 'Assessing...' : 'Assess Inherent'}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Residual Risk</CardTitle>
          <CardDescription>
            {residual.bandKey
              ? residual.bandKey + (residual.score != null ? ' · score ' + residual.score : '')
              : 'Not assessed'}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          <div>
            <Label htmlFor='residual-likelihood'>Likelihood</Label>
            <select
              id='residual-likelihood'
              value={residualLikelihood}
              disabled={!canAssess || pending}
              onChange={event => setResidualLikelihood(event.target.value)}
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
            >
              <option value=''>Select...</option>
              {likelihoodOptions.map(option => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor='residual-severity'>Severity</Label>
            <select
              id='residual-severity'
              value={residualSeverity}
              disabled={!canAssess || pending}
              onChange={event => setResidualSeverity(event.target.value)}
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
            >
              <option value=''>Select...</option>
              {severityOptions.map(option => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {canAssess ? (
            <Button onClick={assessResidual} disabled={pending || !residualLikelihood || !residualSeverity}>
              {pending ? 'Assessing...' : 'Assess Residual'}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export const RiskControlsPanel = ({
  riskId,
  canTreat,
  controls,
  controlTypeOptions
}: {
  riskId: string
  canTreat: boolean
  controls: Array<{
    id: string
    control_type: string
    title: string
    description: string | null
    effectiveness_notes: string | null
    is_active: boolean
  }>
  controlTypeOptions: Option[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [controlType, setControlType] = useState('administrative')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [effectivenessNotes, setEffectivenessNotes] = useState('')

  const addControl = () => {
    startTransition(async () => {
      const result = await addRiskControlAction({
        riskId,
        controlType,
        title,
        description,
        effectivenessNotes
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to add control.')
        return
      }
      toast('success', result.message)
      setTitle('')
      setDescription('')
      setEffectivenessNotes('')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Controls</CardTitle>
        <CardDescription>Hierarchy-of-controls entries for this risk.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {controls.length ? (
          controls.map(control => (
            <div key={control.id} className='border-b pb-3 last:border-b-0 last:pb-0'>
              <div className='font-medium'>{control.title}</div>
              <div className='text-textSecondary text-xs'>
                {controlTypeOptions.find(item => item.key === control.control_type)?.label ||
                  control.control_type}
                {control.is_active ? '' : ' · inactive'}
              </div>
              {control.description ? (
                <p className='text-textSecondary mt-1 text-sm'>{control.description}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className='text-textSecondary text-sm'>No controls recorded yet.</p>
        )}

        {canTreat ? (
          <div className='grid gap-3 border-t pt-4'>
            <div>
              <Label htmlFor='control-type'>Control Type</Label>
              <select
                id='control-type'
                value={controlType}
                disabled={pending}
                onChange={event => setControlType(event.target.value)}
                className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              >
                {controlTypeOptions.map(option => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor='control-title'>Title</Label>
              <Input
                id='control-title'
                className='mt-2'
                value={title}
                disabled={pending}
                onChange={event => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='control-description'>Description</Label>
              <Textarea
                id='control-description'
                className='mt-2'
                rows={3}
                value={description}
                disabled={pending}
                onChange={event => setDescription(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='control-effectiveness'>Effectiveness Notes</Label>
              <Textarea
                id='control-effectiveness'
                className='mt-2'
                rows={2}
                value={effectivenessNotes}
                disabled={pending}
                onChange={event => setEffectivenessNotes(event.target.value)}
              />
            </div>
            <Button onClick={addControl} disabled={pending || !title.trim()}>
              {pending ? 'Adding...' : 'Add Control'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export const RiskTreatmentsPanel = ({
  riskId,
  canTreat,
  treatments,
  treatmentStatusOptions,
  personnel
}: {
  riskId: string
  canTreat: boolean
  treatments: Array<{
    id: string
    treatment_status: string
    title: string
    description: string | null
    due_at: string | null
    notes: string | null
    ownerName: string | null
  }>
  treatmentStatusOptions: Option[]
  personnel: PersonOption[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [treatmentStatus, setTreatmentStatus] = useState('planned')
  const [ownerPersonnelId, setOwnerPersonnelId] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')

  const addTreatment = () => {
    startTransition(async () => {
      const result = await addRiskTreatmentAction({
        riskId,
        title,
        description,
        treatmentStatus,
        ownerPersonnelId: ownerPersonnelId || null,
        dueAt: dueAt || null,
        notes
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to add treatment.')
        return
      }
      toast('success', result.message)
      setTitle('')
      setDescription('')
      setNotes('')
      setDueAt('')
      setOwnerPersonnelId('')
      setTreatmentStatus('planned')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Treatments</CardTitle>
        <CardDescription>Planned and in-progress risk treatments.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {treatments.length ? (
          treatments.map(treatment => (
            <div key={treatment.id} className='border-b pb-3 last:border-b-0 last:pb-0'>
              <div className='font-medium'>{treatment.title}</div>
              <div className='text-textSecondary text-xs'>
                {treatmentStatusOptions.find(item => item.key === treatment.treatment_status)
                  ?.label || treatment.treatment_status}
                {treatment.ownerName ? ' · ' + treatment.ownerName : ''}
                {treatment.due_at ? ' · due ' + new Date(treatment.due_at).toLocaleString() : ''}
              </div>
              {treatment.description ? (
                <p className='text-textSecondary mt-1 text-sm'>{treatment.description}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className='text-textSecondary text-sm'>No treatments recorded yet.</p>
        )}

        {canTreat ? (
          <div className='grid gap-3 border-t pt-4'>
            <div>
              <Label htmlFor='treatment-title'>Title</Label>
              <Input
                id='treatment-title'
                className='mt-2'
                value={title}
                disabled={pending}
                onChange={event => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='treatment-status'>Status</Label>
              <select
                id='treatment-status'
                value={treatmentStatus}
                disabled={pending}
                onChange={event => setTreatmentStatus(event.target.value)}
                className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              >
                {treatmentStatusOptions.map(option => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor='treatment-owner'>Owner</Label>
              <select
                id='treatment-owner'
                value={ownerPersonnelId}
                disabled={pending}
                onChange={event => setOwnerPersonnelId(event.target.value)}
                className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              >
                <option value=''>Select...</option>
                {personnel.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor='treatment-due'>Due</Label>
              <Input
                id='treatment-due'
                type='datetime-local'
                className='mt-2'
                value={dueAt}
                disabled={pending}
                onChange={event => setDueAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='treatment-description'>Description</Label>
              <Textarea
                id='treatment-description'
                className='mt-2'
                rows={3}
                value={description}
                disabled={pending}
                onChange={event => setDescription(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='treatment-notes'>Notes</Label>
              <Textarea
                id='treatment-notes'
                className='mt-2'
                rows={2}
                value={notes}
                disabled={pending}
                onChange={event => setNotes(event.target.value)}
              />
            </div>
            <Button onClick={addTreatment} disabled={pending || !title.trim()}>
              {pending ? 'Adding...' : 'Add Treatment'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

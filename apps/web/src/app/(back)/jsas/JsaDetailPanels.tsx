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
import { toast } from '@repo/ui/utils/toast'
import {
  addControlAction,
  addHazardAction,
  addPpeItemAction,
  addStepAction,
  addTrainingRequirementAction,
  createExecutionAction,
  createJsaFromTemplateAction,
  createRevisionAction
} from './actions'

type Option = { key: string; label: string }
type PersonOption = { id: string; label: string }

type Step = {
  id: string
  step_number: number
  title: string
  description: string | null
}

type Hazard = {
  id: string
  step_id: string
  hazard_description: string
  category_key: string | null
  risk_score: number | null
  risk_band_key: string | null
  residual_score: number | null
  residual_band_key: string | null
}

type Control = {
  id: string
  hazard_id: string
  control_type: string
  title: string
  description: string | null
}

type Execution = {
  id: string
  execution_number: string
  status: string
  started_at: string | null
  leadName: string | null
}

type PpeItem = {
  id: string
  label: string
  required: boolean
}

type TrainingRequirement = {
  id: string
  training_course_id: string
  required: boolean
  courseTitle: string | null
}

type CourseOption = { id: string; label: string }

export const JsaStepsHazardsPanel = ({
  jsaId,
  canEdit,
  steps,
  hazards,
  controls,
  categoryOptions,
  controlTypeOptions,
  likelihoodOptions,
  severityOptions
}: {
  jsaId: string
  canEdit: boolean
  steps: Step[]
  hazards: Hazard[]
  controls: Control[]
  categoryOptions: Option[]
  controlTypeOptions: Option[]
  likelihoodOptions: Option[]
  severityOptions: Option[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [stepTitle, setStepTitle] = useState('')
  const [stepDescription, setStepDescription] = useState('')
  const [hazardStepId, setHazardStepId] = useState(steps[0]?.id || '')
  const [hazardDescription, setHazardDescription] = useState('')
  const [categoryKey, setCategoryKey] = useState('')
  const [likelihoodKey, setLikelihoodKey] = useState('')
  const [severityKey, setSeverityKey] = useState('')
  const [residualLikelihoodKey, setResidualLikelihoodKey] = useState('')
  const [residualSeverityKey, setResidualSeverityKey] = useState('')
  const [controlHazardId, setControlHazardId] = useState(hazards[0]?.id || '')
  const [controlType, setControlType] = useState('administrative')
  const [controlTitle, setControlTitle] = useState('')
  const [controlDescription, setControlDescription] = useState('')

  const addStep = () => {
    startTransition(async () => {
      const result = await addStepAction({
        jsaId,
        title: stepTitle,
        description: stepDescription
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to add step.')
        return
      }
      toast('success', result.message)
      setStepTitle('')
      setStepDescription('')
      router.refresh()
    })
  }

  const addHazard = () => {
    startTransition(async () => {
      const result = await addHazardAction({
        jsaId,
        stepId: hazardStepId,
        hazardDescription,
        categoryKey,
        likelihoodKey,
        severityKey,
        residualLikelihoodKey: residualLikelihoodKey || likelihoodKey,
        residualSeverityKey: residualSeverityKey || severityKey
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to add hazard.')
        return
      }
      toast('success', result.message)
      setHazardDescription('')
      setResidualLikelihoodKey('')
      setResidualSeverityKey('')
      router.refresh()
    })
  }

  const addControl = () => {
    startTransition(async () => {
      const result = await addControlAction({
        jsaId,
        hazardId: controlHazardId,
        controlType,
        title: controlTitle,
        description: controlDescription
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to add control.')
        return
      }
      toast('success', result.message)
      setControlTitle('')
      setControlDescription('')
      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-4'>
      <Card>
        <CardHeader>
          <CardTitle>Job steps</CardTitle>
          <CardDescription>Break the job into ordered steps for hazard analysis.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          {steps.length === 0 ? (
            <p className='text-textSecondary text-sm'>No steps yet.</p>
          ) : (
            <ul className='grid gap-3'>
              {steps.map(step => (
                <li key={step.id} className='rounded-md border p-3'>
                  <div className='font-medium'>
                    {step.step_number}. {step.title}
                  </div>
                  {step.description ? (
                    <p className='text-textSecondary mt-1 text-sm'>{step.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <div className='grid gap-3 border-t pt-4'>
              <div>
                <Label htmlFor='step-title'>Step title</Label>
                <Input
                  id='step-title'
                  className='mt-2'
                  value={stepTitle}
                  onChange={event => setStepTitle(event.target.value)}
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor='step-description'>Description</Label>
                <Textarea
                  id='step-description'
                  className='mt-2'
                  rows={2}
                  value={stepDescription}
                  onChange={event => setStepDescription(event.target.value)}
                  disabled={pending}
                />
              </div>
              <Button onClick={addStep} disabled={pending || !stepTitle.trim()}>
                {pending ? 'Adding...' : 'Add step'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hazards & controls</CardTitle>
          <CardDescription>
            Score hazards against the active risk matrix and attach hierarchy-of-controls mitigations.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          {hazards.length === 0 ? (
            <p className='text-textSecondary text-sm'>No hazards yet.</p>
          ) : (
            <ul className='grid gap-3'>
              {hazards.map(hazard => {
                const step = steps.find(item => item.id === hazard.step_id)
                const hazardControls = controls.filter(item => item.hazard_id === hazard.id)
                return (
                  <li key={hazard.id} className='rounded-md border p-3'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>{hazard.hazard_description}</span>
                      {hazard.risk_band_key ? (
                        <Badge variant='outline'>
                          Initial {hazard.risk_band_key}
                          {hazard.risk_score != null ? ' · ' + hazard.risk_score : ''}
                        </Badge>
                      ) : null}
                      {hazard.residual_band_key ? (
                        <Badge variant='outline'>
                          Residual {hazard.residual_band_key}
                          {hazard.residual_score != null ? ' · ' + hazard.residual_score : ''}
                        </Badge>
                      ) : null}
                    </div>
                    <p className='text-textSecondary mt-1 text-xs'>
                      Step {step?.step_number || '?'}: {step?.title || 'Unknown'}
                      {hazard.category_key ? ' · ' + hazard.category_key : ''}
                    </p>
                    {hazardControls.length ? (
                      <ul className='mt-2 grid gap-1 text-sm'>
                        {hazardControls.map(control => (
                          <li key={control.id}>
                            <span className='font-medium'>{control.control_type}</span>
                            {': '}
                            {control.title}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className='text-textSecondary mt-2 text-xs'>No controls yet.</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {canEdit ? (
            <div className='grid gap-6 border-t pt-4 lg:grid-cols-2'>
              <div className='grid gap-3'>
                <h3 className='font-semibold'>Add hazard</h3>
                <div>
                  <Label htmlFor='hazard-step'>Step</Label>
                  <select
                    id='hazard-step'
                    value={hazardStepId}
                    disabled={pending || !steps.length}
                    onChange={event => setHazardStepId(event.target.value)}
                    className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                  >
                    {steps.map(step => (
                      <option key={step.id} value={step.id}>
                        {step.step_number}. {step.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor='hazard-description'>Hazard description</Label>
                  <Textarea
                    id='hazard-description'
                    className='mt-2'
                    rows={2}
                    value={hazardDescription}
                    onChange={event => setHazardDescription(event.target.value)}
                    disabled={pending}
                  />
                </div>
                <div>
                  <Label htmlFor='hazard-category'>Category</Label>
                  <select
                    id='hazard-category'
                    value={categoryKey}
                    disabled={pending}
                    onChange={event => setCategoryKey(event.target.value)}
                    className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                  >
                    <option value=''>Select...</option>
                    {categoryOptions.map(option => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div>
                    <Label htmlFor='hazard-likelihood'>Initial likelihood</Label>
                    <select
                      id='hazard-likelihood'
                      value={likelihoodKey}
                      disabled={pending}
                      onChange={event => setLikelihoodKey(event.target.value)}
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
                    <Label htmlFor='hazard-severity'>Initial severity</Label>
                    <select
                      id='hazard-severity'
                      value={severityKey}
                      disabled={pending}
                      onChange={event => setSeverityKey(event.target.value)}
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
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div>
                    <Label htmlFor='hazard-residual-likelihood'>Residual likelihood</Label>
                    <select
                      id='hazard-residual-likelihood'
                      value={residualLikelihoodKey}
                      disabled={pending}
                      onChange={event => setResidualLikelihoodKey(event.target.value)}
                      className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                    >
                      <option value=''>Same as initial</option>
                      {likelihoodOptions.map(option => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor='hazard-residual-severity'>Residual severity</Label>
                    <select
                      id='hazard-residual-severity'
                      value={residualSeverityKey}
                      disabled={pending}
                      onChange={event => setResidualSeverityKey(event.target.value)}
                      className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                    >
                      <option value=''>Same as initial</option>
                      {severityOptions.map(option => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button
                  onClick={addHazard}
                  disabled={
                    pending || !hazardStepId || !hazardDescription.trim() || !likelihoodKey || !severityKey
                  }
                >
                  {pending ? 'Adding...' : 'Add hazard'}
                </Button>
              </div>

              <div className='grid gap-3'>
                <h3 className='font-semibold'>Add control</h3>
                <div>
                  <Label htmlFor='control-hazard'>Hazard</Label>
                  <select
                    id='control-hazard'
                    value={controlHazardId}
                    disabled={pending || !hazards.length}
                    onChange={event => setControlHazardId(event.target.value)}
                    className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                  >
                    {hazards.map(hazard => (
                      <option key={hazard.id} value={hazard.id}>
                        {hazard.hazard_description.slice(0, 80)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor='control-type'>Control type</Label>
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
                    value={controlTitle}
                    onChange={event => setControlTitle(event.target.value)}
                    disabled={pending}
                  />
                </div>
                <div>
                  <Label htmlFor='control-description'>Description</Label>
                  <Textarea
                    id='control-description'
                    className='mt-2'
                    rows={2}
                    value={controlDescription}
                    onChange={event => setControlDescription(event.target.value)}
                    disabled={pending}
                  />
                </div>
                <Button
                  onClick={addControl}
                  disabled={pending || !controlHazardId || !controlTitle.trim()}
                >
                  {pending ? 'Adding...' : 'Add control'}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export const JsaRequirementsPanel = ({
  jsaId,
  canEdit,
  ppeItems,
  trainingRequirements,
  trainingCourses
}: {
  jsaId: string
  canEdit: boolean
  ppeItems: PpeItem[]
  trainingRequirements: TrainingRequirement[]
  trainingCourses: CourseOption[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [ppeLabel, setPpeLabel] = useState('')
  const [courseId, setCourseId] = useState(trainingCourses[0]?.id || '')

  const addPpe = () => {
    startTransition(async () => {
      const result = await addPpeItemAction({ jsaId, label: ppeLabel, required: true })
      if (!result.ok) {
        toast('error', result.error || 'Unable to add PPE.')
        return
      }
      toast('success', result.message)
      setPpeLabel('')
      router.refresh()
    })
  }

  const addTraining = () => {
    startTransition(async () => {
      const result = await addTrainingRequirementAction({
        jsaId,
        trainingCourseId: courseId,
        required: true
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to add training requirement.')
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
          <CardTitle>PPE</CardTitle>
          <CardDescription>Required personal protective equipment for this JSA.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3'>
          {ppeItems.length ? (
            <ul className='grid gap-2 text-sm'>
              {ppeItems.map(item => (
                <li key={item.id} className='flex items-center justify-between gap-2'>
                  <span>{item.label}</span>
                  {item.required ? <Badge variant='outline'>Required</Badge> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No PPE items yet.</p>
          )}
          {canEdit ? (
            <div className='grid gap-2 border-t pt-3'>
              <Label htmlFor='ppe-label'>PPE item</Label>
              <Input
                id='ppe-label'
                value={ppeLabel}
                disabled={pending}
                onChange={event => setPpeLabel(event.target.value)}
                placeholder='Hard hat'
              />
              <Button onClick={addPpe} disabled={pending || !ppeLabel.trim()}>
                {pending ? 'Adding...' : 'Add PPE'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Training requirements</CardTitle>
          <CardDescription>
            Required courses. Missing completions show as advisory warnings on executions.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3'>
          {trainingRequirements.length ? (
            <ul className='grid gap-2 text-sm'>
              {trainingRequirements.map(item => (
                <li key={item.id} className='flex items-center justify-between gap-2'>
                  <span>{item.courseTitle || item.training_course_id}</span>
                  {item.required ? <Badge variant='outline'>Required</Badge> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No training requirements yet.</p>
          )}
          {canEdit ? (
            <div className='grid gap-2 border-t pt-3'>
              <Label htmlFor='training-course'>Training course</Label>
              <select
                id='training-course'
                value={courseId}
                disabled={pending || !trainingCourses.length}
                onChange={event => setCourseId(event.target.value)}
                className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3'
              >
                <option value=''>Select...</option>
                {trainingCourses.map(course => (
                  <option key={course.id} value={course.id}>
                    {course.label}
                  </option>
                ))}
              </select>
              <Button onClick={addTraining} disabled={pending || !courseId}>
                {pending ? 'Adding...' : 'Add training'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export const CreateJsaFromTemplateButton = ({
  jsaId,
  isTemplate,
  canCreate
}: {
  jsaId: string
  isTemplate: boolean
  canCreate: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (!isTemplate || !canCreate) return null

  return (
    <Button
      type='button'
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await createJsaFromTemplateAction(jsaId)
          if (!result.ok) {
            toast('error', result.error || 'Unable to create JSA from template.')
            return
          }
          toast('success', result.message)
          if (result.id) router.push('/jsas/' + result.id)
          else router.refresh()
        })
      }}
    >
      {pending ? 'Creating...' : 'Create JSA from template'}
    </Button>
  )
}

export const JsaActionsPanel = ({
  jsaId,
  canEdit,
  canExecute,
  executions,
  personnel,
  locations
}: {
  jsaId: string
  canEdit: boolean
  canExecute: boolean
  executions: Execution[]
  personnel: PersonOption[]
  locations: PersonOption[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [changeSummary, setChangeSummary] = useState('')
  const [leadPersonnelId, setLeadPersonnelId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [notes, setNotes] = useState('')

  const createRevision = () => {
    if (pending) return
    const key =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'rev-' + jsaId + '-' + Date.now()
    startTransition(async () => {
      const result = await createRevisionAction({
        jsaId,
        changeSummary,
        idempotencyKey: key
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to create revision.')
        return
      }
      toast('success', result.message)
      if (result.id) router.push('/jsas/' + result.id)
      else router.refresh()
    })
  }

  const startExecution = () => {
    startTransition(async () => {
      const result = await createExecutionAction({
        jsaId,
        locationId,
        leadPersonnelId,
        notes,
        participantPersonnelIds: leadPersonnelId ? [leadPersonnelId] : []
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to start execution.')
        return
      }
      toast('success', result.message)
      if (result.id) router.push('/jsas/' + jsaId + '/executions/' + result.id)
      else router.refresh()
    })
  }

  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle>Revisions</CardTitle>
          <CardDescription>Clone this JSA into a new draft version.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3'>
          {canEdit ? (
            <>
              <div>
                <Label htmlFor='revision-summary'>Change summary</Label>
                <Textarea
                  id='revision-summary'
                  className='mt-2'
                  rows={2}
                  value={changeSummary}
                  onChange={event => setChangeSummary(event.target.value)}
                  disabled={pending}
                />
              </div>
              <Button onClick={createRevision} disabled={pending}>
                {pending ? 'Creating...' : 'Create revision'}
              </Button>
            </>
          ) : (
            <p className='text-textSecondary text-sm'>You cannot create revisions.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Field executions</CardTitle>
          <CardDescription>Start a crew execution and capture acknowledgments.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3'>
          {executions.length ? (
            <ul className='grid gap-2 text-sm'>
              {executions.map(item => (
                <li key={item.id} className='flex flex-wrap items-center justify-between gap-2'>
                  <Link
                    href={'/jsas/' + jsaId + '/executions/' + item.id}
                    className='text-primary font-medium hover:underline'
                  >
                    {item.execution_number}
                  </Link>
                  <Badge variant='outline'>{item.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No executions yet.</p>
          )}

          {canExecute ? (
            <div className='grid gap-3 border-t pt-3'>
              <div>
                <Label htmlFor='execution-lead'>Lead</Label>
                <select
                  id='execution-lead'
                  value={leadPersonnelId}
                  disabled={pending}
                  onChange={event => setLeadPersonnelId(event.target.value)}
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
                <Label htmlFor='execution-location'>Location</Label>
                <select
                  id='execution-location'
                  value={locationId}
                  disabled={pending}
                  onChange={event => setLocationId(event.target.value)}
                  className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                >
                  <option value=''>Select...</option>
                  {locations.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor='execution-notes'>Notes</Label>
                <Textarea
                  id='execution-notes'
                  className='mt-2'
                  rows={2}
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  disabled={pending}
                />
              </div>
              <Button onClick={startExecution} disabled={pending}>
                {pending ? 'Starting...' : 'Start execution'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

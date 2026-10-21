'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import {
  addRestriction,
  addWorkStatusPeriod,
  endWorkStatusPeriod,
  liftRestriction,
  saveMedicalEncounter,
  saveWcCase,
  saveWeeklyUpdate,
  setWcCaseStatus,
  syncWcToOshaNow
} from '../actions'
import type { WcCaseValues, WcEncounterValues, WcRestrictionValues } from '../actions'
import { OSHA_CASE_OUTCOME_LABELS, OSHA_CASE_TYPE_LABELS } from '@/lib/forgeOshaRules'
import type { OshaCaseOutcome, OshaCaseType } from '@/lib/forgeOshaRules'
import {
  WC_LIFTING_OPTIONS,
  WC_LOWER_EXTREMITY_LABELS,
  WC_SEVERITIES,
  WC_SEVERITY_LABELS,
  WC_SIT_OPTIONS,
  WC_STAGES,
  WC_STAGE_LABELS,
  WC_STAND_WALK_OPTIONS,
  WC_UPPER_EXTREMITY_LABELS,
  WC_WORK_STATUSES,
  WC_WORK_STATUS_LABELS
} from '@/lib/forgeWorkersCompRules'

type Result = { error?: string; message?: string }

const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const useAction = () => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (action: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      after?.()
      router.refresh()
    })

  return { pending, run }
}

// ---------------------------------------------------------------------------
// Case overview, claim and OSHA linkage
// ---------------------------------------------------------------------------

export const WcCaseEditor = ({
  caseId,
  rowVersion,
  status,
  hasIncident,
  carriers,
  initialValues,
  canEdit,
  oshaCase
}: {
  caseId: string
  rowVersion: number
  status: string
  hasIncident: boolean
  carriers: Array<{ id: string; label: string }>
  initialValues: WcCaseValues
  canEdit: boolean
  oshaCase: { id: string; caseNumber: string; recordability: string; daysAway: number; restrictedDays: number } | null
}) => {
  const { pending, run } = useAction()
  const [values, setValues] = useState<WcCaseValues>(initialValues)
  const disabled = !canEdit || status === 'archived' || pending
  const set = <K extends keyof WcCaseValues>(key: K, value: WcCaseValues[K]) => setValues(current => ({ ...current, [key]: value }))

  const input = (key: keyof WcCaseValues, label: string, className = 'md:col-span-6', type = 'text') => (
    <div className={className}>
      <Label htmlFor={`wc-${key}`}>{label}</Label>
      <Input id={`wc-${key}`} type={type} className='mt-2' value={String(values[key] ?? '')} disabled={disabled} onChange={event => set(key, event.target.value as never)} />
    </div>
  )

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>Case</CardTitle>
          <CardDescription>Stage and severity drive the follow-up reminders on the dashboard.</CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          <div className='md:col-span-4'>
            <Label htmlFor='wc-stage'>Stage</Label>
            <select id='wc-stage' className={selectClass} value={values.stage} disabled={disabled || status !== 'active'} onChange={event => set('stage', event.target.value as WcCaseValues['stage'])}>
              {WC_STAGES.filter(stage => stage !== 'closed' || status === 'closed').map(stage => <option key={stage} value={stage}>{WC_STAGE_LABELS[stage]}</option>)}
            </select>
          </div>
          <div className='md:col-span-8'>
            <Label htmlFor='wc-severity'>Severity</Label>
            <select id='wc-severity' className={selectClass} value={values.severity || ''} disabled={disabled} onChange={event => set('severity', event.target.value as WcCaseValues['severity'])}>
              <option value=''>Not yet known</option>
              {WC_SEVERITIES.map(item => <option key={item} value={item}>{WC_SEVERITY_LABELS[item]}</option>)}
            </select>
          </div>
          {input('injury_date', 'Injury date', 'md:col-span-4', 'date')}
          {input('reported_date', 'Reported to employer', 'md:col-span-4', 'date')}
          {input('body_parts', 'Body parts affected', 'md:col-span-4')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claim</CardTitle>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          <div className='flex items-center gap-3 md:col-span-12'>
            <Switch id='wc-is_self_pay' checked={Boolean(values.is_self_pay)} disabled={disabled} onCheckedChange={checked => set('is_self_pay', checked)} />
            <Label htmlFor='wc-is_self_pay'>Self pay (no insurance claim)</Label>
          </div>
          {!values.is_self_pay ? (
            <>
              <div className='md:col-span-6'>
                <Label htmlFor='wc-carrier_id'>Carrier</Label>
                <select id='wc-carrier_id' className={selectClass} value={values.carrier_id} disabled={disabled} onChange={event => set('carrier_id', event.target.value)}>
                  <option value=''>Not set</option>
                  {carriers.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </div>
              {input('claim_number', 'Claim number')}
              {input('adjuster_name', 'Adjuster', 'md:col-span-4')}
              {input('adjuster_phone', 'Adjuster phone', 'md:col-span-4', 'tel')}
              {input('adjuster_email', 'Adjuster email', 'md:col-span-4', 'email')}
            </>
          ) : null}
          <div className='md:col-span-12'>
            <Label htmlFor='wc-claim_notes'>Claim notes</Label>
            <Textarea id='wc-claim_notes' className='mt-2' rows={3} value={String(values.claim_notes ?? '')} disabled={disabled} onChange={event => set('claim_notes', event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-up</CardTitle>
          <CardDescription>Before treatment, a follow-up set here replaces the automatic reminders.</CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {input('next_action_label', 'Next action', 'md:col-span-6')}
          {input('next_action_due', 'Due', 'md:col-span-3', 'date')}
          <div className='md:col-span-3'>
            <Label htmlFor='wc-next_action_priority'>Priority</Label>
            <select id='wc-next_action_priority' className={selectClass} value={values.next_action_priority || ''} disabled={disabled} onChange={event => set('next_action_priority', event.target.value as WcCaseValues['next_action_priority'])}>
              <option value=''>Medium</option>
              <option value='high'>High</option>
              <option value='low'>Low</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card data-testid='wc-osha-linkage'>
        <CardHeader>
          <CardTitle>OSHA Recordkeeping</CardTitle>
          <CardDescription>
            Marking the case recordable opens or updates its OSHA case. Days away and restricted days come from the work status periods (capped at 180).
          </CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          <div className='flex items-center gap-3 md:col-span-6'>
            <Switch id='wc-osha_recordable' checked={Boolean(values.osha_recordable)} disabled={disabled || !hasIncident} onCheckedChange={checked => set('osha_recordable', checked)} />
            <Label htmlFor='wc-osha_recordable'>OSHA recordable{!hasIncident ? ' (link an injury incident first)' : ''}</Label>
          </div>
          {values.osha_recordable ? (
            <>
              <div className='flex items-center gap-3 md:col-span-6'>
                <Switch id='wc-osha_privacy_case' checked={Boolean(values.osha_privacy_case)} disabled={disabled} onCheckedChange={checked => set('osha_privacy_case', checked)} />
                <Label htmlFor='wc-osha_privacy_case'>Privacy case</Label>
              </div>
              <div className='md:col-span-6'>
                <Label htmlFor='wc-osha_case_type'>Injury or illness type</Label>
                <select id='wc-osha_case_type' className={selectClass} value={values.osha_case_type || ''} disabled={disabled} onChange={event => set('osha_case_type', event.target.value as WcCaseValues['osha_case_type'])}>
                  <option value=''>(1) Injury (default)</option>
                  {(Object.keys(OSHA_CASE_TYPE_LABELS) as OshaCaseType[]).map(item => <option key={item} value={item}>{OSHA_CASE_TYPE_LABELS[item]}</option>)}
                </select>
              </div>
              <div className='md:col-span-6'>
                <Label htmlFor='wc-osha_case_outcome_override'>Outcome</Label>
                <select id='wc-osha_case_outcome_override' className={selectClass} value={values.osha_case_outcome_override || ''} disabled={disabled} onChange={event => set('osha_case_outcome_override', event.target.value as WcCaseValues['osha_case_outcome_override'])}>
                  <option value=''>Work it out from severity and days</option>
                  {(Object.keys(OSHA_CASE_OUTCOME_LABELS) as OshaCaseOutcome[]).map(item => <option key={item} value={item}>{OSHA_CASE_OUTCOME_LABELS[item]}</option>)}
                </select>
              </div>
            </>
          ) : null}
          {oshaCase ? (
            <div className='flex flex-wrap items-center gap-3 md:col-span-12' data-testid='wc-osha-linked'>
              <a className='text-primary font-semibold hover:underline' href={`/osha/cases/${oshaCase.id}`}>OSHA case {oshaCase.caseNumber}</a>
              <Badge size='sm' variant='secondary'>{oshaCase.recordability === 'recordable' ? 'Recordable' : oshaCase.recordability === 'not_recordable' ? 'Not recordable' : 'Pending'}</Badge>
              <span className='text-textSecondary text-sm'>{oshaCase.daysAway} days away · {oshaCase.restrictedDays} restricted on the log</span>
              {canEdit && status !== 'archived' ? (
                <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => syncWcToOshaNow({ caseId }))}>Update OSHA Log</Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canEdit && status !== 'archived' ? (
        <div className='flex flex-wrap gap-3'>
          <Button disabled={pending} onClick={() => run(() => saveWcCase({ caseId, rowVersion, values }))}>{pending ? 'Saving...' : 'Save Case'}</Button>
          {status === 'active' ? (
            <Button variant='outline' disabled={pending} onClick={() => window.confirm('Close this case? Any open work status period ends today.') && run(() => setWcCaseStatus({ caseId, rowVersion, action: 'close' }))}>Close Case</Button>
          ) : (
            <Button variant='outline' disabled={pending} onClick={() => run(() => setWcCaseStatus({ caseId, rowVersion, action: 'reopen' }))}>Reopen Case</Button>
          )}
          <Button variant='destructive' className='ms-auto' disabled={pending} onClick={() => window.confirm('Archive this case? It becomes read-only.') && run(() => setWcCaseStatus({ caseId, rowVersion, action: 'archive' }))}>Archive</Button>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Work status periods
// ---------------------------------------------------------------------------

export const WcWorkStatusPanel = ({
  caseId,
  periods,
  daysAway,
  restrictedDays,
  canEdit,
  today
}: {
  caseId: string
  periods: Array<{ id: string; work_status: string; start_date: string; end_date: string | null; notes: string | null; canChange: boolean }>
  daysAway: number
  restrictedDays: number
  canEdit: boolean
  today: string
}) => {
  const { pending, run } = useAction()
  const empty = { work_status: 'off_work' as const, start_date: today, end_date: '', notes: '' }
  const [form, setForm] = useState<{ work_status: (typeof WC_WORK_STATUSES)[number]; start_date: string; end_date: string; notes: string }>(empty)

  return (
    <Card data-testid='wc-work-status'>
      <CardHeader>
        <CardTitle>Work Status</CardTitle>
        <CardDescription>
          {daysAway} days away · {restrictedDays} days restricted (calendar days after the injury day, through today for open periods).
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {periods.length ? (
          <ul className='flex flex-col gap-2'>
            {periods.map(period => (
              <li key={period.id} className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
                <div>
                  <div className='font-semibold'>{WC_WORK_STATUS_LABELS[period.work_status as keyof typeof WC_WORK_STATUS_LABELS]}</div>
                  <div className='text-textSecondary text-sm'>{period.start_date} → {period.end_date || 'ongoing'}{period.notes ? ` · ${period.notes}` : ''}</div>
                </div>
                {canEdit && !period.end_date && period.canChange ? (
                  <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => endWorkStatusPeriod({ caseId, periodId: period.id, endDate: today }))}>End Today</Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className='text-textSecondary text-sm'>No work status recorded yet.</p>}

        {canEdit ? (
          <div className='grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-12'>
            <div className='md:col-span-4'>
              <Label htmlFor='wc-period-status'>New status</Label>
              <select id='wc-period-status' className={selectClass} value={form.work_status} disabled={pending} onChange={event => setForm(current => ({ ...current, work_status: event.target.value as typeof form.work_status }))}>
                {WC_WORK_STATUSES.map(item => <option key={item} value={item}>{WC_WORK_STATUS_LABELS[item]}</option>)}
              </select>
            </div>
            <div className='md:col-span-4'>
              <Label htmlFor='wc-period-start'>From</Label>
              <Input id='wc-period-start' type='date' className='mt-2' value={form.start_date} disabled={pending} onChange={event => setForm(current => ({ ...current, start_date: event.target.value }))} />
            </div>
            <div className='md:col-span-4'>
              <Label htmlFor='wc-period-end'>Through (optional)</Label>
              <Input id='wc-period-end' type='date' className='mt-2' value={form.end_date} disabled={pending} onChange={event => setForm(current => ({ ...current, end_date: event.target.value }))} />
            </div>
            <div className='md:col-span-9'>
              <Label htmlFor='wc-period-notes'>Notes</Label>
              <Input id='wc-period-notes' className='mt-2' value={form.notes} disabled={pending} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} />
            </div>
            <div className='flex items-end md:col-span-3'>
              <Button disabled={pending} onClick={() => run(() => addWorkStatusPeriod({ caseId, values: form }), () => setForm(empty))}>Record Status</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Restrictions
// ---------------------------------------------------------------------------

const emptyRestriction = (today: string): WcRestrictionValues => ({
  start_date: today,
  end_date: '',
  stand_walk_hours: '',
  sit_hours: '',
  lifting_level: '',
  upper_extremity: [],
  lower_extremity: [],
  push_pull_limit_lbs: '',
  transitional_hours_per_day: '',
  description: ''
})

export const WcRestrictionsPanel = ({
  caseId,
  restrictions,
  canEdit,
  today
}: {
  caseId: string
  restrictions: Array<{ id: string; status: string; start_date: string; end_date: string | null; summary: string[] }>
  canEdit: boolean
  today: string
}) => {
  const { pending, run } = useAction()
  const [form, setForm] = useState<WcRestrictionValues>(emptyRestriction(today))

  const toggle = (key: 'upper_extremity' | 'lower_extremity', value: string) =>
    setForm(current => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value]
    }))

  const optionSelect = (key: 'stand_walk_hours' | 'sit_hours' | 'lifting_level', label: string, options: readonly string[], suffix = '') => (
    <div className='md:col-span-4'>
      <Label htmlFor={`wc-r-${key}`}>{label}</Label>
      <select id={`wc-r-${key}`} className={selectClass} value={form[key] || ''} disabled={pending} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))}>
        <option value=''>No limit set</option>
        {options.map(option => <option key={option} value={option}>{option}{suffix}</option>)}
      </select>
    </div>
  )

  return (
    <Card data-testid='wc-restrictions'>
      <CardHeader>
        <CardTitle>Restrictions &amp; Accommodations</CardTitle>
        <CardDescription>Physician-ordered limits the supervisor must accommodate.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {restrictions.length ? (
          <ul className='flex flex-col gap-2'>
            {restrictions.map(item => (
              <li key={item.id} className='flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3'>
                <div>
                  <div className='font-semibold'>
                    {item.start_date} → {item.end_date || 'until lifted'}
                    <Badge size='sm' variant={item.status === 'active' ? 'tonalPrimary' : 'secondary'} className='ms-2'>{item.status === 'active' ? 'Active' : 'Lifted'}</Badge>
                  </div>
                  <div className='text-textSecondary text-sm'>{item.summary.join(' · ') || 'No details'}</div>
                </div>
                {canEdit && item.status === 'active' ? (
                  <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => liftRestriction({ caseId, restrictionId: item.id }))}>Lift</Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className='text-textSecondary text-sm'>No restrictions recorded.</p>}

        {canEdit ? (
          <div className='grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-12'>
            <div className='md:col-span-4'>
              <Label htmlFor='wc-r-start'>From</Label>
              <Input id='wc-r-start' type='date' className='mt-2' value={form.start_date} disabled={pending} onChange={event => setForm(current => ({ ...current, start_date: event.target.value }))} />
            </div>
            <div className='md:col-span-4'>
              <Label htmlFor='wc-r-end'>Through (optional)</Label>
              <Input id='wc-r-end' type='date' className='mt-2' value={form.end_date} disabled={pending} onChange={event => setForm(current => ({ ...current, end_date: event.target.value }))} />
            </div>
            <div className='md:col-span-4'>
              <Label htmlFor='wc-r-hours'>Transitional hours per day</Label>
              <select id='wc-r-hours' className={selectClass} value={form.transitional_hours_per_day} disabled={pending} onChange={event => setForm(current => ({ ...current, transitional_hours_per_day: event.target.value as WcRestrictionValues['transitional_hours_per_day'] }))}>
                <option value=''>Full shift</option>
                {['2', '4', '6', '8'].map(hours => <option key={hours} value={hours}>{hours} hours</option>)}
              </select>
            </div>
            {optionSelect('stand_walk_hours', 'Stand / walk (hours)', WC_STAND_WALK_OPTIONS)}
            {optionSelect('sit_hours', 'Sit (hours)', WC_SIT_OPTIONS)}
            {optionSelect('lifting_level', 'Lifting level', WC_LIFTING_OPTIONS)}
            <fieldset className='md:col-span-6'>
              <legend className='text-sm font-medium'>Upper extremity</legend>
              {Object.entries(WC_UPPER_EXTREMITY_LABELS).map(([key, label]) => (
                <label key={key} className='mt-2 flex items-center gap-2 text-sm'>
                  <input type='checkbox' checked={form.upper_extremity.includes(key)} disabled={pending} onChange={() => toggle('upper_extremity', key)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <fieldset className='md:col-span-6'>
              <legend className='text-sm font-medium'>Lower extremity</legend>
              {Object.entries(WC_LOWER_EXTREMITY_LABELS).map(([key, label]) => (
                <label key={key} className='mt-2 flex items-center gap-2 text-sm'>
                  <input type='checkbox' checked={form.lower_extremity.includes(key)} disabled={pending} onChange={() => toggle('lower_extremity', key)} />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className='md:col-span-4'>
              <Label htmlFor='wc-r-push'>Push / pull limit (lbs)</Label>
              <Input id='wc-r-push' inputMode='numeric' className='mt-2' value={form.push_pull_limit_lbs} disabled={pending} onChange={event => setForm(current => ({ ...current, push_pull_limit_lbs: event.target.value }))} />
            </div>
            <div className='md:col-span-8'>
              <Label htmlFor='wc-r-description'>Other restrictions</Label>
              <Input id='wc-r-description' className='mt-2' value={form.description} disabled={pending} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
            </div>
            <div className='md:col-span-12'>
              <Button disabled={pending} onClick={() => run(() => addRestriction({ caseId, values: form }), () => setForm(emptyRestriction(today)))}>Record Restrictions</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Medical encounters
// ---------------------------------------------------------------------------

const emptyEncounter = (today: string): WcEncounterValues => ({
  encounter_date: today,
  provider_name: '',
  provider_specialty: '',
  facility: '',
  symptoms: '',
  exam_findings: '',
  diagnosis: '',
  assessment: '',
  treatment: '',
  medication: '',
  notes: '',
  next_appointment_date: ''
})

export const WcMedicalPanel = ({
  caseId,
  encounters,
  canManage,
  today
}: {
  caseId: string
  encounters: Array<{ id: string; values: WcEncounterValues; canEdit: boolean }>
  canManage: boolean
  today: string
}) => {
  const { pending, run } = useAction()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<WcEncounterValues>(emptyEncounter(today))

  const field = (key: keyof WcEncounterValues, label: string, className = 'md:col-span-6', type = 'text') => (
    <div className={className}>
      <Label htmlFor={`wc-m-${key}`}>{label}</Label>
      <Input id={`wc-m-${key}`} type={type} className='mt-2' value={String(form[key] ?? '')} disabled={pending} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
    </div>
  )

  return (
    <Card data-testid='wc-medical'>
      <CardHeader>
        <CardTitle>Medical Visits</CardTitle>
        <CardDescription>Restricted medical information. Visible only with workers&apos; comp medical access; only the author can edit a visit.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {encounters.length ? (
          <ul className='flex flex-col gap-2'>
            {encounters.map(item => (
              <li key={item.id} className='rounded-lg border p-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='font-semibold'>{item.values.encounter_date} · {item.values.provider_name || 'Provider not recorded'}</div>
                  {canManage && item.canEdit ? (
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => { setEditingId(item.id); setForm(item.values) }}>Edit</Button>
                  ) : null}
                </div>
                {item.values.diagnosis ? <div className='text-sm'>Diagnosis: {item.values.diagnosis}</div> : null}
                {item.values.treatment ? <div className='text-textSecondary text-sm'>Treatment: {item.values.treatment}</div> : null}
                {item.values.next_appointment_date ? <div className='text-textSecondary text-sm'>Next appointment: {item.values.next_appointment_date}</div> : null}
              </li>
            ))}
          </ul>
        ) : <p className='text-textSecondary text-sm'>No medical visits recorded.</p>}

        {canManage ? (
          <div className='grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-12'>
            <div className='font-semibold md:col-span-12'>{editingId ? 'Edit visit' : 'Record a visit'}</div>
            {field('encounter_date', 'Visit date', 'md:col-span-4', 'date')}
            {field('provider_name', 'Provider', 'md:col-span-4')}
            {field('provider_specialty', 'Specialty', 'md:col-span-4')}
            {field('facility', 'Facility', 'md:col-span-6')}
            {field('next_appointment_date', 'Next appointment', 'md:col-span-6', 'date')}
            {(['symptoms', 'exam_findings', 'diagnosis', 'assessment', 'treatment', 'medication', 'notes'] as const).map(key => (
              <div key={key} className='md:col-span-6'>
                <Label htmlFor={`wc-m-${key}`} className='capitalize'>{key.replace('_', ' ')}</Label>
                <Textarea id={`wc-m-${key}`} className='mt-2' rows={2} value={String(form[key] ?? '')} disabled={pending} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
              </div>
            ))}
            <div className='flex gap-3 md:col-span-12'>
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () => saveMedicalEncounter({ caseId, encounterId: editingId || undefined, values: form }),
                    () => { setEditingId(null); setForm(emptyEncounter(today)) }
                  )
                }
              >
                {editingId ? 'Save Visit' : 'Record Visit'}
              </Button>
              {editingId ? <Button variant='tonalDefault' disabled={pending} onClick={() => { setEditingId(null); setForm(emptyEncounter(today)) }}>Cancel</Button> : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Weekly updates
// ---------------------------------------------------------------------------

export const WcWeeklyPanel = ({
  caseId,
  currentWeek,
  weekStatus,
  updates,
  canEdit
}: {
  caseId: string
  currentWeek: string
  weekStatus: 'complete' | 'due' | 'overdue'
  updates: Array<{ id: string; week_of: string; notes: string; canEdit: boolean }>
  canEdit: boolean
}) => {
  const { pending, run } = useAction()
  const current = updates.find(item => item.week_of === currentWeek)
  const [notes, setNotes] = useState(current?.notes || '')

  return (
    <Card data-testid='wc-weekly'>
      <CardHeader>
        <CardTitle>Weekly Updates</CardTitle>
        <CardDescription>
          One status note per open case each week, due Thursday. This week (Thursday {currentWeek}):{' '}
          <Badge size='sm' variant={weekStatus === 'complete' ? 'tonalSuccess' : weekStatus === 'overdue' ? 'destructive' : 'secondary'} data-testid='wc-week-status'>
            {weekStatus === 'complete' ? 'Complete' : weekStatus === 'overdue' ? 'Overdue' : 'Due'}
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {canEdit && (!current || current.canEdit) ? (
          <div className='flex flex-col gap-3'>
            <Label htmlFor='wc-weekly-notes'>Update for the week of {currentWeek}</Label>
            <Textarea id='wc-weekly-notes' rows={3} value={notes} disabled={pending} onChange={event => setNotes(event.target.value)} />
            <div><Button disabled={pending} onClick={() => run(() => saveWeeklyUpdate({ caseId, weekOf: currentWeek, notes }))}>Save Weekly Update</Button></div>
          </div>
        ) : null}
        {updates.length ? (
          <ul className='flex flex-col gap-2'>
            {updates.map(item => (
              <li key={item.id} className='rounded-lg border p-3'>
                <div className='font-semibold'>Week of {item.week_of}</div>
                <div className='text-textSecondary whitespace-pre-wrap text-sm'>{item.notes}</div>
              </li>
            ))}
          </ul>
        ) : <p className='text-textSecondary text-sm'>No weekly updates yet.</p>}
      </CardContent>
    </Card>
  )
}

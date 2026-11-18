'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { fillOshaCaseFromIncident, saveOshaCase, setOshaCaseStatus } from '../../actions'
import type { OshaCaseValues } from '../../actions'
import {
  OSHA_CASE_OUTCOMES,
  OSHA_CASE_OUTCOME_LABELS,
  OSHA_CASE_TYPES,
  OSHA_CASE_TYPE_LABELS,
  OSHA_DAY_CAP,
  OSHA_RECORDABILITY,
  OSHA_RECORDABILITY_LABELS
} from '@/lib/forgeOshaRules'

type Result = { error?: string; message?: string }

const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const OshaCaseEditor = ({
  caseId,
  rowVersion,
  status,
  hasIncident,
  initialValues,
  canEdit
}: {
  caseId: string
  rowVersion: number
  status: 'open' | 'closed' | 'voided'
  hasIncident: boolean
  initialValues: OshaCaseValues
  canEdit: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<OshaCaseValues>(initialValues)
  const disabled = !canEdit || status === 'voided' || pending
  const recordable = values.recordability === 'recordable'

  const set = <K extends keyof OshaCaseValues>(key: K, value: OshaCaseValues[K]) =>
    setValues(current => {
      const next = { ...current, [key]: value }

      if (key === 'recordability' && value !== 'recordable') {
        next.case_outcome = ''
        next.is_privacy_case = false
        next.date_of_death = ''
      }

      if (key === 'case_outcome' && value !== 'death') next.date_of_death = ''

      return next
    })

  const run = (action: () => Promise<Result>) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      router.refresh()
    })

  const textInput = (key: keyof OshaCaseValues, label: string, className = 'md:col-span-6', type = 'text') => (
    <div className={className}>
      <Label htmlFor={`osha-${key}`}>{label}</Label>
      <Input
        id={`osha-${key}`}
        type={type}
        className='mt-2'
        value={String(values[key] ?? '')}
        disabled={disabled}
        onChange={event => set(key, event.target.value as never)}
      />
    </div>
  )

  const textArea = (key: keyof OshaCaseValues, label: string, help?: string) => (
    <div className='md:col-span-12'>
      <Label htmlFor={`osha-${key}`}>{label}</Label>
      <Textarea
        id={`osha-${key}`}
        className='mt-2'
        rows={3}
        value={String(values[key] ?? '')}
        disabled={disabled}
        onChange={event => set(key, event.target.value as never)}
      />
      {help ? <p className='text-textSecondary mt-1 text-xs'>{help}</p> : null}
    </div>
  )

  const yesNo = (key: 'treated_in_er' | 'hospitalized_overnight', label: string) => (
    <div className='md:col-span-6'>
      <Label htmlFor={`osha-${key}`}>{label}</Label>
      <select
        id={`osha-${key}`}
        className={selectClass}
        value={values[key] === true ? 'yes' : values[key] === false ? 'no' : ''}
        disabled={disabled}
        onChange={event => set(key, event.target.value === 'yes' ? true : event.target.value === 'no' ? false : null)}
      >
        <option value=''>Not answered</option>
        <option value='yes'>Yes</option>
        <option value='no'>No</option>
      </select>
    </div>
  )

  const totalDays = Number(values.days_away || 0) + Number(values.restricted_days || 0)

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>Classification</CardTitle>
          <CardDescription>
            Recordable and privacy cases appear on the Form 300 log and the Form 300A summary. Choose the single most serious outcome.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          <div className='md:col-span-4'>
            <Label htmlFor='osha-recordability'>Recordability</Label>
            <select
              id='osha-recordability'
              className={selectClass}
              value={values.recordability}
              disabled={disabled}
              onChange={event => set('recordability', event.target.value as OshaCaseValues['recordability'])}
            >
              {OSHA_RECORDABILITY.map(item => <option key={item} value={item}>{OSHA_RECORDABILITY_LABELS[item]}</option>)}
            </select>
          </div>

          {recordable ? (
            <>
              <div className='md:col-span-4'>
                <Label htmlFor='osha-case_outcome'>Case outcome</Label>
                <select
                  id='osha-case_outcome'
                  className={selectClass}
                  value={values.case_outcome || ''}
                  disabled={disabled}
                  onChange={event => set('case_outcome', event.target.value as OshaCaseValues['case_outcome'])}
                >
                  <option value=''>Select...</option>
                  {OSHA_CASE_OUTCOMES.map(item => <option key={item} value={item}>{OSHA_CASE_OUTCOME_LABELS[item]}</option>)}
                </select>
              </div>
              <div className='md:col-span-4'>
                <Label htmlFor='osha-case_type'>Injury or illness type</Label>
                <select
                  id='osha-case_type'
                  className={selectClass}
                  value={values.case_type || ''}
                  disabled={disabled}
                  onChange={event => set('case_type', event.target.value as OshaCaseValues['case_type'])}
                >
                  <option value=''>Select...</option>
                  {OSHA_CASE_TYPES.map(item => <option key={item} value={item}>{OSHA_CASE_TYPE_LABELS[item]}</option>)}
                </select>
              </div>
              <div className='flex items-center gap-3 md:col-span-12'>
                <Switch
                  id='osha-is_privacy_case'
                  checked={Boolean(values.is_privacy_case)}
                  disabled={disabled}
                  onCheckedChange={checked => set('is_privacy_case', checked)}
                />
                <Label htmlFor='osha-is_privacy_case'>
                  Privacy case: the log shows &quot;Privacy Case&quot; instead of the employee&apos;s name (29 CFR 1904.29(b)(6)).
                </Label>
              </div>
            </>
          ) : null}

          {values.recordability === 'not_recordable' ? textArea('not_recordable_reason', 'Why this case is not recordable', 'Kept with the case for audit. Not shown on any OSHA form.') : null}

          {textInput('days_away', 'Days away from work (K)', 'md:col-span-4', 'number')}
          {textInput('restricted_days', 'Days on job transfer or restriction (L)', 'md:col-span-4', 'number')}
          <div className='text-textSecondary flex items-end text-sm md:col-span-4'>
            {totalDays} of {OSHA_DAY_CAP} countable days used.
          </div>
          {recordable && values.case_outcome === 'death' ? textInput('date_of_death', 'Date of death', 'md:col-span-4', 'date') : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form 300 Log Entry</CardTitle>
          <CardDescription>Columns B to F of the log.</CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {textInput('employee_name', 'Employee name (B)')}
          {textInput('job_title', 'Job title (C)')}
          {textInput('injury_date', 'Date of injury or onset of illness (D)', 'md:col-span-4', 'date')}
          {textInput('event_location', 'Where the event occurred (E)', 'md:col-span-8')}
          {textArea('injury_description', 'Describe the injury or illness, parts of body affected, and object or substance (F)')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form 301: Employee</CardTitle>
          <CardDescription>Filled from the personnel record when the case was opened.</CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {textInput('employee_street', 'Street', 'md:col-span-12')}
          {textInput('employee_city', 'City', 'md:col-span-5')}
          {textInput('employee_state', 'State', 'md:col-span-3')}
          {textInput('employee_zip', 'ZIP', 'md:col-span-4')}
          {textInput('employee_date_of_birth', 'Date of birth', 'md:col-span-4', 'date')}
          {textInput('employee_date_hired', 'Date hired', 'md:col-span-4', 'date')}
          <div className='md:col-span-4'>
            <Label htmlFor='osha-employee_sex'>Sex</Label>
            <select
              id='osha-employee_sex'
              className={selectClass}
              value={values.employee_sex || ''}
              disabled={disabled}
              onChange={event => set('employee_sex', event.target.value as OshaCaseValues['employee_sex'])}
            >
              <option value=''>Not recorded</option>
              <option value='male'>Male</option>
              <option value='female'>Female</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form 301: Health Care Professional</CardTitle>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {textInput('physician_name', 'Physician or other health care professional')}
          {textInput('treatment_facility', 'Facility (if treated away from the worksite)')}
          {textInput('treatment_street', 'Street', 'md:col-span-12')}
          {textInput('treatment_city', 'City', 'md:col-span-5')}
          {textInput('treatment_state', 'State', 'md:col-span-3')}
          {textInput('treatment_zip', 'ZIP', 'md:col-span-4')}
          {yesNo('treated_in_er', 'Treated in an emergency room?')}
          {yesNo('hospitalized_overnight', 'Hospitalized overnight as an in-patient?')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form 301: Case Details</CardTitle>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {textInput('time_began_work', 'Time employee began work', 'md:col-span-4', 'time')}
          {textInput('time_of_event', 'Time of event', 'md:col-span-4', 'time')}
          <div className='flex items-end gap-3 pb-2 md:col-span-4'>
            <Switch
              id='osha-time_cannot_be_determined'
              checked={Boolean(values.time_cannot_be_determined)}
              disabled={disabled}
              onCheckedChange={checked => set('time_cannot_be_determined', checked)}
            />
            <Label htmlFor='osha-time_cannot_be_determined'>Time cannot be determined</Label>
          </div>
          {textArea('activity_before', 'What was the employee doing just before the incident occurred?')}
          {textArea('what_happened', 'What happened?')}
          {textArea('injury_or_illness', 'What was the injury or illness?')}
          {textArea('object_or_substance', 'What object or substance directly harmed the employee?')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form 301: Completed By</CardTitle>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {textInput('completed_by_name', 'Completed by')}
          {textInput('completed_by_title', 'Title')}
          {textInput('completed_by_phone', 'Phone', 'md:col-span-6', 'tel')}
          {textInput('completed_date', 'Date', 'md:col-span-6', 'date')}
        </CardContent>
      </Card>

      <div className='flex flex-wrap items-center gap-3'>
        {canEdit && status !== 'voided' ? (
          <>
            <Button disabled={pending} onClick={() => run(() => saveOshaCase({ caseId, rowVersion, values }))}>
              {pending ? 'Saving...' : 'Save Case'}
            </Button>
            {hasIncident ? (
              <Button variant='outline' disabled={pending} onClick={() => run(() => fillOshaCaseFromIncident({ caseId, rowVersion }))}>
                Fill Blanks from Incident
              </Button>
            ) : null}
            {status === 'open' ? (
              <Button variant='outline' disabled={pending} onClick={() => run(() => setOshaCaseStatus({ caseId, rowVersion, action: 'close' }))}>
                Close Case
              </Button>
            ) : (
              <Button variant='outline' disabled={pending} onClick={() => run(() => setOshaCaseStatus({ caseId, rowVersion, action: 'reopen' }))}>
                Reopen Case
              </Button>
            )}
            <Button
              variant='destructive'
              className='ms-auto'
              disabled={pending}
              onClick={() => {
                const reason = window.prompt('Why is this case being voided? Voided cases leave the log but stay in history.')

                if (reason) run(() => setOshaCaseStatus({ caseId, rowVersion, action: 'void', reason }))
              }}
            >
              Void Case
            </Button>
          </>
        ) : null}
        <Button variant='tonalDefault' asChild><Link href={`/osha/cases/${caseId}/form-301`}>Form 301</Link></Button>
        <Button variant='tonalDefault' asChild><Link href='/osha'>Back to OSHA</Link></Button>
      </div>
    </div>
  )
}

export default OshaCaseEditor

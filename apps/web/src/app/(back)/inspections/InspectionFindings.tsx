'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { closeInspectionFinding, updateInspectionFinding } from './actions'

type Finding = {
  id: string
  title: string
  description: string | null
  severity: string
  status: string
  due_date: string | null
  corrective_action: string | null
  verification_notes: string | null
}

const InspectionFindings = ({
  findings,
  editable,
  canClose,
  severityLabels,
  statusLabels
}: {
  findings: Finding[]
  editable: boolean
  canClose: boolean
  severityLabels: Record<string, string>
  statusLabels: Record<string, string>
}) => {
  const [pending, startTransition] = useTransition()
  const [drafts, setDrafts] = useState<Record<string, { correctiveAction: string; status: 'open' | 'in_progress' | 'pending_verification'; dueDate: string; verification: string }>>(
    Object.fromEntries(findings.map(finding => [
      finding.id,
      {
        correctiveAction: finding.corrective_action || '',
        status: ['open','in_progress','pending_verification'].includes(finding.status)
          ? finding.status as 'open' | 'in_progress' | 'pending_verification'
          : 'open',
        dueDate: finding.due_date || '',
        verification: finding.verification_notes || ''
      }
    ]))
  )

  const save = (finding: Finding) => {
    const draft = drafts[finding.id]
    startTransition(async () => {
      const result = await updateInspectionFinding({
        findingId: finding.id,
        correctiveAction: draft.correctiveAction,
        status: draft.status,
        dueDate: draft.dueDate || null
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to update finding.')
        return
      }
      toast('success', result.message)
      window.location.reload()
    })
  }

  const close = (finding: Finding) => {
    const draft = drafts[finding.id]
    startTransition(async () => {
      const result = await closeInspectionFinding({
        findingId: finding.id,
        verificationNotes: draft.verification
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to close finding.')
        return
      }
      toast('success', result.message)
      window.location.reload()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Findings & Corrective Actions</CardTitle>
        <CardDescription>Track deficiencies through correction and verification.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {findings.length ? findings.map(finding => {
          const draft = drafts[finding.id]
          const closed = finding.status === 'closed' || finding.status === 'canceled'

          return (
            <div key={finding.id} className='rounded-lg border p-4'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <div className='font-semibold'>{finding.title}</div>
                  {finding.description ? <p className='text-textSecondary mt-1 text-sm'>{finding.description}</p> : null}
                </div>
                <div className='flex gap-2'>
                  <Badge size='sm' variant={finding.severity === 'critical' || finding.severity === 'high' ? 'destructive' : 'secondary'}>
                    {severityLabels[finding.severity] || finding.severity}
                  </Badge>
                  <Badge size='sm' variant={closed ? 'tonalSuccess' : 'outline'}>{statusLabels[finding.status] || finding.status}</Badge>
                </div>
              </div>

              {!closed ? (
                <div className='mt-4 grid gap-4 md:grid-cols-2'>
                  <div className='md:col-span-2'>
                    <Label>Corrective Action</Label>
                    <Textarea
                      className='mt-2'
                      rows={2}
                      disabled={!editable || pending}
                      value={draft.correctiveAction}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [finding.id]: { ...current[finding.id], correctiveAction: event.target.value }
                      }))}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select
                      className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
                      disabled={!editable || pending}
                      value={draft.status}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [finding.id]: { ...current[finding.id], status: event.target.value as any }
                      }))}
                    >
                      <option value='open'>Open</option>
                      <option value='in_progress'>In Progress</option>
                      <option value='pending_verification'>Pending Verification</option>
                    </select>
                  </div>
                  <div>
                    <Label>Due Date</Label>
                    <Input
                      className='mt-2'
                      type='date'
                      disabled={!editable || pending}
                      value={draft.dueDate}
                      onChange={event => setDrafts(current => ({
                        ...current,
                        [finding.id]: { ...current[finding.id], dueDate: event.target.value }
                      }))}
                    />
                  </div>
                  {editable ? <Button variant='outline' onClick={() => save(finding)} disabled={pending}>Save Corrective Action</Button> : null}
                  {canClose ? (
                    <div className='md:col-span-2 rounded-lg border p-3'>
                      <Label>Verification Notes</Label>
                      <Textarea
                        className='mt-2'
                        rows={2}
                        value={draft.verification}
                        onChange={event => setDrafts(current => ({
                          ...current,
                          [finding.id]: { ...current[finding.id], verification: event.target.value }
                        }))}
                      />
                      <Button className='mt-3' onClick={() => close(finding)} disabled={pending}>Verify & Close Finding</Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className='text-textSecondary mt-3 text-sm'>Verification: {finding.verification_notes || 'No verification notes recorded.'}</div>
              )}
            </div>
          )
        }) : (
          <div className='text-textSecondary rounded-lg border p-6 text-center'>No findings have been recorded.</div>
        )}
      </CardContent>
    </Card>
  )
}

export default InspectionFindings

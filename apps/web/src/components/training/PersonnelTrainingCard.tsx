import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import CompletionFiles from '@/components/training/CompletionFiles'
import TrainingRecordManage from '@/components/training/TrainingRecordManage'
import { TRAINING_SOURCE_LABELS, getPersonTrainingHistory } from '@/lib/forgeTrainingReports'

const usDate = (iso: string | null) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '—')

const STATUS: Record<string, { label: string; className: string }> = {
  current: { label: 'Current', className: 'text-success' },
  expiring: { label: 'Expiring', className: 'text-warning font-semibold' },
  expired: { label: 'Expired', className: 'text-destructive font-semibold' },
  not_required: { label: 'Current', className: 'text-success' },
  superseded: { label: 'Replaced', className: 'text-textSecondary' },
  pending: { label: 'Awaiting approval', className: 'text-textSecondary' },
  rejected: { label: 'Rejected', className: 'text-destructive' }
}

/**
 * 1.0 personnel training history on the person's profile: open assignments and every training record with
 * its status (current / expiring / expired), how it was taken, and attached certificates.
 */
const PersonnelTrainingCard = async ({ organizationId, personnelId, canAttach }: { organizationId: string; personnelId: string; canAttach: boolean }) => {
  const { open, records } = await getPersonTrainingHistory(organizationId, personnelId)

  return (
    <Card data-testid='personnel-training'>
      <CardHeader>
        <CardTitle>Training</CardTitle>
        <CardDescription>
          {open.length} open · {records.length} record{records.length === 1 ? '' : 's'}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4 text-sm'>
        {open.length ? (
          <div>
            <div className='mb-1 font-medium'>Open assignments</div>
            <ul className='flex flex-col divide-y'>
              {open.map((row: any) => (
                <li key={row.id} className='flex flex-wrap justify-between gap-2 py-1.5'>
                  <span>
                    {row.courseTitle}
                    {row.status === 'in_progress' ? <span className='text-textSecondary'> (started)</span> : null}
                  </span>
                  <span className={row.late ? 'text-destructive' : 'text-textSecondary'}>{row.due_date ? (row.late ? 'Overdue, was due ' : 'Due ') + usDate(row.due_date) : 'No due date'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <div className='mb-1 font-medium'>Records</div>
          {records.length ? (
            <ul className='flex flex-col divide-y'>
              {records.map((row: any) => {
                const status = STATUS[row.status] || { label: row.status, className: 'text-textSecondary' }

                return (
                  <li key={row.id} className='flex flex-col gap-1 py-2' data-personnel-training={row.courseTitle}>
                    <div className='flex flex-wrap justify-between gap-2'>
                      <span className='font-medium'>{row.courseTitle}</span>
                      <span className={status.className}>
                        {status.label}
                        {row.expires_at && ['current', 'expiring', 'expired'].includes(row.status) ? ` · expires ${usDate(row.expires_at)}` : ''}
                      </span>
                    </div>
                    <div className='text-textSecondary flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
                      <span>{usDate(String(row.completed_at).slice(0, 10))}</span>
                      <span className='capitalize'>{row.result}</span>
                      {row.score !== null && row.score !== undefined ? <span>{Number(row.score)}%</span> : null}
                      <span>{TRAINING_SOURCE_LABELS[row.source] || row.source}</span>
                      {row.certificate_number && row.approval_status === 'approved' ? (
                        <Link className='text-primary hover:underline' href={'/training/certificates/' + row.id}>
                          {row.certificate_number}
                        </Link>
                      ) : null}
                      <CompletionFiles completionId={row.id} files={row.files} canEdit={canAttach} label={row.courseTitle} />
                      {/* Record Completion in this person's scope (the same check as attaching) edits or archives the record. */}
                      {canAttach ? <TrainingRecordManage record={{ ...row, label: row.courseTitle }} /> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className='text-textSecondary'>No training records yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default PersonnelTrainingCard

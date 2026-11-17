import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import ArchiveSubmissionButton from './ArchiveSubmissionButton'
import FormRenderer from '@/components/forms/FormRenderer'
import { FormSignaturePanel } from '@/components/forms/FormSignaturePanel'
import { formSubmissionWithinScope, loadFormSubmission } from '@/lib/forgeFormAccess'
import type { FormSubmissionStatus } from '@/lib/forgeFormRules'
import { FORM_SUBMISSION_STATUS_LABELS } from '@/lib/forgeFormRules'
import { allowedPermission, canArchiveFormSubmission, canEditFormSubmission } from '@/lib/forgeFormSubmissions'
import { getUserNames } from '@/lib/forgeLoto'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Form Submission' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const statusVariant = (status: string) =>
  status === 'submitted' ? 'tonalSuccess' : status === 'pending_signature' ? 'secondary' : status === 'archived' ? 'outline' : 'tonalPrimary'

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Card>
    <CardHeader className='pb-2'>
      <CardDescription>{label}</CardDescription>
    </CardHeader>
    <CardContent>
      <div className='font-semibold'>{children}</div>
    </CardContent>
  </Card>
)

const FormSubmissionDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('forms.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const userId = context.user.id

  if (!UUID.test(id)) notFound()

  const loaded = await loadFormSubmission({ organizationId, submissionId: id })

  if (!loaded) notFound()

  const { submission, version } = loaded

  if (!(await formSubmissionWithinScope({ organizationId, userId, scope: context.permission.scope ?? null, submission }))) notFound()

  const supabase = createServiceRoleClient() as any

  const [canEdit, canArchive, { data: subject }, { data: location }, { data: division }, { data: activity }] = await Promise.all([
    canEditFormSubmission({ organizationId, userId, access: context.access, submission }),
    canArchiveFormSubmission({ organizationId, userId, access: context.access, submission }),
    submission.subject_personnel_id
      ? supabase.from('forge_personnel').select('id, first_name, last_name, employee_number').eq('organization_id', organizationId).eq('id', submission.subject_personnel_id).maybeSingle()
      : Promise.resolve({ data: null }),
    submission.location_id ? supabase.from('locations').select('name').eq('id', submission.location_id).maybeSingle() : Promise.resolve({ data: null }),
    submission.division_id ? supabase.from('divisions').select('name').eq('id', submission.division_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase
      .from('forge_form_submission_activity')
      .select('id, activity_type, message, actor_user_id, created_at')
      .eq('organization_id', organizationId)
      .eq('submission_id', submission.id)
      .order('created_at', { ascending: false })
      .limit(200)
  ])

  const names = await getUserNames({
    organizationId,
    userIds: [submission.submitted_by, submission.created_by, ...((activity || []) as any[]).map(item => item.actor_user_id)]
  })

  const canViewPersonnel = Boolean(allowedPermission(context.access, 'personnel.view'))
  const canPrint = Boolean(allowedPermission(context.access, 'forms.export'))
  const status = submission.status as FormSubmissionStatus
  const subjectName = subject ? `${subject.first_name} ${subject.last_name}`.trim() : null

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} /{' '}
            <Link href='/forms/submissions' className='hover:underline'>
              Form Submissions
            </Link>
          </p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold' data-submission-number>
              {submission.submission_number}
            </h1>
            <Badge size='sm' variant={statusVariant(status)} data-submission-status={status}>
              {FORM_SUBMISSION_STATUS_LABELS[status] || status}
            </Badge>
          </div>
          <p className='text-textSecondary mt-2'>
            {submission.title} · {version.title} version {version.version}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {canEdit ? (
            <Button asChild>
              <Link href={`/forms/submissions/${submission.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {canPrint ? (
            <Button variant='outline' asChild>
              <Link href={`/forms/submissions/${submission.id}/print`}>Print</Link>
            </Button>
          ) : null}
          {canArchive ? <ArchiveSubmissionButton submissionId={submission.id} /> : null}
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Fact label='Subject'>
          {subject ? (
            canViewPersonnel ? (
              <Link href={`/personnel/${subject.id}`} className='text-primary hover:underline' data-submission-subject>
                {subjectName}
              </Link>
            ) : (
              <span data-submission-subject>{subjectName}</span>
            )
          ) : (
            '—'
          )}
          {subject?.employee_number ? <div className='text-textSecondary text-xs font-normal'>Employee {subject.employee_number}</div> : null}
        </Fact>
        <Fact label='Location / division'>{[location?.name, division?.name].filter(Boolean).join(' · ') || '—'}</Fact>
        <Fact label='Submitted'>
          {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : 'Not submitted'}
          {submission.submitted_by ? <div className='text-textSecondary text-xs font-normal'>by {names[submission.submitted_by] || 'unknown'}</div> : null}
        </Fact>
        <Fact label='Last updated'>{new Date(submission.updated_at).toLocaleString()}</Fact>
      </div>

      {submission.archived_at ? (
        <Card>
          <CardHeader>
            <CardTitle>Archived submission</CardTitle>
            <CardDescription>{new Date(submission.archived_at).toLocaleString()}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {/* Signing slot: supervisor / EHS Director signatures and sign links (built separately). */}
      <FormSignaturePanel submissionId={submission.id} />

      <Card>
        <CardHeader>
          <CardTitle>Answers</CardTitle>
        </CardHeader>
        <CardContent>
          <FormRenderer schema={version.schema} answers={(submission.answers || {}) as Record<string, unknown>} readOnly />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-3' data-submission-activity>
          {(activity || []).length ? (
            (activity as any[]).map(item => (
              <div key={item.id} className='rounded-lg border p-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='font-medium capitalize'>{String(item.activity_type).replaceAll('_', ' ')}</div>
                  <div className='text-textSecondary text-xs'>
                    {item.actor_user_id ? `${names[item.actor_user_id] || 'User'} · ` : ''}
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
                {item.message ? <div className='text-textSecondary mt-1 text-sm'>{item.message}</div> : null}
              </div>
            ))
          ) : (
            <div className='text-textSecondary text-sm'>No activity recorded yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default FormSubmissionDetailPage

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'

import FormSubmissionEditor from '@/components/forms/FormSubmissionEditor'
import { loadFormSubmission } from '@/lib/forgeFormAccess'
import type { FormSubmissionStatus } from '@/lib/forgeFormRules'
import { FORM_SUBMISSION_STATUS_LABELS } from '@/lib/forgeFormRules'
import { allowedPermission, canEditFormSubmission, formPlacementOptions } from '@/lib/forgeFormSubmissions'
import { getUserNames } from '@/lib/forgeLoto'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'

export const metadata: Metadata = { title: 'Edit Form Submission' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const EditFormSubmissionPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) redirect('/dashboard')

  const { id } = await params
  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })

  if (!UUID.test(id)) notFound()

  const loaded = await loadFormSubmission({ organizationId, submissionId: id })

  if (!loaded) notFound()

  const { submission, version } = loaded

  if (!(await canEditFormSubmission({ organizationId, userId: context.user.id, access, submission }))) notFound()

  const placementPermission = allowedPermission(access, 'forms.edit') || allowedPermission(access, 'forms.submit')

  const [placement, names] = await Promise.all([
    formPlacementOptions({ organizationId, userId: context.user.id, scope: placementPermission?.scope ?? null }),
    getUserNames({ organizationId, userIds: [context.user.id] })
  ])

  // Keep the current location / division selectable even when it is outside the editor's own assignments.
  const withCurrent = (options: { id: string; label: string }[], currentId: string | null, label: string) =>
    currentId && !options.some(option => option.id === currentId) ? [{ id: currentId, label }, ...options] : options

  const status = submission.status as FormSubmissionStatus

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forms</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>Edit {submission.submission_number}</h1>
            <Badge size='sm' variant={status === 'submitted' ? 'tonalSuccess' : status === 'pending_signature' ? 'secondary' : 'outline'}>
              {FORM_SUBMISSION_STATUS_LABELS[status] || status}
            </Badge>
          </div>
          <p className='text-textSecondary mt-2'>
            {version.title} · version {version.version}
          </p>
        </div>
        <Button variant='outline' asChild>
          <Link href={`/forms/submissions/${submission.id}`}>View submission</Link>
        </Button>
      </div>

      <FormSubmissionEditor
        submissionId={submission.id}
        isNew={false}
        schema={version.schema}
        initialAnswers={(submission.answers || {}) as Record<string, unknown>}
        status={status}
        rowVersion={Number(submission.row_version)}
        locations={withCurrent(placement.locations, submission.location_id, 'Current location')}
        divisions={withCurrent(placement.divisions, submission.division_id, 'Current division')}
        initialLocationId={submission.location_id}
        initialDivisionId={submission.division_id}
        defaultSignerName={names[context.user.id] || context.user.email || ''}
      />
    </div>
  )
}

export default EditFormSubmissionPage

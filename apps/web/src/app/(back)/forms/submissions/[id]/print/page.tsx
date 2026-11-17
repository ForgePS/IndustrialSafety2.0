import { notFound } from 'next/navigation'

import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'

import FormPrintSheet from '@/components/forms/FormPrintSheet'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { formSubmissionWithinScope, loadFormSubmission } from '@/lib/forgeFormAccess'
import type { FormSubmissionStatus } from '@/lib/forgeFormRules'
import { FORM_SUBMISSION_STATUS_LABELS } from '@/lib/forgeFormRules'
import { getUserNames } from '@/lib/forgeLoto'
import { getTenantContext } from '@/lib/forgeTenantContext'

export const metadata: Metadata = { title: 'Print Form Submission' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : ''

/**
 * Port slice 9: a filled form submission for printing (1.0 GET /industrial/form-submissions/:id/printable).
 * Needs forms.export, and the submission must be within the forms.view scope; otherwise 404.
 */
const FormSubmissionPrintPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) notFound()

  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const access = await getEffectiveTenantAccess({ organizationId, userId })
  const exportPermission = access.effective.find(item => item.permissionKey === 'forms.export')
  const viewPermission = access.effective.find(item => item.permissionKey === 'forms.view')

  if (!exportPermission?.allowed || !viewPermission?.allowed) notFound()

  const { id } = await params

  if (!UUID.test(id)) notFound()

  const loaded = await loadFormSubmission({ organizationId, submissionId: id })

  if (!loaded) notFound()

  const { submission, template, version } = loaded

  if (!(await formSubmissionWithinScope({ organizationId, userId, scope: viewPermission.scope ?? null, submission }))) notFound()

  const supabase = createServiceRoleClient() as any

  const [{ data: subject }, { data: location }, { data: division }, names] = await Promise.all([
    submission.subject_personnel_id
      ? supabase
          .from('forge_personnel')
          .select('first_name, last_name, employee_number')
          .eq('organization_id', organizationId)
          .eq('id', submission.subject_personnel_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    submission.location_id
      ? supabase.from('locations').select('name').eq('organization_id', organizationId).eq('id', submission.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
    submission.division_id
      ? supabase.from('divisions').select('name').eq('organization_id', organizationId).eq('id', submission.division_id).maybeSingle()
      : Promise.resolve({ data: null }),
    getUserNames({ organizationId, userIds: [submission.submitted_by] })
  ])

  const status = (submission.status as FormSubmissionStatus) || 'draft'
  const subjectName = subject ? `${subject.first_name} ${subject.last_name}`.trim() + (subject.employee_number ? ` (#${subject.employee_number})` : '') : ''

  const submittedBy =
    (submission.submitted_by && names[submission.submitted_by]) || (submission.source_system === 'forge_1x' ? 'Imported from Forge 1.0' : '')

  return (
    <FormPrintSheet
      mode='filled'
      answers={submission.answers && typeof submission.answers === 'object' ? submission.answers : {}}
      companyName={context.activeOrganization.name}
      title={version.title || template.title}
      subtitle={version.id ? `Version ${version.version}` : 'Draft form (not published)'}
      fields={version.schema.fields}
      meta={[
        { label: 'Submission', value: submission.submission_number },
        { label: 'Status', value: FORM_SUBMISSION_STATUS_LABELS[status] || status },
        { label: 'Subject', value: subjectName },
        { label: 'Location', value: [location?.name, division?.name].filter(Boolean).join(' · ') },
        { label: 'Submitted by', value: submittedBy },
        { label: 'Submitted', value: formatDateTime(submission.submitted_at) }
      ]}
      footer={`${context.activeOrganization.name} · ${submission.submission_number}`}
      backHref={`/forms/submissions/${submission.id}`}
      backLabel='Back to submission'
    />
  )
}

export default FormSubmissionPrintPage

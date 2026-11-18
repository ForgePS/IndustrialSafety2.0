import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import CorrectiveActionControls from '../CorrectiveActionControls'
import CorrectiveActionRecordForm from '../CorrectiveActionRecordForm'
import type { CorrectiveActionFormValues } from '../actions'
import RecordActivityTimeline from '@/components/workflow/RecordActivityTimeline'
import RecordAcknowledgementPanel from '@/components/workflow/RecordAcknowledgementPanel'
import RecordCommentsPanel from '@/components/workflow/RecordCommentsPanel'
import RecordEvidencePanel from '@/components/workflow/RecordEvidencePanel'
import RecordLinksPanel from '@/components/workflow/RecordLinksPanel'
import WorkflowApprovalPanel from '@/components/workflow/WorkflowApprovalPanel'
import WorkflowStatusBadge from '@/components/workflow/WorkflowStatusBadge'
import WorkflowTimeline from '@/components/workflow/WorkflowTimeline'
import { listAcknowledgements } from '@/lib/forgeAcknowledgements'
import { listApprovalsForResource } from '@/lib/forgeApprovals'
import { ensureCapaWorkflowInstance } from '@/lib/forgeCapaWorkflowSync'
import { listRecordComments } from '@/lib/forgeComments'
import { correctiveActionWithinScope, getCorrectiveActionDetail } from '@/lib/forgeCorrectiveActions'
import { listRecordEvidence } from '@/lib/forgeEvidence'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { listRecordActivity } from '@/lib/forgeRecordActivity'
import { getRecordLinks } from '@/lib/forgeRecordLinks'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getWorkflowHistory, getWorkflowInstance } from '@/lib/forgeWorkflow'

export const metadata: Metadata = { title: 'Corrective Action' }

const CorrectiveActionDetailPage = async ({
  params
}: {
  params: Promise<{ id: string }>
}) => {
  const context = await requireTenantPermission('corrective_actions.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: record },
    form,
    statusLookup,
    severityLookup,
    typeLookup,
    sourceLookup,
    verificationLookup
  ] = await Promise.all([
    supabase
      .from('forge_corrective_actions')
      .select('*, forge_personnel!forge_corrective_actions_assigned_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id), locations(name, code), divisions(name, code)')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle(),
    getEffectiveForm({
      organizationId,
      formKey: 'corrective_actions.action'
    }),
    getEffectiveLookup({
      organizationId,
      lookupKey: 'corrective_actions.status'
    }),
    getEffectiveLookup({
      organizationId,
      lookupKey: 'corrective_actions.severity'
    }),
    getEffectiveLookup({
      organizationId,
      lookupKey: 'corrective_actions.type'
    }),
    getEffectiveLookup({
      organizationId,
      lookupKey: 'corrective_actions.source_type'
    }),
    getEffectiveLookup({
      organizationId,
      lookupKey: 'corrective_actions.verification_result'
    })
  ])

  if (!record || !form) notFound()

  const mayView = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: record
  })
  if (!mayView) notFound()

  const permissions = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissions.get('corrective_actions.edit')
  const assignPermission = permissions.get('corrective_actions.assign')
  const submitPermission = permissions.get('corrective_actions.submit')
  const verifyPermission = permissions.get('corrective_actions.verify')
  const closePermission = permissions.get('corrective_actions.close')
  const archivePermission = permissions.get('corrective_actions.archive')

  const within = async (permission: any) =>
    permission
      ? correctiveActionWithinScope({
          organizationId,
          userId: context.user.id,
          scope: permission.scope,
          action: record
        })
      : false

  const [
    canEdit,
    canAssign,
    canSubmit,
    canVerify,
    canClose,
    canArchive,
    detail,
    personnel,
    { data: allLocations },
    { data: allDivisions },
    assignments,
    linkedTaskResult
  ] = await Promise.all([
    within(editPermission),
    within(assignPermission),
    within(submitPermission),
    within(verifyPermission),
    within(closePermission),
    within(archivePermission),
    getCorrectiveActionDetail({
      organizationId,
      correctiveActionId: record.id
    }),
    assignPermission || editPermission
      ? getScopedPersonnel({
          organizationId,
          userId: context.user.id,
          permission: (assignPermission || editPermission) as any
        })
      : Promise.resolve([]),
    supabase
      .from('locations')
      .select('id, name, code')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('divisions')
      .select('id, name, code')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name'),
    getTenantScopeAssignments({
      organizationId,
      userId: context.user.id
    }),
    record.linked_task_id
      ? supabase
          .from('forge_tasks')
          .select('id, task_number, title, status')
          .eq('organization_id', organizationId)
          .eq('id', record.linked_task_id)
          .maybeSingle()
      : Promise.resolve({ data: null })
  ])

  const assignmentScope = (assignPermission || editPermission)?.scope || 'own'

  const locations =
    assignmentScope === 'organization'
      ? allLocations || []
      : (allLocations || []).filter((item: any) => assignments.locationIds.includes(item.id))

  const divisions =
    assignmentScope === 'organization'
      ? allDivisions || []
      : (allDivisions || []).filter((item: any) => assignments.divisionIds.includes(item.id))

  const statusLabels = Object.fromEntries(
    statusLookup.options.map(option => [option.key, option.label])
  )
  const severityLabels = Object.fromEntries(
    severityLookup.options.map(option => [option.key, option.label])
  )
  const typeLabels = Object.fromEntries(
    typeLookup.options.map(option => [option.key, option.label])
  )
  const sourceLabels = Object.fromEntries(
    sourceLookup.options.map(option => [option.key, option.label])
  )
  const verificationLabels = Object.fromEntries(
    verificationLookup.options.map(option => [option.key, option.label])
  )

  const overdue = Boolean(
    record.due_at &&
    new Date(record.due_at).getTime() < Date.now() &&
    !['verified','closed','canceled'].includes(record.status)
  )

  const values: CorrectiveActionFormValues = {
    title: record.title,
    description: record.description || '',
    action_type: record.action_type,
    severity: record.severity,
    source_type: record.source_type,
    source_reference: record.source_reference || '',
    assigned_personnel_id: record.assigned_personnel_id || '',
    location_id: record.location_id || '',
    division_id: record.division_id || '',
    due_at: record.due_at ? new Date(record.due_at).toISOString().slice(0, 16) : '',
    immediate_containment: record.immediate_containment || '',
    root_cause_required: Boolean(record.root_cause_required),
    root_cause: record.root_cause || '',
    action_plan: record.action_plan || '',
    preventive_action: record.preventive_action || '',
    verification_due_at: record.verification_due_at
      ? new Date(record.verification_due_at).toISOString().slice(0, 16)
      : '',
    effectiveness_review_due_at: record.effectiveness_review_due_at
      ? new Date(record.effectiveness_review_due_at).toISOString().slice(0, 16)
      : '',
    effectiveness_notes: record.effectiveness_notes || '',
    status: record.status,
    row_version: record.row_version ?? 1
  }

  const readOnly =
    Boolean(record.archived_at) ||
    !['open','in_progress'].includes(record.status) ||
    !canEdit

  const linkedTask = linkedTaskResult?.data || null

  const resourceType = 'corrective_action'
  let workflowInstance = await getWorkflowInstance({
    organizationId,
    resourceType,
    resourceId: record.id
  })
  if (!workflowInstance) {
    workflowInstance = await ensureCapaWorkflowInstance({
      organizationId,
      capaId: record.id,
      status: record.status,
      actorUserId: context.user.id
    })
  }

  const [
    workflowHistory,
    sharedComments,
    recordLinks,
    evidence,
    sharedActivity,
    approvals,
    acknowledgements
  ] = await Promise.all([
    getWorkflowHistory({
      organizationId,
      resourceType,
      resourceId: record.id
    }),
    listRecordComments({
      organizationId,
      resourceType,
      resourceId: record.id
    }),
    getRecordLinks({
      organizationId,
      resourceType,
      resourceId: record.id
    }),
    listRecordEvidence({
      organizationId,
      resourceType,
      resourceId: record.id
    }),
    listRecordActivity({
      organizationId,
      resourceType,
      resourceId: record.id
    }),
    listApprovalsForResource({
      organizationId,
      resourceType,
      resourceId: record.id
    }),
    listAcknowledgements({
      organizationId,
      resourceType,
      resourceId: record.id
    })
  ])

  const canManageLinks = context.access.effective.some(
    item => item.permissionKey === 'records.links.manage' && item.allowed
  )
  const canComment = context.access.effective.some(
    item => item.permissionKey === 'records.comments.create' && item.allowed
  )
  const canUploadEvidence = context.access.effective.some(
    item => item.permissionKey === 'records.evidence.upload' && item.allowed
  )
  const canAcknowledge = context.access.effective.some(
    item => item.permissionKey === 'records.acknowledgements.create' && item.allowed
  )

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} / Corrective Actions
          </p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{record.title}</h1>
            <Badge
              size='sm'
              variant={
                record.severity === 'critical' || record.severity === 'high'
                  ? 'destructive'
                  : record.severity === 'moderate'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {severityLabels[record.severity] || record.severity}
            </Badge>
            <Badge
              size='sm'
              variant={
                record.status === 'closed'
                  ? 'tonalSuccess'
                  : record.status === 'pending_verification'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {statusLabels[record.status] || record.status}
            </Badge>
            {overdue ? <Badge size='sm' variant='destructive'>Overdue</Badge> : null}
          </div>
          <p className='text-textSecondary mt-2'>
            {record.action_number} · {typeLabels[record.action_type] || record.action_type}
          </p>
        </div>

        {linkedTask ? (
          <Button variant='outline' asChild>
            <Link href={'/tasks/' + linkedTask.id}>
              Task {linkedTask.task_number}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Assigned Owner</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='font-semibold'>
              {record.forge_personnel
                ? record.forge_personnel.first_name + ' ' + record.forge_personnel.last_name
                : '—'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Location</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='font-semibold'>{record.locations?.name || '—'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Due</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={overdue ? 'text-destructive font-semibold' : 'font-semibold'}>
              {record.due_at ? new Date(record.due_at).toLocaleString() : 'No due date'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Source</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='font-semibold'>
              {sourceLabels[record.source_type] || record.source_type}
            </div>
            {record.source_reference ? (
              <div className='text-textSecondary mt-1 text-xs'>{record.source_reference}</div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {record.verification_result || record.closure_notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Verification & Closure</CardTitle>
            <CardDescription>
              Independent effectiveness review and final closeout evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <div className='text-textSecondary text-xs font-semibold uppercase tracking-wide'>
                Verification Result
              </div>
              <div className='mt-1 font-medium'>
                {record.verification_result
                  ? verificationLabels[record.verification_result] || record.verification_result
                  : '—'}
              </div>
              {record.verification_notes ? (
                <div className='text-textSecondary mt-2 whitespace-pre-wrap text-sm'>
                  {record.verification_notes}
                </div>
              ) : null}
            </div>
            <div>
              <div className='text-textSecondary text-xs font-semibold uppercase tracking-wide'>
                Closure
              </div>
              <div className='text-textSecondary mt-1 whitespace-pre-wrap text-sm'>
                {record.closure_notes || 'Not closed.'}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {record.archived_at ? (
        <Card>
          <CardHeader>
            <CardTitle>Archived Corrective Action</CardTitle>
            <CardDescription>{new Date(record.archived_at).toLocaleString()}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <CorrectiveActionControls
        correctiveActionId={record.id}
        status={record.status}
        canSubmit={Boolean(canSubmit)}
        canVerify={Boolean(canVerify)}
        canClose={Boolean(canClose)}
        canArchive={Boolean(canArchive)}
        archived={Boolean(record.archived_at)}
      />

      <div className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-3'>
          <span className='text-textSecondary text-sm font-semibold uppercase tracking-wide'>
            Shared workflow
          </span>
          <WorkflowStatusBadge
            stateKey={workflowInstance.current_state_key}
            label={
              'Workflow · ' +
              String(workflowInstance.current_state_key)
                .split('_')
                .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ')
            }
          />
        </div>

        <WorkflowTimeline
          events={(workflowHistory || []).map((event: any) => ({
            id: event.id,
            transition_key: event.transition_key,
            from_state_key: event.from_state_key,
            to_state_key: event.to_state_key,
            comment: event.comment,
            occurred_at: event.occurred_at
          }))}
        />

        <RecordCommentsPanel
          resourceType={resourceType}
          resourceId={record.id}
          comments={sharedComments}
          canComment={canComment}
        />

        <RecordLinksPanel
          resourceType={resourceType}
          resourceId={record.id}
          outbound={recordLinks.outbound}
          inbound={recordLinks.inbound}
          canManage={canManageLinks}
        />

        <RecordEvidencePanel
          resourceType={resourceType}
          resourceId={record.id}
          evidence={evidence}
          canUpload={canUploadEvidence}
        />

        <WorkflowApprovalPanel approvals={approvals} />

        <RecordAcknowledgementPanel
          resourceType={resourceType}
          resourceId={record.id}
          acknowledgements={acknowledgements}
          canAcknowledge={canAcknowledge}
        />

        <RecordActivityTimeline activity={sharedActivity} />
      </div>

      <CorrectiveActionRecordForm
        form={form}
        correctiveActionId={record.id}
        initialValues={values}
        readOnly={readOnly}
        canAssign={Boolean(canAssign)}
        personnel={(personnel || []).map((person: any) => ({
          id: person.id,
          label: person.employee_number
            ? person.first_name + ' ' + person.last_name + ' (' + person.employee_number + ')'
            : person.first_name + ' ' + person.last_name
        }))}
        locations={locations.map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
        divisions={divisions.map((item: any) => ({
          id: item.id,
          label: item.code ? item.name + ' (' + item.code + ')' : item.name
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
          <CardDescription>Corrective Action discussion and operational updates.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {detail.comments.length ? detail.comments.map((comment: any) => (
            <div key={comment.id} className='rounded-lg border p-3'>
              <div className='whitespace-pre-wrap text-sm'>{comment.comment}</div>
              <div className='text-textSecondary mt-2 text-xs'>
                {new Date(comment.created_at).toLocaleString()}
              </div>
            </div>
          )) : (
            <div className='text-textSecondary text-sm'>No comments yet.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>
            CAPA lifecycle, assignment, verification, and closure history.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {detail.activity.length ? detail.activity.map((item: any) => (
            <div key={item.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium capitalize'>
                  {String(item.activity_type).replaceAll('_', ' ')}
                </div>
                <div className='text-textSecondary text-xs'>
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
              {item.message ? (
                <div className='text-textSecondary mt-1 text-sm'>{item.message}</div>
              ) : null}
            </div>
          )) : (
            <div className='text-textSecondary text-sm'>No activity recorded yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default CorrectiveActionDetailPage

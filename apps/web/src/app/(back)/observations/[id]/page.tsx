import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import ObservationControls from '../ObservationControls'
import ObservationCrossModuleActions from '../ObservationCrossModuleActions'
import ObservationRecordForm from '../ObservationRecordForm'
import type { ObservationFormValues } from '../actions'
import RecordActivityTimeline from '@/components/workflow/RecordActivityTimeline'
import RecordCommentsPanel from '@/components/workflow/RecordCommentsPanel'
import RecordEvidencePanel from '@/components/workflow/RecordEvidencePanel'
import RecordLinksPanel from '@/components/workflow/RecordLinksPanel'
import WorkflowActionMenu from '@/components/workflow/WorkflowActionMenu'
import WorkflowStatusBadge from '@/components/workflow/WorkflowStatusBadge'
import WorkflowTimeline from '@/components/workflow/WorkflowTimeline'
import { listRecordComments } from '@/lib/forgeComments'
import { listRecordEvidence } from '@/lib/forgeEvidence'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { loadObservation, observationWithinScope } from '@/lib/forgeObservations'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { listRecordActivity } from '@/lib/forgeRecordActivity'
import { getRecordLinks } from '@/lib/forgeRecordLinks'
import { OBSERVATION_WORKFLOW_KEY } from '@/lib/forgeRiskPreventionWorkflows'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import {
  ensureWorkflowInstance,
  getAllowedTransitions,
  getWorkflowHistory,
  getWorkflowInstance
} from '@/lib/forgeWorkflow'

export const metadata: Metadata = { title: 'Observation' }

const toDatetimeLocal = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  )
}

const ObservationDetailPage = async ({
  params
}: {
  params: Promise<{ id: string }>
}) => {
  const context = await requireTenantPermission('observations.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const canViewReporterIdentity = context.access.effective.some(
    item => item.permissionKey === 'observations.view_reporter_identity' && item.allowed
  )

  const [detail, form, statusLookup, typeLookup, categoryLookup] = await Promise.all([
    loadObservation({
      organizationId,
      observationId: id,
      userId: context.user.id,
      permission: context.permission,
      canViewReporterIdentity
    }),
    getEffectiveForm({
      organizationId,
      formKey: 'observations.observation'
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'observations.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'observations.type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'observations.category' })
  ])

  if (!detail || !form) notFound()

  const record = detail.observation
  const permissions = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissions.get('observations.edit')
  const assignPermission = permissions.get('observations.assign')
  const canCreateCapa = Boolean(permissions.get('corrective_actions.create'))
  const canCreateRisk = Boolean(permissions.get('risk_register.create'))

  // Closed is terminal and record-locking (server enforces too).
  const canEdit = record.status !== 'closed' && editPermission
    ? await observationWithinScope({
        organizationId,
        userId: context.user.id,
        scope: editPermission.scope,
        observation: record
      })
    : false

  const canAssign = assignPermission
    ? await observationWithinScope({
        organizationId,
        userId: context.user.id,
        scope: assignPermission.scope,
        observation: record
      })
    : false

  const [personnel, { data: allLocations }, { data: allDivisions }, assignments] =
    await Promise.all([
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
      })
    ])

  const scope = (assignPermission || editPermission || context.permission).scope
  const locations =
    scope === 'organization'
      ? allLocations || []
      : (allLocations || []).filter((item: any) => assignments.locationIds.includes(item.id))
  const divisions =
    scope === 'organization'
      ? allDivisions || []
      : (allDivisions || []).filter((item: any) => assignments.divisionIds.includes(item.id))

  const statusLabels = Object.fromEntries(
    statusLookup.options.map(option => [option.key, option.label])
  )
  const typeLabels = Object.fromEntries(typeLookup.options.map(option => [option.key, option.label]))
  const categoryLabels = Object.fromEntries(
    categoryLookup.options.map(option => [option.key, option.label])
  )

  const initialValues: ObservationFormValues = {
    title: record.title,
    description: record.description,
    observation_type: record.observation_type,
    category_key: record.category_key,
    reporting_mode: record.reporting_mode,
    occurred_at: toDatetimeLocal(record.occurred_at),
    work_area: record.work_area,
    location_id: record.location_id,
    division_id: record.division_id,
    immediate_action: record.immediate_action,
    assigned_to_personnel_id: record.assigned_to_personnel_id,
    initial_likelihood_key: record.initial_likelihood_key,
    initial_severity_key: record.initial_severity_key,
    row_version: record.row_version,
    status: record.status
  }

  const assigneeName = (record as any).forge_personnel
    ? [(record as any).forge_personnel.first_name, (record as any).forge_personnel.last_name]
        .filter(Boolean)
        .join(' ')
    : null

  const resourceType = 'observation'
  let workflowInstance = await getWorkflowInstance({
    organizationId,
    resourceType,
    resourceId: record.id
  })
  if (!workflowInstance) {
    workflowInstance = await ensureWorkflowInstance({
      organizationId,
      resourceType,
      resourceId: record.id,
      workflowKey: OBSERVATION_WORKFLOW_KEY,
      initialStateKey: record.status || 'draft'
    })
  }

  const userPermissionKeys = context.access.effective
    .filter(item => item.allowed)
    .map(item => item.permissionKey)

  const [
    workflowHistory,
    allowedTransitions,
    sharedComments,
    recordLinks,
    evidence,
    sharedActivity
  ] = await Promise.all([
    getWorkflowHistory({
      organizationId,
      resourceType,
      resourceId: record.id
    }),
    getAllowedTransitions({
      organizationId,
      resourceType,
      resourceId: record.id,
      userPermissionKeys
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

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} / Observations
          </p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{record.title}</h1>
          <p className='text-textSecondary mt-2'>
            {record.observation_number}
            {' · '}
            {typeLabels[record.observation_type] || record.observation_type}
            {record.category_key
              ? ' · ' + (categoryLabels[record.category_key] || record.category_key)
              : ''}
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <ObservationCrossModuleActions
            observationId={record.id}
            canCreateCapa={canCreateCapa}
            canCreateRisk={canCreateRisk}
          />
          <Button variant='outline' asChild>
            <Link href='/observations'>Back to list</Link>
          </Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Status</CardDescription>
            <CardTitle className='text-lg'>
              <Badge
                variant={
                  record.status === 'closed' || record.status === 'no_action'
                    ? 'tonalSuccess'
                    : record.status === 'action_required'
                      ? 'destructive'
                      : 'outline'
                }
              >
                {statusLabels[record.status] || record.status}
              </Badge>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Risk</CardDescription>
            <CardTitle className='text-lg'>
              {record.initial_risk_band_key
                ? record.initial_risk_band_key +
                  (record.initial_risk_score != null ? ' · ' + record.initial_risk_score : '')
                : 'Not assessed'}
            </CardTitle>
          </CardHeader>
          <CardContent className='text-textSecondary text-sm'>
            {record.initial_likelihood_key && record.initial_severity_key
              ? record.initial_likelihood_key + ' × ' + record.initial_severity_key
              : 'Likelihood / severity not set'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Reporter</CardDescription>
            <CardTitle className='text-lg'>{detail.reporter.label}</CardTitle>
          </CardHeader>
          <CardContent className='text-textSecondary text-sm'>
            Mode: {record.reporting_mode}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Assignment</CardDescription>
            <CardTitle className='text-lg'>{assigneeName || 'Unassigned'}</CardTitle>
          </CardHeader>
          <CardContent className='text-textSecondary text-sm'>
            {(record as any).locations?.name || 'No location'}
            {(record as any).divisions?.name ? ' · ' + (record as any).divisions.name : ''}
          </CardContent>
        </Card>
      </div>

      <div className='flex flex-col gap-4'>
        <ObservationControls
          observationId={record.id}
          rowVersion={Number(record.row_version)}
          transitions={allowedTransitions.map(item => ({
            transition_key: item.transition_key,
            name: item.name,
            requires_comment: Boolean(item.requires_comment)
          }))}
        />

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

        <WorkflowActionMenu
          currentStateKey={workflowInstance.current_state_key}
          transitions={allowedTransitions.map(item => ({
            transition_key: item.transition_key,
            name: item.name,
            from_state_key: item.from_state_key,
            to_state_key: item.to_state_key,
            requires_comment: item.requires_comment,
            requires_approval: item.requires_approval
          }))}
        />

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

        <RecordActivityTimeline activity={sharedActivity} />
      </div>

      <ObservationRecordForm
        form={form}
        observationId={record.id}
        initialValues={initialValues}
        readOnly={!canEdit}
        canAssign={canAssign}
        personnel={personnel.map((person: any) => ({
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
          <CardTitle>Activity</CardTitle>
          <CardDescription>Operational feed for this observation.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {detail.activity.length ? (
            detail.activity.map((item: any) => (
              <div key={item.id} className='border-b pb-3 last:border-b-0 last:pb-0'>
                <div className='font-medium'>{item.message || item.activity_type}</div>
                <div className='text-textSecondary text-xs'>
                  {new Date(item.created_at).toLocaleString()} · {item.activity_type}
                </div>
              </div>
            ))
          ) : (
            <p className='text-textSecondary text-sm'>No activity yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ObservationDetailPage

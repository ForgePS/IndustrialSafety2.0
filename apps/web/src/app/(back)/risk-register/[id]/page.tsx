import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import RiskControls from '../RiskControls'
import RiskCrossModuleActions from '../RiskCrossModuleActions'
import RiskRecordForm from '../RiskRecordForm'
import {
  RiskAssessmentPanel,
  RiskControlsPanel,
  RiskTreatmentsPanel
} from '../RiskDetailPanels'
import type { RiskFormValues } from '../actions'
import RecordActivityTimeline from '@/components/workflow/RecordActivityTimeline'
import RecordCommentsPanel from '@/components/workflow/RecordCommentsPanel'
import RecordEvidencePanel from '@/components/workflow/RecordEvidencePanel'
import RecordLinksPanel from '@/components/workflow/RecordLinksPanel'
import WorkflowActionMenu from '@/components/workflow/WorkflowActionMenu'
import WorkflowApprovalPanel from '@/components/workflow/WorkflowApprovalPanel'
import WorkflowStatusBadge from '@/components/workflow/WorkflowStatusBadge'
import WorkflowTimeline from '@/components/workflow/WorkflowTimeline'
import { listApprovalsForResource } from '@/lib/forgeApprovals'
import { listRecordComments } from '@/lib/forgeComments'
import { listRecordEvidence } from '@/lib/forgeEvidence'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { listRecordActivity } from '@/lib/forgeRecordActivity'
import { getRecordLinks } from '@/lib/forgeRecordLinks'
import { getActiveRiskMatrix } from '@/lib/forgeRiskMatrix'
import { RISK_REGISTER_WORKFLOW_KEY } from '@/lib/forgeRiskPreventionWorkflows'
import { loadRisk, riskWithinScope } from '@/lib/forgeRiskRegister'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import {
  ensureWorkflowInstance,
  getAllowedTransitions,
  getWorkflowHistory,
  getWorkflowInstance
} from '@/lib/forgeWorkflow'

export const metadata: Metadata = { title: 'Risk' }

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

const RiskDetailPage = async ({
  params
}: {
  params: Promise<{ id: string }>
}) => {
  const context = await requireTenantPermission('risk_register.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    detail,
    form,
    statusLookup,
    categoryLookup,
    controlTypeLookup,
    treatmentStatusLookup,
    activeMatrix
  ] = await Promise.all([
    loadRisk({
      organizationId,
      riskId: id,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveForm({
      organizationId,
      formKey: 'risk_register.risk'
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'risk_register.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'risk_register.category' }),
    getEffectiveLookup({ organizationId, lookupKey: 'risk_register.control_type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'risk_register.treatment_status' }),
    getActiveRiskMatrix({ organizationId })
  ])

  if (!detail || !form) notFound()

  const record = detail.risk
  const permissions = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissions.get('risk_register.edit')
  const assignPermission = permissions.get('risk_register.assign')
  const assessPermission = permissions.get('risk_register.assess')
  const treatPermission = permissions.get('risk_register.treat')
  const acceptPermission = permissions.get('risk_register.accept')
  const reviewPermission = permissions.get('risk_register.review')
  const canCreateCapa = Boolean(permissions.get('corrective_actions.create'))

  const canEdit = editPermission
    ? await riskWithinScope({
        organizationId,
        userId: context.user.id,
        scope: editPermission.scope,
        risk: record
      })
    : false

  const canAssign = assignPermission
    ? await riskWithinScope({
        organizationId,
        userId: context.user.id,
        scope: assignPermission.scope,
        risk: record
      })
    : false

  const canAssess = assessPermission
    ? await riskWithinScope({
        organizationId,
        userId: context.user.id,
        scope: assessPermission.scope,
        risk: record
      })
    : false

  const canTreat = treatPermission
    ? await riskWithinScope({
        organizationId,
        userId: context.user.id,
        scope: treatPermission.scope,
        risk: record
      })
    : false

  const canAccept = acceptPermission
    ? await riskWithinScope({
        organizationId,
        userId: context.user.id,
        scope: acceptPermission.scope,
        risk: record
      })
    : false

  const canReview = reviewPermission
    ? await riskWithinScope({
        organizationId,
        userId: context.user.id,
        scope: reviewPermission.scope,
        risk: record
      })
    : false

  const [personnel, { data: allLocations }, { data: allDivisions }, assignments] =
    await Promise.all([
      assignPermission || editPermission || treatPermission
        ? getScopedPersonnel({
            organizationId,
            userId: context.user.id,
            permission: (assignPermission || treatPermission || editPermission) as any
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
  const categoryLabels = Object.fromEntries(
    categoryLookup.options.map(option => [option.key, option.label])
  )

  const initialValues: RiskFormValues = {
    title: record.title,
    description: record.description,
    hazard_description: record.hazard_description,
    category_key: record.category_key,
    status: record.status,
    work_area: record.work_area,
    location_id: record.location_id,
    division_id: record.division_id,
    owner_personnel_id: record.owner_personnel_id,
    review_due_at: toDatetimeLocal(record.review_due_at),
    source_type: record.source_type,
    source_reference: record.source_reference,
    row_version: record.row_version
  }

  const ownerName = (record as any).forge_personnel
    ? [(record as any).forge_personnel.first_name, (record as any).forge_personnel.last_name]
        .filter(Boolean)
        .join(' ')
    : null

  const personnelOptions = personnel.map((person: any) => ({
    id: person.id,
    label: person.employee_number
      ? person.first_name + ' ' + person.last_name + ' (' + person.employee_number + ')'
      : person.first_name + ' ' + person.last_name
  }))

  const resourceType = 'risk_register'
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
      workflowKey: RISK_REGISTER_WORKFLOW_KEY,
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
    sharedActivity,
    approvals
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
    }),
    listApprovalsForResource({
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
            {context.activeOrganization.name} / Risk Register
          </p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{record.title}</h1>
          <p className='text-textSecondary mt-2'>
            {record.risk_number}
            {record.category_key
              ? ' · ' + (categoryLabels[record.category_key] || record.category_key)
              : ''}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <RiskCrossModuleActions riskId={record.id} canCreateCapa={canCreateCapa} />
          <Button variant='outline' asChild>
            <Link href='/risk-register/matrices'>Matrices</Link>
          </Button>
          <Button variant='outline' asChild>
            <Link href='/risk-register'>Back to list</Link>
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
                  record.status === 'closed'
                    ? 'tonalSuccess'
                    : record.status === 'review'
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
            <CardDescription>Inherent</CardDescription>
            <CardTitle className='text-lg'>
              {record.inherent_band_key
                ? record.inherent_band_key +
                  (record.inherent_score != null ? ' · ' + record.inherent_score : '')
                : 'Not assessed'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Residual</CardDescription>
            <CardTitle className='text-lg'>
              {record.residual_band_key
                ? record.residual_band_key +
                  (record.residual_score != null ? ' · ' + record.residual_score : '')
                : 'Not assessed'}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Owner</CardDescription>
            <CardTitle className='text-lg'>{ownerName || 'Unassigned'}</CardTitle>
          </CardHeader>
          <CardContent className='text-textSecondary text-sm'>
            {(record as any).locations?.name || 'No location'}
            {(record as any).divisions?.name ? ' · ' + (record as any).divisions.name : ''}
          </CardContent>
        </Card>
      </div>

      <RiskAssessmentPanel
        riskId={record.id}
        rowVersion={Number(record.row_version)}
        canAssess={canAssess}
        inherent={{
          likelihoodKey: record.inherent_likelihood_key,
          severityKey: record.inherent_severity_key,
          score: record.inherent_score,
          bandKey: record.inherent_band_key
        }}
        residual={{
          likelihoodKey: record.residual_likelihood_key,
          severityKey: record.residual_severity_key,
          score: record.residual_score,
          bandKey: record.residual_band_key
        }}
        likelihoodOptions={(activeMatrix?.likelihoodLevels || []).map(item => ({
          key: item.level_key,
          label: item.label + ' (' + item.level_key + ')'
        }))}
        severityOptions={(activeMatrix?.severityLevels || []).map(item => ({
          key: item.level_key,
          label: item.label + ' (' + item.level_key + ')'
        }))}
      />

      <div className='grid gap-4 lg:grid-cols-2'>
        <RiskControlsPanel
          riskId={record.id}
          canTreat={canTreat}
          controls={detail.controls}
          controlTypeOptions={controlTypeLookup.options.map(option => ({
            key: option.key,
            label: option.label
          }))}
        />
        <RiskTreatmentsPanel
          riskId={record.id}
          canTreat={canTreat}
          personnel={personnelOptions}
          treatmentStatusOptions={treatmentStatusLookup.options.map(option => ({
            key: option.key,
            label: option.label
          }))}
          treatments={detail.treatments.map((item: any) => ({
            id: item.id,
            treatment_status: item.treatment_status,
            title: item.title,
            description: item.description,
            due_at: item.due_at,
            notes: item.notes,
            ownerName: item.forge_personnel
              ? [item.forge_personnel.first_name, item.forge_personnel.last_name]
                  .filter(Boolean)
                  .join(' ')
              : null
          }))}
        />
      </div>

      <div className='flex flex-col gap-4'>
        <RiskControls
          riskId={record.id}
          rowVersion={Number(record.row_version)}
          canAccept={canAccept}
          canReview={canReview}
          acceptedAt={(record as any).accepted_at || null}
          nextReviewAt={record.next_review_at || record.review_due_at}
          transitions={allowedTransitions.map(item => ({
            transition_key: item.transition_key,
            name: item.name,
            requires_comment: Boolean(item.requires_comment)
          }))}
        />

        <WorkflowApprovalPanel approvals={approvals} />

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

      <RiskRecordForm
        form={form}
        riskId={record.id}
        initialValues={initialValues}
        readOnly={!canEdit}
        canAssign={canAssign}
        hideAssessmentFields
        personnel={personnelOptions}
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
          <CardDescription>Operational feed for this risk.</CardDescription>
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

export default RiskDetailPage

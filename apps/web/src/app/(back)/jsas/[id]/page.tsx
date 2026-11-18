import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import JsaControls from '../JsaControls'
import JsaCrossModuleActions from '../JsaCrossModuleActions'
import JsaRecordForm from '../JsaRecordForm'
import { JsaActionsPanel, JsaRequirementsPanel, JsaStepsHazardsPanel, CreateJsaFromTemplateButton } from '../JsaDetailPanels'
import type { JsaFormValues } from '../actions'
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
import { jsaWithinScope, loadJsa } from '@/lib/forgeJsa'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { listRecordActivity } from '@/lib/forgeRecordActivity'
import { getRecordLinks } from '@/lib/forgeRecordLinks'
import { getActiveRiskMatrix } from '@/lib/forgeRiskMatrix'
import { JSA_WORKFLOW_KEY } from '@/lib/forgeRiskPreventionWorkflows'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import {
  ensureWorkflowInstance,
  getAllowedTransitions,
  getWorkflowHistory,
  getWorkflowInstance
} from '@/lib/forgeWorkflow'

export const metadata: Metadata = { title: 'JSA' }

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

const JsaDetailPage = async ({
  params
}: {
  params: Promise<{ id: string }>
}) => {
  const context = await requireTenantPermission('jsa_jha.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    detail,
    form,
    statusLookup,
    categoryLookup,
    controlTypeLookup,
    activeMatrix
  ] = await Promise.all([
    loadJsa({
      organizationId,
      jsaId: id,
      userId: context.user.id,
      permission: context.permission
    }),
    getEffectiveForm({
      organizationId,
      formKey: 'jsa_jha.jsa'
    }),
    getEffectiveLookup({ organizationId, lookupKey: 'jsa_jha.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'jsa_jha.hazard_category' }),
    getEffectiveLookup({ organizationId, lookupKey: 'jsa_jha.control_type' }),
    getActiveRiskMatrix({ organizationId })
  ])

  if (!detail || !form) notFound()

  const record = detail.jsa
  const permissions = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissions.get('jsa_jha.edit')
  const assignPermission = permissions.get('jsa_jha.assign')
  const executePermission = permissions.get('jsa_jha.execute')
  const canCreateCapa = Boolean(permissions.get('corrective_actions.create'))
  const canCreateRisk = Boolean(permissions.get('risk_register.create'))
  const canLinkAsset = Boolean(permissions.get('jsa_jha.edit'))

  const canCreate = Boolean(permissions.get('jsa_jha.create'))

  const canEdit = editPermission
    ? await jsaWithinScope({
        organizationId,
        userId: context.user.id,
        scope: editPermission.scope,
        jsa: record
      })
    : false

  const canAssign = assignPermission
    ? await jsaWithinScope({
        organizationId,
        userId: context.user.id,
        scope: assignPermission.scope,
        jsa: record
      })
    : false

  const canExecute =
    record.status === 'active' &&
    Boolean(
      executePermission
        ? await jsaWithinScope({
            organizationId,
            userId: context.user.id,
            scope: executePermission.scope,
            jsa: record
          })
        : false
    )

  const [personnel, { data: allLocations }, { data: allDivisions }, assignments, { data: trainingCourseRows }] =
    await Promise.all([
      assignPermission || editPermission || executePermission
        ? getScopedPersonnel({
            organizationId,
            userId: context.user.id,
            permission: (assignPermission || executePermission || editPermission) as any
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
      supabase
        .from('forge_training_courses')
        .select('id, title, course_code')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('title')
        .limit(100)
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

  const initialValues: JsaFormValues = {
    title: record.title,
    description: record.description || '',
    job_title: record.job_title || '',
    task_name: record.task_name || '',
    status: record.status,
    work_area: record.work_area || '',
    location_id: record.location_id || '',
    division_id: record.division_id || '',
    prepared_by_personnel_id: record.prepared_by_personnel_id || '',
    effective_at: toDatetimeLocal(record.effective_at),
    review_due_at: toDatetimeLocal(record.review_due_at),
    is_template: Boolean(record.is_template),
    row_version: record.row_version
  }

  const statusLabel =
    statusLookup.options.find(option => option.key === record.status)?.label || record.status

  const likelihoodOptions =
    activeMatrix?.likelihoodLevels.map(item => ({
      key: item.level_key,
      label: item.label
    })) || []
  const severityOptions =
    activeMatrix?.severityLevels.map(item => ({
      key: item.level_key,
      label: item.label
    })) || []

  const personOptions = personnel.map((person: any) => ({
    id: person.id,
    label: person.employee_number
      ? person.first_name + ' ' + person.last_name + ' (' + person.employee_number + ')'
      : person.first_name + ' ' + person.last_name
  }))

  const locationOptions = locations.map((item: any) => ({
    id: item.id,
    label: item.code ? item.name + ' (' + item.code + ')' : item.name
  }))

  const divisionOptions = divisions.map((item: any) => ({
    id: item.id,
    label: item.code ? item.name + ' (' + item.code + ')' : item.name
  }))

  const resourceType = 'jsa'
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
      workflowKey: JSA_WORKFLOW_KEY,
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
            {context.activeOrganization.name} / JSA / JHA
          </p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{record.title}</h1>
          <div className='text-textSecondary mt-2 flex flex-wrap items-center gap-2 text-sm'>
            <span>{record.jsa_number}</span>
            <Badge variant='outline' data-testid='jsa-status'>
              {statusLabel}
            </Badge>
            <Badge variant='secondary'>v{record.version}</Badge>
            {record.parent_jsa_id ? (
              <Link
                href={'/jsas/' + record.parent_jsa_id}
                className='text-primary hover:underline'
              >
                Prior version
              </Link>
            ) : null}
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <CreateJsaFromTemplateButton
            jsaId={record.id}
            isTemplate={Boolean(record.is_template)}
            canCreate={canCreate}
          />
          <JsaCrossModuleActions
            jsaId={record.id}
            canCreateCapa={canCreateCapa}
            canCreateRisk={canCreateRisk}
            canLinkAsset={canLinkAsset}
          />
          <Button variant='outline' asChild>
            <Link href='/jsas'>Back to list</Link>
          </Button>
        </div>
      </div>

      <div className='flex flex-col gap-4'>
        <JsaControls
          jsaId={record.id}
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

      <Card>
        <CardHeader>
          <CardTitle>Header</CardTitle>
          <CardDescription>
            {[record.job_title, record.task_name, record.work_area].filter(Boolean).join(' · ') ||
              'Job safety analysis record'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JsaRecordForm
            form={form}
            jsaId={record.id}
            initialValues={initialValues}
            readOnly={!canEdit}
            canAssign={canAssign}
            personnel={personOptions}
            locations={locationOptions}
            divisions={divisionOptions}
          />
        </CardContent>
      </Card>

      <JsaStepsHazardsPanel
        jsaId={record.id}
        canEdit={canEdit}
        steps={detail.steps}
        hazards={detail.hazards}
        controls={detail.controls}
        categoryOptions={categoryLookup.options.map(option => ({
          key: option.key,
          label: option.label
        }))}
        controlTypeOptions={controlTypeLookup.options.map(option => ({
          key: option.key,
          label: option.label
        }))}
        likelihoodOptions={likelihoodOptions}
        severityOptions={severityOptions}
      />

      <JsaRequirementsPanel
        jsaId={record.id}
        canEdit={canEdit}
        ppeItems={(detail.ppeItems || []).map((item: any) => ({
          id: item.id,
          label: item.label,
          required: Boolean(item.required)
        }))}
        trainingRequirements={(detail.trainingRequirements || []).map((item: any) => ({
          id: item.id,
          training_course_id: item.training_course_id,
          required: Boolean(item.required),
          courseTitle:
            (item.forge_training_courses as { title?: string } | null)?.title ||
            item.training_course_id
        }))}
        trainingCourses={(trainingCourseRows || []).map((row: any) => ({
          id: row.id,
          label: row.title + (row.course_code ? ' (' + row.course_code + ')' : '')
        }))}
      />

      <JsaActionsPanel
        jsaId={record.id}
        canEdit={canEdit}
        canExecute={canExecute}
        executions={detail.executions.map((item: any) => ({
          id: item.id,
          execution_number: item.execution_number,
          status: item.status,
          started_at: item.started_at,
          leadName: item.forge_personnel
            ? [item.forge_personnel.first_name, item.forge_personnel.last_name]
                .filter(Boolean)
                .join(' ')
            : null
        }))}
        personnel={personOptions}
        locations={locationOptions}
      />

      {detail.revisions?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Revision history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className='grid gap-2 text-sm'>
              {detail.revisions.map((item: any) => (
                <li key={item.id} className='flex flex-wrap items-center justify-between gap-2'>
                  <Link
                    href={'/jsas/' + id + '/revisions/' + item.version_jsa_id}
                    className='text-primary font-medium hover:underline'
                  >
                    Version {item.version}
                  </Link>
                  <span className='text-textSecondary'>
                    {item.change_summary || 'No summary'} ·{' '}
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default JsaDetailPage

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import InspectionChecklist from '../InspectionChecklist'
import InspectionFindings from '../InspectionFindings'
import InspectionRecordForm from '../InspectionRecordForm'
import InspectionWorkflowActions from '../InspectionWorkflowActions'
import type { InspectionFormValues } from '../actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getInspectionDetailData, inspectionWithinScope } from '@/lib/forgeInspections'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import ForgeAiContextButton from '@/components/forge-ai/ForgeAiContextButton'

export const metadata: Metadata = { title: 'Inspection' }

const InspectionDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('inspections.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: inspection },
    form,
    detail,
    statusLookup,
    resultLookup,
    severityLookup,
    findingStatusLookup,
    { data: locations },
    { data: divisions },
    { data: templates }
  ] = await Promise.all([
    supabase
      .from('forge_inspections')
      .select('*, locations(name, code), divisions(name, code), forge_inspection_templates(name, inspection_type, version)')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle(),
    getEffectiveForm({ organizationId, formKey: 'inspections.general' }),
    getInspectionDetailData({ organizationId, inspectionId: id }),
    getEffectiveLookup({ organizationId, lookupKey: 'inspections.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'inspections.result' }),
    getEffectiveLookup({ organizationId, lookupKey: 'inspections.finding_severity' }),
    getEffectiveLookup({ organizationId, lookupKey: 'inspections.finding_status' }),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('forge_inspection_templates').select('id, name, version').eq('organization_id', organizationId).eq('is_active', true).order('name')
  ])

  if (!inspection || !form) notFound()

  const mayView = await inspectionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    inspection
  })

  if (!mayView) notFound()

  const permissionByKey = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissionByKey.get('inspections.edit')
  const submitPermission = permissionByKey.get('inspections.submit')
  const approvePermission = permissionByKey.get('inspections.approve')
  const closePermission = permissionByKey.get('inspections.close')
  const closeFindingsPermission = permissionByKey.get('inspections.close_findings')
  const canUseAi = Boolean(permissionByKey.get('forge_ai.use'))

  const canWithin = async (permission: any) =>
    permission
      ? inspectionWithinScope({
          organizationId,
          userId: context.user.id,
          scope: permission.scope,
          inspection
        })
      : false

  const [mayEditByScope, canSubmit, canApprove, canClose, canCloseFindings, personnel] = await Promise.all([
    canWithin(editPermission),
    canWithin(submitPermission),
    canWithin(approvePermission),
    canWithin(closePermission),
    canWithin(closeFindingsPermission),
    editPermission
      ? getScopedPersonnel({
          organizationId,
          userId: context.user.id,
          permission: editPermission
        })
      : Promise.resolve([])
  ])

  const editable = Boolean(mayEditByScope) && ['draft','in_progress','returned'].includes(inspection.status)

  const statusLabels = Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))
  const resultLabels = Object.fromEntries(resultLookup.options.map(option => [option.key, option.label]))
  const severityLabels = Object.fromEntries(severityLookup.options.map(option => [option.key, option.label]))
  const findingStatusLabels = Object.fromEntries(findingStatusLookup.options.map(option => [option.key, option.label]))

  const values: InspectionFormValues = {
    template_id: inspection.template_id || '',
    inspection_date: inspection.inspection_date || '',
    location_id: inspection.location_id || '',
    division_id: inspection.division_id || '',
    inspector_personnel_id: inspection.inspector_personnel_id || '',
    result: inspection.result || '',
    notes: inspection.notes || ''
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Inspections</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{inspection.inspection_number}</h1>
            <Badge size='sm' variant={inspection.status === 'approved' || inspection.status === 'closed' ? 'tonalSuccess' : 'secondary'}>
              {statusLabels[inspection.status] || inspection.status}
            </Badge>
            {inspection.result ? (
              <Badge size='sm' variant={inspection.result === 'pass' ? 'tonalSuccess' : inspection.result === 'fail' ? 'destructive' : 'outline'}>
                {resultLabels[inspection.result] || inspection.result}
              </Badge>
            ) : null}
          </div>
          <p className='text-textSecondary mt-2'>{inspection.template_name_snapshot || inspection.forge_inspection_templates?.name || 'Inspection'}</p>
        </div>
        {canUseAi ? (
          <ForgeAiContextButton
            contextType='inspection'
            recordId={inspection.id}
            recordLabel={inspection.inspection_number}
          />
        ) : null}
      </div>

      {inspection.status === 'returned' && inspection.return_reason ? (
        <Card>
          <CardHeader>
            <CardTitle>Returned for Correction</CardTitle>
            <CardDescription>Review the requested changes before resubmitting.</CardDescription>
          </CardHeader>
          <CardContent>{inspection.return_reason}</CardContent>
        </Card>
      ) : null}

      {editable ? (
        <InspectionRecordForm
          form={form}
          inspectionId={inspection.id}
          initialValues={values}
          templates={(templates || []).map((item: any) => ({
            id: item.id,
            label: item.version > 1 ? item.name + ' (v' + item.version + ')' : item.name
          }))}
          locations={(locations || []).map((item: any) => ({
            id: item.id,
            label: item.code ? item.name + ' (' + item.code + ')' : item.name
          }))}
          divisions={(divisions || []).map((item: any) => ({
            id: item.id,
            label: item.code ? item.name + ' (' + item.code + ')' : item.name
          }))}
          personnel={(personnel || []).map((person: any) => ({
            id: person.id,
            label: person.employee_number
              ? person.first_name + ' ' + person.last_name + ' (' + person.employee_number + ')'
              : person.first_name + ' ' + person.last_name
          }))}
        />
      ) : (
        <div className='grid gap-4 md:grid-cols-3'>
          <Card><CardHeader className='pb-2'><CardDescription>Inspection Date</CardDescription></CardHeader><CardContent><div className='font-semibold'>{inspection.inspection_date}</div></CardContent></Card>
          <Card><CardHeader className='pb-2'><CardDescription>Location</CardDescription></CardHeader><CardContent><div className='font-semibold'>{inspection.locations?.name || '—'}</div></CardContent></Card>
          <Card><CardHeader className='pb-2'><CardDescription>Division</CardDescription></CardHeader><CardContent><div className='font-semibold'>{inspection.divisions?.name || '—'}</div></CardContent></Card>
        </div>
      )}

      <InspectionChecklist
        inspectionId={inspection.id}
        items={detail.items}
        editable={editable}
        severityOptions={severityLookup.options.map(option => ({ key: option.key, label: option.label }))}
      />

      <InspectionFindings
        findings={detail.findings}
        editable={Boolean(mayEditByScope)}
        canClose={Boolean(canCloseFindings)}
        severityLabels={severityLabels}
        statusLabels={findingStatusLabels}
      />

      <InspectionWorkflowActions
        inspectionId={inspection.id}
        status={inspection.status}
        canSubmit={Boolean(canSubmit)}
        canApprove={Boolean(canApprove)}
        canClose={Boolean(canClose)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Inspection workflow and finding history.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {detail.activity.length ? detail.activity.map((item: any) => (
            <div key={item.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium capitalize'>{String(item.activity_type).replaceAll('_', ' ')}</div>
                <div className='text-textSecondary text-xs'>{new Date(item.created_at).toLocaleString()}</div>
              </div>
              {item.message ? <div className='text-textSecondary mt-1 text-sm'>{item.message}</div> : null}
            </div>
          )) : <div className='text-textSecondary text-sm'>No activity has been recorded yet.</div>}
        </CardContent>
      </Card>
    </div>
  )
}

export default InspectionDetailPage

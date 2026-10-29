import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'
import LotoComponentDeleteButton from '../LotoComponentDeleteButton'
import LotoLifecycleControls from '../LotoLifecycleControls'
import LotoRecordForm from '../LotoRecordForm'
import LotoSubrecordForm from '../LotoSubrecordForm'
import type { LotoFormValues } from '../actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import {
  getLotoProcedureDetail,
  getScopedLotoAssets,
  lotoProcedureWithinScope
} from '@/lib/forgeLoto'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import ForgeAiContextButton from '@/components/forge-ai/ForgeAiContextButton'

export const metadata: Metadata = { title: 'LOTO Procedure' }

const LotoProcedurePage = async ({
  params
}: {
  params: Promise<{ id: string }>
}) => {
  const context = await requireTenantPermission('loto.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: procedure },
    procedureForm,
    energyForm,
    stepForm,
    reviewForm,
    detail,
    statusLookup,
    energyTypeLookup,
    stepTypeLookup,
    reviewResultLookup
  ] = await Promise.all([
    supabase
      .from('forge_loto_procedures')
      .select('*, forge_assets(id, asset_number, name, status, condition, criticality, location_id, division_id, locations(name, code), divisions(name, code))')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle(),
    getEffectiveForm({ organizationId, formKey: 'loto.procedure' }),
    getEffectiveForm({ organizationId, formKey: 'loto.energy_source' }),
    getEffectiveForm({ organizationId, formKey: 'loto.step' }),
    getEffectiveForm({ organizationId, formKey: 'loto.review' }),
    getLotoProcedureDetail({ organizationId, procedureId: id }),
    getEffectiveLookup({ organizationId, lookupKey: 'loto.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'loto.energy_type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'loto.step_type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'loto.review_result' })
  ])

  if (!procedure || !procedureForm) notFound()

  const mayView = await lotoProcedureWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    procedure
  })

  if (!mayView) notFound()

  const permissions = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissions.get('loto.edit')
  const approvePermission = permissions.get('loto.approve')
  const reviewPermission = permissions.get('loto.review')
  const executePermission = permissions.get('loto.execute')
  const retirePermission = permissions.get('loto.retire')
  const canUseAi = Boolean(permissions.get('forge_ai.use'))

  const within = async (permission: any) =>
    permission
      ? lotoProcedureWithinScope({
          organizationId,
          userId: context.user.id,
          scope: permission.scope,
          procedure
        })
      : false

  const [canEdit, canApprove, canReview, canExecute, canRetire, editableAssets] = await Promise.all([
    within(editPermission),
    within(approvePermission),
    within(reviewPermission),
    within(executePermission),
    within(retirePermission),
    editPermission
      ? getScopedLotoAssets({
          organizationId,
          userId: context.user.id,
          permission: editPermission as any
        })
      : Promise.resolve(procedure.forge_assets ? [procedure.forge_assets] : [])
  ])

  const editable = canEdit && ['draft','review'].includes(procedure.status)
  const activeApplication = detail.applications.find((item: any) => item.status === 'in_progress') || null

  const statusLabels = Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))
  const energyTypeLabels = Object.fromEntries(energyTypeLookup.options.map(option => [option.key, option.label]))
  const stepTypeLabels = Object.fromEntries(stepTypeLookup.options.map(option => [option.key, option.label]))
  const reviewResultLabels = Object.fromEntries(reviewResultLookup.options.map(option => [option.key, option.label]))

  const values: LotoFormValues = {
    asset_id: procedure.asset_id,
    title: procedure.title,
    description: procedure.description || '',
    purpose: procedure.purpose || '',
    scope_text: procedure.scope_text || '',
    required_ppe: procedure.required_ppe || '',
    special_precautions: procedure.special_precautions || '',
    authorized_employee_notes: procedure.authorized_employee_notes || '',
    affected_employee_notes: procedure.affected_employee_notes || '',
    shutdown_notes: procedure.shutdown_notes || '',
    restoration_notes: procedure.restoration_notes || '',
    next_review_date: procedure.next_review_date || ''
  }

  const today = new Date().toISOString().slice(0, 10)
  const reviewOverdue = Boolean(
    procedure.status === 'approved' &&
    procedure.next_review_date &&
    procedure.next_review_date < today
  )

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} / Lockout / Tagout
          </p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{procedure.title}</h1>
            <Badge
              size='sm'
              variant={
                procedure.status === 'approved'
                  ? 'tonalSuccess'
                  : procedure.status === 'retired'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {statusLabels[procedure.status] || procedure.status}
            </Badge>
            <Badge size='sm' variant='outline'>Rev {procedure.revision_number}</Badge>
            {reviewOverdue ? <Badge size='sm' variant='destructive'>Review Overdue</Badge> : null}
          </div>
          <p className='text-textSecondary mt-2'>
            {procedure.procedure_number}
            {procedure.forge_assets ? ' · ' + procedure.forge_assets.asset_number + ' · ' + procedure.forge_assets.name : ''}
          </p>
        </div>
        {canUseAi ? (
          <ForgeAiContextButton
            contextType='loto'
            recordId={procedure.id}
            recordLabel={procedure.procedure_number}
          />
        ) : null}
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Equipment</CardDescription></CardHeader>
          <CardContent><div className='font-semibold'>{procedure.forge_assets?.name || '—'}</div><div className='text-textSecondary text-xs'>{procedure.forge_assets?.asset_number || '—'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Location</CardDescription></CardHeader>
          <CardContent><div className='font-semibold'>{procedure.forge_assets?.locations?.name || '—'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Effective Date</CardDescription></CardHeader>
          <CardContent><div className='font-semibold'>{procedure.effective_date || 'Not approved'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Next Periodic Review</CardDescription></CardHeader>
          <CardContent>
            <div className={reviewOverdue ? 'text-destructive font-semibold' : 'font-semibold'}>{procedure.next_review_date || 'Not scheduled'}</div>
          </CardContent>
        </Card>
      </div>

      {procedure.status === 'retired' ? (
        <Card>
          <CardHeader>
            <CardTitle>Retired Procedure</CardTitle>
            <CardDescription>{procedure.retired_at ? new Date(procedure.retired_at).toLocaleString() : 'Retired'}</CardDescription>
          </CardHeader>
          <CardContent>{procedure.retirement_reason || 'No retirement reason recorded.'}</CardContent>
        </Card>
      ) : null}

      <LotoLifecycleControls
        procedureId={procedure.id}
        status={procedure.status}
        activeApplicationId={activeApplication?.id || null}
        canEdit={Boolean(canEdit)}
        canApprove={Boolean(canApprove)}
        canExecute={Boolean(canExecute)}
        canRetire={Boolean(canRetire)}
      />

      <LotoRecordForm
        form={procedureForm}
        procedureId={procedure.id}
        initialValues={values}
        readOnly={!editable}
        assets={(editableAssets || []).map((asset: any) => ({
          id: asset.id,
          label: asset.asset_number + ' · ' + asset.name
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Hazardous Energy Sources</CardTitle>
          <CardDescription>
            Identify every energy source, isolation point, stored-energy control, and method used to verify effective isolation.
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Energy</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Magnitude</TableHead>
              <TableHead>Isolation Location</TableHead>
              <TableHead>Verification</TableHead>
              {editable ? <TableHead className='text-right'>Edit</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.energySources.length ? detail.energySources.map((source: any) => (
              <TableRow key={source.id}>
                <TableCell>{energyTypeLabels[source.energy_type] || source.energy_type}</TableCell>
                <TableCell className='font-medium'>{source.source_name}</TableCell>
                <TableCell>{source.magnitude || '—'}</TableCell>
                <TableCell>
                  <div>{source.isolation_location}</div>
                  {source.isolation_device ? <div className='text-textSecondary text-xs'>{source.isolation_device}</div> : null}
                </TableCell>
                <TableCell className='max-w-md whitespace-normal'>{source.verification_method}</TableCell>
                {editable ? (
                  <TableCell className='text-right'>
                    <LotoComponentDeleteButton
                      procedureId={procedure.id}
                      componentType='energy_source'
                      componentId={source.id}
                      label={source.source_name}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={editable ? 6 : 5} className='py-8 text-center'>No hazardous energy sources have been added.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {editable && energyForm ? (
        <LotoSubrecordForm procedureId={procedure.id} form={energyForm} mode='energy' />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Procedure Steps</CardTitle>
          <CardDescription>
            Ordered operational steps for notification, shutdown, isolation, lock/tag application, stored-energy control, verification, servicing, and restoration.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {detail.steps.length ? detail.steps.map((step: any, index: number) => (
            <div key={step.id} className='rounded-xl border p-4'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='flex min-w-0 gap-3'>
                  <div className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold'>{index + 1}</div>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <div className='font-semibold'>{step.title}</div>
                      <Badge size='sm' variant='outline'>{stepTypeLabels[step.step_type] || step.step_type}</Badge>
                    </div>
                    <div className='mt-2 whitespace-pre-wrap text-sm'>{step.instructions}</div>
                    {step.warning_text ? (
                      <div className='mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm'>
                        <span className='font-semibold'>Warning: </span>{step.warning_text}
                      </div>
                    ) : null}
                    {step.verification_instructions ? (
                      <div className='text-textSecondary mt-3 text-sm'>
                        <span className='font-semibold'>Verification: </span>{step.verification_instructions}
                      </div>
                    ) : null}
                  </div>
                </div>
                {editable ? (
                  <LotoComponentDeleteButton
                    procedureId={procedure.id}
                    componentType='step'
                    componentId={step.id}
                    label={step.title}
                  />
                ) : null}
              </div>
            </div>
          )) : (
            <div className='text-textSecondary rounded-xl border p-8 text-center'>No procedure steps have been added.</div>
          )}
        </CardContent>
      </Card>

      {editable && stepForm ? (
        <LotoSubrecordForm procedureId={procedure.id} form={stepForm} mode='step' />
      ) : null}

      {canReview && procedure.status === 'approved' && reviewForm ? (
        <LotoSubrecordForm procedureId={procedure.id} form={reviewForm} mode='review' />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Periodic Review History</CardTitle>
          <CardDescription>Recorded periodic inspections / reviews of this procedure.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reviewed</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Observed Employee</TableHead>
              <TableHead>Deviations</TableHead>
              <TableHead>Corrective Actions</TableHead>
              <TableHead>Next Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.reviews.length ? detail.reviews.map((review: any) => (
              <TableRow key={review.id}>
                <TableCell>{new Date(review.reviewed_at).toLocaleString()}</TableCell>
                <TableCell>{reviewResultLabels[review.review_result] || review.review_result}</TableCell>
                <TableCell>{review.employee_observed || '—'}</TableCell>
                <TableCell className='max-w-xs whitespace-normal'>{review.deviations_found || '—'}</TableCell>
                <TableCell className='max-w-xs whitespace-normal'>{review.corrective_actions || '—'}</TableCell>
                <TableCell>{review.next_review_date || '—'}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className='py-8 text-center'>No periodic reviews recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Field-Use History</CardTitle>
          <CardDescription>
            Operational use records document notification, verified energy control, and restoration checks. They do not replace the physical LOTO procedure.
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Affected Employees Notified</TableHead>
              <TableHead>Isolation Verified</TableHead>
              <TableHead>Restoration Verified</TableHead>
              <TableHead>Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.applications.length ? detail.applications.map((application: any) => (
              <TableRow key={application.id}>
                <TableCell>{new Date(application.started_at).toLocaleString()}</TableCell>
                <TableCell><Badge size='sm' variant={application.status === 'completed' ? 'tonalSuccess' : 'outline'}>{application.status.replaceAll('_', ' ')}</Badge></TableCell>
                <TableCell>{application.affected_employees_notified ? 'Yes' : 'No'}</TableCell>
                <TableCell>{application.energy_control_verified ? 'Yes' : 'No'}</TableCell>
                <TableCell>{application.restoration_verified ? 'Yes' : 'No'}</TableCell>
                <TableCell>{application.completed_at ? new Date(application.completed_at).toLocaleString() : '—'}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className='py-8 text-center'>No field-use records have been recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revision History</CardTitle>
          <CardDescription>Approved revision snapshots preserved for historical traceability.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Revision</TableHead>
              <TableHead>Preserved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.versions.length ? detail.versions.map((version: any) => (
              <TableRow key={version.id}>
                <TableCell>Revision {version.revision_number}</TableCell>
                <TableCell>{new Date(version.created_at).toLocaleString()}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={2} className='py-8 text-center'>No approved revision snapshots yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default LotoProcedurePage

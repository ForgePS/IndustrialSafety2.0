import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'

import LotoContentForm from '../LotoContentForm'
import LotoEditableItem from '../LotoEditableItem'
import LotoLifecycleControls from '../LotoLifecycleControls'
import LotoPhotoSlot from '../LotoPhotoSlot'
import LotoRecordForm from '../LotoRecordForm'
import LotoSubrecordForm from '../LotoSubrecordForm'
import type { LotoFormValues } from '../actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import {
  getLockHolderOptions,
  getLotoPhotos,
  getLotoProcedureDetail,
  getLotoReviewReturns,
  getScopedLotoAssets,
  getUserNames,
  lotoProcedureWithinScope
} from '@/lib/forgeLoto'
import {
  LOCKOUT_STATUS_LABELS,
  isOpenLockout,
  lotoReviewOverdue,
  normalizePrecautions,
  normalizeRestorationChecks,
  normalizeSequence,
  type LockoutStatus
} from '@/lib/forgeLotoRules'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import ForgeAiContextButton from '@/components/forge-ai/ForgeAiContextButton'
import LotoEnergyBadge from '@/components/loto/LotoEnergyBadge'

export const metadata: Metadata = { title: 'LOTO Procedure' }

const formatDateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : '—')

const LotoProcedurePage = async ({ params }: { params: Promise<{ id: string }> }) => {
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

  const permissions = new Map(context.access.effective.filter(item => item.allowed).map(item => [item.permissionKey, item]))

  const editPermission = permissions.get('loto.edit')
  const approvePermission = permissions.get('loto.approve')
  const reviewPermission = permissions.get('loto.review')
  const executePermission = permissions.get('loto.execute')
  const retirePermission = permissions.get('loto.retire')
  const canUseAi = Boolean(permissions.get('forge_ai.use'))

  const within = async (permission: any) =>
    permission ? lotoProcedureWithinScope({ organizationId, userId: context.user.id, scope: permission.scope, procedure }) : false

  const [canEdit, canApprove, canReview, canExecute, canRetire, editableAssets, photos, returns] = await Promise.all([
    within(editPermission),
    within(approvePermission),
    within(reviewPermission),
    within(executePermission),
    within(retirePermission),
    editPermission
      ? getScopedLotoAssets({ organizationId, userId: context.user.id, permission: editPermission as any })
      : Promise.resolve(procedure.forge_assets ? [procedure.forge_assets] : []),
    getLotoPhotos({ organizationId, procedureIds: [id] }),
    getLotoReviewReturns({ organizationId, procedureId: id })
  ])

  const holders = canExecute && executePermission && procedure.status === 'approved'
    ? await getLockHolderOptions({ organizationId, userId: context.user.id, permission: executePermission as any })
    : { options: [], trainingRequired: null }

  const editable = canEdit && ['draft', 'review'].includes(procedure.status)
  const openLockout = detail.applications.find((item: any) => isOpenLockout(item.status)) || null
  const names = await getUserNames({ organizationId, userIds: returns.map(item => item.returned_by) })

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
  const reviewOverdue = lotoReviewOverdue(procedure, today)
  const latestReturn = procedure.status === 'draft' ? returns.find(item => item.revision_number === procedure.revision_number) || null : null
  const equipmentPhotos = photos.filter(photo => !photo.energy_source_id)

  const sourceValues = (source: any): LotoFormValues => ({
    energy_type: source.energy_type || '',
    energy_code: source.energy_code || '',
    source_name: source.source_name || '',
    magnitude: source.magnitude || '',
    isolation_location: source.isolation_location || '',
    isolation_device: source.isolation_device || '',
    lockout_device: source.lockout_device || '',
    stored_energy_method: source.stored_energy_method || '',
    verification_method: source.verification_method || '',
    notes: source.notes || ''
  })

  const stepValues = (step: any): LotoFormValues => ({
    step_type: step.step_type || '',
    title: step.title || '',
    instructions: step.instructions || '',
    warning_text: step.warning_text || '',
    verification_instructions: step.verification_instructions || ''
  })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} / <Link href='/loto'>Lockout / Tagout</Link>
          </p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{procedure.title}</h1>
            <Badge size='sm' variant={procedure.status === 'approved' ? 'tonalSuccess' : procedure.status === 'retired' ? 'secondary' : 'outline'}>
              {statusLabels[procedure.status] || procedure.status}
            </Badge>
            <Badge size='sm' variant='outline'>Rev {procedure.revision_number}</Badge>
            {reviewOverdue ? <Badge size='sm' variant='destructive'>Review Overdue</Badge> : null}
            {openLockout ? <Badge size='sm' variant='destructive'>Locked Out</Badge> : null}
          </div>
          <p className='text-textSecondary mt-2'>
            {procedure.procedure_number}
            {procedure.forge_assets ? ' · ' + procedure.forge_assets.asset_number + ' · ' + procedure.forge_assets.name : ''}
          </p>
        </div>
        {canUseAi ? <ForgeAiContextButton contextType='loto' recordId={procedure.id} recordLabel={procedure.procedure_number} /> : null}
      </div>

      {latestReturn ? (
        <div className='rounded-xl border border-destructive/40 bg-destructive/5 p-4'>
          <div className='font-semibold'>Corrections requested</div>
          <div className='text-textSecondary text-xs'>
            {names[latestReturn.returned_by || ''] || 'Approver'} · {formatDateTime(latestReturn.returned_at)}
          </div>
          <div className='mt-2 whitespace-pre-wrap text-sm'>{latestReturn.notes}</div>
        </div>
      ) : null}

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Equipment</CardDescription></CardHeader>
          <CardContent>
            {procedure.forge_assets ? (
              <Link href={'/assets/' + procedure.forge_assets.id} className='font-semibold hover:underline'>{procedure.forge_assets.name}</Link>
            ) : (
              <div className='font-semibold'>—</div>
            )}
            <div className='text-textSecondary text-xs'>{procedure.forge_assets?.asset_number || '—'}</div>
          </CardContent>
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
            <CardDescription>{formatDateTime(procedure.retired_at)}</CardDescription>
          </CardHeader>
          <CardContent>{procedure.retirement_reason || 'No retirement reason recorded.'}</CardContent>
        </Card>
      ) : null}

      <LotoLifecycleControls
        procedureId={procedure.id}
        status={procedure.status}
        openLockout={openLockout ? { id: openLockout.id, lockout_number: openLockout.lockout_number } : null}
        canEdit={Boolean(canEdit)}
        canApprove={Boolean(canApprove)}
        canExecute={Boolean(canExecute)}
        canRetire={Boolean(canRetire)}
        reviewOverdue={reviewOverdue}
        personnel={holders.options}
        trainingRequired={holders.trainingRequired}
      />

      <LotoRecordForm
        form={procedureForm}
        procedureId={procedure.id}
        initialValues={values}
        readOnly={!editable}
        assets={(editableAssets || []).map((asset: any) => ({ id: asset.id, label: asset.asset_number + ' · ' + asset.name }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Equipment Photos</CardTitle>
          <CardDescription>Photos of the machine with arrows pointing at the isolation points. They print on the procedure sheet and show on the public QR page.</CardDescription>
        </CardHeader>
        <CardContent>
          <LotoPhotoSlot procedureId={procedure.id} energySourceId={null} photos={equipmentPhotos} editable={editable} label='Equipment' />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hazardous Energy Sources</CardTitle>
          <CardDescription>
            Every energy source, its isolation point, stored-energy control and how to verify zero energy. Each source prints as one row of the isolation table.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {detail.energySources.length ? (
            detail.energySources.map((source: any, index: number) => {
              const body = (
                <div className='flex flex-col gap-3'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <LotoEnergyBadge code={source.energy_code} energyType={source.energy_type} label={energyTypeLabels[source.energy_type]} />
                    <span className='font-semibold'>{source.source_name}</span>
                    <span className='text-textSecondary text-sm'>{energyTypeLabels[source.energy_type] || source.energy_type}{source.magnitude ? ' · ' + source.magnitude : ''}</span>
                  </div>
                  <div className='grid grid-cols-1 gap-2 text-sm md:grid-cols-2'>
                    <div><span className='font-semibold'>Isolation: </span>{source.isolation_location}{source.isolation_device ? ' (' + source.isolation_device + ')' : ''}</div>
                    {source.lockout_device ? <div><span className='font-semibold'>Lockout device: </span>{source.lockout_device}</div> : null}
                    {source.stored_energy_method ? <div><span className='font-semibold'>Stored energy: </span>{source.stored_energy_method}</div> : null}
                    <div><span className='font-semibold'>Verify: </span>{source.verification_method}</div>
                  </div>
                  <LotoPhotoSlot
                    procedureId={procedure.id}
                    energySourceId={source.id}
                    photos={photos.filter(photo => photo.energy_source_id === source.id)}
                    editable={editable}
                    label='Isolation point photos'
                  />
                </div>
              )

              return editable ? (
                <LotoEditableItem
                  key={source.id}
                  procedureId={procedure.id}
                  componentType='energy_source'
                  componentId={source.id}
                  label={source.source_name}
                  form={energyForm}
                  values={sourceValues(source)}
                  isFirst={index === 0}
                  isLast={index === detail.energySources.length - 1}
                >
                  {body}
                </LotoEditableItem>
              ) : (
                <div key={source.id} className='rounded-xl border p-4'>{body}</div>
              )
            })
          ) : (
            <div className='text-textSecondary rounded-xl border p-8 text-center'>No hazardous energy sources have been added.</div>
          )}
        </CardContent>
      </Card>

      {editable && energyForm ? <LotoSubrecordForm procedureId={procedure.id} form={energyForm} mode='energy' /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Procedure Steps</CardTitle>
          <CardDescription>
            Ordered steps for notification, shutdown, isolation, lock/tag, stored-energy release, verification, servicing and restoration. Crews check each one off during a lockout.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {detail.steps.length ? (
            detail.steps.map((step: any, index: number) => {
              const body = (
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
              )

              return editable ? (
                <LotoEditableItem
                  key={step.id}
                  procedureId={procedure.id}
                  componentType='step'
                  componentId={step.id}
                  label={step.title}
                  form={stepForm}
                  values={stepValues(step)}
                  isFirst={index === 0}
                  isLast={index === detail.steps.length - 1}
                  canDuplicate={procedure.status === 'draft'}
                >
                  {body}
                </LotoEditableItem>
              ) : (
                <div key={step.id} className='rounded-xl border p-4'>{body}</div>
              )
            })
          ) : (
            <div className='text-textSecondary rounded-xl border p-8 text-center'>No procedure steps have been added.</div>
          )}
        </CardContent>
      </Card>

      {editable && stepForm ? <LotoSubrecordForm procedureId={procedure.id} form={stepForm} mode='step' /> : null}

      <LotoContentForm
        key={procedure.updated_at}
        procedureId={procedure.id}
        editable={Boolean(editable)}
        initial={{
          precautions: normalizePrecautions(procedure.precautions),
          printPurpose: procedure.print_purpose || '',
          printScope: procedure.print_scope || '',
          printEnforcement: procedure.print_enforcement || '',
          shutdownSequence: normalizeSequence(procedure.shutdown_sequence),
          restoreSequence: normalizeSequence(procedure.restore_sequence),
          restorationChecks: normalizeRestorationChecks(procedure.restoration_checks)
        }}
      />

      {canReview && procedure.status === 'approved' && reviewForm ? <LotoSubrecordForm procedureId={procedure.id} form={reviewForm} mode='review' /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Lockout History</CardTitle>
          <CardDescription>Every lockout issued from this procedure, with who held locks and when the equipment returned to service.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lockout</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Work</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Verified</TableHead>
              <TableHead>Closed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.applications.length ? (
              detail.applications.map((application: any) => (
                <TableRow key={application.id}>
                  <TableCell>
                    <Link href={'/loto/lockouts/' + application.id} className='font-medium hover:underline'>{application.lockout_number || 'Lockout'}</Link>
                    {application.revision_number ? <div className='text-textSecondary text-xs'>Rev {application.revision_number}</div> : null}
                  </TableCell>
                  <TableCell>
                    <Badge size='sm' variant={application.status === 'completed' ? 'tonalSuccess' : isOpenLockout(application.status) ? 'destructive' : 'secondary'}>
                      {LOCKOUT_STATUS_LABELS[application.status as LockoutStatus] || application.status}
                    </Badge>
                  </TableCell>
                  <TableCell className='max-w-xs whitespace-normal'>{application.work_description || application.verification_notes || '—'}</TableCell>
                  <TableCell>{formatDateTime(application.started_at)}</TableCell>
                  <TableCell>{formatDateTime(application.verified_at)}</TableCell>
                  <TableCell>{formatDateTime(application.completed_at || application.canceled_at)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={6} className='py-8 text-center'>No lockouts yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

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
            {detail.reviews.length ? (
              detail.reviews.map((review: any) => (
                <TableRow key={review.id}>
                  <TableCell>{formatDateTime(review.reviewed_at)}</TableCell>
                  <TableCell>{reviewResultLabels[review.review_result] || review.review_result}</TableCell>
                  <TableCell>{review.employee_observed || '—'}</TableCell>
                  <TableCell className='max-w-xs whitespace-normal'>{review.deviations_found || '—'}</TableCell>
                  <TableCell className='max-w-xs whitespace-normal'>{review.corrective_actions || '—'}</TableCell>
                  <TableCell>{review.next_review_date || '—'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={6} className='py-8 text-center'>No periodic reviews recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {returns.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Correction Requests</CardTitle>
            <CardDescription>Notes from approvers who returned the procedure to its author.</CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Returned</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map(item => (
                <TableRow key={item.id}>
                  <TableCell>{formatDateTime(item.returned_at)}</TableCell>
                  <TableCell>Rev {item.revision_number}</TableCell>
                  <TableCell>{names[item.returned_by || ''] || '—'}</TableCell>
                  <TableCell className='max-w-md whitespace-pre-wrap'>{item.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

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
            {detail.versions.length ? (
              detail.versions.map((version: any) => (
                <TableRow key={version.id}>
                  <TableCell>Revision {version.revision_number}</TableCell>
                  <TableCell>{formatDateTime(version.created_at)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={2} className='py-8 text-center'>No approved revision snapshots yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default LotoProcedurePage

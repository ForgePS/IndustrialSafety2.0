import { notFound } from 'next/navigation'
import { assetWithinScope } from '@/lib/forgeAssets'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import IncidentRecordForm from '../IncidentRecordForm'
import IncidentWorkflowActions from '../IncidentWorkflowActions'
import IncidentEquipment from '../IncidentEquipment'
import type { IncidentFormValues } from '../actions'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getIncidentActivity, incidentWithinScope } from '@/lib/forgeIncidents'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import ForgeAiContextButton from '@/components/forge-ai/ForgeAiContextButton'

export const metadata: Metadata = { title: 'Incident' }

const IncidentDetailPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('incidents.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: incident },
    form,
    { data: locations },
    { data: divisions },
    statusLookup,
    typeLookup,
    severityLookup,
    activity
  ] = await Promise.all([
    supabase
      .from('forge_incidents')
      .select('*, locations(name, code), divisions(name, code)')
      .eq('organization_id', organizationId)
      .eq('id', id)
      .maybeSingle(),
    getEffectiveForm({ organizationId, formKey: 'incidents.report' }),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    getEffectiveLookup({ organizationId, lookupKey: 'incidents.status' }),
    getEffectiveLookup({ organizationId, lookupKey: 'incidents.type' }),
    getEffectiveLookup({ organizationId, lookupKey: 'incidents.severity' }),
    getIncidentActivity({ organizationId, incidentId: id })
  ])

  if (!incident || !form) notFound()

  const mayView = await incidentWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    incident
  })

  if (!mayView) notFound()

  const permissionByKey = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const editPermission = permissionByKey.get('incidents.edit')
  const submitPermission = permissionByKey.get('incidents.submit')
  const approvePermission = permissionByKey.get('incidents.approve')
  const closePermission = permissionByKey.get('incidents.close')
  const canUseAi = Boolean(permissionByKey.get('forge_ai.use'))
  const assetViewPermission = permissionByKey.get('assets_equipment.view')

  const canWithin = async (permission: any) =>
    permission
      ? incidentWithinScope({
          organizationId,
          userId: context.user.id,
          scope: permission.scope,
          incident
        })
      : false

  const [mayEditByScope, canSubmit, canApprove, canClose, personnel] = await Promise.all([
    canWithin(editPermission),
    canWithin(submitPermission),
    canWithin(approvePermission),
    canWithin(closePermission),
    editPermission
      ? getScopedPersonnel({
          organizationId,
          userId: context.user.id,
          permission: editPermission
        })
      : Promise.resolve([])
  ])

  const canEdit = Boolean(mayEditByScope) && ['draft','returned'].includes(incident.status)

  // A link never grants asset access. Apply the asset's current scope before displaying it.
  let linkedEquipment: Array<{
    linkId: string; assetId: string; assetNumber: string; name: string; status: string; condition: string
  }> = []
  if (assetViewPermission) {
    const { data: links, error: linkError } = await supabase.from('forge_incident_assets')
      .select('id, asset_id')
      .eq('organization_id', organizationId)
      .eq('incident_id', id)
      .order('linked_at', { ascending: true })
    if (linkError) throw new Error('Unable to load related equipment: ' + linkError.message)
    if (links?.length) {
      const { data: linkedAssets, error: assetsError } = await supabase.from('forge_assets')
        .select('id, organization_id, asset_number, name, status, condition, custodian_user_id, location_id, division_id')
        .eq('organization_id', organizationId)
        .in('id', links.map((link: any) => link.asset_id))
      if (assetsError) throw new Error('Unable to load related assets: ' + assetsError.message)
      const visible = await Promise.all((linkedAssets || []).map(async (asset: any) => ({
        asset,
        allowed: await assetWithinScope({
          organizationId, userId: context.user.id, scope: assetViewPermission.scope, asset
        })
      })))
      const byId = new Map(visible.filter(item => item.allowed).map(item => [item.asset.id, item.asset]))
      linkedEquipment = links.flatMap((link: any) => {
        const asset = byId.get(link.asset_id) as any
        return asset ? [{
          linkId: link.id, assetId: asset.id, assetNumber: asset.asset_number,
          name: asset.name, status: asset.status, condition: asset.condition
        }] : []
      })
    }
  }

  const statusLabels = Object.fromEntries(statusLookup.options.map(option => [option.key, option.label]))
  const typeLabels = Object.fromEntries(typeLookup.options.map(option => [option.key, option.label]))
  const severityLabels = Object.fromEntries(severityLookup.options.map(option => [option.key, option.label]))

  const localDateTime = incident.occurred_at
    ? new Date(incident.occurred_at).toISOString().slice(0, 16)
    : ''

  const values: IncidentFormValues = {
    incident_type: incident.incident_type,
    occurred_at: localDateTime,
    severity: incident.severity,
    location_id: incident.location_id || '',
    division_id: incident.division_id || '',
    reported_by_personnel_id: incident.reported_by_personnel_id || '',
    summary: incident.summary,
    description: incident.description || '',
    immediate_actions: incident.immediate_actions || '',
    involves_injury: incident.involves_injury,
    involves_vehicle: incident.involves_vehicle,
    property_damage: incident.property_damage
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Incidents</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>{incident.incident_number}</h1>
            <Badge size='sm' variant={incident.status === 'approved' || incident.status === 'closed' ? 'tonalSuccess' : 'secondary'}>
              {statusLabels[incident.status] || incident.status}
            </Badge>
          </div>
          <p className='text-textSecondary mt-2'>{incident.summary}</p>
        </div>
        {canUseAi ? (
          <ForgeAiContextButton
            contextType='incident'
            recordId={incident.id}
            recordLabel={incident.incident_number}
          />
        ) : null}
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Type</CardDescription></CardHeader>
          <CardContent><div className='font-semibold'>{typeLabels[incident.incident_type] || incident.incident_type}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Severity</CardDescription></CardHeader>
          <CardContent><div className='font-semibold'>{severityLabels[incident.severity] || incident.severity}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Location</CardDescription></CardHeader>
          <CardContent><div className='font-semibold'>{incident.locations?.name || '—'}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Occurred</CardDescription></CardHeader>
          <CardContent><div className='font-semibold'>{new Date(incident.occurred_at).toLocaleString()}</div></CardContent>
        </Card>
      </div>

      {incident.status === 'returned' && incident.return_reason ? (
        <Card>
          <CardHeader>
            <CardTitle>Returned for Correction</CardTitle>
            <CardDescription>The reviewer requested changes before this incident can be approved.</CardDescription>
          </CardHeader>
          <CardContent>{incident.return_reason}</CardContent>
        </Card>
      ) : null}

      {canEdit ? (
        <IncidentRecordForm
          form={form}
          incidentId={incident.id}
          initialValues={values}
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
        <Card>
          <CardHeader>
            <CardTitle>Incident Details</CardTitle>
            <CardDescription>This record is read-only in its current workflow state or under your current permissions.</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div><div className='text-textSecondary text-xs'>Description</div><div className='mt-1'>{incident.description || '—'}</div></div>
            <div><div className='text-textSecondary text-xs'>Immediate Actions</div><div className='mt-1'>{incident.immediate_actions || '—'}</div></div>
            <div><div className='text-textSecondary text-xs'>Division</div><div className='mt-1'>{incident.divisions?.name || '—'}</div></div>
            <div><div className='text-textSecondary text-xs'>Review Flags</div><div className='mt-1'>{[
              incident.involves_injury ? 'Injury / Illness' : null,
              incident.involves_vehicle ? 'Vehicle' : null,
              incident.property_damage ? 'Property Damage' : null
            ].filter(Boolean).join(', ') || 'None'}</div></div>
          </CardContent>
        </Card>
      )}

      {assetViewPermission ? <IncidentEquipment incidentId={incident.id} equipment={linkedEquipment} canEdit={canEdit} /> : null}

      <IncidentWorkflowActions
        incidentId={incident.id}
        status={incident.status}
        canSubmit={Boolean(canSubmit)}
        canApprove={Boolean(canApprove)}
        canClose={Boolean(canClose)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Workflow and record changes for this incident.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {activity.length ? activity.map((item: any) => (
            <div key={item.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium capitalize'>{String(item.activity_type).replaceAll('_', ' ')}</div>
                <div className='text-textSecondary text-xs'>{new Date(item.created_at).toLocaleString()}</div>
              </div>
              {item.message ? <div className='text-textSecondary mt-1 text-sm'>{item.message}</div> : null}
            </div>
          )) : (
            <div className='text-textSecondary text-sm'>No activity has been recorded yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default IncidentDetailPage

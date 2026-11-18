'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { assetWithinScope } from '@/lib/forgeAssets'
import { incidentWithinScope } from '@/lib/forgeIncidents'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const getEditableIncident = async (supabase: any, organizationId: string, incidentId: string, userId: string, scope: string | null) => {
  const { data: incident, error } = await supabase
    .from('forge_incidents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .maybeSingle()

  if (error || !incident) return { error: 'Incident not found.' }
  if (!['draft', 'returned'].includes(incident.status)) return { error: 'Equipment can only be changed while the incident is Draft or Returned.' }

  const allowed = await incidentWithinScope({ organizationId, userId, scope, incident })
  return allowed ? { incident } : { error: 'This incident is outside your edit scope.' }
}

const logChange = async ({
  supabase, organizationId, incidentId, assetId, assetNumber, userId, action
}: {
  supabase: any
  organizationId: string
  incidentId: string
  assetId: string
  assetNumber: string
  userId: string
  action: 'linked' | 'unlinked'
}) => {
  const message = `Asset ${assetNumber} ${action}.`
  const [activity, audit] = await Promise.all([
    supabase.from('forge_incident_activity').insert({
      organization_id: organizationId,
      incident_id: incidentId,
      activity_type: 'asset_' + action,
      message,
      actor_user_id: userId,
      metadata: { asset_id: assetId, asset_number: assetNumber }
    }),
    supabase.from('forge_creator_audit_log').insert({
      actor_user_id: userId,
      organization_id: organizationId,
      action: 'incident.asset_' + action,
      entity_type: 'incident',
      entity_id: incidentId,
      before_value: action === 'unlinked' ? { asset_id: assetId, asset_number: assetNumber } : null,
      after_value: action === 'linked' ? { asset_id: assetId, asset_number: assetNumber } : null
    })
  ])
  if (activity.error || audit.error) {
    throw new Error('Equipment change succeeded, but its activity history could not be recorded.')
  }
}

export const linkIncidentAsset = async ({ incidentId, assetNumber }: { incidentId: string; assetNumber: string }) => {
  const [incidentAccess, assetAccess] = await Promise.all([
    requireTenantPermission('incidents.edit'),
    requireTenantPermission('assets_equipment.view')
  ])
  const organizationId = incidentAccess.activeOrganization.id
  if (assetAccess.activeOrganization.id !== organizationId) return { error: 'Organization context changed. Reload and try again.' }

  const number = assetNumber.trim().toUpperCase()
  if (!number || number.length > 64) return { error: 'Enter a valid Forge asset number.' }

  const supabase = createServiceRoleClient() as any
  const checked = await getEditableIncident(supabase, organizationId, incidentId, incidentAccess.user.id, incidentAccess.permission.scope)
  if ('error' in checked) return { error: checked.error }

  const { data: asset, error: assetError } = await supabase
    .from('forge_assets')
    .select('id, organization_id, asset_number, custodian_user_id, location_id, division_id')
    .eq('organization_id', organizationId)
    .eq('asset_number', number)
    .maybeSingle()

  if (assetError || !asset || !await assetWithinScope({
    organizationId, userId: assetAccess.user.id, scope: assetAccess.permission.scope, asset
  })) return { error: 'Asset not found within your access scope.' }

  const { count, error: countError } = await supabase
    .from('forge_incident_assets')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('incident_id', incidentId)

  if (countError) return { error: 'Unable to check linked equipment.' }
  if ((count || 0) >= 25) return { error: 'This incident already has 25 linked assets.' }

  const { error } = await supabase.from('forge_incident_assets').insert({
    organization_id: organizationId,
    incident_id: incidentId,
    asset_id: asset.id,
    linked_by: incidentAccess.user.id
  })

  if (error?.code === '23505') return { error: 'This asset is already linked to the incident.' }
  if (error) return { error: 'Unable to link asset: ' + error.message }

  await logChange({
    supabase, organizationId, incidentId, assetId: asset.id,
    assetNumber: asset.asset_number, userId: incidentAccess.user.id, action: 'linked'
  })
  revalidatePath('/incidents/' + incidentId)
  revalidatePath('/assets/' + asset.id)
  return { message: 'Equipment linked to incident.' }
}

export const unlinkIncidentAsset = async ({ incidentId, linkId }: { incidentId: string; linkId: string }) => {
  const [incidentAccess, assetAccess] = await Promise.all([
    requireTenantPermission('incidents.edit'),
    requireTenantPermission('assets_equipment.view')
  ])
  const organizationId = incidentAccess.activeOrganization.id
  if (assetAccess.activeOrganization.id !== organizationId) return { error: 'Organization context changed. Reload and try again.' }

  const supabase = createServiceRoleClient() as any
  const checked = await getEditableIncident(supabase, organizationId, incidentId, incidentAccess.user.id, incidentAccess.permission.scope)
  if ('error' in checked) return { error: checked.error }

  const { data: link } = await supabase.from('forge_incident_assets')
    .select('id, asset_id')
    .eq('organization_id', organizationId)
    .eq('incident_id', incidentId)
    .eq('id', linkId)
    .maybeSingle()
  if (!link) return { error: 'Equipment link not found.' }

  const { data: asset } = await supabase.from('forge_assets')
    .select('id, organization_id, asset_number, custodian_user_id, location_id, division_id')
    .eq('organization_id', organizationId)
    .eq('id', link.asset_id)
    .maybeSingle()

  if (!asset || !await assetWithinScope({
    organizationId, userId: assetAccess.user.id, scope: assetAccess.permission.scope, asset
  })) return { error: 'Asset is outside your access scope.' }

  const { data: deleted, error } = await supabase.from('forge_incident_assets')
    .delete()
    .eq('organization_id', organizationId)
    .eq('incident_id', incidentId)
    .eq('id', linkId)
    .select('id')
    .maybeSingle()
  if (error || !deleted) return { error: 'Unable to remove equipment link.' }

  await logChange({
    supabase, organizationId, incidentId, assetId: asset.id,
    assetNumber: asset.asset_number, userId: incidentAccess.user.id, action: 'unlinked'
  })
  revalidatePath('/incidents/' + incidentId)
  revalidatePath('/assets/' + asset.id)
  return { message: 'Equipment link removed.' }
}

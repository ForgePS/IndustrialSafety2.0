import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { assetWithinScope, getScopedAssets } from '@/lib/forgeAssets'

export const lotoProcedureWithinScope = async ({
  organizationId,
  userId,
  scope,
  procedure
}: {
  organizationId: string
  userId: string
  scope: string | null
  procedure: {
    organization_id: string
    asset_id: string
  }
}) => {
  if (procedure.organization_id !== organizationId) return false

  const supabase = createServiceRoleClient() as any
  const { data: asset } = await supabase
    .from('forge_assets')
    .select('organization_id, custodian_user_id, location_id, division_id')
    .eq('organization_id', organizationId)
    .eq('id', procedure.asset_id)
    .maybeSingle()

  if (!asset) return false

  return assetWithinScope({
    organizationId,
    userId,
    scope,
    asset
  })
}

export const getScopedLotoProcedures = async ({
  organizationId,
  userId,
  permission,
  includeRetired = false
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  includeRetired?: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  const assets = await getScopedAssets({
    organizationId,
    userId,
    permission,
    includeRetired: true
  })

  const assetIds = assets.map((asset: any) => asset.id)
  if (!assetIds.length) return []

  let query = supabase
    .from('forge_loto_procedures')
    .select('*, forge_assets(id, asset_number, name, status, condition, location_id, division_id, locations(name, code), divisions(name, code))')
    .eq('organization_id', organizationId)
    .in('asset_id', assetIds)
    .order('updated_at', { ascending: false })

  if (!includeRetired) query = query.neq('status', 'retired')

  const { data, error } = await query
  if (error) throw new Error('Unable to load LOTO procedures: ' + error.message)

  return data || []
}

export const getLotoProcedureDetail = async ({
  organizationId,
  procedureId
}: {
  organizationId: string
  procedureId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const [
    { data: energySources, error: energyError },
    { data: steps, error: stepsError },
    { data: reviews, error: reviewsError },
    { data: applications, error: applicationsError },
    { data: versions, error: versionsError }
  ] = await Promise.all([
    supabase
      .from('forge_loto_energy_sources')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('sort_order'),
    supabase
      .from('forge_loto_steps')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('sort_order'),
    supabase
      .from('forge_loto_reviews')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('reviewed_at', { ascending: false }),
    supabase
      .from('forge_loto_applications')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('started_at', { ascending: false }),
    supabase
      .from('forge_loto_procedure_versions')
      .select('id, revision_number, created_at, created_by')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('revision_number', { ascending: false })
  ])

  if (energyError) throw new Error('Unable to load LOTO energy sources: ' + energyError.message)
  if (stepsError) throw new Error('Unable to load LOTO steps: ' + stepsError.message)
  if (reviewsError) throw new Error('Unable to load LOTO reviews: ' + reviewsError.message)
  if (applicationsError) throw new Error('Unable to load LOTO applications: ' + applicationsError.message)
  if (versionsError) throw new Error('Unable to load LOTO versions: ' + versionsError.message)

  return {
    energySources: energySources || [],
    steps: steps || [],
    reviews: reviews || [],
    applications: applications || [],
    versions: versions || []
  }
}

export const getScopedLotoAssets = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  return getScopedAssets({
    organizationId,
    userId,
    permission,
    includeRetired: false
  })
}

import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { lotoProcedureWithinScope } from '@/lib/forgeLoto'
import { getTenantContext } from '@/lib/forgeTenantContext'

/** Like requireTenantPermission, but returns null instead of redirecting (for route handlers). */
export const tenantPermissionOrNull = async (permissionKey: string) => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return null

  const access = await getEffectiveTenantAccess({ organizationId: context.activeOrganization.id, userId: context.user.id })
  const permission = access.effective.find(item => item.permissionKey === permissionKey)

  if (!permission?.allowed) return null

  return { ...context, user: context.user, activeOrganization: context.activeOrganization, permission, access }
}

/** Whether the bytes start like a JPEG, PNG or WebP file, so a renamed file cannot pose as a photo. */
export const looksLikePhoto = (bytes: Uint8Array, contentType: string) => {
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (contentType === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (contentType === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'

  return false
}

/** Server helpers shared by the LOTO server actions. Callers check permissions first. */

export const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()

  return cleaned ? cleaned : null
}

export const audit = async ({
  supabase,
  actorUserId,
  organizationId,
  action,
  entityType,
  entityId,
  before,
  after,
  reason
}: {
  supabase: any
  actorUserId: string
  organizationId: string
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  reason?: string | null
}) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null,
    reason: reason ?? null
  })
}

export const loadProcedure = async ({
  supabase,
  organizationId,
  procedureId
}: {
  supabase: any
  organizationId: string
  procedureId: string
}) => {
  const { data } = await supabase
    .from('forge_loto_procedures')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', procedureId)
    .maybeSingle()

  return data || null
}

export const requireProcedureInScope = async ({
  organizationId,
  userId,
  scope,
  procedureId,
  supabase
}: {
  organizationId: string
  userId: string
  scope: string | null
  procedureId: string
  supabase: any
}) => {
  const procedure = await loadProcedure({ supabase, organizationId, procedureId })

  if (!procedure) return { error: 'LOTO procedure not found.' } as const

  const allowed = await lotoProcedureWithinScope({
    organizationId,
    userId,
    scope,
    procedure
  })

  if (!allowed) return { error: 'This LOTO procedure is outside your access scope.' } as const
  
return { procedure } as const
}

export const buildProcedureSnapshot = async ({
  supabase,
  organizationId,
  procedure
}: {
  supabase: any
  organizationId: string
  procedure: any
}) => {
  const [{ data: energySources }, { data: steps }, { data: photos }] = await Promise.all([
    supabase
      .from('forge_loto_energy_sources')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedure.id)
      .order('sort_order'),
    supabase
      .from('forge_loto_steps')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedure.id)
      .order('sort_order'),
    supabase
      .from('forge_loto_photos')
      .select('id, energy_source_id, storage_path, file_name, content_type, caption, annotations, sort_order')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedure.id)
      .order('sort_order')
  ])

  // Photo rows are kept in the snapshot; their files stay in storage when a later revision removes them.
  return {
    procedure,
    energy_sources: energySources || [],
    steps: steps || [],
    photos: photos || []
  }
}

export const storeRevisionSnapshot = async ({
  supabase,
  organizationId,
  procedure,
  userId
}: {
  supabase: any
  organizationId: string
  procedure: any
  userId: string
}) => {
  const snapshot = await buildProcedureSnapshot({ supabase, organizationId, procedure })

  const { error } = await supabase
    .from('forge_loto_procedure_versions')
    .upsert({
      organization_id: organizationId,
      procedure_id: procedure.id,
      revision_number: procedure.revision_number,
      snapshot,
      created_by: userId
    }, { onConflict: 'procedure_id,revision_number' })

  if (error) throw new Error('Unable to preserve LOTO revision: ' + error.message)
}

/**
 * The asset's active "View LOTO Procedures" QR code. 1.0 created it when a sheet was printed;
 * 2.0 does the same, but only for people allowed to create QR codes. Returns the token or null.
 */
export const findOrCreateLotoQr = async ({
  organizationId,
  asset,
  userId,
  canCreate
}: {
  organizationId: string
  asset: { id: string; asset_number?: string | null; name?: string | null }
  userId: string
  canCreate: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: existing } = await supabase
    .from('forge_qr_codes')
    .select('id, token, expires_at')
    .eq('organization_id', organizationId)
    .eq('target_type', 'asset')
    .eq('target_id', asset.id)
    .eq('default_action', 'loto_view')
    .eq('status', 'active')
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  const now = Date.now()
  const live = (existing || []).find((qr: any) => !qr.expires_at || new Date(qr.expires_at).getTime() > now)

  if (live) return live.token as string

  if (!canCreate) return null

  const { data: qrNumber, error: numberError } = await supabase.rpc('next_forge_qr_number', { p_organization_id: organizationId })

  if (numberError || !qrNumber) return null

  const { data: qrCode, error } = await supabase
    .from('forge_qr_codes')
    .insert({
      organization_id: organizationId,
      qr_number: qrNumber,
      name: `LOTO · ${asset.asset_number || ''} ${asset.name || ''}`.trim(),
      description: 'Opens the approved Lockout / Tagout procedures for this equipment. Works without signing in.',
      status: 'active',
      target_type: 'asset',
      target_id: asset.id,
      default_action: 'loto_view',
      created_by: userId,
      updated_by: userId
    })
    .select('id, token')
    .single()

  if (error || !qrCode) return null

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: userId,
    organization_id: organizationId,
    action: 'qr.created',
    entity_type: 'managed_qr_code',
    entity_id: qrCode.id,
    after_value: { qr_number: qrNumber, target_id: asset.id, default_action: 'loto_view', created_from: 'loto_print' }
  })

  return qrCode.token as string
}

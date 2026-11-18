import { createHash, randomBytes } from 'node:crypto'

import { cookies, headers } from 'next/headers'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { vehicleDisplayName } from '@/lib/forgeFleetRules'
import { optionalUserId } from '@/lib/platform/identity'
import type { QrActionConfig, ScanAccessMode, ScanEventAction, ScanTargetType, ScanViewer } from '@/lib/forgeScanRules'
import { QR_TOKEN_PATTERN, allowsEmployeeIdentification, parseQrActionConfig, parseScanAccessMode, personnelDisplayName } from '@/lib/forgeScanRules'

/**
 * Port slice 10: server side of the public scan page (/scan/<token>). Server only.
 *
 * - loadScanQr: the active QR for a token, with its access mode and parsed action config
 * - loadScanTarget: what the QR points at (asset, location or form template)
 * - resolveScanViewer: who is looking (signed-in member of the QR's company, employee identified by
 *   number on this QR, or anonymous)
 * - identifyScanEmployee / signOutScanEmployee: employee-number sessions, rate limited like the training
 *   kiosk (8 failures in 15 minutes per device and per number). 1.0 had no limit and re-sent the number.
 * - recordScanEvent: the scan log (forge_qr_scans with action / person / result)
 * - setAssetServiceStatus: out of service / return to service with a status history row
 *
 * Every mutation on the scan page must call loadScanQr + resolveScanViewer again and check the action
 * with canUseScanAction from forgeScanRules: nothing from the browser is trusted.
 */

export const SCAN_SESSION_COOKIE = 'forge_scan_session'
export const SCAN_SESSION_HOURS = 8

const db = () => createServiceRoleClient() as any

export const hashScanToken = (token: string) => createHash('sha256').update(token).digest('hex')

export type ScanQr = {
  id: string
  organizationId: string
  organizationName: string
  qrNumber: string
  token: string
  name: string
  description: string | null
  targetType: ScanTargetType
  targetId: string
  defaultAction: string
  accessMode: ScanAccessMode
  config: QrActionConfig
}

export type ScanTarget =
  | {
      type: 'asset'
      id: string
      name: string
      number: string | null
      status: string
      assetType: string | null
      locationId: string | null
      locationName: string | null
      divisionId: string | null
    }
  | { type: 'location'; id: string; name: string; locationId: string; divisionId: null }
  | {
      type: 'vehicle'
      id: string
      name: string
      number: string
      status: string
      dotRegulated: boolean
      mileage: number | null
      locationId: string | null
      locationName: string | null
      divisionId: string | null
      assignedDriverPersonnelId: string | null
    }
  | { type: 'form'; id: string; name: string; status: string; currentVersion: number }

/** The target fields buildScanActions needs (asset status, or vehicle status and DOT regulation). */
export const scanMenuTargetInput = (target: ScanTarget) => ({
  assetStatus: target.type === 'asset' ? target.status : null,
  vehicleStatus: target.type === 'vehicle' ? target.status : null,
  vehicleDotRegulated: target.type === 'vehicle' ? target.dotRegulated : null
})

/** The active, unexpired QR for a token, or null. */
export const loadScanQr = async (token: string): Promise<ScanQr | null> => {
  if (!QR_TOKEN_PATTERN.test(token || '')) return null

  const { data } = await db()
    .from('forge_qr_codes')
    .select('id, organization_id, qr_number, token, name, description, status, target_type, target_id, default_action, expires_at, archived_at, access_mode, action_config, organizations(name)')
    .eq('token', token.toLowerCase())
    .eq('status', 'active')
    .is('archived_at', null)
    .maybeSingle()

  if (!data || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) return null

  return {
    id: data.id,
    organizationId: data.organization_id,
    organizationName: data.organizations?.name || '',
    qrNumber: data.qr_number,
    token: data.token,
    name: data.name,
    description: data.description,
    targetType: data.target_type,
    targetId: data.target_id,
    defaultAction: data.default_action,
    accessMode: parseScanAccessMode(data.access_mode),
    config: parseQrActionConfig(data.action_config)
  }
}

export const loadScanTarget = async (qr: ScanQr): Promise<ScanTarget | null> => {
  const supabase = db()

  if (qr.targetType === 'asset') {
    const { data } = await supabase
      .from('forge_assets')
      .select('id, name, asset_number, status, asset_type, location_id, division_id, locations(name)')
      .eq('organization_id', qr.organizationId)
      .eq('id', qr.targetId)
      .maybeSingle()

    return data
      ? {
          type: 'asset',
          id: data.id,
          name: data.name,
          number: data.asset_number,
          status: data.status,
          assetType: data.asset_type,
          locationId: data.location_id,
          locationName: data.locations?.name || null,
          divisionId: data.division_id
        }
      : null
  }

  if (qr.targetType === 'location') {
    const { data } = await supabase.from('locations').select('id, name').eq('organization_id', qr.organizationId).eq('id', qr.targetId).maybeSingle()

    return data ? { type: 'location', id: data.id, name: data.name, locationId: data.id, divisionId: null } : null
  }

  if (qr.targetType === 'vehicle') {
    const { data } = await supabase
      .from('forge_fleet_vehicles')
      .select('id, vehicle_number, unit_number, year, make, model, status, dot_regulated, mileage, location_id, division_id, assigned_driver_personnel_id, archived_at, locations(name)')
      .eq('organization_id', qr.organizationId)
      .eq('id', qr.targetId)
      .maybeSingle()

    return data && !data.archived_at
      ? {
          type: 'vehicle',
          id: data.id,
          name: vehicleDisplayName(data),
          number: data.vehicle_number,
          status: data.status,
          dotRegulated: Boolean(data.dot_regulated),
          mileage: data.mileage ?? null,
          locationId: data.location_id,
          locationName: data.locations?.name || null,
          divisionId: data.division_id,
          assignedDriverPersonnelId: data.assigned_driver_personnel_id
        }
      : null
  }

  const { data } = await supabase
    .from('forge_form_templates')
    .select('id, title, status, current_version')
    .eq('organization_id', qr.organizationId)
    .eq('id', qr.targetId)
    .maybeSingle()

  return data ? { type: 'form', id: data.id, name: data.title, status: data.status, currentVersion: data.current_version } : null
}

const clientIp = async () => {
  const list = await headers()

  return (list.get('x-forwarded-for') || '').split(',')[0].trim() || list.get('x-real-ip') || 'unknown'
}

export const scanUserAgent = async () => (await headers()).get('user-agent')

const cookiePath = (qr: ScanQr) => `/scan/${qr.token}`

/** The employee session on this QR, from the httpOnly cookie, or null. */
const employeeSession = async (qr: ScanQr) => {
  const raw = (await cookies()).get(SCAN_SESSION_COOKIE)?.value

  if (!raw || !/^[a-f0-9]{64}$/.test(raw) || !allowsEmployeeIdentification(qr.accessMode)) return null

  const supabase = db()

  const { data: session } = await supabase
    .from('forge_qr_scan_sessions')
    .select('id, personnel_id, expires_at, revoked_at, forge_personnel(id, first_name, last_name, preferred_name, employment_status, archived_at)')
    .eq('session_token_hash', hashScanToken(raw))
    .eq('qr_code_id', qr.id)
    .maybeSingle()

  const person = session?.forge_personnel

  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null
  if (!person || person.archived_at || person.employment_status === 'terminated') return null

  await supabase.from('forge_qr_scan_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id)

  return { personnelId: person.id as string, name: personnelDisplayName(person) }
}

/**
 * Who is looking at this QR. A signed-in user counts only when they are an active member of the QR's
 * company; otherwise an employee session on this QR; otherwise anonymous.
 */
export const resolveScanViewer = async (qr: ScanQr): Promise<ScanViewer> => {
  const userId = await optionalUserId()
  const supabase = db()

  if (userId) {
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('organization_id', qr.organizationId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (membership) {
      const [access, { data: person }, { data: directory }] = await Promise.all([
        getEffectiveTenantAccess({ organizationId: qr.organizationId, userId }),
        supabase
          .from('forge_personnel')
          .select('id, first_name, last_name, preferred_name')
          .eq('organization_id', qr.organizationId)
          .eq('auth_user_id', userId)
          .is('archived_at', null)
          .maybeSingle(),
        supabase.from('users').select('name, email').eq('user_id', userId).maybeSingle()
      ])

      return {
        kind: 'user',
        userId,
        personnelId: person?.id || null,
        name: person ? personnelDisplayName(person) : directory?.name || directory?.email || 'Signed-in user',
        permissions: access.effective.filter(item => item.allowed).map(item => item.permissionKey)
      }
    }
  }

  const employee = await employeeSession(qr)

  return employee ? { kind: 'employee', ...employee } : { kind: 'anonymous' }
}

/** Actor fields for records written from a scan. */
export const scanActor = (viewer: ScanViewer) => ({
  userId: viewer.kind === 'user' ? viewer.userId : null,
  personnelId: viewer.kind === 'anonymous' ? null : viewer.personnelId,
  name: viewer.kind === 'anonymous' ? null : viewer.name
})

const GENERIC_FAILURE = 'That employee number was not recognized.'

/**
 * Employee-number sign-in on one QR. Failures never reveal whether a number exists. On success the
 * session cookie is set (httpOnly, path /scan/<token>).
 */
export const identifyScanEmployee = async (qr: ScanQr, employeeNumber: string): Promise<{ error: string } | { personnelId: string; name: string }> => {
  if (!allowsEmployeeIdentification(qr.accessMode)) return { error: 'This QR code needs you to sign in to Forge.' }

  const number = (employeeNumber || '').trim()

  if (!number || number.length > 120) return { error: 'Enter your employee number.' }

  const supabase = db()
  const { data: key } = await supabase.rpc('forge_employee_number_key', { raw: number })
  const buckets = [`ip:${await clientIp()}`, `emp:${key || number.toLowerCase()}`]

  const { data: limits } = await supabase.from('forge_qr_scan_rate_limits').select('blocked_until').eq('qr_code_id', qr.id).in('bucket_key', buckets)

  if ((limits || []).some((row: any) => row.blocked_until && Date.parse(row.blocked_until) > Date.now())) {
    return { error: 'Too many attempts. Wait 15 minutes and try again, or ask your supervisor.' }
  }

  const { data: matches } = await supabase.rpc('forge_find_personnel_by_employee_number', {
    p_organization_id: qr.organizationId,
    p_employee_number: number
  })

  const person = (matches || [])[0]

  if (!person || person.employment_status === 'terminated') {
    for (const bucket of buckets) await supabase.rpc('forge_qr_scan_register_failure', { p_qr_code_id: qr.id, p_bucket_key: bucket })
    await recordScanEvent({ qr, action: 'identify', result: 'denied', viewer: { kind: 'anonymous' } })

    return { error: GENERIC_FAILURE }
  }

  const sessionToken = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SCAN_SESSION_HOURS * 3_600_000)

  const { error } = await supabase.from('forge_qr_scan_sessions').insert({
    organization_id: qr.organizationId,
    qr_code_id: qr.id,
    personnel_id: person.id,
    session_token_hash: hashScanToken(sessionToken),
    expires_at: expiresAt.toISOString()
  })

  if (error) return { error: 'Unable to sign in right now.' }

  await supabase.from('forge_qr_scan_rate_limits').delete().eq('qr_code_id', qr.id).eq('bucket_key', buckets[1])

  ;(await cookies()).set(SCAN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: cookiePath(qr),
    expires: expiresAt
  })

  const name = personnelDisplayName(person)

  await recordScanEvent({ qr, action: 'identify', viewer: { kind: 'employee', personnelId: person.id, name } })

  return { personnelId: person.id, name }
}

export const signOutScanEmployee = async (qr: ScanQr) => {
  const store = await cookies()
  const raw = store.get(SCAN_SESSION_COOKIE)?.value

  if (raw && /^[a-f0-9]{64}$/.test(raw)) {
    await db().from('forge_qr_scan_sessions').update({ revoked_at: new Date().toISOString() }).eq('session_token_hash', hashScanToken(raw)).eq('qr_code_id', qr.id)
  }

  store.delete({ name: SCAN_SESSION_COOKIE, path: cookiePath(qr) })
}

/** One scan-log row. 'open' also bumps the QR's scan count. Never throws. */
export const recordScanEvent = async ({
  qr,
  action,
  viewer,
  result = 'ok',
  recordType = null,
  recordId = null,
  metadata = {}
}: {
  qr: ScanQr
  action: ScanEventAction
  viewer: ScanViewer
  result?: 'ok' | 'denied' | 'failed'
  recordType?: string | null
  recordId?: string | null
  metadata?: Record<string, unknown>
}) => {
  try {
    const actor = scanActor(viewer)

    await db().rpc('forge_record_qr_event', {
      p_qr_code_id: qr.id,
      p_action: action,
      p_result: result,
      p_auth_user_id: actor.userId,
      p_personnel_id: actor.personnelId,
      p_record_type: recordType,
      p_record_id: recordId,
      p_metadata: { viewer: viewer.kind, ...metadata },
      p_user_agent: await scanUserAgent()
    })
  } catch {
    // The scan log must never break the action itself.
  }
}

/**
 * Out of service / return to service for the QR's asset. Writes forge_asset_status_history (through
 * forge_set_asset_service_status) and a forge_asset_activity row. The caller checks the action.
 * Returns changed: false when the asset already had that status.
 */
export const setAssetServiceStatus = async ({
  qr,
  assetId,
  status,
  viewer,
  reason = null,
  notes = null,
  source = 'qr_scan',
  relatedRecordType = null,
  relatedRecordId = null
}: {
  qr: ScanQr
  assetId: string
  status: 'active' | 'out_of_service'
  viewer: ScanViewer
  reason?: string | null
  notes?: string | null
  source?: 'qr_scan' | 'qr_issue' | 'qr_inspection'
  relatedRecordType?: string | null
  relatedRecordId?: string | null
}): Promise<{ error: string } | { changed: boolean; historyId: string | null }> => {
  const actor = scanActor(viewer)
  const supabase = db()

  const { data: historyId, error } = await supabase.rpc('forge_set_asset_service_status', {
    p_organization_id: qr.organizationId,
    p_asset_id: assetId,
    p_status: status,
    p_reason: reason,
    p_notes: notes,
    p_source: source,
    p_qr_code_id: qr.id,
    p_actor_user_id: actor.userId,
    p_actor_personnel_id: actor.personnelId,
    p_actor_name: actor.name,
    p_related_record_type: relatedRecordType,
    p_related_record_id: relatedRecordId
  })

  if (error) return { error: error.message || 'Unable to change the service status.' }
  if (!historyId) return { changed: false, historyId: null }

  const outOfService = status === 'out_of_service'
  const who = actor.name || 'A scanner'

  await supabase.from('forge_asset_activity').insert({
    organization_id: qr.organizationId,
    asset_id: assetId,
    activity_type: outOfService ? 'out_of_service' : 'returned_to_service',
    message: outOfService ? `${who} marked this asset out of service from QR ${qr.qrNumber}${reason ? `: ${reason}` : ''}.` : `${who} returned this asset to service from QR ${qr.qrNumber}.`,
    actor_user_id: actor.userId,
    metadata: { qr_code_id: qr.id, source, reason, notes, actor_personnel_id: actor.personnelId, history_id: historyId }
  })

  await recordScanEvent({
    qr,
    action: outOfService ? 'out_of_service' : 'return_to_service',
    viewer,
    recordType: 'asset',
    recordId: assetId,
    metadata: { source, reason }
  })

  return { changed: true, historyId }
}

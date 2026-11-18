import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { isTenantFeatureAvailable } from '@/lib/forgeFeatureAvailability'
import { loadFleetSettings, ownPersonnelIds } from '@/lib/forgeFleetAccess'
import {
  RECIPIENT_PERMISSIONS,
  documentNotice,
  dvirDefectNotice,
  fleetDigest,
  maintenanceNotice,
  noticeReachesRecipient,
  vehicleNotices
} from '@/lib/forgeFleetNotifyRules'
import type { FleetNotice, NoticeVehicle, RecipientScope, ScopeGrant } from '@/lib/forgeFleetNotifyRules'
import { REMOVED_STATUSES, todayIso } from '@/lib/forgeFleetRules'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

/**
 * Port slice 11: fleet reminders (1.0 never sent any). For every organization with the Fleet feature:
 * registration due, insurance expiring, annual inspection due, maintenance due soon / overdue, DVIR defects
 * waiting for a mechanic more than 24 hours, and vehicle documents expiring. The window is the fleet
 * setting renewal_warning_days.
 *
 * Recipients: active members with fleet.edit (every kind) or fleet.maintenance (maintenance and DVIR kinds)
 * whose scope covers the vehicle. forge_fleet_notice_log makes each reminder go to each person once per
 * subject and due point (date, mileage or DVIR). New reminders are sent as ONE digest per recipient per run:
 * a forge_notification_events row with an in-app delivery and a pending email delivery (the outbox drain at
 * /api/helpdesk/cron sends the email).
 */

const SOURCE = 'fleet'

const db = () => createServiceRoleClient() as any

type Recipient = RecipientScope & { userId: string; grants: Partial<Record<string, ScopeGrant | null>> }

/** Members holding fleet.edit or fleet.maintenance through a role or an allow override (prefilter only). */
const permissionCandidates = async (organizationId: string) => {
  const supabase = db()
  const { data: permissions } = await supabase.from('forge_permission_registry').select('id').in('permission_key', RECIPIENT_PERMISSIONS as unknown as string[])
  const permissionIds = (permissions || []).map((row: any) => row.id)

  if (!permissionIds.length) return []

  const [{ data: grants }, { data: overrides }] = await Promise.all([
    supabase.from('forge_tenant_role_permissions').select('role_id').in('permission_id', permissionIds).eq('allowed', true),
    supabase.from('forge_user_permission_overrides').select('user_id').eq('organization_id', organizationId).in('permission_id', permissionIds).eq('override_state', 'allow')
  ])

  const roleIds = [...new Set<string>((grants || []).map((row: any) => row.role_id))]

  const { data: roleUsers } = roleIds.length
    ? await supabase.from('forge_tenant_user_roles').select('user_id').eq('organization_id', organizationId).in('role_id', roleIds)
    : { data: [] }

  const ids = [...new Set<string>([...(roleUsers || []), ...(overrides || [])].map((row: any) => row.user_id))]

  if (!ids.length) return []

  const { data: members } = await supabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true).in('user_id', ids)

  return [...new Set<string>((members || []).map((row: any) => row.user_id))]
}

/** Every member who may get fleet reminders, with their grants and the scope data to match vehicles. */
export const fleetRecipients = async (organizationId: string): Promise<Recipient[]> => {
  const candidates = await permissionCandidates(organizationId)

  const recipients = await Promise.all(
    candidates.map(async userId => {
      const access = await getEffectiveTenantAccess({ organizationId, userId })
      const grants: Recipient['grants'] = {}

      for (const key of RECIPIENT_PERMISSIONS) {
        const grant = access.effective.find(item => item.permissionKey === key && item.allowed)

        grants[key] = grant ? { scope: grant.scope } : null
      }

      if (!Object.values(grants).some(Boolean)) return null

      const needsAssignments = Object.values(grants).some(grant => grant && (grant.scope === 'location' || grant.scope === 'division'))

      const [personnelIds, assignments] = await Promise.all([
        ownPersonnelIds(organizationId, userId),
        needsAssignments ? getTenantScopeAssignments({ organizationId, userId }) : Promise.resolve({ locationIds: [] as string[], divisionIds: [] as string[] })
      ])

      return { userId, grants, personnelIds, locationIds: assignments.locationIds, divisionIds: assignments.divisionIds }
    })
  )

  return recipients.filter(Boolean) as Recipient[]
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** Every reminder due today for the organization's vehicles, with the vehicle each one is about. */
export const collectFleetNotices = async (organizationId: string, now = new Date()) => {
  const supabase = db()
  const settings = await loadFleetSettings(organizationId)
  const warningDays = settings.renewal_warning_days

  const { data: vehicleRows, error } = await supabase
    .from('forge_fleet_vehicles')
    .select(
      'id, organization_id, vehicle_number, unit_number, year, make, model, status, mileage, location_id, division_id, assigned_driver_personnel_id, registration_renewal_date, registration_renewal_month, insurance_expires_on, annual_inspection_due_on'
    )
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .not('status', 'in', `(${REMOVED_STATUSES.join(',')})`)

  if (error) throw new Error('Unable to load vehicles: ' + error.message)

  const vehicles = new Map<string, NoticeVehicle>((vehicleRows || []).map((row: any) => [row.id, row]))
  const notices: FleetNotice[] = []

  if (!vehicles.size) return { notices, vehicles, warningDays }

  const horizon = addDays(todayIso(now), warningDays)
  const dvirCutoff = new Date(now.getTime() - 24 * 3_600_000).toISOString()

  const [{ data: maintenance }, { data: dvirs }, { data: documents }] = await Promise.all([
    supabase
      .from('forge_fleet_maintenance')
      .select('id, vehicle_id, maintenance_number, title, status, due_on, due_mileage')
      .eq('organization_id', organizationId)
      .eq('status', 'open'),
    supabase
      .from('forge_fleet_dvirs')
      .select('id, vehicle_id, dvir_number, status, created_at, archived_at')
      .eq('organization_id', organizationId)
      .eq('status', 'open')
      .is('archived_at', null)
      .lt('created_at', dvirCutoff),
    supabase
      .from('forge_fleet_documents')
      .select('id, vehicle_id, title, file_name, document_type, expires_on, archived_at')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .not('expires_on', 'is', null)
      .lte('expires_on', horizon)
  ])

  for (const vehicle of vehicles.values()) notices.push(...vehicleNotices(vehicle, warningDays, now))

  for (const record of maintenance || []) {
    const vehicle = vehicles.get(record.vehicle_id)
    const notice = vehicle ? maintenanceNotice(record, vehicle, warningDays, now) : null

    if (notice) notices.push(notice)
  }

  for (const dvir of dvirs || []) {
    const vehicle = vehicles.get(dvir.vehicle_id)
    const notice = vehicle ? dvirDefectNotice(dvir, vehicle, now) : null

    if (notice) notices.push(notice)
  }

  for (const document of documents || []) {
    const vehicle = vehicles.get(document.vehicle_id)
    const notice = vehicle ? documentNotice(document, vehicle, warningDays, now) : null

    if (notice) notices.push(notice)
  }

  return { notices, vehicles, warningDays }
}

/** Sends one digest to the recipient with the reminders not sent to them before. Returns how many were new. */
const queueDigest = async (organizationId: string, userId: string, notices: FleetNotice[], now: Date) => {
  const supabase = db()
  const rows = notices.map(notice => ({ organization_id: organizationId, kind: notice.kind, subject_id: notice.subjectId, due_key: notice.dueKey, recipient_user_id: userId }))
  const fresh: Array<{ id: number; kind: string; subject_id: string; due_key: string }> = []

  // Claim the log rows first: a reminder that is already logged (an earlier or parallel run) is skipped.
  for (let start = 0; start < rows.length; start += 500) {
    const { data, error } = await supabase
      .from('forge_fleet_notice_log')
      .upsert(rows.slice(start, start + 500), { onConflict: 'kind,subject_id,due_key,recipient_user_id', ignoreDuplicates: true })
      .select('id, kind, subject_id, due_key')

    if (error) throw new Error('Unable to log fleet reminders: ' + error.message)
    fresh.push(...(data || []))
  }

  if (!fresh.length) return 0

  const claimed = new Set(fresh.map(row => `${row.kind}|${row.subject_id}|${row.due_key}`))
  const items = notices.filter(notice => claimed.has(`${notice.kind}|${notice.subjectId}|${notice.dueKey}`))
  const logIds = fresh.map(row => row.id)
  const release = () => supabase.from('forge_fleet_notice_log').delete().in('id', logIds)
  const digest = fleetDigest(items, now)

  const { data: event, error } = await supabase
    .from('forge_notification_events')
    .insert({
      organization_id: organizationId,
      source_module: SOURCE,
      event_type: 'fleet_reminders',
      visibility: 'customer',
      resource_type: items.length === 1 ? 'fleet_' + items[0].kind : 'fleet_digest',
      resource_id: items.length === 1 ? items[0].subjectId : null,
      actor_user_id: null,
      title: digest.title,
      body: digest.body,
      payload: {
        kind: 'fleet_reminders',
        recipient_user_id: userId,
        items: items.slice(0, 100).map(item => ({ kind: item.kind, subject_id: item.subjectId, vehicle_id: item.vehicleId, due_key: item.dueKey }))
      }
    })
    .select('id')
    .single()

  if (error || !event) {
    await release()
    throw new Error('Unable to queue the fleet reminder: ' + (error?.message || 'no event'))
  }

  const sentAt = now.toISOString()

  const { error: deliveryError } = await supabase.from('forge_notification_deliveries').insert(
    (['in_app', 'email'] as const).map(channel => ({
      event_id: event.id,
      organization_id: organizationId,
      recipient_user_id: userId,
      recipient_audience: 'customer',
      channel,
      status: channel === 'in_app' ? 'sent' : 'pending',
      title: digest.title,
      body: digest.body,
      link_path: digest.link,
      sent_at: channel === 'in_app' ? sentAt : null
    }))
  )

  if (deliveryError) {
    await supabase.from('forge_notification_events').delete().eq('id', event.id)
    await release()
    throw new Error('Unable to queue the fleet reminder delivery: ' + deliveryError.message)
  }

  await supabase.from('forge_fleet_notice_log').update({ event_id: event.id }).in('id', logIds)

  return items.length
}

/** Reminders for one organization. */
export const queueFleetReminders = async (organizationId: string, now = new Date()) => {
  const { notices, vehicles } = await collectFleetNotices(organizationId, now)

  if (!notices.length) return { notices: 0, recipients: 0, queued: 0, digests: 0 }

  const recipients = await fleetRecipients(organizationId)
  let queued = 0
  let digests = 0
  const failures: string[] = []

  for (const recipient of recipients) {
    const mine = notices.filter(notice => {
      const vehicle = vehicles.get(notice.vehicleId)

      return vehicle ? noticeReachesRecipient(notice, recipient.grants, recipient, vehicle) : false
    })

    if (!mine.length) continue

    try {
      const count = await queueDigest(organizationId, recipient.userId, mine, now)

      queued += count
      if (count) digests += 1
    } catch (failure) {
      console.error('[fleet] reminders', organizationId, recipient.userId, (failure as Error).message)
      failures.push((failure as Error).message)
    }
  }

  return { notices: notices.length, recipients: recipients.length, queued, digests, ...(failures.length ? { failures: failures.length } : {}) }
}

/** The scheduled job: every organization with fleet vehicles and the Fleet feature turned on. */
export const runFleetCron = async ({ now = new Date() }: { now?: Date } = {}) => {
  const { data, error } = await db().from('forge_fleet_vehicles').select('organization_id').is('archived_at', null)

  if (error) throw new Error('Unable to load fleet organizations: ' + error.message)

  const organizationIds = [...new Set<string>((data || []).map((row: any) => row.organization_id))]
  const results = []

  for (const organizationId of organizationIds) {
    try {
      if (!(await isTenantFeatureAvailable({ organizationId, featureKey: 'fleet' }))) {
        results.push({ organizationId, skipped: 'Fleet is not turned on.' })
        continue
      }

      results.push({ organizationId, ...(await queueFleetReminders(organizationId, now)) })
    } catch (failure) {
      console.error('[fleet] cron', organizationId, (failure as Error).message)
      results.push({ organizationId, error: (failure as Error).message })
    }
  }

  return { checked: organizationIds.length, results }
}

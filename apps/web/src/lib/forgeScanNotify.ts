import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { vehicleWithinScope } from '@/lib/forgeFleetAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

/**
 * Port slice 10: notices for an issue reported from a QR scan (1.0 only logged that it "would notify").
 * Same shared notification service as forgeCapaNotify / forgeFormNotify: one forge_notification_events row
 * per recipient with an in-app delivery and a pending email delivery that the outbox drain sends.
 *
 * Recipients: active members holding qr_management.view_issues or corrective_actions.assign whose scope
 * covers the report (organization scope, or location / division scope that includes the report's location),
 * plus the asset's custodian (custodian user, or the custodian personnel's login). The reporter is skipped.
 * Critical issues and immediate hazards are urgent: the title starts with "URGENT" and payload.urgent is
 * true (the notification tables have no priority column).
 *
 * Never throws: a notice problem must never fail the report.
 */

const SOURCE = 'qr_management'
const RECIPIENT_PERMISSIONS = ['qr_management.view_issues', 'corrective_actions.assign']

/** Vehicle issues also go to fleet.edit holders whose fleet scope covers the vehicle (port slice 11). */
const VEHICLE_RECIPIENT_PERMISSION = 'fleet.edit'

export type ScanIssueVehicle = {
  id: string
  location_id: string | null
  division_id: string | null
  assigned_driver_personnel_id: string | null
}

const db = () => createServiceRoleClient() as any

const activeMemberIds = async (organizationId: string, userIds: string[]) => {
  const ids = [...new Set(userIds.filter(Boolean))]

  if (!ids.length) return new Set<string>()

  const { data } = await db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true).in('user_id', ids)

  return new Set<string>((data || []).map((row: any) => row.user_id))
}

/** Candidates holding any of the permissions through a role or an allow override (prefilter only). */
const permissionCandidates = async (organizationId: string, keys: string[] = RECIPIENT_PERMISSIONS) => {
  const supabase = db()
  const { data: permissions } = await supabase.from('forge_permission_registry').select('id').in('permission_key', keys)
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

  return [...new Set<string>([...(roleUsers || []), ...(overrides || [])].map((row: any) => row.user_id))]
}

/** Whether the user's grant scope covers a report at this location / division. */
const scopeCovers = async (organizationId: string, userId: string, scope: string | null, locationId: string | null, divisionId: string | null) => {
  if (scope === 'organization') return true
  if (scope !== 'location' && scope !== 'division') return false

  const assignments = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location') return Boolean(locationId && assignments.locationIds.includes(locationId))

  return Boolean(divisionId && assignments.divisionIds.includes(divisionId))
}

/** Members who should hear about an issue at this location: map of user id → may open the CAPA. */
export const scanIssueRecipients = async ({
  organizationId,
  locationId,
  divisionId,
  vehicle = null
}: {
  organizationId: string
  locationId: string | null
  divisionId: string | null
  vehicle?: ScanIssueVehicle | null
}): Promise<Map<string, { capa: boolean }>> => {
  const members = await activeMemberIds(organizationId, await permissionCandidates(organizationId))
  const result = new Map<string, { capa: boolean }>()

  if (vehicle) {
    const fleetMembers = await activeMemberIds(organizationId, await permissionCandidates(organizationId, [VEHICLE_RECIPIENT_PERMISSION]))

    await Promise.all(
      [...fleetMembers].map(async userId => {
        const access = await getEffectiveTenantAccess({ organizationId, userId })
        const grant = access.effective.find(item => item.permissionKey === VEHICLE_RECIPIENT_PERMISSION && item.allowed)

        if (!grant) return

        const covered = await vehicleWithinScope({ organizationId, userId, scope: grant.scope, vehicle: { organization_id: organizationId, ...vehicle } })

        if (covered && !result.has(userId)) result.set(userId, { capa: false })
      })
    )
  }

  await Promise.all(
    [...members].map(async userId => {
      const access = await getEffectiveTenantAccess({ organizationId, userId })
      let notify = false
      let capa = false

      for (const key of RECIPIENT_PERMISSIONS) {
        const grant = access.effective.find(item => item.permissionKey === key && item.allowed)

        if (!grant || !(await scopeCovers(organizationId, userId, grant.scope, locationId, divisionId))) continue
        notify = true
        if (key === 'corrective_actions.assign') capa = true
      }

      if (notify) result.set(userId, { capa: capa || Boolean(result.get(userId)?.capa) })
    })
  )

  return result
}

export const notifyScanIssue = async ({
  organizationId,
  reportId,
  correctiveActionId,
  actionNumber,
  title,
  targetName,
  qrNumber,
  priority,
  urgent,
  outOfService,
  locationId,
  divisionId,
  custodianUserId,
  custodianPersonnelId,
  actorUserId,
  vehicle = null
}: {
  organizationId: string
  reportId: string
  correctiveActionId: string | null
  actionNumber: string | null
  title: string
  targetName: string
  qrNumber: string
  priority: string
  urgent: boolean
  outOfService: boolean
  locationId: string | null
  divisionId: string | null
  custodianUserId: string | null
  custodianPersonnelId: string | null
  actorUserId: string | null

  /** Set for vehicle QRs: fleet.edit holders covering the vehicle are told too. */
  vehicle?: ScanIssueVehicle | null
}): Promise<{ queued: number }> => {
  try {
    const supabase = db()
    const recipients = await scanIssueRecipients({ organizationId, locationId, divisionId, vehicle })
    const custodians: string[] = []

    if (custodianUserId) custodians.push(custodianUserId)

    if (custodianPersonnelId) {
      const { data: person } = await supabase
        .from('forge_personnel')
        .select('auth_user_id')
        .eq('organization_id', organizationId)
        .eq('id', custodianPersonnelId)
        .is('archived_at', null)
        .maybeSingle()

      if (person?.auth_user_id) custodians.push(person.auth_user_id)
    }

    const activeCustodians = await activeMemberIds(organizationId, custodians)

    for (const userId of activeCustodians) if (!recipients.has(userId)) recipients.set(userId, { capa: false })

    if (actorUserId) recipients.delete(actorUserId)
    if (!recipients.size) return { queued: 0 }

    const heading = `${urgent ? 'URGENT: ' : ''}Issue reported at ${targetName}`.slice(0, 200)

    const body = [
      `${title} (${priority} priority) was reported from a scan of QR ${qrNumber}.`,
      outOfService ? `The ${vehicle ? 'vehicle' : 'equipment'} was marked out of service.` : null,
      actionNumber ? `Corrective Action ${actionNumber} was opened.` : 'No Corrective Action could be opened; check the scan issue list.'
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 2000)

    let queued = 0
    const now = new Date().toISOString()

    for (const [userId, { capa }] of recipients) {
      const dedupeKey = `qr-issue:${reportId}:${userId}`

      const { data: existing } = await supabase.from('forge_notification_events').select('id').eq('source_module', SOURCE).eq('payload->>dedupe_key', dedupeKey).limit(1)

      if (existing?.length) continue

      const { data: event, error } = await supabase
        .from('forge_notification_events')
        .insert({
          organization_id: organizationId,
          source_module: SOURCE,
          event_type: 'qr_issue_reported',
          visibility: 'customer',
          resource_type: correctiveActionId ? 'corrective_action' : 'qr_issue_report',
          resource_id: correctiveActionId || reportId,
          actor_user_id: actorUserId,
          title: heading,
          body,
          payload: { kind: 'qr_issue_reported', dedupe_key: dedupeKey, recipient_user_id: userId, report_id: reportId, urgent, priority }
        })
        .select('id')
        .single()

      if (error || !event) {
        console.error('[scan] issue notice event', reportId, error?.message)
        continue
      }

      const link = capa && correctiveActionId ? `/corrective-actions/${correctiveActionId}` : '/qr/issues'

      const { error: deliveryError } = await supabase.from('forge_notification_deliveries').insert(
        (['in_app', 'email'] as const).map(channel => ({
          event_id: event.id,
          organization_id: organizationId,
          recipient_user_id: userId,
          recipient_audience: 'customer',
          channel,
          status: channel === 'in_app' ? 'sent' : 'pending',
          title: heading,
          body,
          link_path: link,
          sent_at: channel === 'in_app' ? now : null
        }))
      )

      if (deliveryError) {
        await supabase.from('forge_notification_events').delete().eq('id', event.id)
        console.error('[scan] issue notice delivery', reportId, deliveryError.message)
        continue
      }

      queued += 1
    }

    return { queued }
  } catch (error) {
    console.error('[scan] issue notice', reportId, (error as Error).message)

    return { queued: 0 }
  }
}

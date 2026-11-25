import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { companyTimeZone, covers, forkliftRights, loadIncidentLinks, recentIncidents } from '@/lib/forgeForkliftAccess'
import { getTenantContext } from '@/lib/forgeTenantContext'
import IncidentLinksEditor from '@/components/forklifts/IncidentLinksEditor'

/**
 * Port slice 19: incidents linked to a forklift or an operator, with add and remove for people who manage
 * forklifts. Drop it on a page as
 *   <IncidentLinksPanel organizationId={id} forkliftId={truck.id} canManage={here.manage} />
 * (or operatorId={operator.id}, plus canRequireRefresher={here.authorize} to offer "also require refresher
 * training"). The actions re-check every right; the incidents offered are those at locations the viewer manages.
 */
const IncidentLinksPanel = async ({
  organizationId,
  forkliftId,
  operatorId,
  canManage,
  canRequireRefresher = false
}: {
  organizationId: string
  forkliftId?: string
  operatorId?: string
  canManage: boolean
  canRequireRefresher?: boolean
}) => {
  const [links, timeZone] = await Promise.all([loadIncidentLinks(organizationId, { forkliftId, operatorId }), companyTimeZone(organizationId)])

  let options: { id: string; label: string }[] = []

  if (canManage) {
    const context = await getTenantContext()
    const userId = context.user?.id

    if (userId) {
      const rights = await forkliftRights(organizationId, userId, await getEffectiveTenantAccess({ organizationId, userId }))
      const linked = new Set(links.map(link => link.incident_id))

      options = (await recentIncidents(organizationId))
        .filter(incident => !linked.has(incident.id) && covers(rights.manage, incident.location_id))
        .map(incident => ({ id: incident.id, label: `${incident.incident_number} · ${incident.summary}`.slice(0, 160) }))
    }
  }

  return (
    <IncidentLinksEditor
      forkliftId={forkliftId || null}
      operatorId={operatorId || null}
      links={links.map(link => ({
        id: link.id,
        incidentId: link.incident_id,
        number: link.forge_incidents?.incident_number || 'Incident',
        summary: link.forge_incidents?.summary || '',
        occurredAt: link.forge_incidents?.occurred_at || null,
        note: link.note || null,
        both: Boolean(link.forklift_id && link.operator_id)
      }))}
      incidents={options}
      canManage={canManage}
      canRequireRefresher={Boolean(operatorId) && canRequireRefresher}
      timeZone={timeZone}
    />
  )
}

export default IncidentLinksPanel

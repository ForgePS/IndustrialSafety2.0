import type { PermitRightsAll } from '@/lib/forgePermitAccess'
import { companyAssets, companyContractors, companyLocations, companyTimeZone, listSpaces, loadPermitSettings } from '@/lib/forgePermitAccess'
import type { PermitType } from '@/lib/forgePermitRules'
import { isoToLocalDateTime, maxHours } from '@/lib/forgePermitRules'

/** Port slice 18: shared server lookups for the permit pages. */

/** Short zone name, e.g. "CST". */
export const zoneAbbreviation = (timeZone: string, at = new Date()) =>
  new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(at).find(part => part.type === 'timeZoneName')?.value || timeZone

type Grant = { locations: string[] | null } | null

const inGrant = (grant: Grant, locationId: string | null) => Boolean(grant) && (grant!.locations === null || (Boolean(locationId) && grant!.locations!.includes(locationId as string)))

/** Everything the permit form needs. `grant` is the grant the person creates or edits under. */
export const permitFormOptions = async (organizationId: string, type: PermitType, grant: Grant) => {
  const [locations, spaces, assets, contractors, settings, timeZone] = await Promise.all([
    companyLocations(organizationId),
    type === 'confined_space' && grant ? listSpaces({ organizationId, grant }) : Promise.resolve([]),
    companyAssets(organizationId),
    companyContractors(organizationId),
    loadPermitSettings(organizationId),
    companyTimeZone(organizationId)
  ])

  const hours = maxHours(settings, type)
  const now = new Date()

  return {
    locations: locations.filter(location => inGrant(grant, location.id)),
    spaces: (spaces as any[]).filter(space => space.permit_required && !space.archived_at).map(space => ({ id: space.id as string, name: (space.space_code ? space.space_code + ' ' : '') + space.name, locationId: space.location_id as string })),
    assets,
    contractors: contractors.filter(item => item.status !== 'inactive' && item.status !== 'suspended').map(item => ({ id: item.id, name: item.name })),
    settings,
    timeZone,
    zoneLabel: zoneAbbreviation(timeZone),
    maxHours: hours,
    defaultFrom: isoToLocalDateTime(now.toISOString(), timeZone),
    defaultUntil: isoToLocalDateTime(new Date(now.getTime() + hours * 3600_000).toISOString(), timeZone)
  }
}

export type { PermitRightsAll }

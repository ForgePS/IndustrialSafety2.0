import type { Operator } from '@/lib/forgeForkliftAccess'
import { companyTimeZone, currentlyTrained, loadForkliftSettings } from '@/lib/forgeForkliftAccess'
import type { Standing } from '@/lib/forgeForkliftRules'
import { operatorStanding, todayIn } from '@/lib/forgeForkliftRules'

/**
 * Port slice 19: operator standings for a set of operator rows, in the company's time zone, with the required
 * course's completions and the reminder window. Shared by the operator list, the overview card, the dashboard and
 * the personnel page so they all agree.
 */
export const operatorStandings = async (organizationId: string, operators: Pick<Operator, 'id' | 'personnel_id' | 'status' | 'truck_classes' | 'expires_on' | 'refresher_required'>[]) => {
  const [settings, timeZone] = await Promise.all([loadForkliftSettings(organizationId), companyTimeZone(organizationId)])
  const today = todayIn(timeZone)
  const trained = operators.length ? await currentlyTrained(organizationId, settings, operators.map(operator => operator.personnel_id)) : null

  const standings = new Map<string, Standing>(
    operators.map(operator => [
      operator.id,
      operatorStanding(operator, { today, noticeDays: settings.expiry_notice_days, trainingCurrent: trained ? trained.has(operator.personnel_id) : true })
    ])
  )

  return { standings, settings, timeZone, today, trained }
}

/** The standing filters offered on the operator list ('current' = may operate today). */
export const STANDING_FILTERS: Record<string, string> = {
  current: 'Can operate (authorized or due soon)',
  authorized: 'Authorized',
  expiring: 'Re-evaluation due soon',
  expired: 'Evaluation expired',
  refresher: 'Needs refresher training',
  training: 'Training not current',
  suspended: 'Suspended',
  revoked: 'Revoked',
  due: 'Due for re-evaluation (expired, due soon or refresher)'
}

export const matchesStanding = (standing: Standing, filter: string) => {
  if (!filter) return true
  if (filter === 'current') return standing === 'authorized' || standing === 'expiring'
  if (filter === 'due') return standing === 'expired' || standing === 'expiring' || standing === 'refresher'

  return standing === filter
}

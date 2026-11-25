import { createServiceRoleClient } from '@repo/supabase/server'

import type { ForkliftRights } from '@/lib/forgeForkliftAccess'
import { companyPersonnel, companyTimeZone, covers, currentlyTrained, loadForkliftSettings } from '@/lib/forgeForkliftAccess'
import { todayIn } from '@/lib/forgeForkliftRules'
import { fetchAllRows } from '@/lib/forgeFetchAll'

/** Port slice 19: what the authorize / re-evaluate form needs. People are the active personnel the viewer authorizes for. */
export const authorizeFormData = async (organizationId: string, rights: ForkliftRights) => {
  const [personnel, settings, timeZone, operators] = await Promise.all([
    companyPersonnel(organizationId),
    loadForkliftSettings(organizationId),
    companyTimeZone(organizationId),
    fetchAllRows(
      () => (createServiceRoleClient() as any).from('forge_forklift_operators').select('id, personnel_id').eq('organization_id', organizationId).order('id'),
      'Unable to load operators'
    )
  ])

  const operatorOf = new Map((operators as any[]).map(row => [row.personnel_id as string, row.id as string]))
  const inScope = personnel.filter(person => covers(rights.authorize, person.locationId))
  const trained = await currentlyTrained(organizationId, settings, inScope.map(person => person.id))

  let courseTitle: string | null = null

  if (trained && settings.training_course_id) {
    const { data } = await (createServiceRoleClient() as any).from('forge_training_courses').select('title').eq('id', settings.training_course_id).maybeSingle()

    courseTitle = (data?.title as string) || null
  }

  return {
    people: inScope.map(person => ({
      id: person.id,
      name: person.name,
      employeeNumber: person.employeeNumber,
      operatorId: operatorOf.get(person.id) || null,
      trained: trained ? trained.has(person.id) : null
    })),
    evaluators: personnel.map(person => ({ id: person.id, name: person.name })),
    settings,
    timeZone,
    today: todayIn(timeZone),
    courseTitle
  }
}

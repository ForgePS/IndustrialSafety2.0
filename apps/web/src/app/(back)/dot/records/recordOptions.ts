import { createServiceRoleClient } from '@repo/supabase/server'

import { personName } from '@/lib/forgeDot'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import type { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Context = Awaited<ReturnType<typeof requireTenantPermission>>

/** Drivers (personnel in dot.edit scope, DOT drivers first) and locations for the record form. */
export const recordFormOptions = async (context: Context) => {
  const organizationId = context.activeOrganization.id
  const permission = context.access.effective.find(item => item.permissionKey === 'dot.edit') || context.permission

  const [people, { data: locations }] = await Promise.all([
    getScopedPersonnel({ organizationId, userId: context.user.id, permission: permission as any }),
    (createServiceRoleClient() as any).from('locations').select('id, name').eq('organization_id', organizationId).order('name')
  ])

  return {
    people: (people as any[])
      .map(person => ({
        id: person.id as string,
        name: personName(person) + (person.employee_number ? ' · #' + person.employee_number : ''),
        driver: Boolean(person.is_dot_driver)
      }))
      .sort((a, b) => Number(b.driver) - Number(a.driver) || a.name.localeCompare(b.name)),
    locations: ((locations || []) as Array<{ id: string; name: string }>).map(item => ({ id: item.id, name: item.name })),
    allowNoDriver: permission.scope === 'organization'
  }
}

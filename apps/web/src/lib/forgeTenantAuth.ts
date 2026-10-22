import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'

export const requireTenantPermission = async (permissionKey: string) => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) redirect('/dashboard')

  const access = await getEffectiveTenantAccess({
    organizationId: context.activeOrganization.id,
    userId: context.user.id
  })

  const permission = access.effective.find(item => item.permissionKey === permissionKey)

  if (!permission?.allowed) redirect('/dashboard')

  return {
    ...context,
    permission,
    access
  }
}

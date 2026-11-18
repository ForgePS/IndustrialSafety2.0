import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getForgePlatformAccess } from '@/lib/forgeCreatorAuth'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export type HelpdeskCustomerAccess = {
  user: { id: string; email?: string | null }
  organizationId: string
  organizationName: string
  permissions: Set<string>
  has: (key: string) => boolean
  locationIds: string[]
  divisionIds: string[]
}

export type HelpdeskStaffAccess = {
  user: { id: string; email?: string | null }
  platformRole: string
  permissions: Set<string>
  has: (key: string) => boolean
}

export const getHelpdeskCustomerAccess = async (): Promise<HelpdeskCustomerAccess | null> => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return null

  const [access, scope] = await Promise.all([
    getEffectiveTenantAccess({ organizationId: context.activeOrganization.id, userId: context.user.id }),
    getTenantScopeAssignments({ organizationId: context.activeOrganization.id, userId: context.user.id })
  ])

  const permissions = new Set<string>(
    access.effective.filter(item => item.allowed && item.permissionKey.startsWith('helpdesk.')).map(item => item.permissionKey)
  )

  return {
    user: { id: context.user.id, email: context.user.email },
    organizationId: context.activeOrganization.id,
    organizationName: context.activeOrganization.name,
    permissions,
    has: (key: string) => permissions.has(key),
    locationIds: scope.locationIds,
    divisionIds: scope.divisionIds
  }
}

export const requireHelpdeskCustomer = async (permissionKey = 'helpdesk.knowledge.view') => {
  const access = await getHelpdeskCustomerAccess()

  if (!access) {
    const staff = await getHelpdeskStaffAccess()

    redirect(staff?.has('helpdesk.support.view') ? '/help-desk/console' : '/dashboard')
  }

  if (!access.has(permissionKey)) redirect(permissionKey === 'helpdesk.knowledge.view' ? '/dashboard' : '/help-desk')

  return access
}

export const getHelpdeskStaffAccess = async (): Promise<HelpdeskStaffAccess | null> => {
  const { user, platformRole } = await getForgePlatformAccess()

  if (!user || !platformRole) return null

  const db = createServiceRoleClient() as any

  const { data, error } = await db
    .from('forge_support_platform_role_permissions')
    .select('permission_key')
    .eq('platform_role', platformRole)

  if (error) return null
  const permissions = new Set<string>((data || []).map((row: any) => row.permission_key))

  if (!permissions.size) return null

  return {
    user: { id: user.id, email: user.email },
    platformRole,
    permissions,
    has: (key: string) => permissions.has(key)
  }
}

export const requireHelpdeskStaff = async (permissionKey = 'helpdesk.support.view') => {
  const access = await getHelpdeskStaffAccess()

  if (!access) redirect('/help-desk')
  if (!access.has(permissionKey)) redirect(permissionKey !== 'helpdesk.support.view' && access.has('helpdesk.support.view') ? '/help-desk/console' : '/dashboard')

  return access
}

export type HelpdeskRequestMeta = { request_id: string; source_ip: string | null; user_agent: string | null }

export const getRequestMeta = async (): Promise<HelpdeskRequestMeta> => {
  const h = await headers()
  const forwarded = (h.get('x-forwarded-for') || '').split(',')[0].trim()

  return {
    request_id: (h.get('x-request-id') || crypto.randomUUID()).slice(0, 120),
    source_ip: (forwarded || h.get('x-real-ip') || '').slice(0, 64) || null,
    user_agent: (h.get('user-agent') || '').slice(0, 400) || null
  }
}

export type HelpdeskRpcResult = { ok: boolean; error?: string; conflict?: boolean; [key: string]: any }

export const callHelpdeskRpc = async (fn: string, args: Record<string, unknown>): Promise<HelpdeskRpcResult> => {
  const db = createServiceRoleClient() as any
  const { data, error } = await db.rpc(fn, args)

  if (error) {
    console.error('[helpdesk]', fn, error.message)

    return { ok: false, error: 'The help desk could not complete that request. Try again.' }
  }

  if (data && typeof data === 'object' && 'ok' in data) return data as HelpdeskRpcResult

  return { ok: true, data }
}

// Customer ticket visibility: own/watched always, Location scope and whole-tenant scope by permission.
export const customerTicketScope = async (access: HelpdeskCustomerAccess) => {
  const db = createServiceRoleClient() as any

  const { data: watched } = await db
    .from('forge_support_ticket_watchers')
    .select('ticket_id')
    .eq('organization_id', access.organizationId)
    .eq('user_id', access.user.id)
    .eq('watcher_type', 'customer')

  const watchedIds: string[] = (watched || []).map((row: any) => row.ticket_id)

  return {
    tenant: access.has('helpdesk.ticket.view_tenant'),
    locationIds: access.has('helpdesk.ticket.view_location') ? access.locationIds : [],
    watchedIds,
    canView: (ticket: { requester_user_id: string; location_id: string | null; id: string; organization_id: string }) =>
      ticket.organization_id === access.organizationId &&
      (access.has('helpdesk.ticket.view_tenant') ||
        ticket.requester_user_id === access.user.id ||
        watchedIds.includes(ticket.id) ||
        (access.has('helpdesk.ticket.view_location') && !!ticket.location_id && access.locationIds.includes(ticket.location_id)))
  }
}

export const applyCustomerScope = (
  query: any,
  access: HelpdeskCustomerAccess,
  scope: Awaited<ReturnType<typeof customerTicketScope>>
) => {
  query = query.eq('organization_id', access.organizationId)
  if (scope.tenant) return query
  const clauses = [`requester_user_id.eq.${access.user.id}`]

  if (scope.watchedIds.length) clauses.push(`id.in.(${scope.watchedIds.join(',')})`)
  if (scope.locationIds.length) clauses.push(`location_id.in.(${scope.locationIds.join(',')})`)

  return query.or(clauses.join(','))
}

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export const cleanText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

import { createServiceRoleClient } from '@repo/supabase/server'

import { loadPersonForScope, personWithinScope } from '@/lib/forgeDot'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

/**
 * Permission and scope checks shared by DOT server actions and route handlers. Each returns either
 * { error } or the loaded row with the tenant context. Callers never trust ids from the browser.
 */

type Context = Awaited<ReturnType<typeof requireTenantPermission>>
export type DotLoaded<T> = { error: string } | { ok: true; context: Context; organizationId: string; supabase: any; row: T }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const cleanDate = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null

  return ISO_DATE.test(value.trim()) ? value.trim() : undefined
}

export const dotContext = async (permissionKey: string, { forRoute = false } = {}) =>
  forRoute ? tenantPermissionOrNull(permissionKey) : requireTenantPermission(permissionKey)

const scoped = async (context: Context, personnelId: string | null) =>
  personWithinScope({
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    scope: context.permission.scope,
    person: await loadPersonForScope(personnelId)
  })

export const loadDriverFileInScope = async (context: Context | null, fileId: string): Promise<DotLoaded<any>> => {
  if (!context) return { error: 'Not found.' }

  const supabase = createServiceRoleClient() as any
  const organizationId = context.activeOrganization.id
  const { data: row } = await supabase.from('forge_dot_driver_files').select('*').eq('organization_id', organizationId).eq('id', fileId).maybeSingle()

  if (!row || !(await scoped(context, row.personnel_id))) return { error: 'Driver file not found.' }

  return { ok: true, context, organizationId, supabase, row }
}

export const loadCompanyDriverInScope = async (context: Context | null, driverId: string): Promise<DotLoaded<any>> => {
  if (!context) return { error: 'Not found.' }

  const supabase = createServiceRoleClient() as any
  const organizationId = context.activeOrganization.id
  const { data: row } = await supabase.from('forge_dot_company_drivers').select('*').eq('organization_id', organizationId).eq('id', driverId).maybeSingle()

  if (!row || !(await scoped(context, row.personnel_id))) return { error: 'Company driver not found.' }

  return { ok: true, context, organizationId, supabase, row }
}

export const loadDotRecordInScope = async (context: Context | null, recordId: string): Promise<DotLoaded<any>> => {
  if (!context) return { error: 'Not found.' }

  const supabase = createServiceRoleClient() as any
  const organizationId = context.activeOrganization.id
  const { data: row } = await supabase.from('forge_dot_records').select('*').eq('organization_id', organizationId).eq('id', recordId).maybeSingle()

  if (!row || !(await scoped(context, row.personnel_id))) return { error: 'DOT record not found.' }

  return { ok: true, context, organizationId, supabase, row }
}

/** A person picked in a form: must exist in the organization and be inside the user's scope. */
export const personInScope = async (context: Context, personnelId: string | null) => {
  if (!personnelId) return context.permission.scope === 'organization'

  const person = await loadPersonForScope(personnelId)

  if (!person || person.organization_id !== context.activeOrganization.id) return false

  return scoped(context, personnelId)
}

/** Raises a friendly message for a database rule break, or a generic one. */
export const dbMessage = (error: { code?: string; message?: string } | null, fallback: string) =>
  error ? (['23514', '23503', '23505', 'P0002'].includes(String(error.code)) ? cleanDbMessage(error) : fallback) : fallback

const cleanDbMessage = (error: { code?: string; message?: string }) => {
  if (error.code === '23505') return 'That would create a duplicate. This driver may already have an open file.'

  return String(error.message || 'Not allowed.')
}

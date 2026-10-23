'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const uuidOrNull = z
  .string()
  .transform(value => value.trim() || null)
  .refine(value => value === null || z.string().uuid().safeParse(value).success, 'Invalid selection.')

const textOrNull = (max: number) =>
  z
    .string()
    .max(max)
    .transform(value => value.trim() || null)

const departmentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Department name is required.').max(200),
  code: textOrNull(40),
  description: textOrNull(1000),
  location_id: uuidOrNull,
  division_id: uuidOrNull,
  contact_personnel_id: uuidOrNull
})

const positionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Position name is required.').max(200),
  code: textOrNull(40),
  description: textOrNull(1000),
  department_id: uuidOrNull
})

export type DepartmentInput = z.input<typeof departmentSchema>
export type PositionInput = z.input<typeof positionSchema>

const duplicateMessage = (kind: 'Department' | 'Position', error: { code?: string; message?: string }) => {
  if (error.code === '23505') {
    return /code/.test(error.message || '')
      ? `Another active ${kind.toLowerCase()} already uses this code.`
      : `An active ${kind.toLowerCase()} with this name already exists here.`
  }

  
return error.message || `Unable to save ${kind.toLowerCase()}.`
}

const refresh = () => {
  revalidatePath('/personnel/structure')
  revalidatePath('/personnel')
}

export const saveDepartment = async (input: DepartmentInput) => {
  const context = await requireTenantPermission('personnel.configure')
  const organizationId = context.activeOrganization.id
  const parsed = departmentSchema.safeParse(input)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the department fields.' }

  const { id, ...values } = parsed.data
  const supabase = createServiceRoleClient() as any

  let before: any = null

  if (id) {
    const { data } = await supabase.from('forge_departments').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle()

    if (!data) return { error: 'Department not found.' }
    before = data
  }

  const query = id
    ? supabase.from('forge_departments').update({ ...values, updated_by: context.user.id }).eq('id', id).eq('organization_id', organizationId)
    : supabase.from('forge_departments').insert({ ...values, organization_id: organizationId, created_by: context.user.id, updated_by: context.user.id })

  const { data: after, error } = await query.select('*').single()

  if (error || !after) return { error: duplicateMessage('Department', error || {}) }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: id ? 'personnel.department_updated' : 'personnel.department_created',
    entityType: 'department',
    entityId: after.id,
    beforeValue: before,
    afterValue: after
  })

  refresh()
  
return { id: after.id, message: id ? 'Department updated.' : 'Department created.' }
}

export const setDepartmentActive = async ({ id, active }: { id: string; active: boolean }) => {
  const context = await requireTenantPermission('personnel.configure')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: after, error } = await supabase
    .from('forge_departments')
    .update({ is_active: active, updated_by: context.user.id })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle()

  if (error) return { error: duplicateMessage('Department', error) }
  if (!after) return { error: 'Department not found.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: active ? 'personnel.department_reactivated' : 'personnel.department_deactivated',
    entityType: 'department',
    entityId: id,
    afterValue: { is_active: active }
  })

  refresh()
  
return { message: active ? 'Department reactivated.' : 'Department deactivated. Existing assignments are kept.' }
}

export const savePosition = async (input: PositionInput) => {
  const context = await requireTenantPermission('personnel.configure')
  const organizationId = context.activeOrganization.id
  const parsed = positionSchema.safeParse(input)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the position fields.' }

  const { id, ...values } = parsed.data
  const supabase = createServiceRoleClient() as any

  let before: any = null

  if (id) {
    const { data } = await supabase.from('forge_positions').select('*').eq('id', id).eq('organization_id', organizationId).maybeSingle()

    if (!data) return { error: 'Position not found.' }
    before = data
  }

  const query = id
    ? supabase.from('forge_positions').update({ ...values, updated_by: context.user.id }).eq('id', id).eq('organization_id', organizationId)
    : supabase.from('forge_positions').insert({ ...values, organization_id: organizationId, created_by: context.user.id, updated_by: context.user.id })

  const { data: after, error } = await query.select('*').single()

  if (error || !after) return { error: duplicateMessage('Position', error || {}) }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: id ? 'personnel.position_updated' : 'personnel.position_created',
    entityType: 'position',
    entityId: after.id,
    beforeValue: before,
    afterValue: after
  })

  refresh()
  
return { id: after.id, message: id ? 'Position updated.' : 'Position created.' }
}

export const setPositionActive = async ({ id, active }: { id: string; active: boolean }) => {
  const context = await requireTenantPermission('personnel.configure')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: after, error } = await supabase
    .from('forge_positions')
    .update({ is_active: active, updated_by: context.user.id })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .maybeSingle()

  if (error) return { error: duplicateMessage('Position', error) }
  if (!after) return { error: 'Position not found.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: active ? 'personnel.position_reactivated' : 'personnel.position_deactivated',
    entityType: 'position',
    entityId: id,
    afterValue: { is_active: active }
  })

  refresh()
  
return { message: active ? 'Position reactivated.' : 'Position deactivated. Existing assignments are kept.' }
}

import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getScopedPersonnel } from '@/lib/forgePersonnel'

export const getTrainingScopePersonnel = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  return getScopedPersonnel({
    organizationId,
    userId,
    permission
  })
}

export const getTrainingOverview = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  const supabase = createServiceRoleClient() as any
  const personnel = await getTrainingScopePersonnel({ organizationId, userId, permission })
  const personnelIds = personnel.map((item: any) => item.id)

  // Every course (archived ones too, for the Active / Archived filter and old assignments), and active groups with
  // their members for the assignment list's group filter.
  const [{ data: courses }, assignmentsResult, completionsResult, { data: groups }, { data: members }] = await Promise.all([
    supabase
      .from('forge_training_courses')
      .select('*')
      .eq('organization_id', organizationId)
      .order('title'),
    personnelIds.length
      ? supabase
          .from('forge_training_assignments')
          .select('*, forge_training_courses(title, course_code), forge_personnel(first_name, last_name, employee_number)')
          .eq('organization_id', organizationId)
          .in('personnel_id', personnelIds)
          .order('assigned_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    personnelIds.length
      ? supabase
          .from('forge_training_completions')
          .select('*, forge_training_courses(title, course_code), forge_personnel(first_name, last_name, employee_number)')
          .eq('organization_id', organizationId)
          .in('personnel_id', personnelIds)
          .is('archived_at', null)
          .order('completed_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase.from('forge_training_groups').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('forge_training_group_members').select('group_id, personnel_id').eq('organization_id', organizationId)
  ])

  if (assignmentsResult.error) throw new Error(`Unable to load training assignments: ${assignmentsResult.error.message}`)
  if (completionsResult.error) throw new Error(`Unable to load training completions: ${completionsResult.error.message}`)

  const memberIds = new Map<string, string[]>()

  for (const row of members || []) memberIds.set(row.group_id, [...(memberIds.get(row.group_id) || []), row.personnel_id])

  return {
    // Active courses (as before, for the AI tools' counts) and archived ones separately.
    courses: (courses || []).filter((course: any) => course.is_active),
    archivedCourses: (courses || []).filter((course: any) => !course.is_active),
    groups: (groups || []).map((group: any) => ({ id: group.id as string, name: group.name as string, memberIds: memberIds.get(group.id) || [] })),
    personnel,
    assignments: assignmentsResult.data || [],
    completions: completionsResult.data || []
  }
}

export const getMyTraining = async ({
  organizationId,
  userId
}: {
  organizationId: string
  userId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: personnel } = await supabase
    .from('forge_personnel')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', userId)
    .is('archived_at', null)
    .maybeSingle()

  if (!personnel) {
    return {
      personnel: null,
      assignments: [],
      completions: []
    }
  }

  const [{ data: assignments }, { data: completions }] = await Promise.all([
    supabase
      .from('forge_training_assignments')
      .select('*, forge_training_courses(title, course_code, description, delivery_method, duration_minutes)')
      .eq('organization_id', organizationId)
      .eq('personnel_id', personnel.id)
      .neq('status', 'canceled')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('forge_training_completions')
      .select('*, forge_training_courses(title, course_code, validity_months)')
      .eq('organization_id', organizationId)
      .eq('personnel_id', personnel.id)
      .is('archived_at', null)
      .order('completed_at', { ascending: false })
  ])

  return {
    personnel,
    assignments: assignments || [],
    completions: completions || []
  }
}

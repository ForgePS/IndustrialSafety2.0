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

  const [{ data: courses }, assignmentsResult, completionsResult] = await Promise.all([
    supabase
      .from('forge_training_courses')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
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
          .order('completed_at', { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ])

  if (assignmentsResult.error) throw new Error(`Unable to load training assignments: ${assignmentsResult.error.message}`)
  if (completionsResult.error) throw new Error(`Unable to load training completions: ${completionsResult.error.message}`)

  return {
    courses: courses || [],
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
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('forge_training_completions')
      .select('*, forge_training_courses(title, course_code, validity_months)')
      .eq('organization_id', organizationId)
      .eq('personnel_id', personnel.id)
      .order('completed_at', { ascending: false })
  ])

  return {
    personnel,
    assignments: assignments || [],
    completions: completions || []
  }
}

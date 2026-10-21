import { createServiceRoleClient } from '@repo/supabase/server'

export type DepartmentOption = {
  id: string
  label: string
  locationId: string | null
  divisionId: string | null
  isActive: boolean
}

export type PositionOption = {
  id: string
  label: string
  departmentId: string | null
  isActive: boolean
}

export type PersonOption = {
  id: string
  label: string
}

const withCode = (name: string, code: string | null) => (code ? `${name} (${code})` : name)

export const personnelDisplayName = (person: {
  first_name: string
  last_name: string
  middle_name?: string | null
  preferred_name?: string | null
  suffix?: string | null
}) => {
  const legal = [person.first_name, person.middle_name, person.last_name, person.suffix].filter(Boolean).join(' ')

  
return person.preferred_name && person.preferred_name !== person.first_name
    ? `${legal} ("${person.preferred_name}")`
    : legal
}

/**
 * Departments, positions and supervisor choices for the personnel form.
 * Inactive rows are returned only when a record already references them, so editing an
 * older record never silently drops its assignment.
 */
export const getPersonnelStructureOptions = async ({
  organizationId,
  locationIds,
  keepIds = []
}: {
  organizationId: string
  locationIds?: string[] | null
  keepIds?: Array<string | null | undefined>
}) => {
  const supabase = createServiceRoleClient() as any
  const keep = new Set(keepIds.filter(Boolean) as string[])

  const [{ data: departments, error: departmentError }, { data: positions, error: positionError }, { data: people, error: peopleError }] =
    await Promise.all([
      supabase
        .from('forge_departments')
        .select('id, name, code, location_id, division_id, is_active, sort_order')
        .eq('organization_id', organizationId)
        .order('sort_order')
        .order('name'),
      supabase
        .from('forge_positions')
        .select('id, name, code, department_id, is_active, sort_order')
        .eq('organization_id', organizationId)
        .order('sort_order')
        .order('name'),
      supabase
        .from('forge_personnel')
        .select('id, first_name, last_name, middle_name, preferred_name, suffix, employee_number')
        .eq('organization_id', organizationId)
        .is('archived_at', null)
        .order('last_name')
        .order('first_name')
    ])

  if (departmentError) throw new Error(`Unable to load departments: ${departmentError.message}`)
  if (positionError) throw new Error(`Unable to load positions: ${positionError.message}`)
  if (peopleError) throw new Error(`Unable to load supervisors: ${peopleError.message}`)

  const departmentOptions: DepartmentOption[] = (departments || [])
    .filter((item: any) => item.is_active || keep.has(item.id))
    .filter((item: any) => !locationIds || !item.location_id || locationIds.includes(item.location_id) || keep.has(item.id))
    .map((item: any) => ({
      id: item.id,
      label: withCode(item.name, item.code) + (item.is_active ? '' : ' (inactive)'),
      locationId: item.location_id,
      divisionId: item.division_id,
      isActive: item.is_active
    }))

  const positionOptions: PositionOption[] = (positions || [])
    .filter((item: any) => item.is_active || keep.has(item.id))
    .map((item: any) => ({
      id: item.id,
      label: withCode(item.name, item.code) + (item.is_active ? '' : ' (inactive)'),
      departmentId: item.department_id,
      isActive: item.is_active
    }))

  const supervisorOptions: PersonOption[] = (people || []).map((item: any) => ({
    id: item.id,
    label: item.employee_number ? `${personnelDisplayName(item)} · ${item.employee_number}` : personnelDisplayName(item)
  }))

  return { departments: departmentOptions, positions: positionOptions, supervisors: supervisorOptions }
}

/**
 * Validates department / position / supervisor references before a personnel write.
 * The database triggers enforce the same rules; this returns readable messages first.
 */
export const validatePersonnelStructure = async ({
  supabase,
  organizationId,
  personnelId,
  departmentId,
  positionId,
  supervisorPersonnelId,
  previous
}: {
  supabase: any
  organizationId: string
  personnelId?: string
  departmentId: string | null
  positionId: string | null
  supervisorPersonnelId: string | null
  previous?: { department_id?: string | null; position_id?: string | null } | null
}): Promise<string | null> => {
  if (departmentId) {
    const { data } = await supabase
      .from('forge_departments')
      .select('id, is_active')
      .eq('id', departmentId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!data) return 'Selected Department does not belong to this company.'
    if (!data.is_active && previous?.department_id !== departmentId) return 'Selected Department is inactive.'
  }

  if (positionId) {
    const { data } = await supabase
      .from('forge_positions')
      .select('id, is_active, department_id')
      .eq('id', positionId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!data) return 'Selected Position does not belong to this company.'
    if (!data.is_active && previous?.position_id !== positionId) return 'Selected Position is inactive.'

    if (data.department_id && departmentId && data.department_id !== departmentId) {
      return 'Selected Position belongs to a different department.'
    }
  }

  if (supervisorPersonnelId) {
    if (personnelId && supervisorPersonnelId === personnelId) return 'A person cannot be their own supervisor.'

    const { data } = await supabase
      .from('forge_personnel')
      .select('id')
      .eq('id', supervisorPersonnelId)
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .maybeSingle()

    if (!data) return 'Selected Supervisor is not an active person in this company.'
  }

  return null
}

/** Turns database constraint errors from personnel writes into readable messages. */
export const personnelWriteErrorMessage = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return 'Unable to save personnel record.'

  if (error.code === '23505' && /employee_number/.test(error.message || '')) {
    return 'Another active person already uses this employee number (numbers like "EMP-0042" and "42" count as the same).'
  }

  if (/forge_personnel_termination_after_hire/.test(error.message || '')) {
    return 'Termination Date cannot be before Hire Date.'
  }

  if (/forge_personnel_not_own_supervisor/.test(error.message || '')) {
    return 'A person cannot be their own supervisor.'
  }

  return error.message || 'Unable to save personnel record.'
}

import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'

import StructureManager from './StructureManager'
import type { DepartmentRow, PositionRow } from './StructureManager'
import { personnelDisplayName } from '@/lib/forgePersonnelStructure'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Departments & Positions' }

const PersonnelStructurePage = async () => {
  const context = await requireTenantPermission('personnel.configure')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: departments },
    { data: positions },
    { data: locations },
    { data: divisions },
    { data: people },
    { data: assignedCounts }
  ] = await Promise.all([
    supabase.from('forge_departments').select('*').eq('organization_id', organizationId).order('is_active', { ascending: false }).order('name'),
    supabase.from('forge_positions').select('*').eq('organization_id', organizationId).order('is_active', { ascending: false }).order('name'),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    supabase
      .from('forge_personnel')
      .select('id, first_name, last_name, middle_name, preferred_name, suffix')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .order('last_name'),
    supabase
      .from('forge_personnel')
      .select('department_id, position_id')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
  ])

  const departmentCounts = new Map<string, number>()
  const positionCounts = new Map<string, number>()

  for (const row of assignedCounts || []) {
    if (row.department_id) departmentCounts.set(row.department_id, (departmentCounts.get(row.department_id) || 0) + 1)
    if (row.position_id) positionCounts.set(row.position_id, (positionCounts.get(row.position_id) || 0) + 1)
  }

  const label = (item: { name: string; code: string | null }) => (item.code ? `${item.name} (${item.code})` : item.name)

  const departmentRows: DepartmentRow[] = (departments || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    description: item.description,
    locationId: item.location_id,
    divisionId: item.division_id,
    contactPersonnelId: item.contact_personnel_id,
    isActive: item.is_active,
    personnelCount: departmentCounts.get(item.id) || 0
  }))

  const positionRows: PositionRow[] = (positions || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    description: item.description,
    departmentId: item.department_id,
    isActive: item.is_active,
    personnelCount: positionCounts.get(item.id) || 0
  }))

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Personnel</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Departments &amp; Positions</h1>
        <p className='text-textSecondary mt-2'>
          Departments can belong to a Location and Division. Positions can belong to a department or apply company-wide.
        </p>
      </div>

      <StructureManager
        departments={departmentRows}
        positions={positionRows}
        locations={(locations || []).map((item: any) => ({ id: item.id, label: label(item) }))}
        divisions={(divisions || []).map((item: any) => ({ id: item.id, label: label(item) }))}
        people={(people || []).map((item: any) => ({ id: item.id, label: personnelDisplayName(item) }))}
      />
    </div>
  )
}

export default PersonnelStructurePage

import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'

import GroupManager from './GroupManager'
import { personnelDisplayName } from '@/lib/forgePersonnelStructure'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Training Groups' }

const TrainingGroupsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) => {
  const context = await requireTenantPermission('training.manage_groups')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const groupId = (await searchParams).group || null

  const [{ data: groups }, { data: memberCounts }, { data: requirementCounts }, { data: people }, { data: courses }] = await Promise.all([
    supabase.from('forge_training_groups').select('*').eq('organization_id', organizationId).order('is_active', { ascending: false }).order('name'),
    supabase.from('forge_training_group_members').select('group_id').eq('organization_id', organizationId),
    supabase.from('forge_training_group_requirements').select('group_id').eq('organization_id', organizationId),
    supabase
      .from('forge_personnel')
      .select('id, first_name, last_name, middle_name, preferred_name, suffix, employee_number')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .order('last_name'),
    supabase.from('forge_training_courses').select('id, title, course_code').eq('organization_id', organizationId).eq('is_active', true).order('title')
  ])

  const count = (rows: any[], id: string) => rows.filter(row => row.group_id === id).length

  const list = (groups || []).map((group: any) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    isActive: group.is_active,
    memberCount: count(memberCounts || [], group.id),
    requirementCount: count(requirementCounts || [], group.id)
  }))

  const selected = list.find((group: any) => group.id === groupId) || null
  const personLabel = (person: any) => (person.employee_number ? `${personnelDisplayName(person)} · ${person.employee_number}` : personnelDisplayName(person))

  const [{ data: members }, { data: requirements }] = selected
    ? await Promise.all([
        supabase.from('forge_training_group_members').select('personnel_id, forge_personnel(id, first_name, last_name, middle_name, preferred_name, suffix, employee_number)').eq('group_id', selected.id),
        supabase.from('forge_training_group_requirements').select('course_id, forge_training_courses(title)').eq('group_id', selected.id)
      ])
    : [{ data: [] }, { data: [] }]

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Training Groups</h1>
          <p className='text-textSecondary mt-2'>Groups define who needs which courses. They drive the compliance matrix and bulk assignment.</p>
        </div>
        <Button variant='tonalDefault' asChild><Link href='/training'>Back to Training</Link></Button>
      </div>

      <GroupManager
        key={selected?.id || 'none'}
        groups={list}
        selected={selected}
        members={(members || []).filter((row: any) => row.forge_personnel).map((row: any) => ({ id: row.personnel_id, label: personLabel(row.forge_personnel) })).sort((a: any, b: any) => a.label.localeCompare(b.label))}
        requirements={(requirements || []).map((row: any) => ({ id: row.course_id, label: row.forge_training_courses?.title || 'Course' }))}
        people={(people || []).map((person: any) => ({ id: person.id, label: personLabel(person) }))}
        courses={(courses || []).map((course: any) => ({ id: course.id, label: course.course_code ? `${course.title} (${course.course_code})` : course.title }))}
        canAssign={context.access.effective.some(item => item.permissionKey === 'training.assign' && item.allowed)}
      />
    </div>
  )
}

export default TrainingGroupsPage

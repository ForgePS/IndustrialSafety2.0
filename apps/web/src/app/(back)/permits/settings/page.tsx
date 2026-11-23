import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import { ChecklistItemsPanel, PermitSettingsForm, TrainingRequirementsPanel } from '@/components/permits/PermitSettingsPanels'
import PermitTabs from '@/components/permits/PermitTabs'
import { loadCheckDefinitions, loadPermitSettings, loadTrainingRequirements, permitRights } from '@/lib/forgePermitAccess'
import { mergeCheckDefinitions, PERMIT_TYPE_INFO, PERMIT_TYPES } from '@/lib/forgePermitRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Permit settings' }

/** Port slice 18: company permit settings, training requirements and checklist items. */
const PermitSettingsPage = async () => {
  const context = await requireTenantPermission('permits.view')
  const organizationId = context.activeOrganization.id
  const rights = await permitRights(organizationId, context.user.id, context.access)

  if (!rights.manage) redirect('/permits')

  const canEdit = rights.manage.locations === null

  const [settings, requirements, coursesResult, ...definitions] = await Promise.all([
    loadPermitSettings(organizationId),
    loadTrainingRequirements(organizationId),
    (createServiceRoleClient() as any).from('forge_training_courses').select('id, title, course_code').eq('organization_id', organizationId).eq('is_active', true).order('title'),
    ...PERMIT_TYPES.map(type => loadCheckDefinitions(organizationId, type))
  ])

  const courses = ((coursesResult.data || []) as any[]).map(course => ({ id: course.id as string, name: (course.course_code ? course.course_code + ' ' : '') + course.title }))

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary text-3xl font-bold'>Permit settings</h1>
        <p className='text-textSecondary mt-2'>Limits, approval rules, required training and checklist items for every permit in the company.</p>
      </div>
      <PermitTabs active='settings' canManage />
      {!canEdit ? (
        <p className='border-warning text-warning rounded-md border p-3 text-sm' data-settings-readonly>
          Only someone who manages permits for the whole company can change these settings.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Limits and approval</CardTitle>
        </CardHeader>
        <CardContent>
          <PermitSettingsForm initial={settings as unknown as Record<string, number | boolean>} canEdit={canEdit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Required training</CardTitle>
        </CardHeader>
        <CardContent>
          <TrainingRequirementsPanel
            requirements={requirements.map((item: any) => ({ id: item.id, permit_type: item.permit_type, role: item.role, course_title: item.forge_training_courses?.title || 'Unknown course' }))}
            courses={courses}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {PERMIT_TYPES.map((type, index) => (
        <Card key={type}>
          <CardHeader>
            <CardTitle>{PERMIT_TYPE_INFO[type].label} checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ChecklistItemsPanel
              type={type}
              canEdit={canEdit}
              items={mergeCheckDefinitions(definitions[index]).map(item => ({
                id: (item as any).id,
                check_key: item.check_key,
                label: item.label,
                required: item.required,
                allow_na: item.allow_na,
                builtIn: !item.organization_id
              }))}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default PermitSettingsPage

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import ForkliftTabs from '@/components/forklifts/ForkliftTabs'
import { CheckItemsPanel, ForkliftSettingsForm } from '@/components/forklifts/ForkliftSettingsPanels'
import { companyCourses, forkliftRights, loadCheckItems, loadForkliftSettings } from '@/lib/forgeForkliftAccess'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forklift settings' }

/** Port slice 19: company forklift settings and the pre-shift checklist. Location managers can view; company managers change. */
const ForkliftSettingsPage = async () => {
  const context = await requireTenantPermission('forklifts.view')
  const organizationId = context.activeOrganization.id
  const rights = await forkliftRights(organizationId, context.user.id, context.access)

  if (!rights.manage) redirect('/forklifts')

  const canEdit = rights.manage.locations === null
  const [settings, courses, items] = await Promise.all([loadForkliftSettings(organizationId), companyCourses(organizationId), loadCheckItems(organizationId, { includeArchived: true })])

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary text-3xl font-bold'>Forklift settings</h1>
        <p className='text-textSecondary mt-2'>Operator rules, training, defects and the pre-shift checklist for every forklift in the company.</p>
      </div>
      <ForkliftTabs active='settings' canManage />
      {!canEdit ? (
        <p className='border-warning text-warning rounded-md border p-3 text-sm' data-settings-readonly>
          Only someone who manages forklifts for the whole company can change these settings.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Operators and defects</CardTitle>
        </CardHeader>
        <CardContent>
          <ForkliftSettingsForm initial={settings} courses={courses} canEdit={canEdit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pre-shift checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <CheckItemsPanel items={items.map(item => ({ ...item, builtIn: !item.organization_id }))} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  )
}

export default ForkliftSettingsPage

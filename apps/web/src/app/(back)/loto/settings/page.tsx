import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import LotoTabs from '../LotoTabs'
import LotoSettingsForm from './LotoSettingsForm'
import { getLotoSettings } from '@/lib/forgeLoto'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'LOTO Settings' }

const LotoSettingsPage = async () => {
  const context = await requireTenantPermission('loto.settings')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [settings, { data: courses }] = await Promise.all([
    getLotoSettings(organizationId),
    supabase
      .from('forge_training_courses')
      .select('id, title, course_code')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('title')
  ])

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name}</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Lockout / Tagout</h1>
      </div>

      <LotoTabs active='settings' showSettings />

      <Card>
        <CardHeader>
          <CardTitle>Authorized Employees</CardTitle>
          <CardDescription>
            OSHA 1910.147 requires that only trained, authorized employees apply locks. Pick the training course that authorizes someone, and choose whether lockouts enforce it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LotoSettingsForm courses={courses || []} initialCourseId={settings.authorized_course_id} initialRequired={settings.require_authorized_training} />
        </CardContent>
      </Card>
    </div>
  )
}

export default LotoSettingsPage

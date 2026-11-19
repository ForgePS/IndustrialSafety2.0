import type { Metadata } from 'next'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import TemplateForm from '@/components/emergency/TemplateForm'
import { alertTabs } from '@/components/emergency/tabs'
import { grantOf, listTemplates } from '@/lib/forgeEmergency'
import { alertTypeLabel, severityLabel } from '@/lib/forgeEmergencyRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Alert templates' }

/** Port slice 14: the templates senders start from. */
const AlertTemplatesPage = async () => {
  const context = await requireTenantPermission('emergency_alerts.manage_templates')
  const templates = await listTemplates(context.activeOrganization.id)
  const canSend = Boolean(grantOf(context.access, 'emergency_alerts.send') || grantOf(context.access, 'emergency_alerts.run_drills'))

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary text-3xl font-bold'>Alert templates</h1>
        <p className='text-textSecondary mt-2'>Ready-made messages for the emergencies you plan for, so an alert can go out in seconds.</p>
      </div>
      <EmergencyTabs tabs={alertTabs({ canSend, canManageTemplates: true })} current='templates' label='Emergency alerts' />
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>New template</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateForm />
        </CardContent>
      </Card>
      {templates.map((template: any) => (
        <Card key={template.id} data-emergency-template={template.name}>
          <CardContent className='flex flex-col gap-2 p-4'>
            <div className='flex flex-wrap items-baseline justify-between gap-2'>
              <div>
                <span className='font-semibold'>{template.name}</span>
                <span className='text-textSecondary ms-2 text-xs'>
                  {alertTypeLabel(template.alert_type)} · {severityLabel(template.severity)}
                  {template.enabled ? '' : ' · not offered'}
                </span>
              </div>
            </div>
            <p className='text-sm font-medium'>{template.headline}</p>
            <p className='text-textSecondary text-sm whitespace-pre-line'>{template.message}</p>
            <TemplateForm template={template} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default AlertTemplatesPage

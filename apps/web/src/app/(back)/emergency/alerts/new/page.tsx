import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import ComposeAlertForm from '@/components/emergency/ComposeAlertForm'
import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { alertTabs } from '@/components/emergency/tabs'
import { activePersonnel, companyDepartments, companyLocations, grantOf, listTemplates, requireMember, sendRights } from '@/lib/forgeEmergency'

export const metadata: Metadata = { title: 'Send an alert' }

/** Port slice 14: compose an emergency alert. Location-scoped senders only see their own locations. */
const NewAlertPage = async () => {
  const context = await requireMember()
  const organizationId = context.activeOrganization.id
  const rights = await sendRights(organizationId, context.user.id, context.access)

  if (!rights.drill && !rights.live) redirect('/emergency/alerts')

  // The wider of the two grants decides what can be picked; the server checks again for the kind sent.
  const locationsAllowed = rights.live?.locations === null || rights.drill?.locations === null ? null : [...new Set([...(rights.live?.locations || []), ...(rights.drill?.locations || [])])]

  const [templates, locations, departments, personnel] = await Promise.all([
    listTemplates(organizationId, { enabledOnly: true }),
    companyLocations(organizationId),
    companyDepartments(organizationId),
    activePersonnel(organizationId)
  ])

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary text-3xl font-bold'>Send an alert</h1>
        <p className='text-textSecondary mt-2'>It goes out at once in Forge and by email. Check who it reaches, then confirm.</p>
      </div>
      <EmergencyTabs tabs={alertTabs({ canSend: true, canManageTemplates: Boolean(grantOf(context.access, 'emergency_alerts.manage_templates')) })} current='new' label='Emergency alerts' />
      <ComposeAlertForm
        templates={templates}
        locations={locationsAllowed === null ? locations : locations.filter(location => locationsAllowed.includes(location.id))}
        departments={departments.map(department => ({ id: department.id, name: department.name }))}
        people={personnel.filter(person => !person.archived && person.status === 'active').map(person => ({ id: person.id, name: person.name }))}
        canSendLive={Boolean(rights.live)}
        companyWideAllowed={locationsAllowed === null}
      />
    </div>
  )
}

export default NewAlertPage

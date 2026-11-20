import type { Metadata } from 'next'

import SettingsForm from '@/components/contractors/SettingsForm'
import { contractorTabs } from '@/components/contractors/tabs'
import EmergencyTabs from '@/components/emergency/EmergencyTabs'
import { grantOf, loadSettings } from '@/lib/forgeContractors'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Contractor settings' }

/** Port slice 15: contractor requirements for the company. */
const ContractorSettingsPage = async () => {
  const context = await requireTenantPermission('contractor_safety.settings')
  const settings = await loadSettings(context.activeOrganization.id)

  return (
    <div className='flex flex-col gap-6'>
      <h1 className='text-textPrimary text-3xl font-bold'>Contractor Safety</h1>
      <EmergencyTabs tabs={contractorTabs({ canSignIn: Boolean(grantOf(context.access, 'contractor_safety.sign_in')), canSettings: true })} current='settings' label='Contractor Safety' />
      <SettingsForm initial={settings} />
    </div>
  )
}

export default ContractorSettingsPage

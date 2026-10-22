import type { Metadata } from 'next'
import { TbSettings } from 'react-icons/tb'

import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { getHelpdeskSettingsData, listTenantOptions } from '@/lib/forgeHelpdeskConsoleData'
import SettingsTabs from './SettingsTabs'

export const metadata: Metadata = { title: 'Help Desk Settings' }

const SettingsPage = async () => {
  const staff = await requireHelpdeskStaff()
  const [data, tenants] = await Promise.all([getHelpdeskSettingsData(), listTenantOptions()])

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbSettings />
          Help Desk settings
        </h1>
        <p className='text-textSecondary mt-1'>Customer experience, SLA policies, request catalog, tags, saved replies and support teams. Every change is audited.</p>
      </div>
      <SettingsTabs data={JSON.parse(JSON.stringify(data))} tenants={tenants.map(t => ({ id: t.id, name: t.name }))} permissions={[...staff.permissions]} />
    </div>
  )
}

export default SettingsPage

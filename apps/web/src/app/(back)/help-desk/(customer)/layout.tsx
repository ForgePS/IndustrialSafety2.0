import type { ReactNode } from 'react'

import { getHelpdeskStaffAccess } from '@/lib/forgeHelpdeskAccess'
import HelpdeskNav from './HelpdeskNav'

const CustomerHelpdeskLayout = async ({ children }: { children: ReactNode }) => {
  const staff = await getHelpdeskStaffAccess()

  return (
    <div className='flex flex-col gap-6'>
      <HelpdeskNav showConsole={Boolean(staff?.has('helpdesk.support.view'))} />
      {children}
    </div>
  )
}

export default CustomerHelpdeskLayout

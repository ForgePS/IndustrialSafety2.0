import type { ReactNode } from 'react'

import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import ConsoleNav from './ConsoleNav'

const HelpdeskConsoleLayout = async ({ children }: { children: ReactNode }) => {
  const staff = await requireHelpdeskStaff()
  const can = (key: string) => staff.has(key)

  return (
    <div className='flex flex-col gap-6'>
      <ConsoleNav
        show={{
          incidents: can('helpdesk.admin.incidents') || can('helpdesk.admin.status') || can('helpdesk.admin.announcements') || can('helpdesk.support.link_incident'),
          knowledge: can('helpdesk.knowledge.create') || can('helpdesk.knowledge.edit') || can('helpdesk.knowledge.review') || can('helpdesk.knowledge.publish'),
          development: can('helpdesk.support.link_development'),
          analytics: can('helpdesk.analytics.view'),
          settings: ['manage', 'sla', 'categories', 'templates', 'tags'].some(k => can('helpdesk.admin.' + k))
        }}
      />
      {children}
    </div>
  )
}

export default HelpdeskConsoleLayout

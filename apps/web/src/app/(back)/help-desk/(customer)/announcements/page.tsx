import type { Metadata } from 'next'
import { TbSpeakerphone } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { announcementTypeLabels, label } from '@/lib/forgeHelpdesk'
import { requireHelpdeskCustomer } from '@/lib/forgeHelpdeskAccess'
import { listCustomerAnnouncements } from '@/lib/forgeHelpdeskData'

export const metadata: Metadata = { title: 'Announcements' }

const AnnouncementsPage = async () => {
  const access = await requireHelpdeskCustomer('helpdesk.status.view')
  const announcements = await listCustomerAnnouncements(access, { limit: 50 })

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbSpeakerphone />
          Announcements
        </h1>
        <p className='text-textSecondary mt-1'>Release notes, planned maintenance, and notices from Forge.</p>
      </div>
      {announcements.length ? (
        announcements.map((a: any) => (
          <Card key={a.id}>
            <CardHeader>
              <div className='flex flex-wrap items-center gap-2'>
                <CardTitle className='text-lg'>{a.title}</CardTitle>
                <Badge size='sm' variant='tonalPrimary'>
                  {label(announcementTypeLabels, a.announcement_type)}
                </Badge>
                {a.organization_id ? (
                  <Badge size='sm' variant='outline'>
                    For {access.organizationName}
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                {a.announcement_type === 'planned_maintenance'
                  ? `Scheduled ${new Date(a.starts_at).toLocaleString()}${a.ends_at ? ' – ' + new Date(a.ends_at).toLocaleString() : ''}`
                  : `Posted ${new Date(a.published_at).toLocaleDateString()}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className='whitespace-pre-wrap text-sm'>{a.body}</p>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-sm'>No current announcements.</CardContent>
        </Card>
      )}
    </div>
  )
}

export default AnnouncementsPage

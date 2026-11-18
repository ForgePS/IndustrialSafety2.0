import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { TbBell } from 'react-icons/tb'
import { getAuthUser } from '@repo/supabase/serverHelpers'

import { listInbox } from '@/lib/forgeNotifications'
import NotificationInbox from './NotificationInbox'

export const metadata: Metadata = { title: 'Notifications' }

const NotificationsPage = async ({ searchParams }: { searchParams: Promise<{ filter?: string }> }) => {
  const {
    data: { user }
  } = await getAuthUser()

  if (!user) redirect('/auth/login')
  const { filter } = await searchParams
  const unreadOnly = filter === 'unread'
  const items = await listInbox(user.id, { limit: 100, unreadOnly })

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbBell />
          Notifications
        </h1>
        <p className='text-textSecondary mt-1'>Updates on your support tickets, mentions, and platform incidents.</p>
      </div>
      <NotificationInbox items={JSON.parse(JSON.stringify(items))} unreadOnly={unreadOnly} />
    </div>
  )
}

export default NotificationsPage

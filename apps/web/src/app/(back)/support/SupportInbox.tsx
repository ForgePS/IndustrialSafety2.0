'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import type { SupportNotice } from '@/lib/forgeSupportOperations'
import { markSupportNotificationsRead } from './operationsActions'

const labels: Record<string, string> = {
  created: 'New request',
  customer_reply: 'Customer replied',
  forge_reply: 'Forge Support replied',
  status_changed: 'Request status changed',
  assigned: 'Assigned to you',
  feedback: 'Customer feedback received'
}

export default function SupportInbox({ notices, staff = false }: { notices: SupportNotice[]; staff?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const unread = notices.filter(notice => !notice.readAt)
  const base = staff ? '/admin/creator/support/' : '/support/'

  function markRead(ids: string[]) {
    setError('')
    startTransition(async () => {
      try {
        const result = await markSupportNotificationsRead(staff ? 'staff' : 'customer', ids)
        if (result.error) setError(result.error)
        else router.refresh()
      } catch {
        setError('Unable to update notifications.')
      }
    })
  }

  return (
    <Card className='mb-6' role='region' aria-label='Support inbox'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <CardTitle>Support inbox</CardTitle>
          {unread.length ? <Button size='sm' variant='outline' disabled={pending} onClick={() => markRead(unread.map(item => item.id))}>Mark shown notifications read</Button> : null}
        </div>
        <CardDescription>{unread.length} unread in the latest {notices.length} notifications. Refresh this page to check for updates.</CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3'>
        {notices.length ? notices.map(notice => (
          <div key={notice.id} className={'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ' + (!notice.readAt ? 'border-primary/40' : '')}>
            <div>
              <p className='text-sm font-medium'>{labels[notice.kind] || 'Request updated'}{!notice.readAt ? ' · Unread' : ''}</p>
              <Link className='text-primary text-sm underline' href={base + notice.ticketId}>{notice.ticketNumber} · {notice.subject}</Link>
              <p className='text-textSecondary mt-1 text-xs'>{new Date(notice.createdAt).toLocaleString()}</p>
            </div>
            {!notice.readAt ? <Button size='sm' variant='outline' disabled={pending} onClick={() => markRead([notice.id])}>Mark read</Button> : null}
          </div>
        )) : <p className='text-textSecondary text-sm'>No support notifications yet.</p>}
        {error ? <p role='alert' className='text-destructive text-sm'>{error}</p> : null}
      </CardContent>
    </Card>
  )
}

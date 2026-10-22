'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { cn } from '@repo/ui/lib/utils'

import { markNotificationsReadAction } from '@/app/(back)/help-desk/actions'

type Item = { id: string; title: string; body: string | null; link_path: string | null; read_at: string | null; created_at: string }

const safeLink = (path: string | null) => (path && path.startsWith('/') && !path.startsWith('//') ? path : null)

const NotificationInbox = ({ items, unreadOnly }: { items: Item[]; unreadOnly: boolean }) => {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const unread = items.filter(i => !i.read_at)

  const mark = (ids: string[] | 'all', then?: () => void) =>
    start(async () => {
      setError('')
      const result = await markNotificationsReadAction({ ids })

      if (!result.ok) setError(result.error || 'Unable to update notifications.')
      else {
        then?.()
        router.refresh()
      }
    })

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex gap-2'>
          <Button asChild size='sm' variant={unreadOnly ? 'outline' : 'tonal'}>
            <Link href='/notifications'>All</Link>
          </Button>
          <Button asChild size='sm' variant={unreadOnly ? 'tonal' : 'outline'}>
            <Link href='/notifications?filter=unread'>Unread</Link>
          </Button>
        </div>
        <Button type='button' size='sm' variant='ghost' disabled={pending || !unread.length} onClick={() => mark('all')}>
          Mark all as read
        </Button>
      </div>
      {error ? (
        <p role='alert' className='text-destructive text-sm'>
          {error}
        </p>
      ) : null}
      <Card>
        <CardContent className='flex flex-col divide-y p-0'>
          {items.length ? (
            items.map(item => {
              const link = safeLink(item.link_path)

              return (
                <div key={item.id} className={cn('flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:justify-between', !item.read_at && 'bg-primary/5')}>
                  <div className='min-w-0'>
                    <p className={cn('text-sm', !item.read_at && 'font-semibold')}>
                      {!item.read_at ? <span className='bg-primary mr-2 inline-block size-2 rounded-full' aria-label='Unread' /> : null}
                      {item.title}
                    </p>
                    {item.body ? <p className='text-textSecondary mt-1 line-clamp-2 text-sm'>{item.body}</p> : null}
                    <p className='text-textSecondary mt-1 text-xs'>{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                  <div className='flex shrink-0 gap-2'>
                    {link ? (
                      <Button type='button' size='sm' variant='outline' onClick={() => (item.read_at ? router.push(link) : mark([item.id], () => router.push(link)))}>
                        Open
                      </Button>
                    ) : null}
                    {!item.read_at ? (
                      <Button type='button' size='sm' variant='ghost' disabled={pending} onClick={() => mark([item.id])}>
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })
          ) : (
            <p className='text-textSecondary p-6 text-sm'>{unreadOnly ? 'You are all caught up.' : 'No notifications yet.'}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default NotificationInbox

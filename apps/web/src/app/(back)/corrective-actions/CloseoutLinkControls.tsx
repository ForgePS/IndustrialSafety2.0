'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbCopy, TbLink, TbLinkOff } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { toast } from '@repo/ui/utils/toast'

import type { CloseoutLinkState } from '@/lib/forgeCapaCloseout'

import { generateCloseoutLink, revokeCloseoutLink } from './closeoutActions'

const day = (value: string) => new Date(value).toLocaleDateString()

const CloseoutLinkControls = ({
  correctiveActionId,
  canIssue,
  state
}: {
  correctiveActionId: string
  canIssue: boolean
  state: CloseoutLinkState
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generate = () =>
    startTransition(async () => {
      setError(null)
      const result = await generateCloseoutLink(correctiveActionId)

      if (result.error || !result.path) {
        setError(result.error || 'Unable to create the closeout link.')

        return
      }

      const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '')

      setCreated({ url: base + result.path, expiresAt: result.expiresAt || '' })
      router.refresh()
    })

  const revoke = () =>
    startTransition(async () => {
      setError(null)
      const result = await revokeCloseoutLink(correctiveActionId)

      if (result.error) {
        setError(result.error)

        return
      }

      setCreated(null)
      toast('success', 'Closeout link revoked.')
      router.refresh()
    })

  return (
    <Card data-testid='closeout-link-panel'>
      <CardHeader>
        <CardTitle>Closeout Link</CardTitle>
        <CardDescription>
          A link anyone can open without signing in to submit closeout notes and photos. The submission moves this
          Corrective Action to Pending Verification; it still needs verification here.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {created ? (
          <div className='flex flex-col gap-2'>
            <div className='text-sm font-medium'>Copy this link now: it is shown only once.</div>
            <div className='flex flex-wrap gap-2'>
              <Input readOnly value={created.url} className='min-w-0 flex-1' data-testid='closeout-link-url' onFocus={event => event.currentTarget.select()} />
              <Button
                type='button'
                variant='outline'
                onClick={() => navigator.clipboard?.writeText(created.url).then(() => toast('success', 'Link copied.'))}
              >
                <TbCopy />
                Copy Link
              </Button>
            </div>
          </div>
        ) : null}

        {state.active ? (
          <div className='text-sm' data-testid='closeout-link-active'>
            Active link created {day(state.active.createdAt)}, expires {day(state.active.expiresAt)}.
          </div>
        ) : (
          <div className='text-textSecondary text-sm'>No active closeout link.</div>
        )}

        {state.lastSubmission ? (
          <div className='rounded-lg border p-3 text-sm' data-testid='closeout-last-submission'>
            <div className='font-medium'>
              Last submission {new Date(state.lastSubmission.usedAt).toLocaleString()} by {state.lastSubmission.name || 'an unnamed submitter'}
              {state.lastSubmission.photoCount ? ` · ${state.lastSubmission.photoCount} photo${state.lastSubmission.photoCount === 1 ? '' : 's'}` : ''}
            </div>
            {state.lastSubmission.notes ? (
              <div className='text-textSecondary mt-1 whitespace-pre-wrap'>{state.lastSubmission.notes}</div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className='text-destructive text-sm' role='alert'>
            {error}
          </div>
        ) : null}

        <div className='flex flex-wrap gap-2'>
          {canIssue ? (
            <Button type='button' onClick={generate} disabled={pending}>
              <TbLink />
              {state.active ? 'Generate New Link' : 'Generate Closeout Link'}
            </Button>
          ) : null}
          {state.active ? (
            <Button type='button' variant='outline' onClick={revoke} disabled={pending}>
              <TbLinkOff />
              Revoke Link
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default CloseoutLinkControls

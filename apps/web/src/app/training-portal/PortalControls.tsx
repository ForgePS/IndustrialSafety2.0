'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'

import { portalSignIn, portalSignOut } from './actions'

export const PortalSignIn = ({ token }: { token: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await portalSignIn(token, employeeNumber)

      if (result.error) {
        setError(result.error)

        return
      }

      setEmployeeNumber('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className='flex flex-col gap-4' data-testid='portal-sign-in'>
      <div>
        <Label htmlFor='portal-employee-number'>Employee number</Label>
        <Input
          id='portal-employee-number'
          className='mt-2 h-14 text-2xl'
          autoComplete='off'
          inputMode='text'
          value={employeeNumber}
          disabled={pending}
          onChange={event => setEmployeeNumber(event.target.value)}
        />
      </div>
      {error ? <div role='alert' className='border-destructive text-destructive rounded-md border p-3 text-sm'>{error}</div> : null}
      <Button type='submit' size='lg' disabled={pending || !employeeNumber.trim()}>{pending ? 'Checking...' : 'Start Training'}</Button>
    </form>
  )
}

export const PortalSignOut = ({ token }: { token: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant='outline'
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await portalSignOut(token)
          router.push(`/training-portal/${token}`)
          router.refresh()
        })
      }
    >
      Sign Out
    </Button>
  )
}

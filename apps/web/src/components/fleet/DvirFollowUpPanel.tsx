'use client'

import { useCallback, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import SignaturePad from '@/components/common/SignaturePad'
import { certifyDvirAction, reviewDvirAction } from '@/app/(back)/fleet/dvirs/actions'
import { MECHANIC_ACTION_LABELS, MECHANIC_ACTIONS } from '@/lib/forgeFleetDvirRules'
import type { MechanicAction } from '@/lib/forgeFleetDvirRules'

/**
 * Port slice 11 (piece B): the follow-up on a DVIR with defects. A mechanic (fleet.dvir_certify) certifies
 * the defects corrected or not needing correction; then the next driver (fleet.dvir, signed in) signs the
 * review that closes it.
 */
export const DvirCertifyPanel = ({ dvirId, defaultName, hasRepair }: { dvirId: string; defaultName: string; hasRepair: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [action, setAction] = useState<MechanicAction | ''>('')
  const [name, setName] = useState(defaultName)
  const [notes, setNotes] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const onSignature = useCallback((value: string | null) => setSignature(value), [])

  const save = () =>
    startTransition(async () => {
      setError(null)
      if (!action) return setError('Choose whether the defects were corrected or need no correction.')
      if (!signature) return setError('The mechanic must sign.')

      const result = await certifyDvirAction(dvirId, { action, mechanicName: name, notes, signature }).catch(() => ({ ok: false as const, error: 'Something went wrong. Try again.' }))

      if (!result.ok) return setError(result.error)

      toast('success', result.message)
      router.refresh()
    })

  return (
    <Card data-testid='dvir-certify-panel'>
      <CardHeader>
        <CardTitle>Mechanic certification</CardTitle>
        <CardDescription>
          Sign once the defects are repaired, or when they need no repair for safe operation.
          {hasRepair ? ' Certifying “corrected” also completes the linked repair record.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2' role='radiogroup' aria-label='Mechanic certification'>
          {MECHANIC_ACTIONS.map(value => (
            <label key={value} className='flex items-start gap-2 text-sm'>
              <input type='radio' name='mechanic-action' value={value} className='mt-1 size-4' checked={action === value} onChange={() => setAction(value)} data-mechanic-action={value} />
              <span>{MECHANIC_ACTION_LABELS[value]}</span>
            </label>
          ))}
        </div>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='mechanic-name'>Mechanic name</Label>
          <Input id='mechanic-name' value={name} onChange={event => setName(event.target.value)} />
        </div>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='mechanic-notes'>Notes</Label>
          <textarea
            id='mechanic-notes'
            className='border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm'
            value={notes}
            onChange={event => setNotes(event.target.value)}
            placeholder='Optional: what was done'
          />
        </div>
        <SignaturePad label='Mechanic signature' onChange={onSignature} disabled={pending} />
        {error ? (
          <p className='text-sm text-red-700' role='alert'>
            {error}
          </p>
        ) : null}
        <Button type='button' onClick={save} disabled={pending} data-testid='dvir-certify-save'>
          {pending ? 'Saving…' : 'Sign certification'}
        </Button>
      </CardContent>
    </Card>
  )
}

export const DvirReviewPanel = ({ dvirId, defaultName }: { dvirId: string; defaultName: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(defaultName)
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const onSignature = useCallback((value: string | null) => setSignature(value), [])

  const save = () =>
    startTransition(async () => {
      setError(null)
      if (!signature) return setError('Sign the review.')

      const result = await reviewDvirAction(dvirId, { reviewName: name, signature }).catch(() => ({ ok: false as const, error: 'Something went wrong. Try again.' }))

      if (!result.ok) return setError(result.error)

      toast('success', result.message)
      router.refresh()
    })

  return (
    <Card data-testid='dvir-review-panel'>
      <CardHeader>
        <CardTitle>Next driver review</CardTitle>
        <CardDescription>The next driver reviews the mechanic&apos;s certification and signs before driving the vehicle.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='review-name'>Driver name</Label>
          <Input id='review-name' value={name} onChange={event => setName(event.target.value)} />
        </div>
        <SignaturePad label='Driver review signature' onChange={onSignature} disabled={pending} />
        {error ? (
          <p className='text-sm text-red-700' role='alert'>
            {error}
          </p>
        ) : null}
        <Button type='button' onClick={save} disabled={pending} data-testid='dvir-review-save'>
          {pending ? 'Saving…' : 'Sign review'}
        </Button>
      </CardContent>
    </Card>
  )
}

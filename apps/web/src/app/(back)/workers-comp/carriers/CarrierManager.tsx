'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { saveCarrier, setCarrierActive } from '../actions'
import type { WcCarrierValues } from '../actions'

type Carrier = WcCarrierValues & { id: string; is_active: boolean }

const empty: WcCarrierValues = { name: '', policy_number: '', contact_name: '', phone: '', email: '', claims_address: '' }

const CarrierManager = ({ carriers }: { carriers: Carrier[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<WcCarrierValues>(empty)

  const run = (action: () => Promise<{ error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      after?.()
      router.refresh()
    })

  const field = (key: keyof WcCarrierValues, label: string, className = 'md:col-span-6') => (
    <div className={className}>
      <Label htmlFor={`carrier-${key}`}>{label}</Label>
      <Input id={`carrier-${key}`} className='mt-2' value={String(form[key] ?? '')} disabled={pending} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
    </div>
  )

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Edit Carrier' : 'Add Carrier'}</CardTitle>
          <CardDescription>Insurance carriers available on workers&apos; comp cases.</CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {field('name', 'Carrier name')}
          {field('policy_number', 'Policy number')}
          {field('contact_name', 'Claims contact', 'md:col-span-4')}
          {field('phone', 'Phone', 'md:col-span-4')}
          {field('email', 'Email', 'md:col-span-4')}
          {field('claims_address', 'Claims address', 'md:col-span-12')}
          <div className='flex gap-3 md:col-span-12'>
            <Button disabled={pending} onClick={() => run(() => saveCarrier({ carrierId: editingId || undefined, values: form }), () => { setEditingId(null); setForm(empty) })}>
              {editingId ? 'Save Carrier' : 'Add Carrier'}
            </Button>
            {editingId ? <Button variant='tonalDefault' onClick={() => { setEditingId(null); setForm(empty) }}>Cancel</Button> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className='flex flex-col gap-3 p-5'>
          {carriers.length ? carriers.map(carrier => (
            <div key={carrier.id} className='flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0' data-testid={`carrier-row-${carrier.name}`}>
              <div>
                <div className='font-semibold'>
                  {carrier.name}
                  {!carrier.is_active ? <Badge size='sm' variant='secondary' className='ms-2'>Inactive</Badge> : null}
                </div>
                <div className='text-textSecondary text-sm'>{[carrier.policy_number, carrier.contact_name, carrier.phone, carrier.email].filter(Boolean).join(' · ') || 'No contact details'}</div>
              </div>
              <div className='flex gap-2'>
                <Button size='sm' variant='outline' disabled={pending} onClick={() => { setEditingId(carrier.id); setForm({ name: carrier.name, policy_number: carrier.policy_number || '', contact_name: carrier.contact_name || '', phone: carrier.phone || '', email: carrier.email || '', claims_address: carrier.claims_address || '' }) }}>Edit</Button>
                <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => setCarrierActive({ carrierId: carrier.id, active: !carrier.is_active }))}>
                  {carrier.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
            </div>
          )) : <p className='text-textSecondary text-sm'>No carriers yet.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

export default CarrierManager

'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { createTenant, updateTenant } from './actions'
import type { TenantInput } from './actions'

type Plan = {
  id: string
  name: string
  status: string
  billing_interval: string
  base_price_cents: number | null
}

type TenantInitial = {
  id: string
  name: string
  legal_name: string | null
  slug: string
  customer_number: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  billing_contact_email: string | null
  phone: string | null
  website: string | null
  timezone: string
  locale: string
  internal_notes: string | null
  plan_id?: string | null
  subscription_status?: TenantInput['subscriptionStatus'] | null
}

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const TenantForm = ({ plans, initial }: { plans: Plan[]; initial?: TenantInitial }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug))

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  const defaultStatus = useMemo(() => initial?.subscription_status ?? 'onboarding', [initial?.subscription_status])

  const submit = (formData: FormData) => {
    const input: TenantInput = {
      name: String(formData.get('name') || ''),
      legalName: String(formData.get('legalName') || ''),
      slug: String(formData.get('slug') || ''),
      customerNumber: String(formData.get('customerNumber') || ''),
      primaryContactName: String(formData.get('primaryContactName') || ''),
      primaryContactEmail: String(formData.get('primaryContactEmail') || ''),
      billingContactEmail: String(formData.get('billingContactEmail') || ''),
      phone: String(formData.get('phone') || ''),
      website: String(formData.get('website') || ''),
      timezone: String(formData.get('timezone') || 'America/Chicago'),
      locale: String(formData.get('locale') || 'en-US'),
      internalNotes: String(formData.get('internalNotes') || ''),
      planId: String(formData.get('planId') || ''),
      subscriptionStatus: String(formData.get('subscriptionStatus') || 'onboarding') as TenantInput['subscriptionStatus']
    }

    startTransition(async () => {
      const result = initial ? await updateTenant(initial.id, input) : await createTenant(input)

      if ('error' in result) {
        toast('error', result.error || 'Unable to save tenant.')
        return
      }

      toast('success', result.message || 'Tenant saved.')

      if (!initial && 'id' in result && result.id) router.push(`/admin/creator/tenants/${result.id}`)
      else router.push(`/admin/creator/tenants/${initial?.id}`)

      router.refresh()
    })
  }

  return (
    <form action={submit} className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>Company identity</CardTitle>
          <CardDescription>Core tenant identity used throughout Forge Industrial Safety 2.0.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-5 md:grid-cols-2'>
          <div>
            <Label htmlFor='name'>Company name *</Label>
            <Input id='name' name='name' value={name} onChange={event => setName(event.target.value)} required className='mt-2' />
          </div>
          <div>
            <Label htmlFor='legalName'>Legal name</Label>
            <Input id='legalName' name='legalName' defaultValue={initial?.legal_name ?? ''} className='mt-2' />
          </div>
          <div>
            <Label htmlFor='slug'>Tenant slug *</Label>
            <Input
              id='slug'
              name='slug'
              value={slug}
              onChange={event => {
                setSlugTouched(true)
                setSlug(slugify(event.target.value))
              }}
              required
              className='mt-2'
            />
            <p className='text-textSecondary mt-1 text-xs'>Stable tenant identifier. Lowercase letters, numbers and hyphens.</p>
          </div>
          <div>
            <Label htmlFor='customerNumber'>Customer number</Label>
            <Input id='customerNumber' name='customerNumber' defaultValue={initial?.customer_number ?? ''} className='mt-2' />
          </div>
          <div>
            <Label htmlFor='website'>Website</Label>
            <Input id='website' name='website' defaultValue={initial?.website ?? ''} placeholder='https://example.com' className='mt-2' />
          </div>
          <div>
            <Label htmlFor='phone'>Phone</Label>
            <Input id='phone' name='phone' defaultValue={initial?.phone ?? ''} className='mt-2' />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>Primary operational and billing contacts for the tenant account.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-5 md:grid-cols-2'>
          <div>
            <Label htmlFor='primaryContactName'>Primary contact</Label>
            <Input id='primaryContactName' name='primaryContactName' defaultValue={initial?.primary_contact_name ?? ''} className='mt-2' />
          </div>
          <div>
            <Label htmlFor='primaryContactEmail'>Primary contact email</Label>
            <Input id='primaryContactEmail' name='primaryContactEmail' type='email' defaultValue={initial?.primary_contact_email ?? ''} className='mt-2' />
          </div>
          <div>
            <Label htmlFor='billingContactEmail'>Billing contact email</Label>
            <Input id='billingContactEmail' name='billingContactEmail' type='email' defaultValue={initial?.billing_contact_email ?? ''} className='mt-2' />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription & defaults</CardTitle>
          <CardDescription>Initial commercial plan and tenant defaults. Entitlements remain controlled separately.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-5 md:grid-cols-2'>
          <div>
            <Label htmlFor='planId'>Plan</Label>
            <select
              id='planId'
              name='planId'
              defaultValue={initial?.plan_id ?? ''}
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
            >
              <option value=''>Custom / no plan assigned</option>
              {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor='subscriptionStatus'>Subscription status</Label>
            <select
              id='subscriptionStatus'
              name='subscriptionStatus'
              defaultValue={defaultStatus}
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
            >
              <option value='trial'>Trial</option>
              <option value='onboarding'>Onboarding</option>
              <option value='active'>Active</option>
              <option value='past_due'>Past Due</option>
              <option value='suspended'>Suspended</option>
              <option value='canceled'>Canceled</option>
              <option value='archived'>Archived</option>
            </select>
          </div>
          <div>
            <Label htmlFor='timezone'>Time zone</Label>
            <Input id='timezone' name='timezone' defaultValue={initial?.timezone ?? 'America/Chicago'} className='mt-2' />
          </div>
          <div>
            <Label htmlFor='locale'>Locale</Label>
            <Input id='locale' name='locale' defaultValue={initial?.locale ?? 'en-US'} className='mt-2' />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Internal Forge notes</CardTitle>
          <CardDescription>Visible to Forge platform operators only.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea id='internalNotes' name='internalNotes' defaultValue={initial?.internal_notes ?? ''} rows={5} />
        </CardContent>
      </Card>

      <div className='flex flex-wrap gap-3'>
        <Button type='submit' disabled={pending}>{pending ? 'Saving...' : initial ? 'Save Tenant' : 'Create Tenant'}</Button>
        <Button type='button' variant='tonalDefault' asChild>
          <Link href={initial ? `/admin/creator/tenants/${initial.id}` : '/admin/creator/tenants'}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}

export default TenantForm

'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { createPortalLink, deactivatePortalLink } from './actions'
import { generateForgeQrSvg } from '@/lib/forgeQrSvg'

type Link = { id: string; title: string; locationName: string | null; isActive: boolean; expiresAt: string | null; lastUsedAt: string | null; activeSessions: number }

const qrFor = (url: string) => {
  try {
    return generateForgeQrSvg(url, 5)
  } catch {
    return null
  }
}

const PortalManager = ({ links, locations }: { links: Link[]; locations: Array<{ id: string; label: string }> }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({ title: '', location_id: '', expires_at: '' })
  const [created, setCreated] = useState<{ url: string; qr: string | null } | null>(null)

  const create = () =>
    startTransition(async () => {
      const result = await createPortalLink(form)

      if (result.error || !result.url) {
        toast('error', result.error || 'Unable to create the link.')

        return
      }

      setCreated({ url: result.url, qr: qrFor(result.url) })
      setForm({ title: '', location_id: '', expires_at: '' })
      router.refresh()
    })

  const deactivate = (linkId: string) =>
    startTransition(async () => {
      const result = await deactivatePortalLink({ linkId })

      if (result.error) toast('error', result.error)
      else toast('success', result.message || 'Deactivated.')
      router.refresh()
    })

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>New Kiosk Link</CardTitle>
          <CardDescription>
            Employees open the link on a shared tablet or scan its QR code, then sign in with their employee number (as in Forge 1.0). Eight failed attempts in 15 minutes lock that device or number for 15 minutes; sessions last one hour.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          <div className='md:col-span-5'>
            <Label htmlFor='portal-title'>Name</Label>
            <Input id='portal-title' className='mt-2' placeholder='Break room tablet' value={form.title} disabled={pending} onChange={event => setForm({ ...form, title: event.target.value })} />
          </div>
          <div className='md:col-span-4'>
            <Label htmlFor='portal-location'>Only people at</Label>
            <select id='portal-location' className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3' value={form.location_id} disabled={pending} onChange={event => setForm({ ...form, location_id: event.target.value })}>
              <option value=''>Any Location</option>
              {locations.map(location => <option key={location.id} value={location.id}>{location.label}</option>)}
            </select>
          </div>
          <div className='md:col-span-3'>
            <Label htmlFor='portal-expires'>Expires (optional)</Label>
            <Input id='portal-expires' type='date' className='mt-2' value={form.expires_at} disabled={pending} onChange={event => setForm({ ...form, expires_at: event.target.value })} />
          </div>
          <div className='md:col-span-12'>
            <Button disabled={pending || !form.title.trim()} onClick={create}>Create Kiosk Link</Button>
          </div>
        </CardContent>
      </Card>

      {created ? (
        <Card className='border-primary' data-testid='portal-created'>
          <CardHeader>
            <CardTitle>Copy this link now</CardTitle>
            <CardDescription>For security it is shown only once. If it is lost, deactivate it and create a new one.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <Input readOnly value={created.url} data-testid='portal-created-url' onFocus={event => event.target.select()} />
            <div className='flex flex-wrap gap-3'>
              <Button variant='outline' onClick={() => navigator.clipboard?.writeText(created.url).then(() => toast('success', 'Link copied.'))}>Copy Link</Button>
              <Button variant='tonalDefault' onClick={() => setCreated(null)}>Done</Button>
            </div>
            {created.qr ? <div className='w-48 rounded bg-white p-2' dangerouslySetInnerHTML={{ __html: created.qr }} /> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Kiosk Links</CardTitle></CardHeader>
        <CardContent className='flex flex-col gap-3' data-testid='portal-links'>
          {links.length ? links.map(link => (
            <div key={link.id} className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
              <div>
                <div className='font-semibold'>
                  {link.title}
                  {link.isActive ? <Badge size='sm' variant='tonalSuccess' className='ms-2'>Active</Badge> : <Badge size='sm' variant='secondary' className='ms-2'>Inactive</Badge>}
                </div>
                <div className='text-textSecondary text-sm'>
                  {link.locationName ? `Only ${link.locationName}` : 'Any Location'}
                  {link.expiresAt ? ` · expires ${link.expiresAt.slice(0, 10)}` : ''}
                  {link.lastUsedAt ? ` · last used ${new Date(link.lastUsedAt).toLocaleString()}` : ' · never used'}
                  {link.isActive ? ` · ${link.activeSessions} signed in` : ''}
                </div>
              </div>
              {link.isActive ? (
                <Button size='sm' variant='outline' disabled={pending} onClick={() => window.confirm('Deactivate this kiosk link? Anyone signed in through it will be signed out.') && deactivate(link.id)}>
                  Deactivate
                </Button>
              ) : null}
            </div>
          )) : <p className='text-textSecondary text-sm'>No kiosk links yet.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

export default PortalManager

import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'

import PortalManager from './PortalManager'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Training Kiosk Links' }

const TrainingPortalAdminPage = async () => {
  const context = await requireTenantPermission('training.manage_portal')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: links }, { data: sessions }, { data: locations }] = await Promise.all([
    supabase.from('forge_training_portal_links').select('*, locations(name)').eq('organization_id', organizationId).order('is_active', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('forge_training_portal_sessions').select('link_id').eq('organization_id', organizationId).is('revoked_at', null).gt('expires_at', new Date().toISOString()),
    supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name')
  ])

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Training Kiosk</h1>
        </div>
        <Button variant='tonalDefault' asChild><Link href='/training'>Back to Training</Link></Button>
      </div>

      <PortalManager
        links={(links || []).map((link: any) => ({
          id: link.id,
          title: link.title,
          locationName: link.locations?.name || null,
          isActive: link.is_active && (!link.expires_at || Date.parse(link.expires_at) > Date.now()),
          expiresAt: link.expires_at,
          lastUsedAt: link.last_used_at,
          activeSessions: (sessions || []).filter((session: any) => session.link_id === link.id).length
        }))}
        locations={(locations || []).map((location: any) => ({ id: location.id, label: location.code ? `${location.name} (${location.code})` : location.name }))}
      />
    </div>
  )
}

export default TrainingPortalAdminPage

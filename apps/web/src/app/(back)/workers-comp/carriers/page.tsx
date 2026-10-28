import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'

import CarrierManager from './CarrierManager'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Workers\' Comp Carriers' }

const CarriersPage = async () => {
  const context = await requireTenantPermission('workers_comp.configure')
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_wc_carriers')
    .select('*')
    .eq('organization_id', context.activeOrganization.id)
    .order('is_active', { ascending: false })
    .order('name')

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Workers&apos; Comp</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Insurance Carriers</h1>
        </div>
        <Button variant='tonalDefault' asChild><Link href='/workers-comp'>Back</Link></Button>
      </div>

      <CarrierManager
        carriers={(data || []).map((item: any) => ({
          id: item.id,
          is_active: item.is_active,
          name: item.name,
          policy_number: item.policy_number || '',
          contact_name: item.contact_name || '',
          phone: item.phone || '',
          email: item.email || '',
          claims_address: item.claims_address || ''
        }))}
      />
    </div>
  )
}

export default CarriersPage

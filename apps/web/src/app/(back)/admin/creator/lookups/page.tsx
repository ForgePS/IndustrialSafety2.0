import Link from 'next/link'
import type { Metadata } from 'next'
import { TbBuildingCommunity, TbChevronRight } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Tenant Dropdowns & Lookups | Forge Creator 2.0' }

const Page = async () => {
  await requireForgePlatformRole()
  const supabase = createServiceRoleClient() as any
  const { data: tenants, error } = await supabase
    .from('organizations')
    .select('id, name, slug, status')
    .neq('status', 'archived')
    .order('name')

  if (error) throw new Error(`Unable to load tenants: ${error.message}`)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Tenant Dropdowns & Lookups</h1>
        <p className='text-textSecondary mt-2 max-w-4xl'>
          Dropdown customization is tenant-specific. Select the company whose options and editing rights you want to configure.
        </p>
      </div>

      <div className='grid gap-5 md:grid-cols-2 xl:grid-cols-3'>
        {(tenants || []).map((tenant: any) => (
          <Card key={tenant.id}>
            <CardHeader>
              <div className='bg-primary/10 text-primary mb-3 flex size-11 items-center justify-center rounded-lg'>
                <TbBuildingCommunity className='text-2xl' />
              </div>
              <CardTitle>{tenant.name}</CardTitle>
              <CardDescription>{tenant.slug}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className='w-full'>
                <Link href={`/admin/creator/tenants/${tenant.id}/lookups`}>
                  Open Dropdown Manager
                  <TbChevronRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default Page

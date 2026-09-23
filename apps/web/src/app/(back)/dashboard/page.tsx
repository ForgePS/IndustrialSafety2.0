import Link from 'next/link'
import type { Metadata } from 'next'
import { TbArrowRight, TbBuilding, TbLayoutDashboard } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveExperience } from '@/lib/forgeExperience'

export const metadata: Metadata = { title: 'Dashboard' }

const DashboardPage = async () => {
  const { user, activeOrganization } = await getTenantContext()

  if (!user || !activeOrganization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No company assigned</CardTitle>
          <CardDescription>Your account is not currently assigned to an active Forge tenant.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const experience = await getEffectiveExperience({
    organizationId: activeOrganization.id,
    userId: user.id,
    types: ['menu', 'dashboard', 'widget']
  })

  const modules = experience.filter(item => item.type === 'menu' && item.key !== 'nav.company_settings')
  const dashboardElement = experience.find(item => item.key === 'dashboard.home')

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{activeOrganization.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>
            {dashboardElement?.label || 'Dashboard'}
          </h1>
          <p className='text-textSecondary mt-2'>
            {dashboardElement?.description || 'Your Forge Industrial Safety workspace.'}
          </p>
        </div>
        <div className='flex items-center gap-2 text-sm text-textSecondary'>
          <TbBuilding />
          <span>{activeOrganization.membershipRole}</span>
        </div>
      </div>

      <div className='grid gap-5 md:grid-cols-2 xl:grid-cols-3'>
        {modules.length ? modules.map(module => (
          <Card key={module.id} className='h-full'>
            <CardHeader>
              <div className='bg-primary/10 text-primary mb-3 flex size-11 items-center justify-center rounded-lg'>
                <TbLayoutDashboard className='text-2xl' />
              </div>
              <CardTitle>{module.label}</CardTitle>
              <CardDescription>{module.description || 'Open this Forge module.'}</CardDescription>
            </CardHeader>
            <CardContent>
              {module.routeLive && module.route ? (
                <Button variant='outline' asChild>
                  <Link href={module.route}>
                    Open
                    <TbArrowRight />
                  </Link>
                </Button>
              ) : (
                <Button variant='outline' disabled>Coming Soon</Button>
              )}
            </CardContent>
          </Card>
        )) : (
          <Card className='md:col-span-2 xl:col-span-3'>
            <CardHeader>
              <CardTitle>No modules available yet</CardTitle>
              <CardDescription>
                Your Forge Administrator controls which modules are available to your company and role.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}

export default DashboardPage

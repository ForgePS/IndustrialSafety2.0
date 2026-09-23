// Next Imports
import Link from 'next/link'
import type { Metadata } from 'next'

// Third-party Imports
import {
  TbBuildingCommunity,
  TbCreditCard,
  TbKey,
  TbListDetails,
  TbRoute,
  TbSettingsAutomation,
  TbAdjustments,
  TbShieldLock,
  TbToggleRight,
  TbUsersGroup,
  TbWallet
} from 'react-icons/tb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'

export const metadata: Metadata = {
  title: 'Forge Creator 2.0'
}

const creatorAreas = [
  {
    title: 'Tenants',
    description: 'Provision, suspend, archive and manage every Forge tenant.',
    href: '/admin/creator/tenants',
    icon: TbBuildingCommunity
  },
  {
    title: 'Plans & Subscriptions',
    description: 'Plans, contracts, negotiated pricing, renewals and subscription lifecycle.',
    href: '/admin/creator/subscriptions',
    icon: TbCreditCard
  },
  {
    title: 'Features & Entitlements',
    description: 'Control modules, feature flags, tenant overrides and plan entitlements.',
    href: '/admin/creator/features',
    icon: TbToggleRight
  },
  {
    title: 'Permission Registry',
    description: 'Define every assignable action, scope and sensitive permission.',
    href: '/admin/creator/permissions',
    icon: TbShieldLock
  },
  {
    title: 'Roles & Access',
    description: 'Tenant role templates, granular access and individual overrides.',
    href: '/admin/creator/access',
    icon: TbUsersGroup
  },
  {
    title: 'Dropdowns & Lookups',
    description: 'Manage every dropdown, option key and tenant customization rule.',
    href: '/admin/creator/lookups',
    icon: TbListDetails
  },
  {
    title: 'Experience Builder',
    description: 'Edit labels, help text, visibility, presentation and who may customize each experience element.',
    href: '/admin/creator/experience',
    icon: TbAdjustments
  },
  {
    title: 'Navigation Builder',
    description: 'Control menus, dropdown menus, ordering, visibility and tenant overrides.',
    href: '/admin/creator/navigation',
    icon: TbRoute
  },
  {
    title: 'Configuration Engine',
    description: 'Locked On, Configurable and Locked Off settings with inheritance.',
    href: '/admin/creator/configuration',
    icon: TbSettingsAutomation
  },
  {
    title: 'Billing & Usage',
    description: 'Allowances, overages, billing operations and SaaS usage controls.',
    href: '/admin/creator/billing',
    icon: TbWallet
  },
  {
    title: 'Audit & Security',
    description: 'Track platform changes, sensitive actions and Creator activity.',
    href: '/admin/creator/audit',
    icon: TbKey
  }
]

const CreatorDashboard = () => {
  return (
    <div className='flex flex-col gap-8'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Control Plane</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Forge Creator 2.0</h1>
          <p className='text-textSecondary mt-2 max-w-3xl'>
            Operate the entire multi-tenant SaaS platform, define what tenants can customize, and control how Forge behaves without
            hard-coding customer-specific rules.
          </p>
        </div>
        <Button asChild>
          <Link href='/admin/creator/tenants'>Manage Tenants</Link>
        </Button>
      </div>

      <div className='grid gap-5 md:grid-cols-2 xl:grid-cols-3'>
        {creatorAreas.map(area => {
          const Icon = area.icon

          return (
            <Card key={area.href} className='h-full'>
              <CardHeader>
                <div className='bg-primary/10 text-primary mb-3 flex size-11 items-center justify-center rounded-lg'>
                  <Icon className='text-2xl' />
                </div>
                <CardTitle>{area.title}</CardTitle>
                <CardDescription>{area.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant='outline' asChild>
                  <Link href={area.href}>Open</Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Creator policy model</CardTitle>
          <CardDescription>
            Every configurable function will resolve through the same inheritance model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid gap-3 md:grid-cols-3'>
            <div className='rounded-lg border p-4'>
              <div className='font-semibold'>Locked On</div>
              <p className='text-textSecondary mt-1 text-sm'>Enabled by Forge and cannot be disabled by a tenant.</p>
            </div>
            <div className='rounded-lg border p-4'>
              <div className='font-semibold'>Configurable</div>
              <p className='text-textSecondary mt-1 text-sm'>Tenant, location or user overrides are allowed only where Creator permits them.</p>
            </div>
            <div className='rounded-lg border p-4'>
              <div className='font-semibold'>Locked Off</div>
              <p className='text-textSecondary mt-1 text-sm'>Unavailable regardless of tenant-level configuration.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default CreatorDashboard

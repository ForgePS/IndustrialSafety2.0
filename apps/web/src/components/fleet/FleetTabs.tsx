import Link from 'next/link'

export type FleetTabKey = 'dashboard' | 'vehicles' | 'dvirs' | 'maintenance' | 'renewals' | 'drivers' | 'removed' | 'reports' | 'settings'

const TABS: { key: FleetTabKey; label: string; href: string; permission?: string }[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/fleet' },
  { key: 'vehicles', label: 'Vehicles', href: '/fleet/vehicles' },
  { key: 'dvirs', label: 'DVIRs', href: '/fleet/dvirs' },
  { key: 'maintenance', label: 'Maintenance', href: '/fleet/maintenance' },
  { key: 'renewals', label: 'Renewals', href: '/fleet/renewals' },
  { key: 'drivers', label: 'Drivers', href: '/fleet/drivers' },
  { key: 'removed', label: 'Removed', href: '/fleet/removed' },
  { key: 'reports', label: 'Reports', href: '/fleet/reports', permission: 'fleet.export' },
  { key: 'settings', label: 'Settings', href: '/fleet/settings', permission: 'fleet.settings' }
]

/**
 * Port slice 11: the tab row shared by every /fleet page. Pass the viewer's allowed permission keys so tabs
 * they can't open are hidden.
 */
const FleetTabs = ({ active, permissions }: { active: FleetTabKey; permissions: string[] }) => (
  <nav className='flex flex-wrap gap-1 border-b' aria-label='Fleet sections'>
    {TABS.filter(tab => !tab.permission || permissions.includes(tab.permission)).map(tab => (
      <Link
        key={tab.key}
        href={tab.href}
        aria-current={tab.key === active ? 'page' : undefined}
        className={
          '-mb-px border-b-2 px-4 py-2 text-sm font-medium ' +
          (tab.key === active ? 'border-primary text-primary' : 'text-textSecondary hover:text-textPrimary border-transparent')
        }
      >
        {tab.label}
      </Link>
    ))}
  </nav>
)

export default FleetTabs

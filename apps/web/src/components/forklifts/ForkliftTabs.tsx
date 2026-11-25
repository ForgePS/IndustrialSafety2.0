import Link from 'next/link'

/** Port slice 19: tabs for the Forklifts section. */
const TABS = [
  { key: 'overview', label: 'Overview', href: '/forklifts' },
  { key: 'trucks', label: 'Trucks', href: '/forklifts/trucks' },
  { key: 'checks', label: 'Pre-Shift Checks', href: '/forklifts/checks' },
  { key: 'defects', label: 'Defects', href: '/forklifts/defects' },
  { key: 'operators', label: 'Operators', href: '/forklifts/operators' },
  { key: 'settings', label: 'Settings', href: '/forklifts/settings', manage: true }
]

const ForkliftTabs = ({ active, canManage }: { active: string; canManage: boolean }) => (
  <nav aria-label='Forklifts' className='flex flex-wrap gap-1 border-b print:hidden'>
    {TABS.filter(tab => !tab.manage || canManage).map(tab => (
      <Link
        key={tab.key}
        href={tab.href}
        aria-current={active === tab.key ? 'page' : undefined}
        className={
          '-mb-px border-b-2 px-3 py-2 text-sm font-medium ' +
          (active === tab.key ? 'border-primary text-primary' : 'text-textSecondary hover:text-textPrimary border-transparent')
        }
      >
        {tab.label}
      </Link>
    ))}
  </nav>
)

export default ForkliftTabs

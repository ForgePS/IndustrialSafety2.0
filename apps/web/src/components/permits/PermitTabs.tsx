import Link from 'next/link'

/** Port slice 18: tabs for the High-Risk Work (permit to work) section. */
const TABS = [
  { key: 'board', label: 'Board', href: '/permits' },
  { key: 'confined-space', label: 'Confined Space', href: '/permits/confined-space' },
  { key: 'hot-work', label: 'Hot Work', href: '/permits/hot-work' },
  { key: 'working-at-heights', label: 'Heights', href: '/permits/working-at-heights' },
  { key: 'electrical', label: 'Electrical', href: '/permits/electrical' },
  { key: 'spaces', label: 'Spaces', href: '/permits/confined-space/spaces' },
  { key: 'settings', label: 'Settings', href: '/permits/settings', manage: true }
]

const PermitTabs = ({ active, canManage }: { active: string; canManage: boolean }) => (
  <nav aria-label='High-risk work' className='flex flex-wrap gap-1 border-b print:hidden'>
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

export default PermitTabs

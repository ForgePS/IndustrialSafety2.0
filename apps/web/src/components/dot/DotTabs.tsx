import Link from 'next/link'

export type DotTab = 'dashboard' | 'drivers' | 'company-drivers' | 'records' | 'reports' | 'settings'

/** Section links for DOT Compliance (1.0 tabs; Vehicles and DVIRs come with the Fleet port). */
const DotTabs = ({ active, showSettings, showReports }: { active: DotTab; showSettings: boolean; showReports: boolean }) => {
  const tabs = [
    { key: 'dashboard', label: 'Dashboard', href: '/dot' },
    { key: 'drivers', label: 'Driver Files', href: '/dot/drivers' },
    { key: 'company-drivers', label: 'Company Drivers', href: '/dot/company-drivers' },
    { key: 'records', label: 'Records', href: '/dot/records' },
    ...(showReports ? [{ key: 'reports', label: 'Reports', href: '/dot/reports' }] : []),
    ...(showSettings ? [{ key: 'settings', label: 'Settings', href: '/dot/settings' }] : [])
  ]

  return (
    <nav className='flex flex-wrap gap-1 border-b' aria-label='DOT Compliance sections'>
      {tabs.map(tab => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? 'page' : undefined}
          className={
            '-mb-px border-b-2 px-4 py-2 text-sm font-medium ' +
            (tab.key === active ? 'border-primary text-primary' : 'text-textSecondary border-transparent hover:text-textPrimary')
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

export default DotTabs

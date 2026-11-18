import Link from 'next/link'

/** Section links shared by the LOTO procedure list, lockouts and settings pages. */
const LotoTabs = ({ active, showSettings }: { active: 'procedures' | 'lockouts' | 'settings'; showSettings: boolean }) => {
  const tabs = [
    { key: 'procedures', label: 'Procedures', href: '/loto' },
    { key: 'lockouts', label: 'Lockouts', href: '/loto/lockouts' },
    ...(showSettings ? [{ key: 'settings', label: 'Settings', href: '/loto/settings' }] : [])
  ]

  return (
    <nav className='flex gap-1 border-b' aria-label='Lockout / Tagout sections'>
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

export default LotoTabs

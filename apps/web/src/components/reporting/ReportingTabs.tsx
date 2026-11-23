import Link from 'next/link'

const TABS = [
  { key: 'library', label: 'Report library', href: '/reporting' },
  { key: 'saved', label: 'Saved reports', href: '/reporting/saved' },
  { key: 'history', label: 'History', href: '/reporting/history' }
] as const

/** Port slice 13: the Reporting section's tabs. */
const ReportingTabs = ({ current }: { current: (typeof TABS)[number]['key'] }) => (
  <nav aria-label='Reporting' className='flex flex-wrap gap-1 border-b'>
    {TABS.map(tab => (
      <Link
        key={tab.key}
        href={tab.href}
        aria-current={current === tab.key ? 'page' : undefined}
        className={
          '-mb-px border-b-2 px-3 py-2 text-sm font-medium ' +
          (current === tab.key ? 'border-primary text-primary' : 'text-textSecondary hover:text-textPrimary border-transparent')
        }
      >
        {tab.label}
      </Link>
    ))}
  </nav>
)

export default ReportingTabs

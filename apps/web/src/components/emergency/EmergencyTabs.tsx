import Link from 'next/link'

type Tab = { key: string; label: string; href: string }

/** Port slice 14: tabs for the Emergency Plans and Emergency Alerts sections. */
const EmergencyTabs = ({ tabs, current, label }: { tabs: Tab[]; current: string; label: string }) => (
  <nav aria-label={label} className='flex flex-wrap gap-1 border-b'>
    {tabs.map(tab => (
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

export default EmergencyTabs

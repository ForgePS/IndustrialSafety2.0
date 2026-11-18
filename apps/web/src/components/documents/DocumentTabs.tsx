import Link from 'next/link'

export type DocumentTabKey = 'library' | 'acknowledgments' | 'approvals' | 'reviews' | 'archived' | 'settings'

const TABS: { key: DocumentTabKey; label: string; href: string; permission?: string }[] = [
  { key: 'library', label: 'Library', href: '/documents' },
  { key: 'acknowledgments', label: 'To read', href: '/documents/acknowledgments' },
  { key: 'approvals', label: 'Approvals', href: '/documents/approvals', permission: 'documents.approve' },
  { key: 'reviews', label: 'Reviews', href: '/documents/reviews', permission: 'documents.manage' },
  { key: 'archived', label: 'Archived', href: '/documents/archived', permission: 'documents.manage' },
  { key: 'settings', label: 'Settings', href: '/documents/settings', permission: 'documents.settings' }
]

/**
 * Port slice 12: the tab row shared by every /documents page. Pass the viewer's allowed permission keys so tabs
 * they can't open are hidden.
 */
const DocumentTabs = ({ active, permissions }: { active?: DocumentTabKey; permissions: string[] }) => (
  <nav className='flex flex-wrap gap-1 border-b' aria-label='Document control sections'>
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

export default DocumentTabs

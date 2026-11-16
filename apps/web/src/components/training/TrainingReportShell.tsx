import Link from 'next/link'
import { TbDownload } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'

export type TrainingReportTab = 'records' | 'overdue' | 'activity' | 'qc'

const TABS: Array<{ key: TrainingReportTab; label: string; href: string }> = [
  { key: 'records', label: 'Records', href: '/training/reports' },
  { key: 'overdue', label: 'Overdue', href: '/training/reports/overdue' },
  { key: 'activity', label: 'Team Activity', href: '/training/reports/activity' },
  { key: 'qc', label: 'Quiz QC', href: '/training/reports/qc' }
]

/** Title, tabs and CSV button shared by the training report pages. */
const TrainingReportShell = ({
  active,
  organizationName,
  description,
  csvHref,
  children
}: {
  active: TrainingReportTab
  organizationName: string
  description: string
  csvHref?: string
  children: React.ReactNode
}) => (
  <div className='flex min-w-0 flex-col gap-6'>
    <div className='flex flex-wrap items-end justify-between gap-4'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{organizationName} / Training</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Training Reports</h1>
        <p className='text-textSecondary mt-2'>{description}</p>
      </div>
      <div className='flex flex-wrap gap-2'>
        {csvHref ? (
          <Button variant='outline' asChild>
            {/* A file download, not a page: a plain anchor keeps the browser from client-routing it. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href={csvHref} download>
              <TbDownload />
              Download CSV
            </a>
          </Button>
        ) : null}
        <Button variant='tonalDefault' asChild>
          <Link href='/training'>Back to Training</Link>
        </Button>
      </div>
    </div>
    <nav className='flex flex-wrap gap-1 border-b' aria-label='Training reports'>
      {TABS.map(tab => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? 'page' : undefined}
          className={'-mb-px border-b-2 px-3 py-2 text-sm ' + (tab.key === active ? 'border-primary text-primary font-semibold' : 'text-textSecondary hover:text-textPrimary border-transparent')}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
    {children}
  </div>
)

export default TrainingReportShell

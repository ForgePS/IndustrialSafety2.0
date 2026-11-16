import { TbTruck } from 'react-icons/tb'

import DotTabs, { type DotTab } from './DotTabs'

/** Page title, subtitle, actions and section tabs shared by every DOT page. */
const DotHeader = ({
  active,
  allowed,
  title = 'DOT Compliance',
  subtitle,
  actions
}: {
  active: DotTab
  allowed: (key: string) => boolean
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}) => (
  <>
    <div className='flex flex-wrap items-end justify-between gap-4'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbTruck />
          {title}
        </h1>
        <p className='text-textSecondary mt-2'>
          {subtitle || 'Driver qualification files, the company-driver MVR roster and other DOT records.'}
        </p>
      </div>
      {actions ? <div className='flex flex-wrap gap-2'>{actions}</div> : null}
    </div>
    <DotTabs active={active} showSettings={allowed('dot.settings')} showReports={allowed('dot.export')} />
  </>
)

export const allowedFrom = (context: { access: { effective: Array<{ permissionKey: string; allowed: boolean }> } }) => (key: string) =>
  context.access.effective.some(item => item.permissionKey === key && item.allowed)

export default DotHeader

import { TbFileText } from 'react-icons/tb'

import DocumentTabs, { type DocumentTabKey } from '@/components/documents/DocumentTabs'
import { DOCUMENT_STATUS_LABELS, VERSION_STATUS_LABELS, statusTone, type DocumentStatus, type VersionStatus } from '@/lib/forgeDocumentRules'

/** Port slice 12: title, subtitle, actions and the Document Control tab row. */
export const DocumentPageHeader = ({
  active,
  permissions,
  title = 'Document Control',
  subtitle,
  actions
}: {
  active?: DocumentTabKey
  permissions: string[]
  title?: string
  subtitle: string
  actions?: React.ReactNode
}) => (
  <>
    <div className='flex flex-wrap items-end justify-between gap-4'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbFileText />
          {title}
        </h1>
        <p className='text-textSecondary mt-2'>{subtitle}</p>
      </div>
      {actions ? <div className='flex flex-wrap gap-2'>{actions}</div> : null}
    </div>
    <DocumentTabs active={active} permissions={permissions} />
  </>
)

export const DocumentStatusBadge = ({ status }: { status: string }) => (
  <span className={'inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ' + statusTone(status)} data-status={status}>
    {DOCUMENT_STATUS_LABELS[status as DocumentStatus] || status}
  </span>
)

export const VersionStatusBadge = ({ status }: { status: string }) => (
  <span className={'inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ' + statusTone(status)} data-version-status={status}>
    {VERSION_STATUS_LABELS[status as VersionStatus] || status}
  </span>
)

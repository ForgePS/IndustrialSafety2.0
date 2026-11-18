import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { getDevelopmentIssueDetail } from '@/lib/forgeHelpdeskConsoleData'
import DevelopmentIssueView from './DevelopmentIssueView'

export const metadata: Metadata = { title: 'Development Issue' }

const DevelopmentIssuePage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireHelpdeskStaff('helpdesk.support.link_development')
  const { id } = await params
  const detail = await getDevelopmentIssueDetail(id)

  if (!detail) notFound()

  return <DevelopmentIssueView detail={JSON.parse(JSON.stringify(detail))} />
}

export default DevelopmentIssuePage

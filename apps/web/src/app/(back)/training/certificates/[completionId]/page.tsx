import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import PrintButton from '@/components/common/PrintButton'
import TrainingCertificate, { loadCertificate } from '@/components/training/TrainingCertificate'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'

export const metadata: Metadata = { title: 'Training Certificate' }

/** The employee may print their own certificate; others need training.view within personnel scope. */
const CertificatePage = async ({ params }: { params: Promise<{ completionId: string }> }) => {
  const { completionId } = await params
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) notFound()

  const organizationId = context.activeOrganization.id
  const certificate = await loadCertificate(organizationId, completionId)

  if (!certificate) notFound()

  const person = certificate.completion.forge_personnel
  const isOwn = person?.auth_user_id === context.user.id

  if (!isOwn) {
    const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })
    const view = access.effective.find(item => item.permissionKey === 'training.view' && item.allowed)
    const allowed = view && person ? await personnelRecordWithinScope({ organizationId, userId: context.user.id, scope: view.scope, record: person }) : false

    if (!allowed) notFound()
  }

  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <div className='flex justify-end print:hidden'><PrintButton /></div>
      <TrainingCertificate certificate={certificate} />
    </div>
  )
}

export default CertificatePage

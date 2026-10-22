import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'

import { loadPortal } from '../../../portalContext'
import PrintButton from '@/components/common/PrintButton'
import TrainingCertificate, { loadCertificate } from '@/components/training/TrainingCertificate'

export const metadata: Metadata = { title: 'Training Certificate', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** Kiosk learners may only see their own certificates. */
const PortalCertificatePage = async ({ params }: { params: Promise<{ token: string; completionId: string }> }) => {
  const { token, completionId } = await params
  const { link, session } = await loadPortal(token)

  if (!link || !session) redirect(`/training-portal/${token}`)

  const certificate = await loadCertificate(link.organization_id, completionId)

  if (!certificate || certificate.completion.personnel_id !== session.personnel_id) notFound()

  return (
    <main className='bg-background mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-10'>
      <div className='flex flex-wrap justify-between gap-3 print:hidden'>
        <Button variant='tonalDefault' asChild><Link href={`/training-portal/${token}`}>All my training</Link></Button>
        <PrintButton />
      </div>
      <TrainingCertificate certificate={certificate} />
    </main>
  )
}

export default PortalCertificatePage

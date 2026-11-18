import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'

import { portalCompleteCourse, portalCompleteSection, portalOpenMaterial, portalStartQuiz, portalSubmitQuiz } from '../../../actions'
import { PortalSignOut } from '../../../PortalControls'
import { loadPortal } from '../../../portalContext'
import CoursePlayer from '@/components/training/CoursePlayer'
import { getLearnerView } from '@/lib/forgeTrainingLms'
import { toCoursePlayerData } from '@/lib/forgeTrainingPlayer'

export const metadata: Metadata = { title: 'Training Kiosk', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PortalCoursePage = async ({ params }: { params: Promise<{ token: string; assignmentId: string }> }) => {
  const { token, assignmentId } = await params
  const { link, session } = await loadPortal(token)

  if (!link || !session) redirect(`/training-portal/${token}`)

  const view = await getLearnerView(link.organization_id, assignmentId)

  if (!view || view.assignment.personnel_id !== session.personnel_id) notFound()

  return (
    <main className='bg-background mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Button variant='tonalDefault' asChild><Link href={`/training-portal/${token}`}>All my training</Link></Button>
        <PortalSignOut token={token} />
      </div>
      <CoursePlayer
        data={toCoursePlayerData(view)}
        completeSection={portalCompleteSection.bind(null, token, assignmentId)}
        startQuiz={portalStartQuiz.bind(null, token, assignmentId)}
        submitQuiz={portalSubmitQuiz.bind(null, token, assignmentId)}
        completeCourse={portalCompleteCourse.bind(null, token, assignmentId)}
        openMaterial={portalOpenMaterial.bind(null, token, assignmentId)}
        certificateBase={`/training-portal/${token}/certificate/`}
      />
    </main>
  )
}

export default PortalCoursePage

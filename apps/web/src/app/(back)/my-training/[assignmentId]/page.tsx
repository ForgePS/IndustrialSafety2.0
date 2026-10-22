import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'

import { myCompleteSection, myOpenMaterial, myStartQuiz, mySubmitQuiz } from '../actions'
import CoursePlayer from '@/components/training/CoursePlayer'
import { getLearnerView } from '@/lib/forgeTrainingLms'
import { toCoursePlayerData } from '@/lib/forgeTrainingPlayer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Course' }

const MyCoursePage = async ({ params }: { params: Promise<{ assignmentId: string }> }) => {
  const context = await requireTenantPermission('my_training.view')
  const { assignmentId } = await params
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', context.user.id)
    .is('archived_at', null)
    .maybeSingle()

  const view = person ? await getLearnerView(organizationId, assignmentId) : null

  if (!view || view.assignment.personnel_id !== person.id) notFound()

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div><Button variant='tonalDefault' asChild><Link href='/my-training'>Back to My Training</Link></Button></div>
      <CoursePlayer
        data={toCoursePlayerData(view)}
        completeSection={myCompleteSection.bind(null, assignmentId)}
        startQuiz={myStartQuiz.bind(null, assignmentId)}
        submitQuiz={mySubmitQuiz.bind(null, assignmentId)}
        openMaterial={myOpenMaterial.bind(null, assignmentId)}
        certificateBase='/training/certificates/'
      />
    </div>
  )
}

export default MyCoursePage

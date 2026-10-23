import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import PaperResultsForm from './PaperResultsForm'
import { trainingTodayIso } from '@/lib/forgeTrainingLms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Paper Quiz Results' }

const PaperResultsPage = async () => {
  const context = await requireTenantPermission('training.record_completion')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  // Paper quizzes need a published version (its pass mark and printed questions).
  const { data: versions } = await supabase
    .from('forge_training_course_versions')
    .select('course_id, forge_training_courses!inner(id, title, is_active)')
    .eq('organization_id', organizationId)
    .eq('status', 'published')

  const courses = (versions || [])
    .map((row: any) => row.forge_training_courses)
    .filter((course: any) => course?.is_active)
    .sort((a: any, b: any) => a.title.localeCompare(b.title))

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Paper Quizzes</h1>
        </div>
        <Button variant='tonalDefault' asChild><Link href='/training'>Back to Training</Link></Button>
      </div>

      {courses.length ? (
        <PaperResultsForm courses={courses.map((course: any) => ({ id: course.id, title: course.title }))} today={trainingTodayIso()} />
      ) : (
        <Card><CardContent className='p-6'>No course has published quiz content yet. Publish a course version to print and record paper quizzes.</CardContent></Card>
      )}
    </div>
  )
}

export default PaperResultsPage

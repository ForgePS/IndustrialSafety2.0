import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'

import ContentManager from './ContentManager'
import { getCourseContent } from '@/lib/forgeTrainingLms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Course Content' }

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))

const CourseContentPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('training.manage_content')
  const { id } = await params
  const content = await getCourseContent(context.activeOrganization.id, id)

  if (!content) notFound()

  const { course, versions, editing, published, sections, questions, materials } = content

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Training</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{course.title}: Content &amp; Quiz</h1>
        </div>
        <div className='flex flex-wrap gap-3'>
          {published ? (
            <>
              <Button variant='outline' asChild><Link href={`/training/courses/${id}/paper`}>Paper Quiz</Link></Button>
              <Button variant='outline' asChild><Link href={`/training/courses/${id}/paper?variant=key`}>Answer Key</Link></Button>
            </>
          ) : null}
          <Button variant='tonalDefault' asChild><Link href={`/training/courses/${id}`}>Back to Course</Link></Button>
        </div>
      </div>

      {/* Remount only when a different version (or its status) is shown, so in-progress form input survives saves. */}
      <ContentManager
        key={`${editing?.id || 'none'}-${editing?.status || ''}`}
        courseId={id}
        versions={versions.map((item: any) => ({ id: item.id, version_number: item.version_number, status: item.status, label: item.label }))}
        editing={editing ? { id: editing.id, version_number: editing.version_number, status: editing.status, label: editing.label } : null}
        settings={editing ? {
          label: text(editing.label),
          passing_percent: String(editing.passing_percent),
          quiz_question_count: text(editing.quiz_question_count),
          max_attempts: text(editing.max_attempts),
          requires_acknowledgement: editing.requires_acknowledgement,
          acknowledgement_text: text(editing.acknowledgement_text),
          effective_date: text(editing.effective_date)
        } : null}
        sections={sections}
        questions={questions}
        materials={materials.map((item: any) => ({ id: item.id, title: item.title, file_name: item.file_name, content_type: item.content_type, size_bytes: item.size_bytes }))}
      />
    </div>
  )
}

export default CourseContentPage

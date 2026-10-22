import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'

import PrintButton from '@/components/common/PrintButton'
import { writeForgeAudit } from '@/lib/forgeAudit'
import { ANSWER_LETTERS } from '@/lib/forgeTrainingRules'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'

export const metadata: Metadata = { title: 'Paper Quiz' }

/**
 * Printable paper quiz from the published version (1.0 training-paper-quiz.ts). The trainee sheet has
 * blanks for name, employee number and date; the answer key marks the correct answers.
 */
const PaperQuizPage = async ({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) => {
  const { id } = await params
  const variant = (await searchParams).variant === 'key' ? 'key' : 'trainee'
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) redirect('/auth/login')

  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })
  const allowed = access.effective.some(item => (item.permissionKey === 'training.manage_content' || item.permissionKey === 'training.record_completion') && item.allowed)

  if (!allowed) redirect('/dashboard')

  const supabase = createServiceRoleClient() as any

  const [{ data: course }, { data: version }] = await Promise.all([
    supabase.from('forge_training_courses').select('id, title, course_code').eq('organization_id', organizationId).eq('id', id).maybeSingle(),
    supabase.from('forge_training_course_versions').select('id, version_number, passing_percent').eq('organization_id', organizationId).eq('course_id', id).eq('status', 'published').maybeSingle()
  ])

  if (!course || !version) notFound()

  const { data: questions } = await supabase
    .from('forge_training_questions')
    .select('id, stem, choices, correct_index')
    .eq('version_id', version.id)
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at')

  if (variant === 'key') {
    await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'training.answer_key_viewed', entityType: 'training_course', entityId: id, afterValue: { version_number: version.version_number } })
  }

  return (
    <div className='flex min-w-0 flex-col gap-4' data-testid={`paper-quiz-${variant}`}>
      <div className='flex flex-wrap justify-between gap-3 print:hidden'>
        <div className='flex flex-wrap gap-3'>
          <Button variant='tonalDefault' asChild><Link href='/training/paper'>Enter Results</Link></Button>
          <Button variant='outline' asChild>
            <Link href={`/training/courses/${id}/paper${variant === 'key' ? '' : '?variant=key'}`}>{variant === 'key' ? 'Trainee Sheet' : 'Answer Key'}</Link>
          </Button>
        </div>
        <PrintButton />
      </div>

      <div className='bg-white p-6 text-neutral-900 print:p-0'>
        <div className='text-sm text-neutral-500'>{context.activeOrganization.name}</div>
        <h1 className='text-2xl font-bold'>{course.title}{variant === 'key' ? ': Answer Key' : ''}</h1>
        <p className='text-sm text-neutral-600'>Version {version.version_number} · {(questions || []).length} questions · {version.passing_percent}% to pass</p>

        {variant === 'trainee' ? (
          <div className='mt-6 grid gap-6 text-sm sm:grid-cols-3'>
            <div>Name: ______________________</div>
            <div>Employee #: ______________</div>
            <div>Date: ______________</div>
          </div>
        ) : (
          <p className='mt-4 text-sm font-semibold text-red-700'>Confidential answer key. Do not hand out.</p>
        )}

        <ol className='mt-8 flex flex-col gap-6'>
          {(questions || []).map((question: any, index: number) => (
            <li key={question.id} className='break-inside-avoid'>
              <div className='font-semibold'>{index + 1}. {question.stem}</div>
              <ul className='mt-2 flex flex-col gap-1 pl-4'>
                {question.choices.map((choice: string, choiceIndex: number) => (
                  <li key={choiceIndex} className={variant === 'key' && choiceIndex === question.correct_index ? 'font-bold' : undefined}>
                    {variant === 'key' ? (choiceIndex === question.correct_index ? '✔ ' : '   ') : '○ '}
                    {ANSWER_LETTERS[choiceIndex]}. {choice}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

export default PaperQuizPage

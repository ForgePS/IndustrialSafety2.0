'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

type Result = { error?: string; message?: string; url?: string; passed?: boolean; completionId?: string | null }

export type CoursePlayerData = {
  courseTitle: string
  courseDescription: string | null
  status: string
  dueDate: string | null
  published: boolean
  passingPercent: number | null
  requiresAcknowledgement: boolean
  acknowledgementText: string | null
  sections: Array<{ id: string; title: string; body: string | null; materialId: string | null; isRequired: boolean; estimatedMinutes: number | null }>
  materials: Record<string, { title: string; contentType: string }>
  completedSections: string[]
  contentDone: boolean
  hasQuiz: boolean
  attemptsRemaining: number | null
  quiz: { attemptId: string; attemptNumber: number; questions: Array<{ id: string; stem: string; choices: string[] }> } | null
  review: {
    attemptNumber: number
    scorePercent: number | null
    passed: boolean | null
    completionId: string | null
    items: Array<{ stem: string; chosen: string | null; correct: boolean; explanation: string | null }>
  } | null
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/**
 * The learner's course: sections, materials, quiz and result. Used by My Training (logged in) and the
 * kiosk portal (employee number); each page passes server actions already bound to its own credentials.
 */
const CoursePlayer = ({
  data,
  completeSection,
  startQuiz,
  submitQuiz,
  openMaterial,
  certificateBase
}: {
  data: CoursePlayerData
  completeSection: (sectionId: string) => Promise<Result>
  startQuiz: () => Promise<Result>
  submitQuiz: (attemptId: string, answers: number[], acknowledged: boolean) => Promise<Result>
  openMaterial: (materialId: string) => Promise<Result>

  /** URL prefix the completion id is appended to, e.g. "/training/certificates/". */
  certificateBase: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [acknowledged, setAcknowledged] = useState(false)
  const open = ['assigned', 'in_progress', 'overdue'].includes(data.status)

  const run = (action: () => Promise<Result>, after?: (result: Result) => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        setNotice({ kind: 'error', text: result.error })

        return
      }

      setNotice(result.message ? { kind: 'success', text: result.message } : null)
      after?.(result)
      router.refresh()
    })

  const showMaterial = (materialId: string) =>
    run(() => openMaterial(materialId), result => {
      if (result.url) window.open(result.url, '_blank', 'noopener')
    })

  const quiz = data.quiz
  const answeredAll = quiz ? quiz.questions.every(question => answers[question.id] !== undefined) : false

  return (
    <div className='flex flex-col gap-6' data-testid='course-player'>
      <div>
        <div className='flex flex-wrap items-center gap-3'>
          <h1 className='text-textPrimary text-3xl font-bold'>{data.courseTitle}</h1>
          <Badge size='sm' variant={data.status === 'completed' ? 'tonalSuccess' : 'secondary'} className='capitalize'>{data.status.replace('_', ' ')}</Badge>
        </div>
        {data.courseDescription ? <p className='text-textSecondary mt-2'>{data.courseDescription}</p> : null}
        {data.dueDate ? <p className='text-textSecondary mt-1 text-sm'>Due {data.dueDate}</p> : null}
      </div>

      {notice ? (
        <div role='status' className={`rounded-md border p-3 text-sm ${notice.kind === 'error' ? 'border-destructive text-destructive' : 'border-success text-success'}`} data-testid='course-notice'>
          {notice.text}
        </div>
      ) : null}

      {!data.published ? (
        <Card><CardContent className='p-6'>This course has no published content yet. Your supervisor can record this training another way.</CardContent></Card>
      ) : null}

      {data.sections.map((section, index) => {
        const done = data.completedSections.includes(section.id)
        const material = section.materialId ? data.materials[section.materialId] : null

        return (
          <Card key={section.id} data-testid={`course-section-${index + 1}`}>
            <CardHeader>
              <CardTitle className='flex flex-wrap items-center gap-2'>
                {index + 1}. {section.title}
                {done ? <Badge size='sm' variant='tonalSuccess'>Done</Badge> : section.isRequired ? <Badge size='sm' variant='secondary'>Required</Badge> : <Badge size='sm' variant='secondary'>Optional</Badge>}
              </CardTitle>
              {section.estimatedMinutes ? <CardDescription>About {section.estimatedMinutes} minutes</CardDescription> : null}
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              {section.body ? <div className='text-textPrimary whitespace-pre-wrap leading-relaxed'>{section.body}</div> : null}
              <div className='flex flex-wrap gap-3'>
                {material && section.materialId ? (
                  <Button variant='outline' disabled={pending} onClick={() => showMaterial(section.materialId!)}>
                    Open {material.contentType.startsWith('video/') ? 'video' : 'material'}: {material.title}
                  </Button>
                ) : null}
                {!done && open ? (
                  <Button disabled={pending} onClick={() => run(() => completeSection(section.id))}>Mark Section Complete</Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {data.hasQuiz ? (
        <Card data-testid='course-quiz'>
          <CardHeader>
            <CardTitle>Quiz</CardTitle>
            <CardDescription>
              {data.passingPercent ? `${data.passingPercent}% is needed to pass.` : null}
              {data.attemptsRemaining !== null ? ` ${data.attemptsRemaining} attempt${data.attemptsRemaining === 1 ? '' : 's'} left.` : null}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-5'>
            {quiz ? (
              <>
                {quiz.questions.map((question, index) => (
                  <fieldset key={question.id} className='rounded-lg border p-4' data-testid={`quiz-question-${index + 1}`}>
                    <legend className='text-textPrimary px-1 font-semibold'>{index + 1}. {question.stem}</legend>
                    <div className='mt-2 flex flex-col gap-2'>
                      {question.choices.map((choice, choiceIndex) => (
                        <label key={choiceIndex} className='flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-black/5'>
                          <input
                            type='radio'
                            className='mt-1'
                            name={`question-${question.id}`}
                            checked={answers[question.id] === choiceIndex}
                            disabled={pending}
                            onChange={() => setAnswers(current => ({ ...current, [question.id]: choiceIndex }))}
                          />
                          <span><strong>{LETTERS[choiceIndex]}.</strong> {choice}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                {data.requiresAcknowledgement ? (
                  <label className='flex items-start gap-3 rounded-lg border p-4'>
                    <input type='checkbox' className='mt-1' checked={acknowledged} disabled={pending} onChange={event => setAcknowledged(event.target.checked)} />
                    <span>{data.acknowledgementText}</span>
                  </label>
                ) : null}
                <div>
                  <Button
                    disabled={pending || !answeredAll || (data.requiresAcknowledgement && !acknowledged)}
                    onClick={() =>
                      run(
                        () => submitQuiz(quiz.attemptId, quiz.questions.map(question => answers[question.id]), acknowledged),
                        () => {
                          setAnswers({})
                          setAcknowledged(false)
                        }
                      )
                    }
                  >
                    {pending ? 'Submitting...' : 'Submit Quiz'}
                  </Button>
                  {!answeredAll ? <p className='text-textSecondary mt-2 text-sm'>Answer every question to submit.</p> : null}
                </div>
              </>
            ) : open ? (
              data.contentDone ? (
                data.attemptsRemaining === 0 ? (
                  <p className='text-textSecondary'>No quiz attempts remain. Ask your supervisor to reassign this training.</p>
                ) : (
                  <div><Button disabled={pending} onClick={() => run(startQuiz)}>{data.review ? 'Retake Quiz' : 'Start Quiz'}</Button></div>
                )
              ) : (
                <p className='text-textSecondary'>Finish the required sections to unlock the quiz.</p>
              )
            ) : null}

            {data.review ? (
              <div className='flex flex-col gap-3 border-t pt-4' data-testid='quiz-review'>
                <div className='text-textPrimary text-lg font-semibold'>
                  Attempt {data.review.attemptNumber}: {data.review.scorePercent}% — {data.review.passed ? 'Passed' : 'Not passed'}
                </div>
                {data.review.passed && data.review.completionId ? (
                  <div><Button variant='outline' asChild><a href={certificateBase + data.review.completionId}>View Certificate</a></Button></div>
                ) : null}
                <ol className='flex flex-col gap-2'>
                  {data.review.items.map((item, index) => (
                    <li key={index} className='rounded-md border p-3 text-sm'>
                      <div className='font-medium'>{index + 1}. {item.stem}</div>
                      <div className={item.correct ? 'text-success' : 'text-destructive'}>{item.correct ? 'Correct' : 'Incorrect'}{item.chosen ? `: you chose "${item.chosen}"` : ''}</div>
                      {item.explanation ? <div className='text-textSecondary mt-1'>{item.explanation}</div> : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default CoursePlayer

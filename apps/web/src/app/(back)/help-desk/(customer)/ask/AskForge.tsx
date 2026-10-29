'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbCheck, TbMessageQuestion, TbSparkles, TbX } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { askForgeAction, recordAssistOutcomeAction } from '@/app/(back)/help-desk/actions'

type Answer = {
  sessionId: string
  answer: string | null
  steps: string[]
  provider: string
  articles: { id: string; slug: string; title: string; summary: string }[]
}

const providerNote = (provider: string) =>
  provider === 'openai' ? 'AI-generated from Forge help articles. Verify before acting.' : provider === 'knowledge_extractive' ? 'Taken directly from Forge help articles.' : 'Matching help articles.'

const AskForge = ({ initialQuestion, areas, canTicket, aiEnabled }: { initialQuestion: string; areas: { id: string; label: string }[]; canTicket: boolean; aiEnabled: boolean }) => {
  const router = useRouter()
  const [question, setQuestion] = useState(initialQuestion)
  const [moduleId, setModuleId] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [viewed, setViewed] = useState<string[]>([])
  const [outcome, setOutcome] = useState<'resolved' | 'not_resolved' | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const ask = () =>
    start(async () => {
      setError('')
      setOutcome(null)
      const result = await askForgeAction({ question, moduleId: moduleId || null })

      if (!result.ok) setError(result.error || 'Ask Forge is unavailable.')
      else setAnswer(result as unknown as Answer)
    })

  const decide = (value: 'resolved' | 'not_resolved') =>
    start(async () => {
      if (!answer) return
      const result = await recordAssistOutcomeAction({ sessionId: answer.sessionId, outcome: value, viewedArticleIds: viewed })

      if (!result.ok) {
        setError(result.error || 'Unable to save your answer.')

        return
      }

      setOutcome(value)
      if (value === 'not_resolved' && canTicket) router.push(`/help-desk/tickets/new?assist=${answer.sessionId}`)
    })

  return (
    <div className='mx-auto flex w-full max-w-3xl flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbMessageQuestion />
          Ask Forge
        </h1>
        <p className='text-textSecondary mt-2'>Describe what you are trying to do. Forge answers from published help articles and can hand your question to support.</p>
      </div>

      <Card>
        <CardContent className='flex flex-col gap-4 p-5'>
          <label htmlFor='ask-question' className='text-sm font-medium'>
            Your question
          </label>
          <Textarea id='ask-question' rows={4} maxLength={4000} value={question} onChange={e => setQuestion(e.target.value)} placeholder='e.g. How do I assign annual safety training to a crew?' />
          <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
            <label className='flex flex-1 flex-col gap-1 text-sm'>
              Product area (optional)
              <select value={moduleId} onChange={e => setModuleId(e.target.value)} className='border-input bg-card h-[38px] rounded-md border px-3'>
                <option value=''>Not sure</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type='button' disabled={pending || question.trim().length < 3} onClick={ask}>
              <TbSparkles />
              {pending && !answer ? 'Searching…' : 'Ask'}
            </Button>
          </div>
          {!aiEnabled ? <p className='text-textSecondary text-xs'>AI answers are turned off. You will see matching help articles.</p> : null}
          {error ? (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {answer ? (
        <Card aria-live='polite'>
          <CardHeader>
            <CardTitle>Suggested answer</CardTitle>
            <CardDescription>{providerNote(answer.provider)}</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {answer.answer ? <p className='whitespace-pre-wrap'>{answer.answer}</p> : <p className='text-textSecondary'>Forge could not find a confident answer in the help articles.</p>}
            {answer.steps.length ? (
              <ol className='flex list-decimal flex-col gap-1 pl-6 text-sm'>
                {answer.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            ) : null}
            {answer.articles.length ? (
              <div className='flex flex-col gap-2'>
                <p className='text-sm font-semibold'>Related articles</p>
                {answer.articles.map(article => (
                  <Link
                    key={article.id}
                    href={`/help-desk/articles/${article.slug}`}
                    target='_blank'
                    onClick={() => setViewed(v => (v.includes(article.id) ? v : [...v, article.id]))}
                    className='hover:border-primary rounded-lg border p-3 text-sm transition-colors'
                  >
                    <span className='text-primary font-medium'>{article.title}</span>
                    <span className='text-textSecondary block line-clamp-2'>{article.summary}</span>
                  </Link>
                ))}
              </div>
            ) : null}

            <div className='border-t pt-4'>
              {outcome === 'resolved' ? (
                <p role='status' className='flex items-center gap-2 text-sm font-medium'>
                  <TbCheck />
                  Great — glad that helped.
                </p>
              ) : outcome === 'not_resolved' && !canTicket ? (
                <p role='status' className='text-sm'>
                  Thanks. Ask your company administrator to contact Forge Support.
                </p>
              ) : (
                <div className='flex flex-col gap-3'>
                  <p className='font-semibold'>Did this solve your problem?</p>
                  <div className='flex flex-wrap gap-2'>
                    <Button type='button' variant='tonal' disabled={pending} onClick={() => decide('resolved')}>
                      <TbCheck />
                      Yes, solved
                    </Button>
                    <Button type='button' variant='outline' disabled={pending} onClick={() => decide('not_resolved')}>
                      <TbX />
                      {canTicket ? 'No, contact support' : 'No'}
                    </Button>
                  </div>
                  {canTicket ? <p className='text-textSecondary text-xs'>Your question and this answer are attached to the ticket so you do not have to repeat yourself.</p> : null}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default AskForge

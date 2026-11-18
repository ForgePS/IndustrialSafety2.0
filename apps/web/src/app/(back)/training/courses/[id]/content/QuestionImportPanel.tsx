'use client'

import { useRef, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { importQuestions, previewQuestionImport, type ImportPreview } from './libraryActions'

const LETTERS = 'ABCDEF'

const SAMPLE = `1. What is lockout/tagout for?
A) Speed up repairs
B) Control hazardous energy
C) Replace PPE
Answer: B
Explanation: LOTO isolates energy before work starts.`

/** Bulk question import into the draft version: paste text, or a .txt, .csv or .pdf file. Preview, then add. */
const QuestionImportPanel = ({ versionId, isDraft }: { versionId: string; isDraft: boolean }) => {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)

  const form = () => {
    const data = new FormData()
    const file = fileRef.current?.files?.[0]

    data.set('versionId', versionId)
    data.set('text', text)
    if (file) data.set('file', file)

    return data
  }

  return (
    <Card data-testid='training-question-import'>
      <CardHeader>
        <CardTitle>Import Questions</CardTitle>
        <CardDescription>
          Paste numbered questions, or choose a .txt, .csv or .pdf. Each question needs choices A-F and an &quot;Answer:&quot; line (a letter, or a number counted from 1).
          CSV needs a header with question, answer and choice columns. Questions go into the draft version.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {!isDraft ? <p className='text-textSecondary text-sm'>Start a new draft version to import questions. Published versions are frozen.</p> : null}
        <Textarea
          aria-label='Questions to import'
          rows={8}
          placeholder={SAMPLE}
          value={text}
          disabled={!isDraft || pending}
          onChange={event => {
            setText(event.target.value)
            setPreview(null)
          }}
        />
        <div className='flex flex-wrap items-center gap-2'>
          <input
            ref={fileRef}
            type='file'
            className='hidden'
            accept='.txt,.csv,.pdf,text/plain,text/csv,application/pdf'
            aria-label='Question file'
            onChange={event => {
              setFileName(event.target.files?.[0]?.name || '')
              setPreview(null)
            }}
          />
          <Button type='button' variant='outline' size='sm' disabled={!isDraft || pending} onClick={() => fileRef.current?.click()}>
            Choose File
          </Button>
          {fileName ? (
            <span className='text-sm'>
              {fileName}{' '}
              <button
                type='button'
                className='text-primary hover:underline'
                onClick={() => {
                  if (fileRef.current) fileRef.current.value = ''
                  setFileName('')
                  setPreview(null)
                }}
              >
                clear
              </button>
            </span>
          ) : null}
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={!isDraft || pending || (!text.trim() && !fileName)}
            onClick={() => startTransition(async () => setPreview(await previewQuestionImport(form())))}
          >
            Preview
          </Button>
          <Button
            type='button'
            size='sm'
            disabled={!isDraft || pending || !preview || preview.errors.length > 0 || !preview.questions.length}
            onClick={() =>
              startTransition(async () => {
                const result = await importQuestions(form())

                if (result.error) toast('error', result.error)
                else {
                  toast('success', result.message || 'Imported.')
                  setText('')
                  setFileName('')
                  setPreview(null)
                  if (fileRef.current) fileRef.current.value = ''
                  router.refresh()
                }
              })
            }
          >
            {pending ? 'Working...' : preview?.questions.length ? `Import ${preview.questions.length} Question${preview.questions.length === 1 ? '' : 's'}` : 'Import Questions'}
          </Button>
        </div>

        {preview ? (
          <div className='flex flex-col gap-2' data-import-preview>
            {preview.errors.length ? (
              <ul className='text-destructive list-disc pl-5 text-sm' data-import-errors>
                {preview.errors.map(error => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
            {preview.questions.length ? (
              <ol className='flex list-decimal flex-col gap-2 pl-5 text-sm'>
                {preview.questions.slice(0, 50).map((question, index) => (
                  <li key={index}>
                    <span className='font-medium'>{question.stem}</span>
                    <ul className='mt-1'>
                      {question.choices.map((choice, choiceIndex) => (
                        <li key={choiceIndex} className={choiceIndex === question.correctIndex ? 'text-success font-semibold' : 'text-textSecondary'}>
                          {LETTERS[choiceIndex]}) {choice}
                          {choiceIndex === question.correctIndex ? ' ✓' : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {preview.questions.length > 50 ? <li className='text-textSecondary list-none'>and {preview.questions.length - 50} more</li> : null}
              </ol>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default QuestionImportPanel

'use client'

import { useRef, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import {
  archiveMaterial,
  createTrainingDraft,
  deleteQuestion,
  deleteSection,
  discardDraft,
  publishVersion,
  saveQuestion,
  saveSection,
  saveVersionSettings
} from './actions'
import type { TrainingQuestionValues, TrainingSectionValues, TrainingVersionSettings } from './actions'

type Result = { error?: string; message?: string }

type Version = { id: string; version_number: number; status: string; label: string | null }
type Section = { id: string; title: string; body: string | null; material_id: string | null; sort_order: number; is_required: boolean; estimated_minutes: number | null }
type Question = { id: string; stem: string; choices: string[]; correct_index: number; explanation: string | null; sort_order: number; is_active: boolean }
type Material = { id: string; title: string; file_name: string; content_type: string; size_bytes: number }

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const selectClass = 'border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const emptySection = (order: number): TrainingSectionValues => ({ title: '', body: '', material_id: '', sort_order: order, is_required: true, estimated_minutes: '' })
const emptyQuestion = (order: number): TrainingQuestionValues => ({ stem: '', choices: ['', '', '', ''], correct_index: 0, explanation: '', sort_order: order, is_active: true })

const sizeLabel = (bytes: number) => (bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`)

const ContentManager = ({
  courseId,
  versions,
  editing,
  settings,
  sections,
  questions,
  materials
}: {
  courseId: string
  versions: Version[]
  editing: Version | null
  settings: TrainingVersionSettings | null
  sections: Section[]
  questions: Question[]
  materials: Material[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isDraft = editing?.status === 'draft'
  const [versionSettings, setVersionSettings] = useState<TrainingVersionSettings | null>(settings)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [section, setSection] = useState<TrainingSectionValues>(emptySection((sections.length + 1) * 10))
  const [questionId, setQuestionId] = useState<string | null>(null)
  const [question, setQuestion] = useState<TrainingQuestionValues>(emptyQuestion((questions.length + 1) * 10))
  const fileRef = useRef<HTMLInputElement>(null)
  const [materialTitle, setMaterialTitle] = useState('')

  const run = (action: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      after?.()
      router.refresh()
    })

  const upload = () =>
    startTransition(async () => {
      const file = fileRef.current?.files?.[0]

      if (!file) {
        toast('error', 'Choose a file to upload.')

        return
      }

      const form = new FormData()

      form.set('file', file)
      form.set('courseId', courseId)
      form.set('title', materialTitle)

      const response = await fetch('/api/training/materials', { method: 'POST', body: form })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast('error', payload.error || 'Upload failed.')

        return
      }

      toast('success', payload.message || 'Uploaded.')
      setMaterialTitle('')
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    })

  const resetSection = () => {
    setSectionId(null)
    setSection(emptySection((sections.length + 1) * 10))
  }

  const resetQuestion = () => {
    setQuestionId(null)
    setQuestion(emptyQuestion((questions.length + 1) * 10))
  }

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
          <CardDescription>
            Learners always get the published version. Published versions are frozen, so every quiz result traces to the exact questions used. Make changes in a draft, then publish it.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='flex flex-wrap gap-2' data-testid='training-versions'>
            {versions.length ? versions.map(version => (
              <Badge key={version.id} size='md' variant={version.status === 'published' ? 'tonalSuccess' : version.status === 'draft' ? 'tonalPrimary' : 'secondary'}>
                Version {version.version_number} · {version.status}
              </Badge>
            )) : <span className='text-textSecondary text-sm'>No content yet.</span>}
          </div>
          <div className='flex flex-wrap gap-3'>
            {!versions.some(version => version.status === 'draft') ? (
              <Button disabled={pending} onClick={() => run(() => createTrainingDraft({ courseId }))}>
                {versions.length ? 'Create Draft from Latest Version' : 'Start Course Content'}
              </Button>
            ) : null}
            {isDraft && editing ? (
              <>
                <Button disabled={pending} onClick={() => window.confirm('Publish this draft? It replaces the current published version for new learners.') && run(() => publishVersion({ versionId: editing.id }))}>
                  Publish Version {editing.version_number}
                </Button>
                <Button variant='outline' disabled={pending} onClick={() => window.confirm('Discard this draft and its changes?') && run(() => discardDraft({ versionId: editing.id }))}>
                  Discard Draft
                </Button>
              </>
            ) : null}
          </div>
          {editing && !isDraft ? <p className='text-textSecondary text-sm'>Showing published version {editing.version_number} (read-only).</p> : null}
        </CardContent>
      </Card>

      {editing && versionSettings ? (
        <Card>
          <CardHeader><CardTitle>Quiz Settings</CardTitle></CardHeader>
          <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
            <div className='md:col-span-3'>
              <Label htmlFor='version-passing'>Passing score (%)</Label>
              <Input id='version-passing' type='number' className='mt-2' value={String(versionSettings.passing_percent)} disabled={!isDraft || pending} onChange={event => setVersionSettings({ ...versionSettings, passing_percent: event.target.value })} />
            </div>
            <div className='md:col-span-3'>
              <Label htmlFor='version-question-count'>Questions per quiz</Label>
              <Input id='version-question-count' type='number' placeholder='All' className='mt-2' value={String(versionSettings.quiz_question_count ?? '')} disabled={!isDraft || pending} onChange={event => setVersionSettings({ ...versionSettings, quiz_question_count: event.target.value })} />
            </div>
            <div className='md:col-span-3'>
              <Label htmlFor='version-max-attempts'>Attempts allowed</Label>
              <Input id='version-max-attempts' type='number' placeholder='Unlimited' className='mt-2' value={String(versionSettings.max_attempts ?? '')} disabled={!isDraft || pending} onChange={event => setVersionSettings({ ...versionSettings, max_attempts: event.target.value })} />
            </div>
            <div className='md:col-span-3'>
              <Label htmlFor='version-effective'>Effective date</Label>
              <Input id='version-effective' type='date' className='mt-2' value={String(versionSettings.effective_date ?? '')} disabled={!isDraft || pending} onChange={event => setVersionSettings({ ...versionSettings, effective_date: event.target.value })} />
            </div>
            <div className='flex items-center gap-3 md:col-span-12'>
              <Switch id='version-ack' checked={Boolean(versionSettings.requires_acknowledgement)} disabled={!isDraft || pending} onCheckedChange={checked => setVersionSettings({ ...versionSettings, requires_acknowledgement: checked })} />
              <Label htmlFor='version-ack'>Learners must accept an acknowledgement before submitting the quiz</Label>
            </div>
            {versionSettings.requires_acknowledgement ? (
              <div className='md:col-span-12'>
                <Label htmlFor='version-ack-text'>Acknowledgement text</Label>
                <Textarea id='version-ack-text' className='mt-2' rows={2} value={String(versionSettings.acknowledgement_text ?? '')} disabled={!isDraft || pending} onChange={event => setVersionSettings({ ...versionSettings, acknowledgement_text: event.target.value })} />
              </div>
            ) : null}
            {isDraft ? (
              <div className='md:col-span-12'>
                <Button disabled={pending} onClick={() => run(() => saveVersionSettings({ versionId: editing.id, values: versionSettings }))}>Save Settings</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid='training-materials'>
        <CardHeader>
          <CardTitle>Materials</CardTitle>
          <CardDescription>PDF, image, MP4 video or text, up to 50 MB. Attach them to sections below.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {materials.length ? (
            <ul className='flex flex-col gap-2'>
              {materials.map(material => (
                <li key={material.id} className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
                  <div>
                    <div className='font-semibold'>{material.title}</div>
                    <div className='text-textSecondary text-sm'>{material.file_name} · {sizeLabel(material.size_bytes)}</div>
                  </div>
                  <Button size='sm' variant='outline' disabled={pending} onClick={() => window.confirm('Archive this material?') && run(() => archiveMaterial({ courseId, materialId: material.id }))}>Archive</Button>
                </li>
              ))}
            </ul>
          ) : <p className='text-textSecondary text-sm'>No materials uploaded.</p>}
          <div className='grid grid-cols-1 gap-3 md:grid-cols-12'>
            <div className='md:col-span-5'>
              <Label htmlFor='material-file'>File</Label>
              <input id='material-file' ref={fileRef} type='file' className='mt-2 block w-full text-sm' accept='.pdf,.png,.jpg,.jpeg,.webp,.mp4,.txt' disabled={pending} />
            </div>
            <div className='md:col-span-5'>
              <Label htmlFor='material-title'>Title</Label>
              <Input id='material-title' className='mt-2' placeholder='Defaults to the file name' value={materialTitle} disabled={pending} onChange={event => setMaterialTitle(event.target.value)} />
            </div>
            <div className='flex items-end md:col-span-2'>
              <Button disabled={pending} onClick={upload}>Upload</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {editing ? (
        <Card data-testid='training-sections'>
          <CardHeader>
            <CardTitle>Sections ({sections.length})</CardTitle>
            <CardDescription>Learners must finish every required section before the quiz unlocks.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {sections.map((item, index) => (
              <div key={item.id} className='flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3'>
                <div className='min-w-0'>
                  <div className='font-semibold'>{index + 1}. {item.title} {item.is_required ? null : <Badge size='sm' variant='secondary'>Optional</Badge>}</div>
                  {item.body ? <div className='text-textSecondary line-clamp-2 text-sm'>{item.body}</div> : null}
                  {item.material_id ? <div className='text-textSecondary text-xs'>Material: {materials.find(material => material.id === item.material_id)?.title || 'archived'}</div> : null}
                </div>
                {isDraft ? (
                  <div className='flex gap-2'>
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => { setSectionId(item.id); setSection({ title: item.title, body: item.body || '', material_id: item.material_id || '', sort_order: item.sort_order, is_required: item.is_required, estimated_minutes: item.estimated_minutes ? String(item.estimated_minutes) : '' }) }}>Edit</Button>
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => window.confirm('Remove this section?') && run(() => deleteSection({ versionId: editing.id, sectionId: item.id }), resetSection)}>Remove</Button>
                  </div>
                ) : null}
              </div>
            ))}
            {isDraft ? (
              <div className='grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-12'>
                <div className='font-semibold md:col-span-12'>{sectionId ? 'Edit section' : 'Add a section'}</div>
                <div className='md:col-span-8'>
                  <Label htmlFor='section-title'>Title</Label>
                  <Input id='section-title' className='mt-2' value={section.title} disabled={pending} onChange={event => setSection({ ...section, title: event.target.value })} />
                </div>
                <div className='md:col-span-2'>
                  <Label htmlFor='section-order'>Order</Label>
                  <Input id='section-order' type='number' className='mt-2' value={String(section.sort_order)} disabled={pending} onChange={event => setSection({ ...section, sort_order: event.target.value })} />
                </div>
                <div className='md:col-span-2'>
                  <Label htmlFor='section-minutes'>Minutes</Label>
                  <Input id='section-minutes' type='number' className='mt-2' value={String(section.estimated_minutes ?? '')} disabled={pending} onChange={event => setSection({ ...section, estimated_minutes: event.target.value })} />
                </div>
                <div className='md:col-span-12'>
                  <Label htmlFor='section-body'>Content</Label>
                  <Textarea id='section-body' className='mt-2' rows={6} value={String(section.body ?? '')} disabled={pending} onChange={event => setSection({ ...section, body: event.target.value })} />
                </div>
                <div className='md:col-span-6'>
                  <Label htmlFor='section-material'>Material</Label>
                  <select id='section-material' className={selectClass} value={String(section.material_id ?? '')} disabled={pending} onChange={event => setSection({ ...section, material_id: event.target.value })}>
                    <option value=''>None</option>
                    {materials.map(material => <option key={material.id} value={material.id}>{material.title}</option>)}
                  </select>
                </div>
                <div className='flex items-end gap-3 pb-2 md:col-span-6'>
                  <Switch id='section-required' checked={Boolean(section.is_required)} disabled={pending} onCheckedChange={checked => setSection({ ...section, is_required: checked })} />
                  <Label htmlFor='section-required'>Required</Label>
                </div>
                <div className='flex gap-3 md:col-span-12'>
                  <Button disabled={pending} onClick={() => run(() => saveSection({ versionId: editing.id, sectionId: sectionId || undefined, values: section }), resetSection)}>{sectionId ? 'Save Section' : 'Add Section'}</Button>
                  {sectionId ? <Button variant='tonalDefault' disabled={pending} onClick={resetSection}>Cancel</Button> : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <Card data-testid='training-questions'>
          <CardHeader>
            <CardTitle>Question Bank ({questions.filter(item => item.is_active).length} active)</CardTitle>
            <CardDescription>Each quiz draws its questions at random from the active questions.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {questions.map((item, index) => (
              <div key={item.id} className='flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3'>
                <div className='min-w-0'>
                  <div className='font-semibold'>{index + 1}. {item.stem} {item.is_active ? null : <Badge size='sm' variant='secondary'>Inactive</Badge>}</div>
                  <ol className='text-textSecondary mt-1 text-sm'>
                    {item.choices.map((choice, choiceIndex) => (
                      <li key={choiceIndex} className={choiceIndex === item.correct_index ? 'text-success font-medium' : undefined}>{LETTERS[choiceIndex]}. {choice}{choiceIndex === item.correct_index ? ' (correct)' : ''}</li>
                    ))}
                  </ol>
                </div>
                {isDraft ? (
                  <div className='flex gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={pending}
                      onClick={() => {
                        setQuestionId(item.id)
                        setQuestion({ stem: item.stem, choices: [...item.choices, ...Array(Math.max(0, 4 - item.choices.length)).fill('')], correct_index: item.correct_index, explanation: item.explanation || '', sort_order: item.sort_order, is_active: item.is_active })
                      }}
                    >
                      Edit
                    </Button>
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => window.confirm('Remove this question?') && run(() => deleteQuestion({ versionId: editing.id, questionId: item.id }), resetQuestion)}>Remove</Button>
                  </div>
                ) : null}
              </div>
            ))}
            {isDraft ? (
              <div className='grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-12'>
                <div className='font-semibold md:col-span-12'>{questionId ? 'Edit question' : 'Add a question'}</div>
                <div className='md:col-span-12'>
                  <Label htmlFor='question-stem'>Question</Label>
                  <Textarea id='question-stem' className='mt-2' rows={2} value={question.stem} disabled={pending} onChange={event => setQuestion({ ...question, stem: event.target.value })} />
                </div>
                {question.choices.map((choice, choiceIndex) => (
                  <div key={choiceIndex} className='flex items-end gap-3 md:col-span-6'>
                    <input
                      type='radio'
                      name='question-correct'
                      aria-label={`Answer ${LETTERS[choiceIndex]} is correct`}
                      className='mb-3'
                      checked={Number(question.correct_index) === choiceIndex}
                      disabled={pending}
                      onChange={() => setQuestion({ ...question, correct_index: choiceIndex })}
                    />
                    <div className='flex-1'>
                      <Label htmlFor={`question-choice-${choiceIndex}`}>Answer {LETTERS[choiceIndex]}</Label>
                      <Input
                        id={`question-choice-${choiceIndex}`}
                        className='mt-2'
                        value={choice}
                        disabled={pending}
                        onChange={event => setQuestion({ ...question, choices: question.choices.map((value, index) => (index === choiceIndex ? event.target.value : value)) })}
                      />
                    </div>
                  </div>
                ))}
                <div className='md:col-span-12'>
                  {question.choices.length < 6 ? (
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => setQuestion({ ...question, choices: [...question.choices, ''] })}>Add Answer</Button>
                  ) : null}
                  <p className='text-textSecondary mt-2 text-xs'>Select the circle next to the correct answer. Blank answers are left out.</p>
                </div>
                <div className='md:col-span-8'>
                  <Label htmlFor='question-explanation'>Explanation (shown after a pass)</Label>
                  <Input id='question-explanation' className='mt-2' value={String(question.explanation ?? '')} disabled={pending} onChange={event => setQuestion({ ...question, explanation: event.target.value })} />
                </div>
                <div className='flex items-end gap-3 pb-2 md:col-span-4'>
                  <Switch id='question-active' checked={Boolean(question.is_active)} disabled={pending} onCheckedChange={checked => setQuestion({ ...question, is_active: checked })} />
                  <Label htmlFor='question-active'>Active</Label>
                </div>
                <div className='flex gap-3 md:col-span-12'>
                  <Button disabled={pending} onClick={() => run(() => saveQuestion({ versionId: editing.id, questionId: questionId || undefined, values: question }), resetQuestion)}>{questionId ? 'Save Question' : 'Add Question'}</Button>
                  {questionId ? <Button variant='tonalDefault' disabled={pending} onClick={resetQuestion}>Cancel</Button> : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default ContentManager

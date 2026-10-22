'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { recordPaperResults } from './actions'
import type { PaperResultOutcome } from './actions'

const PaperResultsForm = ({ courses, today }: { courses: Array<{ id: string; title: string }>; today: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [courseId, setCourseId] = useState(courses[0]?.id || '')
  const [date, setDate] = useState(today)
  const [raw, setRaw] = useState('')
  const [outcomes, setOutcomes] = useState<PaperResultOutcome[]>([])

  const submit = () =>
    startTransition(async () => {
      const result = await recordPaperResults({ courseId, raw, defaultDate: date })

      setOutcomes(result.outcomes || [])

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Recorded.')
      if ((result.outcomes || []).every(item => item.ok)) setRaw('')
      router.refresh()
    })

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>Enter Paper Quiz Results</CardTitle>
          <CardDescription>
            One person per line: employee number and percent, optionally the quiz date (YYYY-MM-DD). Paste straight from a spreadsheet, or type lines like <code>EMP-0042, 85</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          <div className='md:col-span-8'>
            <Label htmlFor='paper-course'>Course</Label>
            <select id='paper-course' className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3' value={courseId} disabled={pending} onChange={event => setCourseId(event.target.value)}>
              {courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </div>
          <div className='md:col-span-4'>
            <Label htmlFor='paper-date'>Quiz date (when not on the line)</Label>
            <Input id='paper-date' type='date' className='mt-2' value={date} max={today} disabled={pending} onChange={event => setDate(event.target.value)} />
          </div>
          <div className='md:col-span-12'>
            <Label htmlFor='paper-results'>Results</Label>
            <Textarea id='paper-results' className='mt-2 font-mono' rows={8} value={raw} disabled={pending} onChange={event => setRaw(event.target.value)} />
          </div>
          <div className='flex flex-wrap gap-3 md:col-span-12'>
            <Button disabled={pending || !courseId || !raw.trim()} onClick={submit}>{pending ? 'Recording...' : 'Record Results'}</Button>
            {courseId ? (
              <>
                <Button variant='outline' asChild><Link href={`/training/courses/${courseId}/paper`}>Print Trainee Sheet</Link></Button>
                <Button variant='outline' asChild><Link href={`/training/courses/${courseId}/paper?variant=key`}>Print Answer Key</Link></Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {outcomes.length ? (
        <Card data-testid='paper-outcomes'>
          <CardHeader><CardTitle>Results</CardTitle></CardHeader>
          <CardContent>
            <ul className='flex flex-col gap-2'>
              {outcomes.map(item => (
                <li key={item.line} className={`rounded-md border p-2 text-sm ${item.ok ? '' : 'border-destructive text-destructive'}`}>
                  Line {item.line}: {item.employeeNumber}{item.name ? ` (${item.name})` : ''} — {item.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default PaperResultsForm

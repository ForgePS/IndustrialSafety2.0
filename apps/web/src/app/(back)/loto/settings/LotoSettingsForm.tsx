'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { saveLotoSettings } from '../content-actions'

const LotoSettingsForm = ({
  courses,
  initialCourseId,
  initialRequired
}: {
  courses: Array<{ id: string; title: string; course_code: string | null }>
  initialCourseId: string | null
  initialRequired: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [courseId, setCourseId] = useState(initialCourseId || '')
  const [required, setRequired] = useState(initialRequired)

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <Label>Authorized-employee course</Label>
        <select
          className='border-input bg-card mt-2 h-[38px] w-full max-w-xl rounded-md border px-3'
          value={courseId}
          disabled={pending}
          onChange={event => setCourseId(event.target.value)}
        >
          <option value=''>None</option>
          {courses.map(course => (
            <option key={course.id} value={course.id}>
              {course.course_code ? course.course_code + ' · ' : ''}{course.title}
            </option>
          ))}
        </select>
      </div>
      <label className='flex items-start gap-3 text-sm'>
        <input type='checkbox' className='mt-1' checked={required} disabled={pending} onChange={event => setRequired(event.target.checked)} />
        <span>
          Only people with a current, approved completion of this course can hold a lock. Lock holders must then be picked from personnel; typed names are refused.
        </span>
      </label>
      <div>
        <Button
          disabled={pending || (required && !courseId)}
          onClick={() =>
            startTransition(async () => {
              const result = await saveLotoSettings({ authorizedCourseId: courseId || null, requireAuthorizedTraining: required })

              if (result.error) toast('error', result.error)
              else {
                toast('success', result.message || 'Saved.')
                router.refresh()
              }
            })
          }
        >
          {pending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}

export default LotoSettingsForm

'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { setTrainingCourseActive } from '@/app/(back)/training/manageActions'

/** Archive or reactivate a course (Create Course permission). */
const CourseLifecycleButton = ({ courseId, active }: { courseId: string; active: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const toggle = () => {
    if (active && !window.confirm('Archive this course? Open assignments stay, but it cannot be assigned again and groups stop requiring it until it is reactivated.')) return

    startTransition(async () => {
      const result = await setTrainingCourseActive({ courseId, active: !active })

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      router.refresh()
    })
  }

  return (
    <Button size='sm' variant={active ? 'outline' : 'default'} onClick={toggle} disabled={pending}>
      {pending ? 'Saving...' : active ? 'Archive Course' : 'Reactivate Course'}
    </Button>
  )
}

export default CourseLifecycleButton

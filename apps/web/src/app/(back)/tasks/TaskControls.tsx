'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TbArchive, TbCheck, TbMessagePlus } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { addTaskComment, archiveTask, completeTask } from './actions'

const TaskControls = ({
  taskId,
  status,
  canComplete,
  canArchive,
  archived
}: {
  taskId: string
  status: string
  canComplete: boolean
  canArchive: boolean
  archived: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [comment, setComment] = useState('')
  const [completionNotes, setCompletionNotes] = useState('')
  const [completeOpen, setCompleteOpen] = useState(false)

  const addComment = () => {
    startTransition(async () => {
      const result = await addTaskComment({ taskId, comment })

      if ('error' in result) {
        toast('error', result.error || 'Unable to add comment.')
        return
      }

      toast('success', result.message)
      setComment('')
      router.refresh()
    })
  }

  const complete = () => {
    startTransition(async () => {
      const result = await completeTask({
        taskId,
        verificationNotes: completionNotes
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to complete Task.')
        return
      }

      toast('success', result.message)
      setCompleteOpen(false)
      router.refresh()
    })
  }

  const archive = () => {
    if (!window.confirm('Archive this Task? The Task and history will be preserved.')) return

    startTransition(async () => {
      const result = await archiveTask(taskId)

      if ('error' in result) {
        toast('error', result.error || 'Unable to archive Task.')
        return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      {!archived ? (
        <Card>
          <CardHeader>
            <CardTitle>Task Actions</CardTitle>
            <CardDescription>Completion and archival are recorded separately from normal editing.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-wrap gap-2'>
              {canComplete && !['completed','canceled'].includes(status) ? (
                <Button onClick={() => setCompleteOpen(value => !value)} disabled={pending}>
                  <TbCheck />Complete Task
                </Button>
              ) : null}
              {canArchive && ['completed','canceled'].includes(status) ? (
                <Button variant='outline' onClick={archive} disabled={pending}>
                  <TbArchive />Archive Task
                </Button>
              ) : null}
            </div>

            {completeOpen ? (
              <div className='rounded-lg border p-4'>
                <Label>Verification / Closure Notes</Label>
                <Textarea
                  className='mt-2'
                  rows={4}
                  value={completionNotes}
                  onChange={event => setCompletionNotes(event.target.value)}
                  placeholder='Describe completion, verification, or closure evidence...'
                />
                <div className='mt-3 flex gap-2'>
                  <Button onClick={complete} disabled={pending}>Confirm Completion</Button>
                  <Button variant='outline' onClick={() => setCompleteOpen(false)} disabled={pending}>Cancel</Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add Comment</CardTitle>
          <CardDescription>Comments become part of the Task history.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={comment}
            onChange={event => setComment(event.target.value)}
            placeholder='Add a Task update or comment...'
            disabled={pending || archived}
          />
          <Button className='mt-3' variant='outline' onClick={addComment} disabled={pending || archived || !comment.trim()}>
            <TbMessagePlus />Add Comment
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default TaskControls

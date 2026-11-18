'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbArchive, TbArrowBackUp, TbBan, TbCalendarCheck, TbPencil } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { confirmDocumentReview, markDocumentObsolete, setDocumentArchived } from '@/app/(back)/documents/actions'

const areaClass = 'border-input bg-card mt-1 min-h-16 w-full rounded-md border p-2 text-sm'

/** Port slice 12: edit, confirm review, make obsolete, archive and restore buttons on the document page. */
const DocumentActionsPanel = ({
  documentId,
  archived,
  canEdit,
  canArchive,
  canObsolete,
  canConfirmReview
}: {
  documentId: string
  archived: boolean
  canEdit: boolean
  canArchive: boolean
  canObsolete: boolean
  canConfirmReview: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState<'review' | 'obsolete' | null>(null)
  const [text, setText] = useState('')

  const run = (action: () => Promise<{ error?: string; errors?: Record<string, string>; message?: string }>) =>
    startTransition(async () => {
      const result = await action()
      const error = result.error || Object.values(result.errors || {})[0]

      if (error) return void toast('error', error)
      toast('success', result.message || 'Saved.')
      setOpen(null)
      setText('')
      router.refresh()
    })

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-wrap gap-2'>
        {canEdit && !archived ? (
          <Button size='sm' variant='outline' asChild>
            <Link href={`/documents/${documentId}/edit`}>
              <TbPencil />
              Edit
            </Link>
          </Button>
        ) : null}
        {canConfirmReview && !archived ? (
          <Button size='sm' variant='outline' disabled={pending} onClick={() => setOpen(open === 'review' ? null : 'review')}>
            <TbCalendarCheck />
            Confirm review
          </Button>
        ) : null}
        {canObsolete && !archived ? (
          <Button size='sm' variant='outline' disabled={pending} onClick={() => setOpen(open === 'obsolete' ? null : 'obsolete')}>
            <TbBan />
            Make obsolete
          </Button>
        ) : null}
        {canArchive ? (
          archived ? (
            <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => setDocumentArchived(documentId, false))}>
              <TbArrowBackUp />
              Restore
            </Button>
          ) : (
            <Button
              size='sm'
              variant='outline'
              disabled={pending}
              onClick={() => {
                if (window.confirm('Archive this document? It is hidden from the library and nobody is asked to read it. You can restore it later.')) {
                  run(() => setDocumentArchived(documentId, true))
                }
              }}
            >
              <TbArchive />
              Archive
            </Button>
          )
        ) : null}
      </div>

      {open ? (
        <form
          className='bg-secondary/50 flex flex-col gap-2 rounded-md p-3'
          onSubmit={event => {
            event.preventDefault()
            run(() => (open === 'review' ? confirmDocumentReview(documentId, text) : markDocumentObsolete(documentId, text)))
          }}
        >
          <Label htmlFor='document-action-text'>{open === 'review' ? 'Review note (optional)' : 'Why is this document obsolete?'}</Label>
          <textarea id='document-action-text' className={areaClass} value={text} maxLength={2000} onChange={event => setText(event.target.value)} />
          <p className='text-textSecondary text-xs'>
            {open === 'review'
              ? 'Confirms the document is still correct with no changes. The next review date moves on by the review interval.'
              : 'Nobody will be asked to read it any more, and a version in review goes back to draft.'}
          </p>
          <div className='flex gap-2'>
            <Button type='submit' size='sm' disabled={pending || (open === 'obsolete' && !text.trim())}>
              {open === 'review' ? 'Confirm review' : 'Make obsolete'}
            </Button>
            <Button type='button' size='sm' variant='ghost' onClick={() => setOpen(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

export default DocumentActionsPanel

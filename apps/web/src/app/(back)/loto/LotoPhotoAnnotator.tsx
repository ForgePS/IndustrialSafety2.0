'use client'

import { useRef, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@repo/ui/components/ui/dialog'
import { toast } from '@repo/ui/utils/toast'

import LotoAnnotatedImage from '@/components/loto/LotoAnnotatedImage'
import { LOTO_MAX_ARROWS, normalizeLotoArrows, type LotoArrow } from '@/lib/forgeLotoRules'
import { updateLotoPhoto } from './content-actions'

/** Drag on the photo to draw an arrow (the tip is where you let go). Tap an arrow to select it. */
const LotoPhotoAnnotator = ({
  open,
  onOpenChange,
  procedureId,
  photo
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  procedureId: string
  photo: { id: string; url: string; file_name: string; annotations: unknown }
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [arrows, setArrows] = useState<LotoArrow[]>(() => normalizeLotoArrows(photo.annotations))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<LotoArrow | null>(null)
  const surface = useRef<HTMLDivElement>(null)

  const point = (event: React.PointerEvent) => {
    const rect = surface.current?.getBoundingClientRect()

    if (!rect || !rect.width || !rect.height) return null

    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    }
  }

  // Selecting: the nearest arrow within ~4% of the image to the tap.
  const nearest = (x: number, y: number) => {
    let best: { id: string; distance: number } | null = null

    for (const arrow of arrows) {
      const dx = arrow.x2 - arrow.x1
      const dy = arrow.y2 - arrow.y1
      const lengthSq = dx * dx + dy * dy || 1
      const t = Math.min(1, Math.max(0, ((x - arrow.x1) * dx + (y - arrow.y1) * dy) / lengthSq))
      const distance = Math.hypot(x - (arrow.x1 + t * dx), y - (arrow.y1 + t * dy))

      if (distance < 0.04 && (!best || distance < best.distance)) best = { id: arrow.id, distance }
    }

    return best?.id || null
  }

  const save = () => {
    startTransition(async () => {
      const result = await updateLotoPhoto({ procedureId, photoId: photo.id, annotations: arrows })

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Arrows saved.')
      onOpenChange(false)
      router.refresh()
    })
  }

  const shown = draft ? [...arrows, draft] : arrows

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[95vh] max-w-4xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Mark isolation points</DialogTitle>
        </DialogHeader>
        <p className='text-textSecondary text-sm'>
          Drag from where the arrow starts to the isolation point. Tap an arrow to select it, then remove it.
        </p>
        <div
          ref={surface}
          className='relative mx-auto w-fit touch-none select-none'
          onPointerDown={event => {
            const p = point(event)

            if (!p) return

            const hit = nearest(p.x, p.y)

            if (hit) {
              setSelectedId(hit)

              return
            }

            setSelectedId(null)

            if (arrows.length >= LOTO_MAX_ARROWS) {
              toast('error', `A photo can hold ${LOTO_MAX_ARROWS} arrows.`)

              return
            }

            ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
            setDraft({ id: 'n' + Date.now(), x1: p.x, y1: p.y, x2: p.x, y2: p.y })
          }}
          onPointerMove={event => {
            if (!draft) return

            const p = point(event)

            if (p) setDraft({ ...draft, x2: p.x, y2: p.y })
          }}
          onPointerUp={() => {
            if (!draft) return

            const kept = normalizeLotoArrows([draft])

            if (kept.length) setArrows(current => [...current, kept[0]])
            setDraft(null)
          }}
        >
          <LotoAnnotatedImage src={photo.url} alt={photo.file_name} annotations={shown} selectedId={selectedId} imgClassName='max-h-[65vh]' />
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button onClick={save} disabled={pending}>{pending ? 'Saving...' : 'Save arrows'}</Button>
          <Button
            variant='outline'
            disabled={pending || !selectedId}
            onClick={() => {
              setArrows(current => current.filter(arrow => arrow.id !== selectedId))
              setSelectedId(null)
            }}
          >
            Remove selected
          </Button>
          <Button variant='outline' disabled={pending || !arrows.length} onClick={() => setArrows([])}>Clear all</Button>
          <Button variant='outline' disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <span className='text-textSecondary self-center text-sm'>{arrows.length} arrow{arrows.length === 1 ? '' : 's'}</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default LotoPhotoAnnotator

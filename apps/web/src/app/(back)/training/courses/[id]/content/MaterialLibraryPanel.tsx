'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { toast } from '@repo/ui/utils/toast'

import { MATERIAL_TOPIC_LABELS, MATERIAL_TOPICS } from '@/lib/forgeTrainingReportRules'
import { deleteMaterialFolder, saveMaterialFolder, setMaterialPlacement } from './libraryActions'

type Folder = { id: string; name: string }
type Material = { id: string; title: string; file_name: string; folder_id: string | null; topic: string }

const selectClass = 'border-input bg-card h-[34px] rounded-md border px-2 text-sm'

/** Folders and topics for a course's materials (the 1.0 source library). */
const MaterialLibraryPanel = ({ courseId, folders, materials }: { courseId: string; folders: Folder[]; materials: Material[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')

  const run = (action: () => Promise<{ error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) toast('error', result.error)
      else {
        toast('success', result.message || 'Saved.')
        after?.()
        router.refresh()
      }
    })

  return (
    <Card data-testid='training-library'>
      <CardHeader>
        <CardTitle>Library: Folders &amp; Topics</CardTitle>
        <CardDescription>Group this course&apos;s materials into folders and tag each with a topic. The Training Library filters by topic across courses.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap items-center gap-2'>
          {folders.map(folder => (
            <span key={folder.id} className='bg-secondary inline-flex items-center gap-2 rounded px-2 py-1 text-sm' data-folder={folder.name}>
              {folder.name}
              <button
                type='button'
                className='text-textSecondary hover:text-primary text-xs'
                disabled={pending}
                onClick={() => {
                  const next = window.prompt('Rename folder', folder.name)

                  if (next && next.trim() !== folder.name) run(() => saveMaterialFolder({ courseId, folderId: folder.id, name: next }))
                }}
              >
                rename
              </button>
              <button
                type='button'
                className='text-textSecondary hover:text-destructive text-xs'
                disabled={pending}
                onClick={() => {
                  if (window.confirm(`Remove the folder "${folder.name}"? Its materials move to No folder.`)) run(() => deleteMaterialFolder({ courseId, folderId: folder.id }))
                }}
              >
                remove
              </button>
            </span>
          ))}
          <Input className='h-[34px] w-48' placeholder='New folder' aria-label='New folder name' value={name} onChange={event => setName(event.target.value)} />
          <Button size='sm' variant='outline' disabled={pending || !name.trim()} onClick={() => run(() => saveMaterialFolder({ courseId, name }), () => setName(''))}>
            Add Folder
          </Button>
        </div>

        {materials.length ? (
          <div className='flex flex-col divide-y'>
            {materials.map(material => (
              <div key={material.id} className='flex flex-wrap items-center justify-between gap-2 py-2' data-library-material={material.title}>
                <span className='text-sm'>
                  <span className='font-medium'>{material.title}</span> <span className='text-textSecondary'>· {material.file_name}</span>
                </span>
                <span className='flex gap-2'>
                  <select
                    aria-label={`Folder for ${material.title}`}
                    className={selectClass}
                    disabled={pending}
                    value={material.folder_id || ''}
                    onChange={event => run(() => setMaterialPlacement({ courseId, materialId: material.id, folderId: event.target.value || null, topic: material.topic }))}
                  >
                    <option value=''>No folder</option>
                    {folders.map(folder => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Topic for ${material.title}`}
                    className={selectClass}
                    disabled={pending}
                    value={material.topic}
                    onChange={event => run(() => setMaterialPlacement({ courseId, materialId: material.id, folderId: material.folder_id, topic: event.target.value }))}
                  >
                    {MATERIAL_TOPICS.map(topic => (
                      <option key={topic} value={topic}>
                        {MATERIAL_TOPIC_LABELS[topic]}
                      </option>
                    ))}
                  </select>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className='text-textSecondary text-sm'>Upload materials above, then file them here.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default MaterialLibraryPanel

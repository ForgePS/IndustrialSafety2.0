'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbFolder, TbFolderPlus, TbPencil, TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { toast } from '@repo/ui/utils/toast'

import { createFolder, deleteFolder, renameFolder } from '@/app/(back)/documents/actions'

export type FolderItem = { name: string; documentCount: number; builtIn: boolean; canRename: boolean; canDelete: boolean }

const inputClass = 'border-input bg-card h-[34px] w-full rounded-md border px-2 text-sm'

/** Port slice 12: the library's folder list with counts, and (for managers) create, rename and delete. */
const FolderPanel = ({
  folders,
  active,
  total,
  unfiled,
  canCreate,
  canEdit,
  baseQuery
}: {
  folders: FolderItem[]
  active: string
  total: number
  unfiled: number
  canCreate: boolean
  canEdit: boolean

  /** The other filters, kept when switching folders. */
  baseQuery: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')

  const href = (folder: string) => {
    const params = new URLSearchParams(baseQuery)

    if (folder) params.set('folder', folder)
    else params.delete('folder')

    const query = params.toString()

    return '/documents' + (query ? '?' + query : '')
  }

  const run = (action: () => Promise<{ error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Saved.')
      after?.()
      router.refresh()
    })

  const linkClass = (selected: boolean) =>
    'flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-sm ' + (selected ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-secondary')

  return (
    <Card data-testid='document-folders'>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>Folders</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-1'>
        <Link href={href('')} className={linkClass(!active)}>
          <span className='flex-1'>All documents</span>
          <span className='text-textSecondary text-xs'>{total}</span>
        </Link>
        {folders.map(folder => (
          <div key={folder.name} className='group flex items-center gap-1' data-folder={folder.name}>
            {editing === folder.name ? (
              <form
                className='flex flex-1 items-center gap-1'
                onSubmit={event => {
                  event.preventDefault()
                  run(
                    () => renameFolder(folder.name, renameTo),
                    () => setEditing(null)
                  )
                }}
              >
                <input aria-label='New folder name' className={inputClass} value={renameTo} maxLength={120} autoFocus onChange={event => setRenameTo(event.target.value)} />
                <Button type='submit' size='sm' disabled={pending}>
                  Save
                </Button>
                <Button type='button' size='sm' variant='ghost' onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <Link href={href(folder.name)} className={linkClass(active.toLowerCase() === folder.name.toLowerCase())}>
                  <TbFolder className='shrink-0' />
                  <span className='flex-1 truncate'>{folder.name}</span>
                  <span className='text-textSecondary text-xs'>{folder.documentCount}</span>
                </Link>
                {canEdit && folder.canRename ? (
                  <button
                    type='button'
                    className='text-textSecondary hover:text-textPrimary p-1'
                    aria-label={`Rename ${folder.name}`}
                    onClick={() => {
                      setEditing(folder.name)
                      setRenameTo(folder.name)
                    }}
                  >
                    <TbPencil />
                  </button>
                ) : null}
                {canEdit && folder.canDelete ? (
                  <button
                    type='button'
                    className='text-textSecondary hover:text-destructive p-1'
                    aria-label={`Delete ${folder.name}`}
                    disabled={pending}
                    onClick={() => {
                      const message = folder.documentCount
                        ? `Delete the folder "${folder.name}"? Its ${folder.documentCount} document${folder.documentCount === 1 ? '' : 's'} will be kept and moved to "Not in a folder".`
                        : `Delete the folder "${folder.name}"?`

                      if (window.confirm(message)) run(() => deleteFolder(folder.name))
                    }}
                  >
                    <TbTrash />
                  </button>
                ) : null}
              </>
            )}
          </div>
        ))}
        <Link href={href('none')} className={linkClass(active === 'none')}>
          <span className='flex-1'>Not in a folder</span>
          <span className='text-textSecondary text-xs'>{unfiled}</span>
        </Link>
        {canCreate ? (
          <form
            className='mt-3 flex items-center gap-1 border-t pt-3'
            onSubmit={event => {
              event.preventDefault()
              run(
                () => createFolder(newName),
                () => setNewName('')
              )
            }}
          >
            <input aria-label='Folder name' placeholder='New folder' className={inputClass} value={newName} maxLength={120} onChange={event => setNewName(event.target.value)} />
            <Button type='submit' size='sm' variant='outline' disabled={pending || !newName.trim()}>
              <TbFolderPlus />
              Add
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default FolderPanel

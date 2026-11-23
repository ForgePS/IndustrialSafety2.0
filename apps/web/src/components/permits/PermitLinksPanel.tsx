'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { addPermitLink, removePermitLink } from '@/app/(back)/permits/actions'

type Option = { id: string; name: string }

export type PermitLinkRow = { id: string; kind: 'loto' | 'document'; targetId: string; label: string }

/** Port slice 18: lockout procedures and controlled documents linked to a permit. */
const PermitLinksPanel = ({
  permitId,
  links,
  procedures,
  documents,
  canEdit
}: {
  permitId: string
  links: PermitLinkRow[]
  procedures: Option[]
  documents: Option[]
  canEdit: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState('')

  const run = (work: () => Promise<{ error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await work()

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Done.')
      after?.()
      router.refresh()
    })

  const linked = new Set(links.map(link => `${link.kind}:${link.targetId}`))
  const procedureOptions = procedures.filter(item => !linked.has('loto:' + item.id))
  const documentOptions = documents.filter(item => !linked.has('document:' + item.id))

  return (
    <div className='flex flex-col gap-3' data-permit-links>
      {links.length ? (
        <ul className='flex flex-col gap-2 text-sm'>
          {links.map(link => (
            <li key={link.id} className='flex items-center justify-between gap-2' data-permit-link={link.label}>
              <Link href={link.kind === 'loto' ? `/loto/${link.targetId}` : `/documents/${link.targetId}`} className='text-primary hover:underline'>
                {link.kind === 'loto' ? 'Lockout procedure' : 'Document'}: {link.label}
              </Link>
              {canEdit ? (
                <Button type='button' size='sm' variant='outline' disabled={pending} onClick={() => run(() => removePermitLink(permitId, link.id))}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-textSecondary text-sm'>Nothing linked.</p>
      )}
      {canEdit ? (
        <form
          className='flex flex-wrap items-center gap-2'
          data-permit-link-form
          onSubmit={event => {
            event.preventDefault()
            const [kind, id] = choice.split(':')

            if (!id) return
            run(() => addPermitLink(permitId, kind, id), () => setChoice(''))
          }}
        >
          <select aria-label='Procedure or document' required value={choice} onChange={event => setChoice(event.target.value)} className='bg-background max-w-md rounded-md border px-3 py-2 text-sm'>
            <option value=''>Pick a lockout procedure or document</option>
            {procedureOptions.length ? (
              <optgroup label='Lockout procedures'>
                {procedureOptions.map(item => (
                  <option key={item.id} value={'loto:' + item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {documentOptions.length ? (
              <optgroup label='Documents'>
                {documentOptions.map(item => (
                  <option key={item.id} value={'document:' + item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <Button type='submit' size='sm' disabled={pending || !choice}>
            {pending ? 'Linking...' : 'Link'}
          </Button>
        </form>
      ) : null}
    </div>
  )
}

export default PermitLinksPanel

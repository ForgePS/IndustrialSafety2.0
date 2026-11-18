'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbPlus, TbX } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { saveDistribution } from '@/app/(back)/documents/actions'

type Option = { id: string; name: string }
type Row = { scope_type: string; scope_id: string | null }
type Scope = 'location' | 'department' | 'role'

const SCOPE_LABELS: Record<Scope, string> = { location: 'Location', department: 'Department', role: 'Role' }
const selectClass = 'border-input bg-card h-[34px] rounded-md border px-2 text-sm'

/**
 * Port slice 12: who a document is for. No rules = everyone in the company. Each rule adds the people at a
 * location, in a department or holding a role.
 */
const DistributionEditor = ({ documentId, initial, options, canEdit }: { documentId: string; initial: Row[]; options: Record<Scope, Option[]>; canEdit: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<Row[]>(initial.filter(row => row.scope_type !== 'organization'))
  const [scope, setScope] = useState<Scope>('location')
  const [scopeId, setScopeId] = useState('')

  const nameOf = (row: Row) => options[row.scope_type as Scope]?.find(option => option.id === row.scope_id)?.name || 'Removed item'
  const taken = new Set(rows.map(row => row.scope_type + ':' + row.scope_id))
  const choices = options[scope].filter(option => !taken.has(scope + ':' + option.id))

  if (!canEdit) {
    return rows.length ? (
      <ul className='flex flex-wrap gap-2 text-sm'>
        {rows.map(row => (
          <li key={row.scope_type + row.scope_id} className='bg-secondary rounded px-2 py-1'>
            {SCOPE_LABELS[row.scope_type as Scope]}: {nameOf(row)}
          </li>
        ))}
      </ul>
    ) : (
      <p className='text-sm'>Everyone in the company.</p>
    )
  }

  return (
    <div className='flex flex-col gap-3' data-testid='distribution-editor'>
      {rows.length ? (
        <ul className='flex flex-wrap gap-2 text-sm'>
          {rows.map(row => (
            <li key={row.scope_type + row.scope_id} className='bg-secondary inline-flex items-center gap-1 rounded px-2 py-1' data-distribution={row.scope_type}>
              {SCOPE_LABELS[row.scope_type as Scope]}: {nameOf(row)}
              <button
                type='button'
                aria-label={`Remove ${nameOf(row)}`}
                className='hover:text-destructive'
                onClick={() => setRows(current => current.filter(item => item !== row))}
              >
                <TbX />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-sm'>Everyone in the company. Add a location, department or role to narrow it.</p>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <select
          aria-label='Distribute by'
          className={selectClass}
          value={scope}
          onChange={event => {
            setScope(event.target.value as Scope)
            setScopeId('')
          }}
        >
          {(Object.keys(SCOPE_LABELS) as Scope[]).map(key => (
            <option key={key} value={key}>
              {SCOPE_LABELS[key]}
            </option>
          ))}
        </select>
        <select aria-label={SCOPE_LABELS[scope]} className={selectClass} value={scopeId} onChange={event => setScopeId(event.target.value)}>
          <option value=''>Choose...</option>
          {choices.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={!scopeId}
          onClick={() => {
            setRows(current => [...current, { scope_type: scope, scope_id: scopeId }])
            setScopeId('')
          }}
        >
          <TbPlus />
          Add
        </Button>
      </div>
      <div>
        <Button
          type='button'
          size='sm'
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveDistribution(documentId, rows)

              if (result.error) return void toast('error', result.error)
              toast('success', result.message || 'Saved.')
              router.refresh()
            })
          }
        >
          {pending ? 'Saving...' : 'Save distribution'}
        </Button>
      </div>
    </div>
  )
}

export default DistributionEditor

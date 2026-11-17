'use client'

import { useMemo, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbArchive, TbCopy, TbEdit, TbFileImport, TbForms, TbPencil, TbPlus, TbPrinter, TbRestore, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { toast } from '@repo/ui/utils/toast'

import { archiveFormTemplate, duplicateFormTemplate, restoreFormTemplate } from '@/app/(back)/forms/templateActions'
import type { LibraryTemplate } from '@/lib/forgeFormBuilderRules'
import { filterLibrary, libraryCategories } from '@/lib/forgeFormBuilderRules'

const STATUS_LABELS: Record<LibraryTemplate['status'], string> = { draft: 'Draft', active: 'Published', archived: 'Archived' }

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—')

/** The tab row shared by the forms pages: Forms, Submissions and (forms.manage) Manage templates. */
export const FormsTabs = ({ active, canManage }: { active: 'forms' | 'submissions' | 'manage'; canManage: boolean }) => {
  const tabs = [
    { key: 'forms', label: 'Forms', href: '/forms' },
    { key: 'submissions', label: 'Submissions', href: '/forms/submissions' },
    ...(canManage ? [{ key: 'manage', label: 'Manage templates', href: '/forms?view=manage' }] : [])
  ]

  return (
    <nav className='flex flex-wrap gap-1 border-b' aria-label='Forms sections'>
      {tabs.map(tab => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? 'page' : undefined}
          className={
            '-mb-px border-b-2 px-4 py-2 text-sm font-medium ' +
            (tab.key === active ? 'border-primary text-primary' : 'text-textSecondary hover:text-textPrimary border-transparent')
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

const FormBuilderLibrary = ({
  templates,
  manage,
  canManage,
  canSubmit
}: {
  templates: LibraryTemplate[]
  manage: boolean
  canManage: boolean
  canSubmit: boolean
}) => {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('all')
  const [pending, startTransition] = useTransition()
  const categories = useMemo(() => libraryCategories(templates), [templates])

  const filtered = useMemo(
    () => filterLibrary(templates, { search, category }).filter(row => !manage || status === 'all' || row.status === status),
    [templates, search, category, status, manage]
  )

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string; id?: string }>, openId?: (id: string) => string) =>
    startTransition(async () => {
      const result = await action()

      if (!result.ok) {
        toast('error', result.error || 'Something went wrong.')

        return
      }

      toast('success', result.message || 'Done.')
      if (openId && result.id) router.push(openId(result.id))
      else router.refresh()
    })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbForms />
            Forms
          </h1>
          <p className='text-textSecondary mt-2'>
            {manage ? 'Build, publish, import and archive the company form templates.' : 'Company forms to fill out, sign and print.'}
          </p>
        </div>
        {canManage ? (
          <div className='flex flex-wrap gap-2'>
            <Button asChild variant='outline'>
              <Link href='/forms/templates/import'>
                <TbFileImport />
                Import checklist
              </Link>
            </Button>
            <Button asChild variant='outline'>
              <Link href='/forms/import'>
                <TbFileImport />
                Import from Forge 1.0
              </Link>
            </Button>
            <Button asChild>
              <Link href='/forms/templates/new'>
                <TbPlus />
                New form
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <FormsTabs active={manage ? 'manage' : 'forms'} canManage={canManage} />

      <Card>
        <CardContent className={'grid gap-4 p-5 ' + (manage ? 'md:grid-cols-[1fr_220px_180px]' : 'md:grid-cols-[1fr_220px]')}>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search forms...' className='pl-10' aria-label='Search forms' />
          </div>
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            aria-label='Category'
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value=''>All categories</option>
            {categories.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            <option value='-'>No category</option>
          </select>
          {manage ? (
            <select
              value={status}
              onChange={event => setStatus(event.target.value)}
              aria-label='Status'
              className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
            >
              <option value='all'>All statuses</option>
              <option value='active'>Published</option>
              <option value='draft'>Draft</option>
              <option value='archived'>Archived</option>
            </select>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Form</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead>Last published</TableHead>
              {manage ? <TableHead>Status</TableHead> : null}
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map(row => (
                <TableRow key={row.id} data-form-template-row={row.id}>
                  <TableCell>
                    <div className='font-semibold'>{row.title}</div>
                    {row.description ? <div className='text-textSecondary line-clamp-2 text-xs'>{row.description}</div> : null}
                  </TableCell>
                  <TableCell>{row.category || '—'}</TableCell>
                  <TableCell>{row.version ? `v${row.version}` : '—'}</TableCell>
                  <TableCell>{row.fieldCount}</TableCell>
                  <TableCell>{formatDate(row.publishedAt)}</TableCell>
                  {manage ? (
                    <TableCell>
                      <Badge size='sm' variant={row.status === 'active' ? 'tonalSuccess' : row.status === 'archived' ? 'secondary' : 'outline'}>
                        {STATUS_LABELS[row.status]}
                      </Badge>
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <div className='flex flex-wrap justify-end gap-2'>
                      {canSubmit && row.status === 'active' ? (
                        <Button size='sm' asChild>
                          <Link href={`/forms/fill/${row.id}`}>
                            <TbPencil />
                            Fill out
                          </Link>
                        </Button>
                      ) : null}
                      {canManage && row.status !== 'archived' ? (
                        <Button size='sm' variant='outline' asChild>
                          <Link href={`/forms/templates/${row.id}`}>
                            <TbEdit />
                            Edit
                          </Link>
                        </Button>
                      ) : null}
                      {canManage && row.version > 0 && row.status !== 'archived' ? (
                        <Button size='sm' variant='outline' asChild>
                          <Link href={`/forms/templates/${row.id}/print`}>
                            <TbPrinter />
                            Print blank
                          </Link>
                        </Button>
                      ) : null}
                      {manage ? (
                        <>
                          <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => duplicateFormTemplate(row.id), id => `/forms/templates/${id}`)}>
                            <TbCopy />
                            Duplicate
                          </Button>
                          {row.status === 'archived' ? (
                            <Button size='sm' variant='outline' disabled={pending} onClick={() => run(() => restoreFormTemplate(row.id))}>
                              <TbRestore />
                              Restore
                            </Button>
                          ) : (
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={pending}
                              onClick={() => {
                                if (window.confirm(`Archive "${row.title}"? It can no longer be filled out. Existing submissions are kept.`)) {
                                  run(() => archiveFormTemplate(row.id))
                                }
                              }}
                            >
                              <TbArchive />
                              Archive
                            </Button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={manage ? 7 : 6} className='py-10 text-center'>
                  {templates.length ? 'No forms match the current filters.' : manage ? 'No form templates yet. Create one or import a checklist.' : 'No forms have been published yet.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default FormBuilderLibrary

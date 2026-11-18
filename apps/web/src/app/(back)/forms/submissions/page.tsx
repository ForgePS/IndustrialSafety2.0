import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'

import type { FormSubmissionStatus } from '@/lib/forgeFormRules'
import { FORM_SUBMISSION_STATUS_LABELS } from '@/lib/forgeFormRules'
import type { FormSubmissionListItem } from '@/lib/forgeFormSubmissions'
import { listFormSubmissions } from '@/lib/forgeFormSubmissions'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Form Submissions' }

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || ''

const statusVariant = (status: string) =>
  status === 'submitted' ? 'tonalSuccess' : status === 'pending_signature' ? 'secondary' : status === 'archived' ? 'outline' : 'tonalPrimary'

const selectClass = 'border-input bg-background h-10 rounded-md border px-3 text-sm'

const SubmissionRows = ({ rows }: { rows: FormSubmissionListItem[] }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Number</TableHead>
        <TableHead>Form</TableHead>
        <TableHead>Title / subject</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Submitted by</TableHead>
        <TableHead>Submitted</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map(row => (
        <TableRow key={row.id} data-submission-row={row.submissionNumber}>
          <TableCell className='font-medium'>
            <Link href={`/forms/submissions/${row.id}`} className='text-primary hover:underline'>
              {row.submissionNumber}
            </Link>
          </TableCell>
          <TableCell>{row.templateTitle}</TableCell>
          <TableCell>
            <div>{row.title}</div>
            {row.subjectName || row.locationName ? (
              <div className='text-textSecondary text-xs'>{[row.subjectName, row.locationName].filter(Boolean).join(' · ')}</div>
            ) : null}
          </TableCell>
          <TableCell>
            <Badge size='sm' variant={statusVariant(row.status)}>
              {FORM_SUBMISSION_STATUS_LABELS[row.status as FormSubmissionStatus] || row.status}
            </Badge>
          </TableCell>
          <TableCell>{row.submittedByName || '—'}</TableCell>
          <TableCell>{row.submittedAt ? new Date(row.submittedAt).toLocaleString() : '—'}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
)

const FormSubmissionsPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('forms.view')
  const organizationId = context.activeOrganization.id
  const params = await searchParams

  const filters = {
    q: one(params.q),
    status: one(params.status),
    templateId: one(params.form),
    locationId: one(params.location),
    from: one(params.from),
    to: one(params.to)
  }

  const group = one(params.group) === 'form'
  const supabase = createServiceRoleClient() as any

  const [rows, { data: templates }, { data: locations }] = await Promise.all([
    listFormSubmissions({ organizationId, userId: context.user.id, scope: context.permission.scope ?? null, filters }),
    supabase.from('forge_form_templates').select('id, title').eq('organization_id', organizationId).order('title'),
    supabase.from('locations').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name')
  ])

  const groups = group
    ? Object.values(
        rows.reduce<Record<string, { title: string; rows: FormSubmissionListItem[] }>>((acc, row) => {
          acc[row.templateId] = acc[row.templateId] || { title: row.templateTitle, rows: [] }
          acc[row.templateId].rows.push(row)

          return acc
        }, {})
      ).sort((a, b) => a.title.localeCompare(b.title))
    : []

  const groupHref = (() => {
    const next = new URLSearchParams()

    for (const [key, value] of Object.entries(params)) if (key !== 'group' && one(value)) next.set(key, one(value))
    if (!group) next.set('group', 'form')

    const query = next.toString()

    return `/forms/submissions${query ? `?${query}` : ''}`
  })()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forms</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Form Submissions</h1>
          <p className='text-textSecondary mt-2'>Filled-out forms you can see, newest first.</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' asChild>
            <Link href={groupHref}>{group ? 'Show as one list' : 'Group by form'}</Link>
          </Button>
          <Button variant='outline' asChild>
            <Link href='/forms'>Form library</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className='pt-6'>
          <form method='get' className='grid gap-3 md:grid-cols-3 xl:grid-cols-7' data-submission-filters>
            {group ? <input type='hidden' name='group' value='form' /> : null}
            <div className='flex flex-col gap-1 xl:col-span-2'>
              <Label htmlFor='submission-q'>Search</Label>
              <Input id='submission-q' name='q' defaultValue={filters.q} placeholder='Number or title' />
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='submission-status'>Status</Label>
              <select id='submission-status' name='status' defaultValue={filters.status} className={selectClass}>
                <option value=''>All open</option>
                <option value='pending_signature'>Needs signature</option>
                <option value='submitted'>Submitted</option>
                <option value='draft'>Draft</option>
                <option value='archived'>Archived</option>
              </select>
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='submission-form'>Form</Label>
              <select id='submission-form' name='form' defaultValue={filters.templateId} className={selectClass}>
                <option value=''>All forms</option>
                {(templates || []).map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='submission-location'>Location</Label>
              <select id='submission-location' name='location' defaultValue={filters.locationId} className={selectClass}>
                <option value=''>All locations</option>
                {(locations || []).map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='submission-from'>Updated from</Label>
              <Input id='submission-from' name='from' type='date' defaultValue={filters.from} />
            </div>
            <div className='flex flex-col gap-1'>
              <Label htmlFor='submission-to'>Updated to</Label>
              <Input id='submission-to' name='to' type='date' defaultValue={filters.to} />
            </div>
            <div className='flex items-end gap-2 xl:col-span-7'>
              <Button type='submit'>Apply filters</Button>
              <Button variant='ghost' asChild>
                <Link href={group ? '/forms/submissions?group=form' : '/forms/submissions'}>Clear</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!rows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>No submissions</CardTitle>
            <CardDescription>No form submissions match these filters.</CardDescription>
          </CardHeader>
        </Card>
      ) : group ? (
        groups.map(item => (
          <Card key={item.title} data-submission-group={item.title}>
            <CardHeader>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>
                {item.rows.length} submission{item.rows.length === 1 ? '' : 's'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SubmissionRows rows={item.rows} />
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className='pt-6'>
            <SubmissionRows rows={rows} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default FormSubmissionsPage

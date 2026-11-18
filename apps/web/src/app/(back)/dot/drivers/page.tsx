import type { Metadata } from 'next'
import Link from 'next/link'
import { TbPlus } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import DotStatusPill from '@/components/dot/DotStatusPill'
import { getScopedDriverFiles } from '@/lib/forgeDot'
import { DOT_DQF_ATTENTION_KINDS, DOT_ISSUE_LABELS, driverMatchesAttentionFilter, formatUsDate, type DotIssueKind } from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'DOT Driver Files' }

const ARCHIVE_REASONS: Record<string, string> = {
  manual: 'Archived',
  dot_driver_off: 'DOT driver turned off',
  personnel_inactive: 'No longer active'
}

const DriverFilesPage = async ({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; attention?: string }> }) => {
  const context = await requireTenantPermission('dot.view')
  const allowed = allowedFrom(context)
  const { view, q, attention: attentionParam } = await searchParams
  const archived = view === 'archived'

  // Only the DQF kinds apply here; anything else is ignored rather than emptying the list.
  const attention = DOT_DQF_ATTENTION_KINDS.includes(attentionParam as DotIssueKind) ? (attentionParam as DotIssueKind) : null
  const search = String(q || '').trim().toLowerCase()

  const files = (
    await getScopedDriverFiles({ organizationId: context.activeOrganization.id, userId: context.user.id, permission: context.permission, includeArchived: archived })
  )
    .filter(file => (archived ? Boolean(file.archived_at) : !file.archived_at))
    .filter(
      file =>
        !search ||
        file.name.toLowerCase().includes(search) ||
        file.file_number.toLowerCase().includes(search) ||
        String(file.person?.employee_number || '').toLowerCase().includes(search)
    )
    .filter(file => driverMatchesAttentionFilter(file, attention))

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader
        active='drivers'
        allowed={allowed}
        actions={
          allowed('dot.edit') ? (
            <Button asChild>
              <Link href='/dot/drivers/new'>
                <TbPlus />
                New Driver File
              </Link>
            </Button>
          ) : null
        }
      />

      <form className='flex flex-wrap items-center gap-3' action='/dot/drivers'>
        <input
          name='q'
          defaultValue={q || ''}
          placeholder='Search name, employee # or file #'
          className='border-input bg-card h-[38px] w-72 rounded-md border px-3 text-sm'
        />
        {archived ? <input type='hidden' name='view' value='archived' /> : null}
        {attention ? <input type='hidden' name='attention' value={attention} /> : null}
        <Button type='submit' size='sm' variant='outline'>Search</Button>
        <Link className='text-primary text-sm hover:underline' href={archived ? '/dot/drivers' : '/dot/drivers?view=archived'}>
          {archived ? 'Show open files' : 'Show archived files'}
        </Link>
      </form>

      {attention ? (
        <div className='flex flex-wrap items-center gap-2 text-sm' data-attention-filter={attention}>
          <span className='text-textSecondary'>Showing drivers with:</span>
          <DotStatusPill tone={attention === 'expiring' ? 'pending' : 'critical'}>{DOT_ISSUE_LABELS[attention]}</DotStatusPill>
          <Link
            className='text-primary hover:underline'
            href={'/dot/drivers' + (q || archived ? '?' + new URLSearchParams({ ...(q ? { q } : {}), ...(archived ? { view: 'archived' } : {}) }).toString() : '')}
          >
            Clear filter
          </Link>
        </div>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>License</TableHead>
              <TableHead>Next due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.length ? (
              files.map(file => {
                const expired = file.issues.filter(issue => issue.kind === 'expired').length
                const missing = file.issues.filter(issue => issue.kind === 'missingDocuments').length
                const expiring = file.issues.filter(issue => issue.kind === 'expiring').length

                return (
                  <TableRow key={file.id} data-driver-file={file.file_number}>
                    <TableCell>
                      <div className='font-semibold'>{file.name}</div>
                      <div className='text-textSecondary text-xs'>
                        {file.file_number}
                        {file.person?.employee_number ? ' · #' + file.person.employee_number : ''}
                      </div>
                    </TableCell>
                    <TableCell>{file.person?.locations?.name || '—'}</TableCell>
                    <TableCell>{file.raw.license_class === 'non_cdl' ? 'Non-CDL' : 'CDL'}</TableCell>
                    <TableCell>{formatUsDate(file.nextDue) || '—'}</TableCell>
                    <TableCell>
                      <div className='flex flex-wrap gap-1'>
                        {file.archived_at ? (
                          <DotStatusPill tone='muted'>{ARCHIVE_REASONS[file.archived_reason || 'manual']}</DotStatusPill>
                        ) : expired || missing || expiring ? (
                          <>
                            {expired ? <DotStatusPill tone='critical'>{expired} expired</DotStatusPill> : null}
                            {missing ? <DotStatusPill tone='critical'>{missing} missing</DotStatusPill> : null}
                            {expiring ? <DotStatusPill tone='pending'>{expiring} expiring</DotStatusPill> : null}
                          </>
                        ) : (
                          <DotStatusPill tone='ok'>Compliant</DotStatusPill>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button size='sm' variant='outline' asChild>
                        <Link href={'/dot/drivers/' + file.id}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className='py-10 text-center'>
                  {attention || search ? 'No driver files match.' : archived ? 'No archived driver files.' : 'No driver files yet.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default DriverFilesPage

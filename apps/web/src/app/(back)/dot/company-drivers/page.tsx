import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import DotStatusPill, { issueTone } from '@/components/dot/DotStatusPill'
import { getDotSettings, getScopedCompanyDrivers, personName } from '@/lib/forgeDot'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import {
  COMPANY_DRIVER_SORT_KEYS,
  COMPANY_DRIVER_STATUS_LABELS,
  DOT_ISSUE_LABELS,
  DOT_ROSTER_ATTENTION_KINDS,
  LICENSE_FOLLOW_UP_LABELS,
  companyDriverMatchesQuery,
  driverMatchesAttentionFilter,
  formatUsDate,
  licenseFollowUps,
  mvrSampleEligible,
  mvrSampleSize,
  sortCompanyDrivers,
  type CompanyDriverSortKey,
  type CompanyDriverStatus,
  type DotIssueKind
} from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import AddCompanyDriverForm from './AddCompanyDriverForm'
import MvrSampleButton from './MvrSampleButton'

export const metadata: Metadata = { title: 'Company Drivers' }

const CompanyDriversPage = async ({ searchParams }: { searchParams: Promise<{
    status?: string
    consent?: string
    unlinked?: string
    sample?: string
    q?: string
    sort?: string
    dir?: string
    license?: string
    attention?: string
  }> }) => {
  const context = await requireTenantPermission('dot.view')
  const organizationId = context.activeOrganization.id
  const allowed = allowedFrom(context)
  const filters = await searchParams
  const year = new Date().getFullYear()
  const today = new Date().toISOString().slice(0, 10)
  const sortKey: CompanyDriverSortKey = COMPANY_DRIVER_SORT_KEYS.includes(filters.sort as CompanyDriverSortKey) ? (filters.sort as CompanyDriverSortKey) : 'name'
  const sortDir = filters.dir === 'desc' ? 'desc' : 'asc'
  const attention = DOT_ROSTER_ATTENTION_KINDS.includes(filters.attention as DotIssueKind) ? (filters.attention as DotIssueKind) : null

  const [all, settings] = await Promise.all([
    getScopedCompanyDrivers({ organizationId, userId: context.user.id, permission: context.permission }),
    getDotSettings(organizationId)
  ])

  const withFollowUps = all.map(item => ({ ...item, followUps: licenseFollowUps(item.driver, item.licenseUploads, today) }))
  const licenseFollowUpCount = withFollowUps.filter(item => item.followUps.length).length

  const drivers = sortCompanyDrivers(
    withFollowUps.filter(
      item =>
        (!filters.status || filters.status === 'all' ? item.driver.status !== 'removed' || filters.status === 'all' : item.driver.status === filters.status) &&
        (!filters.consent || item.issues.some(issue => issue.kind === 'missingMvrConsent')) &&
        (!filters.unlinked || !item.driver.personnel_id) &&
        (!filters.sample || item.driver.sample_year === year) &&
        (!filters.license || item.followUps.length > 0) &&
        driverMatchesAttentionFilter(item, attention) &&
        companyDriverMatchesQuery(item.driver, filters.q)
    ),
    sortKey,
    sortDir
  )

  const eligible = all.filter(item => mvrSampleEligible(item.driver)).length
  const sampled = all.filter(item => item.driver.sample_year === year)
  const sampledDone = sampled.filter(item => item.driver.sample_completed_at).length
  const canEdit = allowed('dot.edit')
  const canSample = canEdit && context.permission.scope === 'organization'

  let candidates: Array<{ id: string; name: string; employeeNumber: string | null }> = []

  if (canEdit) {
    const editPermission = context.access.effective.find(item => item.permissionKey === 'dot.edit')!
    const linked = new Set(all.map(item => item.driver.personnel_id).filter(Boolean))

    candidates = (await getScopedPersonnel({ organizationId, userId: context.user.id, permission: editPermission }))
      .filter((person: any) => !linked.has(person.id) && person.employment_status !== 'terminated')
      .map((person: any) => ({ id: person.id, name: personName(person), employeeNumber: person.employee_number }))
  }

  const link = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams()

    for (const [key, value] of Object.entries({ ...filters, ...patch })) if (value) next.set(key, value)

    return '/dot/company-drivers' + (next.toString() ? '?' + next.toString() : '')
  }

  /** Column header: click to sort, click again to flip the direction. */
  const sortHeader = (key: CompanyDriverSortKey, label: string) => {
    const active = sortKey === key
    const nextDir = active && sortDir === 'asc' ? 'desc' : 'asc'

    return (
      <Link
        href={link({ sort: key === 'name' ? undefined : key, dir: nextDir === 'asc' ? undefined : 'desc' })}
        className={'inline-flex items-center gap-1 hover:underline ' + (active ? 'text-primary' : '')}
        data-sort={key}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        {label}
        {active ? <span aria-hidden>{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span> : null}
      </Link>
    )
  }

  const hiddenFilters = Object.entries(filters).filter(([key, value]) => key !== 'q' && value) as Array<[string, string]>

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader
        active='company-drivers'
        allowed={allowed}
        subtitle={`Drivers on the company vehicle insurance${settings.insurer_name ? ' (' + settings.insurer_name + ')' : ''}: licenses, MVR consent, MVRs and the annual sample.`}
      />

      <div className='grid gap-6 xl:grid-cols-[1fr_380px]'>
        <Card>
          <CardHeader>
            <CardTitle>{year} MVR sample</CardTitle>
            <CardDescription>
              {settings.mvr_sample_percent}% of drivers on insurance or pending, at least one: {mvrSampleSize(eligible, settings.mvr_sample_percent)} of {eligible}. The same drivers come up for a year unless the sample is redrawn.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-wrap items-center gap-3'>
            {sampled.length ? (
              <Link href={link({ sample: '1' })} className='text-primary text-sm hover:underline'>
                {sampled.length} selected · {sampledDone} done
              </Link>
            ) : (
              <span className='text-textSecondary text-sm'>Not drawn yet.</span>
            )}
            {canSample ? <MvrSampleButton year={year} drawn={sampled.length > 0} anyDone={sampledDone > 0} /> : null}
          </CardContent>
        </Card>
        {canEdit ? (
          <Card>
            <CardHeader>
              <CardTitle>Add a driver</CardTitle>
              <CardDescription>Pick from personnel. Drivers not in personnel can be added by name with organization-wide access.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddCompanyDriverForm candidates={candidates} allowUnlinked={context.permission.scope === 'organization'} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className='flex flex-wrap items-center gap-2 text-sm'>
        {(['', 'on_insurance', 'pending_mvr', 'suspended', 'removed', 'all'] as const).map(status => (
          <Link
            key={status || 'current'}
            href={link({ status: status || undefined })}
            className={'rounded-full border px-3 py-1 ' + ((filters.status || '') === status ? 'border-primary text-primary' : 'text-textSecondary')}
          >
            {status === '' ? 'Current' : status === 'all' ? 'All' : COMPANY_DRIVER_STATUS_LABELS[status as CompanyDriverStatus]}
          </Link>
        ))}
        <Link href={link({ consent: filters.consent ? undefined : '1' })} className={'rounded-full border px-3 py-1 ' + (filters.consent ? 'border-primary text-primary' : 'text-textSecondary')}>
          Missing consent
        </Link>
        <Link href={link({ unlinked: filters.unlinked ? undefined : '1' })} className={'rounded-full border px-3 py-1 ' + (filters.unlinked ? 'border-primary text-primary' : 'text-textSecondary')}>
          Not in personnel
        </Link>
        <Link
          href={link({ license: filters.license ? undefined : '1' })}
          className={'rounded-full border px-3 py-1 ' + (filters.license ? 'border-primary text-primary' : 'text-textSecondary')}
          data-license-follow-ups={licenseFollowUpCount}
        >
          License follow-ups ({licenseFollowUpCount})
        </Link>
        {attention ? (
          <Link href={link({ attention: undefined })} className='border-primary text-primary rounded-full border px-3 py-1' data-attention-filter={attention}>
            {DOT_ISSUE_LABELS[attention]} (clear)
          </Link>
        ) : null}
      </div>

      <form className='flex flex-wrap items-center gap-3' action='/dot/company-drivers'>
        <input
          type='search'
          name='q'
          defaultValue={filters.q || ''}
          placeholder='Search name, employee # or license #'
          aria-label='Search company drivers'
          className='border-input bg-card h-[38px] w-72 rounded-md border px-3 text-sm'
        />
        {hiddenFilters.map(([key, value]) => (
          <input key={key} type='hidden' name={key} value={value} />
        ))}
        <Button type='submit' size='sm' variant='outline'>
          Search
        </Button>
        {filters.q ? (
          <Link className='text-primary text-sm hover:underline' href={link({ q: undefined })}>
            Clear search
          </Link>
        ) : null}
      </form>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{sortHeader('name', 'Driver')}</TableHead>
              <TableHead>{sortHeader('status', 'Status')}</TableHead>
              <TableHead>License expires</TableHead>
              <TableHead>Last MVR</TableHead>
              <TableHead>{sortHeader('next_mvr', 'Next MVR due')}</TableHead>
              <TableHead>{sortHeader('consent', 'Consent')}</TableHead>
              <TableHead>Needs attention</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.length ? (
              drivers.map(item => (
                <TableRow key={item.id} data-company-driver={item.name}>
                  <TableCell>
                    <div className='font-semibold'>{item.name}</div>
                    <div className='text-textSecondary text-xs'>
                      {item.driver.employee_number ? '#' + item.driver.employee_number : ''}
                      {!item.driver.personnel_id ? ' Not in personnel' : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DotStatusPill tone={item.driver.status === 'on_insurance' ? 'ok' : item.driver.status === 'pending_mvr' ? 'pending' : 'muted'}>
                      {COMPANY_DRIVER_STATUS_LABELS[item.driver.status as CompanyDriverStatus] || item.driver.status}
                    </DotStatusPill>
                  </TableCell>
                  <TableCell>{formatUsDate(item.driver.license_expires_on) || '—'}</TableCell>
                  <TableCell>{formatUsDate(item.driver.last_mvr_on) || '—'}</TableCell>
                  <TableCell>{formatUsDate(item.driver.next_mvr_due_on) || '—'}</TableCell>
                  <TableCell>{formatUsDate(item.driver.mvr_consent_on) || (item.consentUploads ? 'On file' : '—')}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-1'>
                      {item.issues.map(issue => (
                        <DotStatusPill key={issue.kind} tone={issueTone(issue.kind)}>
                          {issue.kind === 'expired' || issue.kind === 'expiring' ? issue.detail : DOT_ISSUE_LABELS[issue.kind]}
                        </DotStatusPill>
                      ))}
                      {item.followUps.includes('noCopy') ? (
                        <DotStatusPill tone='critical'>{LICENSE_FOLLOW_UP_LABELS.noCopy}</DotStatusPill>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' asChild>
                      <Link href={'/dot/company-drivers/' + item.id}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className='py-10 text-center'>No company drivers match.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default CompanyDriversPage

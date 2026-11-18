import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import OshaFilters from '../OshaFilters'
import { parseOshaParams } from '../params'
import { getOshaLocations, getOshaYearSummary, getScopedOshaCases, oshaLocationIdsInScope } from '@/lib/forgeOsha'
import { OSHA_CASE_TYPES, form300EmployeeName } from '@/lib/forgeOshaRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'OSHA Form 300 Log' }

const check = (on: boolean) => (on ? 'X' : '')

const OshaLogPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('osha.view')
  const organizationId = context.activeOrganization.id
  const scopeIds = await oshaLocationIdsInScope({ organizationId, userId: context.user.id, permission: context.permission })
  const locations = await getOshaLocations({ organizationId, locationIds: scopeIds })
  const { year, locationId, years } = parseOshaParams(await searchParams, locations.map((item: any) => item.id))
  const selectedIds = locationId ? [locationId] : locations.map((item: any) => item.id)

  const [cases, summary] = await Promise.all([
    getScopedOshaCases({ organizationId, userId: context.user.id, permission: context.permission, year, locationId }),
    getOshaYearSummary({ organizationId, year, locationIds: selectedIds })
  ])

  // The log lists recordable cases only (pending and not-recordable decisions stay off the form).
  const rows = cases.filter((row: any) => row.recordability === 'recordable')
  const canExport = context.access.effective.some(item => item.permissionKey === 'osha.export' && item.allowed)
  const totals = summary.combined.totals
  const query = `year=${year}${locationId ? `&location=${locationId}` : ''}`

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / OSHA</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Form 300: Log of Work-Related Injuries and Illnesses</h1>
          <p className='text-textSecondary mt-2'>Year {year}. Privacy cases show &quot;Privacy Case&quot; in place of the employee&apos;s name.</p>
        </div>
        <div className='flex flex-wrap gap-3'>
          {canExport ? (
            <Button variant='outline' asChild>
              <a href={`/api/osha/log?${query}`} data-testid='osha-log-csv'>Download CSV</a>
            </Button>
          ) : null}
          <Button variant='tonalDefault' asChild><Link href={`/osha?${query}`}>Back to OSHA</Link></Button>
        </div>
      </div>

      <OshaFilters action='/osha/log' year={year} years={years} locationId={locationId} locations={locations} />

      {/* contain: inline-size keeps the wide 18-column log scrolling inside the card instead of widening the page. */}
      <Card className='min-w-0 [contain:inline-size]'>
        <CardHeader>
          <CardTitle>{locationId ? locations.find((item: any) => item.id === locationId)?.name : 'All establishments'}</CardTitle>
          <CardDescription>(G) Death · (H) Days away · (I) Job transfer or restriction · (J) Other recordable · (M1)-(M6) injury and illness types</CardDescription>
        </CardHeader>
        <CardContent className='min-w-0 max-w-full overflow-x-auto p-0'>
          <Table data-testid='osha-form-300'>
            <TableHeader>
              <TableRow>
                <TableHead>(A) Case</TableHead>
                <TableHead>(B) Employee</TableHead>
                <TableHead>(C) Job title</TableHead>
                <TableHead>(D) Date</TableHead>
                <TableHead>(E) Where</TableHead>
                <TableHead>(F) Description</TableHead>
                <TableHead>G</TableHead>
                <TableHead>H</TableHead>
                <TableHead>I</TableHead>
                <TableHead>J</TableHead>
                <TableHead>(K) Days away</TableHead>
                <TableHead>(L) Restricted</TableHead>
                {OSHA_CASE_TYPES.map((type, index) => <TableHead key={type}>M{index + 1}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? rows.map((row: any) => (
                <TableRow key={row.id} data-testid={`osha-log-row-${row.case_number}`}>
                  <TableCell className='font-semibold'>{row.case_number}</TableCell>
                  <TableCell>{form300EmployeeName(row)}</TableCell>
                  <TableCell>{row.job_title || ''}</TableCell>
                  <TableCell>{row.injury_date}</TableCell>
                  <TableCell>{row.event_location || ''}</TableCell>
                  <TableCell className='min-w-[220px]'>{row.injury_description || ''}</TableCell>
                  <TableCell>{check(row.case_outcome === 'death')}</TableCell>
                  <TableCell>{check(row.case_outcome === 'days_away')}</TableCell>
                  <TableCell>{check(row.case_outcome === 'job_transfer_restriction')}</TableCell>
                  <TableCell>{check(row.case_outcome === 'other_recordable')}</TableCell>
                  <TableCell>{row.days_away}</TableCell>
                  <TableCell>{row.restricted_days}</TableCell>
                  {OSHA_CASE_TYPES.map(type => <TableCell key={type}>{check(row.case_type === type)}</TableCell>)}
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={18} className='py-10 text-center'>No recordable cases for {year}.</TableCell></TableRow>
              )}
              <TableRow className='font-semibold'>
                <TableCell colSpan={6} className='text-right'>Page totals</TableCell>
                <TableCell>{totals.deaths}</TableCell>
                <TableCell>{totals.daysAwayCases}</TableCell>
                <TableCell>{totals.transferCases}</TableCell>
                <TableCell>{totals.otherCases}</TableCell>
                <TableCell>{totals.daysAway}</TableCell>
                <TableCell>{totals.restrictedDays}</TableCell>
                <TableCell>{totals.injuries}</TableCell>
                <TableCell>{totals.skinDisorders}</TableCell>
                <TableCell>{totals.respiratoryConditions}</TableCell>
                <TableCell>{totals.poisonings}</TableCell>
                <TableCell>{totals.hearingLoss}</TableCell>
                <TableCell>{totals.otherIllnesses}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default OshaLogPage

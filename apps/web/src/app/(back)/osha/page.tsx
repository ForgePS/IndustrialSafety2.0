import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'

import OshaFilters from './OshaFilters'
import { parseOshaParams } from './params'
import { getOshaLocations, getOshaYearSummary, getScopedOshaCases, oshaLocationIdsInScope } from '@/lib/forgeOsha'
import { OSHA_CASE_OUTCOME_LABELS, OSHA_RECORDABILITY_LABELS } from '@/lib/forgeOshaRules'
import type { OshaCaseOutcome, OshaRecordability } from '@/lib/forgeOshaRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'OSHA Recordkeeping' }

const formatRate = (value: number | null) => (value === null ? '—' : value.toFixed(2))
const formatHours = (value: number | null) => (value === null ? 'Not entered' : Math.round(value).toLocaleString())

const OshaPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('osha.view')
  const organizationId = context.activeOrganization.id
  const scopeIds = await oshaLocationIdsInScope({ organizationId, userId: context.user.id, permission: context.permission })
  const locations = await getOshaLocations({ organizationId, locationIds: scopeIds })
  const { year, locationId, years } = parseOshaParams(await searchParams, locations.map((item: any) => item.id))
  const selectedIds = locationId ? [locationId] : locations.map((item: any) => item.id)

  const [summary, cases] = await Promise.all([
    getOshaYearSummary({ organizationId, year, locationIds: selectedIds }),
    getScopedOshaCases({ organizationId, userId: context.user.id, permission: context.permission, year, locationId })
  ])

  // Injury incidents in the year that have no OSHA decision yet.
  const supabase = createServiceRoleClient() as any

  const pendingIncidents = selectedIds.length
    ? (
        await supabase
          .from('forge_incidents')
          .select('id, incident_number, summary, occurred_at, location_id, locations(name), forge_osha_cases(id, status)')
          .eq('organization_id', organizationId)
          .in('location_id', selectedIds)
          .or('involves_injury.eq.true,incident_type.eq.injury,osha_review_flag.eq.true')
          .gte('occurred_at', `${year}-01-01`)
          .lt('occurred_at', `${year + 1}-01-02`)
          .order('occurred_at', { ascending: false })
      ).data || []
    : []

  const awaitingReview = pendingIncidents.filter(
    (incident: any) => !(incident.forge_osha_cases || []).some((item: any) => item.status !== 'voided')
  )

  const canEdit = context.access.effective.some(item => item.permissionKey === 'osha.edit' && item.allowed)
  const query = `?year=${year}${locationId ? `&location=${locationId}` : ''}`
  const totals = summary.combined.totals

  const tiles = [
    { label: 'Recordable cases', value: totals.recordableCases },
    { label: 'Days-away cases', value: totals.daysAwayCases },
    { label: 'Job transfer / restriction cases', value: totals.transferCases },
    { label: 'Other recordable cases', value: totals.otherCases },
    { label: 'Days away', value: totals.daysAway },
    { label: 'Days restricted', value: totals.restrictedDays },
    { label: 'Hours worked', value: formatHours(summary.combined.hoursWorked) },
    { label: 'TRIR', value: formatRate(summary.combined.trir), testId: 'osha-trir' },
    { label: 'DART', value: formatRate(summary.combined.dart), testId: 'osha-dart' }
  ]

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>OSHA Recordkeeping</h1>
          <p className='text-textSecondary mt-2'>Form 300 log, Form 300A summary and Form 301 reports. Rates are per 200,000 hours worked.</p>
        </div>
        <div className='flex flex-wrap gap-3'>
          <Button variant='outline' asChild><Link href={`/osha/log${query}`}>Form 300 Log</Link></Button>
          <Button variant='outline' asChild><Link href={`/osha/summary${query}`}>Form 300A Summary</Link></Button>
        </div>
      </div>

      <OshaFilters action='/osha' year={year} years={years} locationId={locationId} locations={locations} />

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
        {tiles.map(tile => (
          <Card key={tile.label}>
            <CardHeader className='pb-2'><CardDescription>{tile.label}</CardDescription></CardHeader>
            <CardContent><div className='text-textPrimary text-2xl font-bold' data-testid={tile.testId}>{tile.value}</div></CardContent>
          </Card>
        ))}
      </div>

      {summary.combined.hoursWorked === null && totals.recordableCases > 0 ? (
        <p className='text-textSecondary text-sm'>
          Rates appear once hours worked are entered on the Form 300A summary for every establishment with cases.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Injury incidents awaiting an OSHA decision</CardTitle>
          <CardDescription>Open a case from the incident to decide whether it is recordable.</CardDescription>
        </CardHeader>
        <CardContent>
          {awaitingReview.length ? (
            <ul className='flex flex-col gap-3' data-testid='osha-awaiting-review'>
              {awaitingReview.map((incident: any) => (
                <li key={incident.id} className='flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0'>
                  <div>
                    <div className='text-textPrimary font-semibold'>{incident.incident_number} · {incident.summary}</div>
                    <div className='text-textSecondary text-sm'>{incident.locations?.name || '—'} · {new Date(incident.occurred_at).toLocaleDateString()}</div>
                  </div>
                  <Button size='sm' variant='outline' asChild>
                    <Link href={`/incidents/${incident.id}`}>{canEdit ? 'Review incident' : 'View incident'}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No injury incidents are waiting for an OSHA decision.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{year} Cases</CardTitle>
          <CardDescription>Every case opened for the year, including pending and not-recordable decisions.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Injury Date</TableHead>
              <TableHead>Establishment</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Days Away / Restricted</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.length ? cases.map((row: any) => (
              <TableRow key={row.id} data-testid={`osha-case-row-${row.case_number}`}>
                <TableCell className='font-semibold'>{row.case_number}</TableCell>
                <TableCell>
                  {row.employee_name}
                  {row.is_privacy_case ? <Badge size='sm' variant='secondary' className='ms-2'>Privacy case</Badge> : null}
                </TableCell>
                <TableCell>{row.injury_date}</TableCell>
                <TableCell>{row.locations?.name || '—'}</TableCell>
                <TableCell>
                  <Badge size='sm' variant={row.recordability === 'recordable' ? 'tonalPrimary' : 'secondary'}>
                    {OSHA_RECORDABILITY_LABELS[row.recordability as OshaRecordability]}
                  </Badge>
                  {row.status === 'closed' ? <Badge size='sm' variant='secondary' className='ms-2'>Closed</Badge> : null}
                </TableCell>
                <TableCell>{row.case_outcome ? OSHA_CASE_OUTCOME_LABELS[row.case_outcome as OshaCaseOutcome] : '—'}</TableCell>
                <TableCell>{row.days_away} / {row.restricted_days}</TableCell>
                <TableCell className='text-right'>
                  <Button size='sm' variant='outline' asChild><Link href={`/osha/cases/${row.id}`}>Open</Link></Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={8} className='py-10 text-center'>No OSHA cases for {year}.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default OshaPage

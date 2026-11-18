import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'

import OshaAwaitingReview from './OshaAwaitingReview'
import type { AwaitingIncident } from './OshaAwaitingReview'
import OshaFilters from './OshaFilters'
import OshaPrintIssues from './OshaPrintIssues'
import { parseOshaParams } from './params'
import {
  OSHA_TIME_ZONE,
  getOshaLocations,
  getOshaYearSummary,
  getScopedOshaCases,
  oshaLocationIdsInScope,
  oshaRecordWithinScope
} from '@/lib/forgeOsha'
import { OSHA_CASE_OUTCOME_LABELS, OSHA_RECORDABILITY_LABELS, form300PrintIssues, zonedDateTimeParts } from '@/lib/forgeOshaRules'
import type { OshaCaseOutcome, OshaRecordability } from '@/lib/forgeOshaRules'
import { getPersonnelStructureOptions } from '@/lib/forgePersonnelStructure'
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

  // Injury incidents in the year that have no OSHA decision yet. The year is decided the same way a case's injury
  // date is: the incident's local date in the OSHA time zone. The query window is padded a day each side to cover
  // any UTC offset, then narrowed exactly, so every incident lands in exactly one year.
  const supabase = createServiceRoleClient() as any

  const pendingIncidents = selectedIds.length
    ? (
        await supabase
          .from('forge_incidents')
          .select('id, incident_number, summary, occurred_at, location_id, division_id, reported_by_personnel_id, locations(name), forge_osha_cases(id, status)')
          .eq('organization_id', organizationId)
          .in('location_id', selectedIds)
          .or('involves_injury.eq.true,incident_type.eq.injury,osha_review_flag.eq.true')
          .gte('occurred_at', `${year - 1}-12-31`)
          .lt('occurred_at', `${year + 1}-01-02`)
          .order('occurred_at', { ascending: false })
      ).data || []
    : []

  const awaitingReview = pendingIncidents.filter(
    (incident: any) =>
      incident.occurred_at &&
      zonedDateTimeParts(incident.occurred_at, OSHA_TIME_ZONE).date.startsWith(`${year}-`) &&
      !(incident.forge_osha_cases || []).some((item: any) => item.status !== 'voided')
  )

  // "Open OSHA case" uses the same server action as the incident page panel, which re-checks osha.edit scope,
  // incident scope and the employee. The button only shows where the viewer's osha.edit scope reaches.
  const editPermission = context.access.effective.find(item => item.permissionKey === 'osha.edit' && item.allowed)

  const openable = editPermission
    ? await Promise.all(
        awaitingReview.map((incident: any) =>
          oshaRecordWithinScope({
            organizationId,
            userId: context.user.id,
            scope: editPermission.scope,
            record: { organization_id: organizationId, location_id: incident.location_id, division_id: incident.division_id, created_by: context.user.id }
          })
        )
      )
    : awaitingReview.map(() => false)

  const anyOpenable = openable.some(Boolean)

  const [{ data: injuredPeople }, structure] = anyOpenable
    ? await Promise.all([
        supabase
          .from('forge_incident_people')
          .select('incident_id, personnel_id, created_at')
          .eq('organization_id', organizationId)
          .in('incident_id', awaitingReview.map((incident: any) => incident.id))
          .eq('role', 'injured')
          .not('personnel_id', 'is', null)
          .order('created_at'),
        getPersonnelStructureOptions({ organizationId })
      ])
    : [{ data: [] }, null]

  const firstInjured = new Map<string, string>()

  for (const item of injuredPeople || []) {
    if (!firstInjured.has(item.incident_id)) firstInjured.set(item.incident_id, item.personnel_id)
  }

  const awaitingItems: AwaitingIncident[] = awaitingReview.map((incident: any, index: number) => ({
    id: incident.id,
    incidentNumber: incident.incident_number,
    summary: incident.summary,
    locationName: incident.locations?.name || '—',
    occurredOn: new Date(incident.occurred_at).toLocaleDateString(),
    defaultPersonnelId: firstInjured.get(incident.id) || incident.reported_by_personnel_id || null,
    canOpen: openable[index]
  }))

  const printIssues = form300PrintIssues(cases)
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
          <CardDescription>Open a case for the injured or ill employee to decide whether it is recordable.</CardDescription>
        </CardHeader>
        <CardContent>
          {awaitingItems.length ? (
            <OshaAwaitingReview incidents={awaitingItems} people={structure?.supervisors || []} />
          ) : (
            <p className='text-textSecondary text-sm'>No injury incidents are waiting for an OSHA decision.</p>
          )}
        </CardContent>
      </Card>

      <OshaPrintIssues issues={printIssues} year={year} />

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

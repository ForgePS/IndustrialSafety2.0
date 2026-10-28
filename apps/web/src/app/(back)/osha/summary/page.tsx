import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import OshaFilters from '../OshaFilters'
import { parseOshaParams } from '../params'
import OshaSummaryEditor from './OshaSummaryEditor'
import { certifiedTotals, getOshaLocations, getOshaYearSummary, oshaLocationIdsInScope, totalsDiffer } from '@/lib/forgeOsha'
import type { OshaTotals } from '@/lib/forgeOsha'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'OSHA Form 300A Summary' }

const sections: Array<{ title: string; rows: Array<{ key: keyof OshaTotals; label: string }> }> = [
  {
    title: 'Number of Cases',
    rows: [
      { key: 'deaths', label: '(G) Total number of deaths' },
      { key: 'daysAwayCases', label: '(H) Total number of cases with days away from work' },
      { key: 'transferCases', label: '(I) Total number of cases with job transfer or restriction' },
      { key: 'otherCases', label: '(J) Total number of other recordable cases' }
    ]
  },
  {
    title: 'Number of Days',
    rows: [
      { key: 'daysAway', label: '(K) Total number of days away from work' },
      { key: 'restrictedDays', label: '(L) Total number of days of job transfer or restriction' }
    ]
  },
  {
    title: 'Injury and Illness Types',
    rows: [
      { key: 'injuries', label: '(M1) Injuries' },
      { key: 'skinDisorders', label: '(M2) Skin disorders' },
      { key: 'respiratoryConditions', label: '(M3) Respiratory conditions' },
      { key: 'poisonings', label: '(M4) Poisonings' },
      { key: 'hearingLoss', label: '(M5) Hearing loss' },
      { key: 'otherIllnesses', label: '(M6) All other illnesses' }
    ]
  }
]

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))

const OshaSummaryPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('osha.view')
  const organizationId = context.activeOrganization.id
  const scopeIds = await oshaLocationIdsInScope({ organizationId, userId: context.user.id, permission: context.permission })
  const locations = await getOshaLocations({ organizationId, locationIds: scopeIds })
  const parsed = parseOshaParams(await searchParams, locations.map((item: any) => item.id))

  // Form 300A is per establishment, so default to the first one in scope.
  const locationId = parsed.locationId || locations[0]?.id || null
  const { year, years } = parsed

  if (!locationId) {
    return (
      <div className='flex flex-col gap-4'>
        <h1 className='text-textPrimary text-3xl font-bold'>Form 300A Summary</h1>
        <p className='text-textSecondary'>No establishments are within your OSHA access scope.</p>
      </div>
    )
  }

  const { establishments } = await getOshaYearSummary({ organizationId, year, locationIds: [locationId] })
  const establishment = establishments[0]
  const summary = establishment.summary
  const frozen = certifiedTotals(summary)
  const shown = frozen || establishment.totals
  const stale = frozen ? totalsDiffer(frozen, establishment.totals) : false
  const location = establishment.location

  const canEdit = context.access.effective.some(item => item.permissionKey === 'osha.edit' && item.allowed)
  const canCertify = context.access.effective.some(item => item.permissionKey === 'osha.certify' && item.allowed)

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / OSHA</p>
          <div className='mt-1 flex flex-wrap items-center gap-3'>
            <h1 className='text-textPrimary text-3xl font-bold'>Form 300A: Summary of Work-Related Injuries and Illnesses</h1>
            <Badge size='sm' variant={summary?.status === 'certified' ? 'tonalSuccess' : 'secondary'} data-testid='osha-summary-status'>
              {summary?.status === 'certified' ? 'Certified' : 'Draft'}
            </Badge>
          </div>
          <p className='text-textSecondary mt-2'>{location.name} · {year}. Post from February 1 to April 30 of the following year.</p>
        </div>
        <Button variant='tonalDefault' asChild><Link href={`/osha?year=${year}&location=${locationId}`}>Back to OSHA</Link></Button>
      </div>

      <OshaFilters action='/osha/summary' year={year} years={years} locationId={locationId} locations={locations} allowAllLocations={false} />

      {stale ? (
        <Card className='border-destructive'>
          <CardContent className='text-destructive p-5' data-testid='osha-summary-stale'>
            The Form 300 log has changed since this summary was certified. Reopen and recertify it so the posted totals match the log.
          </CardContent>
        </Card>
      ) : null}

      <div className='grid gap-4 md:grid-cols-3'>
        {sections.map(section => (
          <Card key={section.title}>
            <CardHeader><CardTitle>{section.title}</CardTitle></CardHeader>
            <CardContent className='flex flex-col gap-2'>
              {section.rows.map(row => (
                <div key={row.key} className='flex items-center justify-between gap-3 text-sm'>
                  <span className='text-textSecondary'>{row.label}</span>
                  <span className='text-textPrimary font-semibold' data-testid={`osha-300a-${row.key}`}>{shown[row.key]}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Incidence Rates</CardTitle>
          <CardDescription>Per 200,000 hours worked (100 full-time workers for one year). Uses the current log.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 md:grid-cols-3'>
          <div><div className='text-textSecondary text-xs'>TRIR (all recordable cases)</div><div className='text-2xl font-bold' data-testid='osha-summary-trir'>{establishment.trir === null ? '—' : establishment.trir.toFixed(2)}</div></div>
          <div><div className='text-textSecondary text-xs'>DART (days away, restricted or transferred)</div><div className='text-2xl font-bold' data-testid='osha-summary-dart'>{establishment.dart === null ? '—' : establishment.dart.toFixed(2)}</div></div>
          <div><div className='text-textSecondary text-xs'>Hours worked</div><div className='text-2xl font-bold'>{establishment.hoursWorked === null ? 'Not entered' : Math.round(establishment.hoursWorked).toLocaleString()}</div></div>
        </CardContent>
      </Card>

      <OshaSummaryEditor
        key={`${locationId}-${year}-${summary?.row_version || 0}`}
        locationId={locationId}
        year={year}
        summaryId={summary?.id || null}
        rowVersion={summary?.row_version ?? null}
        certified={summary?.status === 'certified'}
        canEdit={canEdit}
        canCertify={canCertify}
        initialValues={{
          establishment_name: text(summary?.establishment_name ?? location.name),
          street: text(summary?.street ?? location.address_line_1),
          city: text(summary?.city ?? location.city),
          state: text(summary?.state ?? location.state_region),
          zip: text(summary?.zip ?? location.postal_code),
          industry_description: text(summary?.industry_description),
          naics_code: text(summary?.naics_code),
          annual_average_employees: text(summary?.annual_average_employees),
          total_hours_worked: text(summary?.total_hours_worked)
        }}
        initialCertification={{
          certifier_name: text(summary?.certifier_name),
          certifier_title: text(summary?.certifier_title),
          certifier_phone: text(summary?.certifier_phone),
          certification_date: text(summary?.certification_date) || new Date().toISOString().slice(0, 10)
        }}
      />
    </div>
  )
}

export default OshaSummaryPage

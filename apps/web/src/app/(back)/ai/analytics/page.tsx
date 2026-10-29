
import Link from 'next/link'
import type { Metadata } from 'next'
import { TbReportAnalytics } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import SavedReportManager from './SavedReportManager'
import {
  getForgeAiExecutiveAnalytics,
  resolveForgeAiAnalyticsRange
} from '@/lib/forgeAiAnalytics'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forge AI Analytics' }

const StatCard = ({
  label,
  value,
  description
}: {
  label: string
  value: string | number
  description?: string
}) => (
  <Card>
    <CardHeader className='pb-2'>
      <CardDescription>{label}</CardDescription>
    </CardHeader>
    <CardContent>
      <div className='text-3xl font-bold'>{value}</div>
      {description ? <div className='text-textSecondary mt-1 text-xs'>{description}</div> : null}
    </CardContent>
  </Card>
)

const ForgeAiAnalyticsPage = async ({
  searchParams
}: {
  searchParams: Promise<{ days?: string }>
}) => {
  const context = await requireTenantPermission('forge_ai.view_analytics')
  const query = await searchParams
  const days = Math.min(Math.max(Number(query.days || 90) || 90, 1), 3650)
  const range = resolveForgeAiAnalyticsRange({ days })
  const organizationId = context.activeOrganization.id

  const permissionByKey = new Map(
    context.access.effective.map(permission => [permission.permissionKey, permission])
  )

  const analytics = await getForgeAiExecutiveAnalytics({
    organizationId,
    userId: context.user.id,
    analyticsPermission: context.permission,
    permissionByKey,
    range
  })

  const canSaveReports = Boolean(
    permissionByKey.get('forge_ai.save_reports')?.allowed
  )

  const supabase = createServiceRoleClient() as any
  let savedReports: any[] = []

  if (canSaveReports) {
    const { data } = await supabase
      .from('forge_ai_saved_reports')
      .select('*')
      .eq('organization_id', organizationId)
      .or('owner_user_id.eq.' + context.user.id + ',visibility.eq.tenant')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(100)

    savedReports = data || []
  }

  const incidents: any = analytics.incidents
  const training: any = analytics.training
  const inspections: any = analytics.inspections
  const assets: any = analytics.assets

  const prompts = [
    {
      label: 'Executive Safety Summary',
      prompt: 'Build an executive safety summary for the last ' + String(days) + ' days. Highlight meaningful changes, overdue work, critical findings, equipment issues, and the most important management priorities. Separate retrieved facts from your interpretation.'
    },
    {
      label: 'Incident Trend Analysis',
      prompt: 'Analyze incidents for the last ' + String(days) + ' days. Compare with the previous equal period, identify patterns by severity, type, Location, and Division, and explain what deserves further review.'
    },
    {
      label: 'Training Gap Analysis',
      prompt: 'Analyze training for the last ' + String(days) + ' days. Identify overdue assignments, courses creating the largest gaps, Location or Division concentrations, completion patterns, and practical follow-up priorities.'
    },
    {
      label: 'Inspection Finding Analysis',
      prompt: 'Analyze inspections and findings for the last ' + String(days) + ' days. Identify critical and overdue findings, repeat finding patterns, Location concentrations, and areas that should receive follow-up.'
    },
    {
      label: 'Equipment Cost & Condition',
      prompt: 'Analyze Assets & Equipment for the last ' + String(days) + ' days. Focus on out-of-service equipment, poor or unserviceable condition, maintenance due, maintenance cost, and assets driving the most maintenance expense.'
    }
  ]

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 flex items-center gap-3 text-3xl font-bold'>
            <TbReportAnalytics />
            AI Analytics
          </h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Permission-aware cross-module safety reporting. Metrics remain limited by your effective Forge permissions and data scope.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' asChild><Link href='/ai/watch'>AI Watch</Link></Button>
          <Button variant='outline' asChild><Link href='/ai'>Back to Forge AI</Link></Button>
        </div>
      </div>

      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-4 p-5'>
          <div>
            <div className='font-semibold'>Analysis Range</div>
            <div className='text-textSecondary text-sm'>{range.dateFrom} through {range.dateTo}</div>
          </div>
          <div className='flex flex-wrap gap-2'>
            {[30, 90, 180, 365].map(value => (
              <Button key={value} size='sm' variant={days === value ? 'default' : 'outline'} asChild>
                <Link href={'/ai/analytics?days=' + value}>{value} Days</Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-5'>
        <StatCard
          label='Incidents'
          value={incidents.available ? incidents.total : '—'}
          description={incidents.available && incidents.change_percent != null
            ? String(incidents.change_percent) + '% vs previous period'
            : incidents.available ? 'No comparable prior-period baseline' : 'Not available in your scope'}
        />
        <StatCard
          label='Overdue Training'
          value={training.available ? training.overdue_assignments : '—'}
          description={training.available ? String(training.overdue_rate_percent) + '% of active assignments' : 'Not available in your scope'}
        />
        <StatCard
          label='Critical Open Findings'
          value={inspections.available ? inspections.critical_open_findings : '—'}
          description={inspections.available ? String(inspections.overdue_findings) + ' overdue findings' : 'Not available in your scope'}
        />
        <StatCard
          label='Assets Out of Service'
          value={assets.available ? assets.out_of_service : '—'}
          description={assets.available ? String(assets.poor_or_unserviceable) + ' poor / unserviceable' : 'Not available in your scope'}
        />
        <StatCard
          label='Maintenance Cost'
          value={assets.available ? '$' + Number(assets.maintenance_cost_in_range || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
          description={assets.available ? String(assets.maintenance_records_in_range) + ' maintenance records' : 'Not available in your scope'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ask Forge to Analyze</CardTitle>
          <CardDescription>Open a prebuilt natural-language analysis prompt, then adjust it before sending.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {prompts.map(item => (
            <Button key={item.label} variant='outline' className='h-auto justify-start whitespace-normal p-4 text-left' asChild>
              <Link href={'/ai?prompt=' + encodeURIComponent(item.prompt)}>{item.label}</Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className='grid gap-4 xl:grid-cols-2'>
        {incidents.available ? (
          <Card>
            <CardHeader>
              <CardTitle>Incident Snapshot</CardTitle>
              <CardDescription>Current analysis period.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 md:grid-cols-3'>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Open</div><div className='text-xl font-semibold'>{incidents.open}</div></div>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Submitted</div><div className='text-xl font-semibold'>{incidents.submitted}</div></div>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Major / Critical</div><div className='text-xl font-semibold'>{incidents.high_severity}</div></div>
            </CardContent>
          </Card>
        ) : null}

        {training.available ? (
          <Card>
            <CardHeader>
              <CardTitle>Training Snapshot</CardTitle>
              <CardDescription>Current visible training workload.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 md:grid-cols-3'>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Visible Personnel</div><div className='text-xl font-semibold'>{training.visible_personnel}</div></div>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Active Assignments</div><div className='text-xl font-semibold'>{training.active_assignments}</div></div>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Completions in Range</div><div className='text-xl font-semibold'>{training.completions_in_range}</div></div>
            </CardContent>
          </Card>
        ) : null}

        {inspections.available ? (
          <Card>
            <CardHeader>
              <CardTitle>Inspection Snapshot</CardTitle>
              <CardDescription>Inspection and finding workload.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 md:grid-cols-3'>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Inspections in Range</div><div className='text-xl font-semibold'>{inspections.inspections_in_range}</div></div>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Open Findings</div><div className='text-xl font-semibold'>{inspections.open_findings}</div></div>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Overdue Findings</div><div className='text-xl font-semibold'>{inspections.overdue_findings}</div></div>
            </CardContent>
          </Card>
        ) : null}

        {assets.available ? (
          <Card>
            <CardHeader>
              <CardTitle>Asset Snapshot</CardTitle>
              <CardDescription>Equipment condition and maintenance.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 md:grid-cols-3'>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Active Assets</div><div className='text-xl font-semibold'>{assets.active_assets}</div></div>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Maintenance Due</div><div className='text-xl font-semibold'>{assets.maintenance_due_now}</div></div>
              <div className='rounded-lg border p-3'><div className='text-textSecondary text-xs'>Critical Assets</div><div className='text-xl font-semibold'>{assets.critical_assets}</div></div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {canSaveReports ? (
        <SavedReportManager reports={savedReports} currentUserId={context.user.id} />
      ) : null}
    </div>
  )
}

export default ForgeAiAnalyticsPage

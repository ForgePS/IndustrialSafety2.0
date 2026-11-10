import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { TbLayoutDashboard } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'

import AlertCenter, { type CenterAlert } from './AlertCenter'
import ForgeAiRecommendationsPanel from '../recommendations/ForgeAiRecommendationsPanel'
import { FORGE_AI_AGENTS } from '@/lib/forgeAiAgents'
import { getScopedForgeAiRecommendations } from '@/lib/forgeAiRecommendations'
import { getScopedForgeAiRiskAssessments } from '@/lib/forgeAiRisk'
import { getForgeAiRuntimeContext } from '@/lib/forgeAiRuntime'
import { getScopedForgeAiWatchAlerts } from '@/lib/forgeAiWatchAccess'
import { commandCenterAvailable } from '@/lib/forgeFeatureAvailability'

export const metadata: Metadata = { title: 'Forge AI Command Center' }

const USAGE_DAYS = 30

const Tile = ({ label, value, href, testId }: { label: string; value: number | string; href?: string; testId: string }) => {
  const body = (
    <Card className='h-full' data-testid={testId}>
      <CardContent className='p-4'>
        <p className='text-textSecondary text-sm'>{label}</p>
        <p className='text-textPrimary mt-1 text-3xl font-bold'>{value}</p>
      </CardContent>
    </Card>
  )

  return href ? <Link href={href}>{body}</Link> : body
}

const bandVariant = (band: string) => (band === 'high' ? 'destructive' : band === 'elevated' ? 'default' : 'outline')

const ForgeAiCommandCenterPage = async () => {
  const runtime = await getForgeAiRuntimeContext()

  if ('error' in runtime) redirect('/dashboard')

  const effective = runtime.access.effective

  if (!commandCenterAvailable(effective)) redirect('/ai')

  const organizationId = runtime.activeOrganization.id
  const userId = runtime.user.id
  const permissionByKey = new Map(effective.map(item => [item.permissionKey, item]))
  const allowed = (key: string) => Boolean(permissionByKey.get(key)?.allowed)
  const supabase = createServiceRoleClient() as any
  const usageSince = new Date(Date.now() - USAGE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const alertPermission = permissionByKey.get('forge_ai.view_alerts')
  const riskPermission = permissionByKey.get('forge_ai.view_risk')

  // Every section reads through the same scoped helpers as its own page, so a user sees here only
  // what they would see there.
  const [alerts, assessments, recommendations, { count: pendingApprovals }, { data: runs }, { data: usage }] = await Promise.all([
    alertPermission?.allowed
      ? getScopedForgeAiWatchAlerts({ organizationId, userId, alertPermission, permissionByKey })
      : Promise.resolve([]),
    riskPermission?.allowed
      ? getScopedForgeAiRiskAssessments({ organizationId, userId, permission: riskPermission, permissionByKey, includeIndicators: false })
      : Promise.resolve([]),
    allowed('forge_ai.view_recommendations')
      ? getScopedForgeAiRecommendations({ organizationId, userId, permissionByKey, includeEvents: true })
      : Promise.resolve([]),
    allowed('forge_ai.approve_actions')
      ? supabase
          .from('forge_ai_action_approvals')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('status', 'pending')
      : Promise.resolve({ count: null }),
    supabase
      .from('forge_ai_agent_runs')
      .select('id, agent_key, status, started_at, duration_ms, tool_calls')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(8),

    // Totals are aggregated in the database, so they cover every event in the window.
    allowed('forge_ai.view_usage')
      ? supabase.rpc('forge_ai_usage_summary', { p_organization_id: organizationId, p_since: usageSince })
      : Promise.resolve({ data: null })
  ])

  const urgentAlerts = (alerts as any[])
    .filter(alert => ['open', 'acknowledged'].includes(alert.status) && ['high', 'critical'].includes(alert.severity))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))

  const scored = (assessments as any[]).filter(row => row.score !== null && row.band !== 'insufficient_data')

  // Facilities only: a division's indicator rolls up its own locations, so counting it too would
  // count the same site twice.
  const attention = scored.filter(row => row.scope_type === 'location' && ['elevated', 'high'].includes(row.band))
  const recs = recommendations as any[]
  const toReview = recs.filter(row => ['proposed', 'in_review'].includes(row.status))
  const awaitingVerification = recs.filter(row => row.status === 'executed')
  const openRecs = recs.filter(row => ['proposed', 'in_review', 'approved', 'executing', 'executed'].includes(row.status)).slice(0, 4)

  const agentName = new Map(FORGE_AI_AGENTS.map(agent => [agent.key, agent.name]))

  const usageRow = Array.isArray(usage) ? usage[0] : usage

  const usageTotals = {
    requests: Number(usageRow?.requests || 0),
    tokens: Number(usageRow?.tokens || 0),
    toolCalls: Number(usageRow?.tool_calls || 0)
  }

  return (
    <div className='flex flex-col gap-6' data-testid='command-center'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{runtime.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 flex items-center gap-3 text-3xl font-bold'>
            <TbLayoutDashboard />
            Command Center
          </h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            One view of what Forge AI has found in your scope: urgent alerts, where risk indicators are highest, and recommendations waiting
            on a person. Every figure comes from your own records; nothing here acts on its own.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button asChild>
            <Link href='/ai'>Ask {runtime.settings.assistant_name || 'Forge AI'}</Link>
          </Button>
          {allowed('forge_ai.view_alerts') ? (
            <Button variant='outline' asChild>
              <Link href='/ai/watch'>AI Watch</Link>
            </Button>
          ) : null}
          {allowed('forge_ai.view_recommendations') ? (
            <Button variant='outline' asChild>
              <Link href='/ai/recommendations'>All Recommendations</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5'>
        <Tile testId='kpi-alerts' label='Open high/critical alerts' value={urgentAlerts.length} href={allowed('forge_ai.view_alerts') ? '/ai/watch' : undefined} />
        <Tile testId='kpi-attention' label='Facilities Elevated or High' value={attention.length} href={riskPermission?.allowed ? '/ai/risk' : undefined} />
        <Tile testId='kpi-review' label='Recommendations to review' value={toReview.length} href={allowed('forge_ai.view_recommendations') ? '/ai/recommendations' : undefined} />
        <Tile testId='kpi-verify' label='Awaiting verification' value={awaitingVerification.length} href={allowed('forge_ai.view_recommendations') ? '/ai/recommendations' : undefined} />
        {allowed('forge_ai.approve_actions') ? (
          <Tile testId='kpi-approvals' label='AI actions pending approval' value={pendingApprovals || 0} href='/ai/actions' />
        ) : null}
      </div>

      <div className='grid gap-6 xl:grid-cols-2'>
        {alertPermission?.allowed ? (
          <Card>
            <CardHeader>
              <CardTitle>Alert Center</CardTitle>
              <CardDescription>High and critical AI Watch alerts that are still open.</CardDescription>
            </CardHeader>
            <CardContent>
              <AlertCenter alerts={urgentAlerts.slice(0, 6) as CenterAlert[]} />
            </CardContent>
          </Card>
        ) : null}

        {riskPermission?.allowed ? (
          <Card data-testid='risk-top'>
            <CardHeader>
              <CardTitle>Highest Risk Indicators</CardTitle>
              <CardDescription>A 0-100 ranking from each scope&apos;s own records. It is not a probability of injury.</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-2'>
              {!scored.length ? <p className='text-textSecondary text-sm'>No scored facilities or divisions yet.</p> : null}
              {scored.slice(0, 5).map(row => (
                <Link key={row.id} href='/ai/risk' className='border-divider flex items-center justify-between gap-3 rounded-md border p-3'>
                  <span className='text-textPrimary'>
                    {row.scope_name} <span className='text-textSecondary text-xs'>({row.scope_type})</span>
                  </span>
                  <span className='flex items-center gap-2'>
                    <Badge variant={bandVariant(row.band)}>{row.band}</Badge>
                    <span className='text-textPrimary font-semibold'>{Math.round(Number(row.score))}</span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {allowed('forge_ai.view_recommendations') ? (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>The newest open recommendations in your scope. Approve, reject or follow up here or on the full page.</CardDescription>
          </CardHeader>
          <CardContent>
            <ForgeAiRecommendationsPanel
              compact
              recommendations={openRecs}
              canReview={allowed('forge_ai.review_recommendations')}
              canSubmit={allowed('forge_ai.review_recommendations') && allowed('forge_ai.run_actions')}
              canApprove={allowed('forge_ai.review_recommendations') && allowed('forge_ai.approve_actions')}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className='grid gap-6 xl:grid-cols-2'>
        <Card data-testid='recent-runs'>
          <CardHeader>
            <CardTitle>Your Recent Assistant Activity</CardTitle>
            <CardDescription>Which agent answered your last requests, and how.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2'>
            {!(runs || []).length ? <p className='text-textSecondary text-sm'>No assistant requests yet.</p> : null}
            {(runs || []).map((run: any) => (
              <div key={run.id} className='flex flex-wrap items-center justify-between gap-2 text-sm'>
                <span className='text-textPrimary'>{agentName.get(run.agent_key) || run.agent_key}</span>
                <span className='text-textSecondary flex items-center gap-2'>
                  <Badge variant={run.status === 'completed' ? 'tonalSuccess' : 'outline'}>{run.status}</Badge>
                  {run.tool_calls} tool call(s)
                  {run.duration_ms ? ` · ${(run.duration_ms / 1000).toFixed(1)}s` : ''}
                  {' · '}
                  {new Date(run.started_at).toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {usage ? (
          <Card data-testid='usage-summary'>
            <CardHeader>
              <CardTitle>Tenant Usage, Last {USAGE_DAYS} Days</CardTitle>
              <CardDescription>All Forge AI requests in this organization.</CardDescription>
            </CardHeader>
            <CardContent className='grid grid-cols-3 gap-4'>
              <div>
                <p className='text-textSecondary text-sm'>Requests</p>
                <p className='text-textPrimary text-2xl font-bold'>{usageTotals.requests.toLocaleString()}</p>
              </div>
              <div>
                <p className='text-textSecondary text-sm'>Tokens</p>
                <p className='text-textPrimary text-2xl font-bold'>{usageTotals.tokens.toLocaleString()}</p>
              </div>
              <div>
                <p className='text-textSecondary text-sm'>Tool calls</p>
                <p className='text-textPrimary text-2xl font-bold'>{usageTotals.toolCalls.toLocaleString()}</p>
              </div>
              <Button className='col-span-3 justify-self-start' variant='outline' size='sm' asChild>
                <Link href='/ai/usage'>Full usage</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

export default ForgeAiCommandCenterPage

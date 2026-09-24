import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forge AI Usage' }

const ForgeAiUsagePage = async () => {
  const context = await requireTenantPermission('forge_ai.view_usage')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const [
    { data: usage },
    { data: toolRuns },
    { count: conversationsCount },
    { count: knowledgeCount }
  ] = await Promise.all([
    supabase
      .from('forge_ai_usage_events')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('forge_ai_tool_runs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('started_at', { ascending: false })
      .limit(100),
    supabase
      .from('forge_ai_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .neq('status', 'deleted'),
    supabase
      .from('forge_ai_knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active')
  ])

  const usageRows = usage || []
  const requestRows = usageRows.filter((row: any) => row.metadata?.usage_type !== 'knowledge_embedding')
  const embeddingRows = usageRows.filter((row: any) => row.metadata?.usage_type === 'knowledge_embedding')

  const totals = usageRows.reduce(
    (acc: any, row: any) => {
      acc.input += Number(row.input_tokens || 0)
      acc.output += Number(row.output_tokens || 0)
      acc.reasoning += Number(row.reasoning_tokens || 0)
      acc.total += Number(row.total_tokens || 0)
      acc.toolCalls += Number(row.tool_calls || 0)
      if (row.duration_ms != null) {
        acc.durationTotal += Number(row.duration_ms)
        acc.durationCount += 1
      }
      return acc
    },
    {
      input: 0,
      output: 0,
      reasoning: 0,
      total: 0,
      toolCalls: 0,
      durationTotal: 0,
      durationCount: 0
    }
  )

  const averageDuration =
    totals.durationCount > 0
      ? Math.round(totals.durationTotal / totals.durationCount)
      : 0

  const toolStatus = (toolRuns || []).reduce((acc: Record<string, number>, row: any) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Usage & Activity</h1>
          <p className='text-textSecondary mt-2'>Current-month AI usage, tool activity, knowledge indexing and operational health.</p>
        </div>
        <Button variant='outline' asChild><Link href='/ai'>Back to Forge AI</Link></Button>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>AI Requests This Month</CardDescription>
          </CardHeader>
          <CardContent><div className='text-3xl font-bold'>{requestRows.length}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Total Tokens</CardDescription>
          </CardHeader>
          <CardContent><div className='text-3xl font-bold'>{totals.total.toLocaleString()}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Tool Calls</CardDescription>
          </CardHeader>
          <CardContent><div className='text-3xl font-bold'>{totals.toolCalls.toLocaleString()}</div></CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Average Request Time</CardDescription>
          </CardHeader>
          <CardContent><div className='text-3xl font-bold'>{averageDuration ? (averageDuration / 1000).toFixed(1) + 's' : '—'}</div></CardContent>
        </Card>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Input Tokens</CardDescription></CardHeader>
          <CardContent><div className='text-xl font-semibold'>{totals.input.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Output Tokens</CardDescription></CardHeader>
          <CardContent><div className='text-xl font-semibold'>{totals.output.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Reasoning Tokens</CardDescription></CardHeader>
          <CardContent><div className='text-xl font-semibold'>{totals.reasoning.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Knowledge Embedding Runs</CardDescription></CardHeader>
          <CardContent><div className='text-xl font-semibold'>{embeddingRows.length}</div></CardContent>
        </Card>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader><CardTitle>Conversations</CardTitle></CardHeader>
          <CardContent><div className='text-3xl font-bold'>{Number(conversationsCount || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Active Knowledge Sources</CardTitle></CardHeader>
          <CardContent><div className='text-3xl font-bold'>{Number(knowledgeCount || 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tool Health</CardTitle></CardHeader>
          <CardContent className='text-sm'>
            <div>Completed: <strong>{toolStatus.completed || 0}</strong></div>
            <div>Denied: <strong>{toolStatus.denied || 0}</strong></div>
            <div>Failed: <strong>{toolStatus.failed || 0}</strong></div>
            <div>Pending Approval: <strong>{toolStatus.pending_approval || 0}</strong></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent AI Usage</CardTitle>
          <CardDescription>Most recent model and embedding activity for this tenant.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Output</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Tools</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usageRows.slice(0, 50).length ? usageRows.slice(0, 50).map((row: any) => (
              <TableRow key={row.id}>
                <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                <TableCell>{row.metadata?.usage_type === 'knowledge_embedding' ? 'Knowledge Index' : 'Assistant'}</TableCell>
                <TableCell>{row.model}</TableCell>
                <TableCell>{Number(row.input_tokens || 0).toLocaleString()}</TableCell>
                <TableCell>{Number(row.output_tokens || 0).toLocaleString()}</TableCell>
                <TableCell>{Number(row.total_tokens || 0).toLocaleString()}</TableCell>
                <TableCell>{Number(row.tool_calls || 0)}</TableCell>
                <TableCell>{row.duration_ms == null ? '—' : (Number(row.duration_ms) / 1000).toFixed(1) + 's'}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={8} className='py-8 text-center'>No Forge AI usage has been recorded this month.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Tool Runs</CardTitle>
          <CardDescription>Permission-aware data capabilities requested by Forge AI.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Capability</TableHead>
              <TableHead>Permission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(toolRuns || []).slice(0, 50).length ? (toolRuns || []).slice(0, 50).map((row: any) => (
              <TableRow key={row.id}>
                <TableCell>{new Date(row.started_at).toLocaleString()}</TableCell>
                <TableCell>{row.capability_key}</TableCell>
                <TableCell>{row.required_permission_key || '—'}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>{row.result_summary || row.error_message || '—'}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={5} className='py-8 text-center'>No Forge AI tool runs have been recorded.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default ForgeAiUsagePage

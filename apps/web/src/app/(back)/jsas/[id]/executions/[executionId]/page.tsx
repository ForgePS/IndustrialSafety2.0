import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import {
  AcknowledgeButton,
  CompleteExecutionForm,
  ExecutionCrewPanel,
  ExecutionLifecycleControls
} from '../../../ExecutionActions'
import { getJsaTrainingWarnings, jsaWithinScope, loadExecution } from '@/lib/forgeJsa'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'JSA Execution' }

const JsaExecutionPage = async ({
  params
}: {
  params: Promise<{ id: string; executionId: string }>
}) => {
  const context = await requireTenantPermission('jsa_jha.view')
  const { id, executionId } = await params
  const organizationId = context.activeOrganization.id

  const detail = await loadExecution({
    organizationId,
    executionId,
    userId: context.user.id,
    permission: context.permission
  })

  if (!detail || detail.jsa.id !== id) notFound()

  const permissions = new Map(
    context.access.effective
      .filter(item => item.allowed)
      .map(item => [item.permissionKey, item])
  )

  const acknowledgePermission = permissions.get('jsa_jha.acknowledge')
  const executePermission = permissions.get('jsa_jha.execute')

  const currentParticipant = detail.participants.find(
    (item: any) => item.user_id === context.user.id
  )

  const canAcknowledge = Boolean(
    acknowledgePermission &&
      currentParticipant &&
      !currentParticipant.acknowledged_at &&
      !['completed', 'canceled'].includes(detail.execution.status)
  )

  const canManage = executePermission
    ? await jsaWithinScope({
        organizationId,
        userId: context.user.id,
        scope: executePermission.scope,
        jsa: detail.jsa
      })
    : false

  const allRequiredAcked = detail.participants
    .filter((item: any) => item.requires_acknowledgement !== false)
    .every((item: any) => Boolean(item.acknowledged_at || item.acknowledgment_id))

  const supabase = createServiceRoleClient() as any
  const { data: personnelRows } = await supabase
    .from('forge_personnel')
    .select('id, first_name, last_name, employee_number')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('last_name', { ascending: true })
    .limit(200)

  // Execution timeline from the authoritative JSA activity log (stop-work reasons persist here even
  // after the execution is resumed and the current stop fields are cleared).
  const { data: timelineRows } = await supabase
    .from('forge_jsa_activity')
    .select('id, activity_type, message, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('jsa_id', detail.jsa.id)
    .contains('metadata', { execution_id: executionId })
    .order('created_at', { ascending: true })
    .limit(100)

  const timeline = (timelineRows || []) as Array<{
    id: string
    activity_type: string
    message: string | null
    metadata: Record<string, unknown> | null
    created_at: string
  }>

  const personnel = (personnelRows || []).map((row: any) => ({
    id: row.id as string,
    label:
      [row.first_name, row.last_name].filter(Boolean).join(' ') +
      (row.employee_number ? ' (' + row.employee_number + ')' : '')
  }))

  const warnings = await getJsaTrainingWarnings({
    organizationId,
    jsaId: detail.jsa.id,
    personnelIds: detail.participants.map((item: any) => item.personnel_id)
  })

  const lead = detail.execution.forge_personnel as
    | { first_name?: string; last_name?: string }
    | null
    | undefined
  const location = detail.execution.locations as { name?: string } | null | undefined

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {detail.jsa.jsa_number} / Execution
          </p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>
            {detail.execution.execution_number}
          </h1>
          <div className='text-textSecondary mt-2 flex flex-wrap items-center gap-2 text-sm'>
            <Link href={'/jsas/' + detail.jsa.id} className='text-primary hover:underline'>
              {detail.jsa.title}
            </Link>
            <Badge variant='outline'>{detail.execution.status}</Badge>
          </div>
        </div>
        <Button variant='outline' asChild>
          <Link href={'/jsas/' + detail.jsa.id}>Back to JSA</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution details</CardTitle>
          <CardDescription>
            Lead:{' '}
            {lead
              ? [lead.first_name, lead.last_name].filter(Boolean).join(' ')
              : '—'}{' '}
            · Location: {location?.name || '—'}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-2 text-sm'>
          <div>
            Started:{' '}
            {detail.execution.started_at
              ? new Date(detail.execution.started_at).toLocaleString()
              : '—'}
          </div>
          <div>
            Completed:{' '}
            {detail.execution.completed_at
              ? new Date(detail.execution.completed_at).toLocaleString()
              : '—'}
          </div>
          {detail.execution.stopped_at ? (
            <div>
              Stopped:{' '}
              {new Date(String(detail.execution.stopped_at)).toLocaleString()}
              {detail.execution.stop_reason
                ? ' — ' + String(detail.execution.stop_reason)
                : ''}
            </div>
          ) : null}
          {detail.execution.notes ? <div>Notes: {detail.execution.notes}</div> : null}
        </CardContent>
      </Card>

      {warnings.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Training warnings</CardTitle>
            <CardDescription>
              Advisory only — missing training does not block activation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className='grid gap-2 text-sm'>
              {warnings.map((warning, index) => (
                <li key={warning.personnelId + warning.trainingCourseId + index}>
                  {warning.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Crew & acknowledgments</CardTitle>
          <CardDescription>
            Add crew, collect briefing acknowledgments, then activate work.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4'>
          <ExecutionCrewPanel
            jsaId={id}
            executionId={executionId}
            status={detail.execution.status}
            personnel={personnel}
            canManage={canManage}
            participants={detail.participants.map((participant: any) => {
              const person = participant.forge_personnel
              return {
                id: participant.id,
                role: participant.role,
                acknowledged_at: participant.acknowledged_at,
                personnel_id: participant.personnel_id,
                name: person
                  ? [person.first_name, person.last_name].filter(Boolean).join(' ')
                  : 'Unknown'
              }
            })}
          />

          {canAcknowledge ? (
            <AcknowledgeButton jsaId={id} executionId={executionId} />
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle</CardTitle>
          </CardHeader>
          <CardContent>
            <ExecutionLifecycleControls
              jsaId={id}
              executionId={executionId}
              status={detail.execution.status}
              canManage={canManage}
              allRequiredAcked={allRequiredAcked}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card data-testid='jsa-execution-timeline'>
        <CardHeader>
          <CardTitle>Execution timeline</CardTitle>
          <CardDescription>Lifecycle transitions and stop-work events for this execution.</CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length ? (
            <ul className='grid gap-2 text-sm'>
              {timeline.map(event => {
                const stopReason =
                  event.activity_type === 'execution_stopped' && event.metadata?.stop_reason
                    ? String(event.metadata.stop_reason)
                    : null
                return (
                  <li key={event.id} className='flex flex-col'>
                    <span>
                      <span className='text-textSecondary'>
                        {new Date(event.created_at).toLocaleString()}
                      </span>{' '}
                      — {event.message || event.activity_type}
                    </span>
                    {stopReason ? (
                      <span className='text-textSecondary'>Stop reason: {stopReason}</span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className='text-textSecondary text-sm'>No lifecycle events recorded yet.</p>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Complete execution</CardTitle>
          </CardHeader>
          <CardContent>
            <CompleteExecutionForm
              jsaId={id}
              executionId={executionId}
              initialNotes={detail.execution.notes}
              status={detail.execution.status}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default JsaExecutionPage

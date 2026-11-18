import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

export type WorkflowApprovalItem = {
  id: string
  approval_type: string
  status: string
  requested_at?: string | null
  completed_at?: string | null
  forge_approval_steps?: Array<{
    id: string
    step_order: number
    status: string
    decision?: string | null
    comment?: string | null
    decided_at?: string | null
  }>
}

const statusVariant = (status: string) => {
  if (status === 'approved') return 'tonalSuccess' as const
  if (status === 'rejected') return 'destructive' as const
  return 'secondary' as const
}

const WorkflowApprovalPanel = ({ approvals }: { approvals: WorkflowApprovalItem[] }) => {
  return (
    <Card data-testid='workflow-approvals'>
      <CardHeader>
        <CardTitle>Approvals</CardTitle>
        <CardDescription>Approval requests tied to this record.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {approvals.length ? (
          approvals.map(approval => {
            const steps = Array.isArray(approval.forge_approval_steps)
              ? approval.forge_approval_steps
              : []

            return (
              <div key={approval.id} className='rounded-lg border p-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='font-medium capitalize'>
                    {approval.approval_type.replaceAll('_', ' ')}
                  </div>
                  <Badge size='sm' variant={statusVariant(approval.status)}>
                    {approval.status}
                  </Badge>
                </div>
                {approval.requested_at ? (
                  <div className='text-textSecondary mt-1 text-xs'>
                    Requested {new Date(approval.requested_at).toLocaleString()}
                  </div>
                ) : null}
                {steps.length ? (
                  <div className='mt-2 flex flex-col gap-1'>
                    {steps
                      .slice()
                      .sort((a, b) => a.step_order - b.step_order)
                      .map(step => (
                        <div key={step.id} className='text-textSecondary text-xs'>
                          Step {step.step_order}: {step.status}
                          {step.comment ? ` — ${step.comment}` : ''}
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            )
          })
        ) : (
          <div className='text-textSecondary text-sm'>No approval requests.</div>
        )}
      </CardContent>
    </Card>
  )
}

export default WorkflowApprovalPanel

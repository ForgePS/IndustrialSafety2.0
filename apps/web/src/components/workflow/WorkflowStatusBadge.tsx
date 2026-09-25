import { Badge } from '@repo/ui/components/ui/badge'

const stateVariant = (stateKey: string) => {
  if (stateKey === 'closed' || stateKey === 'verified') return 'tonalSuccess' as const
  if (stateKey === 'canceled') return 'destructive' as const
  if (stateKey === 'pending_verification') return 'secondary' as const
  return 'outline' as const
}

const formatLabel = (stateKey: string) =>
  stateKey
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const WorkflowStatusBadge = ({
  stateKey,
  label
}: {
  stateKey: string
  label?: string
}) => {
  return (
    <Badge size='sm' variant={stateVariant(stateKey)} data-testid='workflow-status'>
      {label || formatLabel(stateKey)}
    </Badge>
  )
}

export default WorkflowStatusBadge

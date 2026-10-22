import { Badge } from '@repo/ui/components/ui/badge'

import {
  componentStatusLabels,
  componentTone,
  customerStatusLabels,
  label,
  priorityLabels,
  priorityTone,
  slaLabels,
  slaTone,
  statusLabels,
  statusTone
} from '@/lib/forgeHelpdesk'

export const StatusBadge = ({ status, audience = 'staff' }: { status: string; audience?: 'staff' | 'customer' }) => (
  <Badge size='sm' variant={statusTone(status)}>
    {label(audience === 'customer' ? customerStatusLabels : statusLabels, status)}
  </Badge>
)

export const PriorityBadge = ({ priority }: { priority: string }) => (
  <Badge size='sm' variant={priorityTone(priority)}>
    {label(priorityLabels, priority)}
  </Badge>
)

export const SlaBadge = ({ state }: { state: string | null | undefined }) =>
  state ? (
    <Badge size='sm' variant={slaTone(state)}>
      SLA {label(slaLabels, state).toLowerCase()}
    </Badge>
  ) : null

export const ComponentStatusBadge = ({ status }: { status: string }) => (
  <Badge size='sm' variant={componentTone(status)}>
    {label(componentStatusLabels, status)}
  </Badge>
)

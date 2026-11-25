import { Badge } from '@repo/ui/components/ui/badge'

/** Port slice 19: a forklift's service status (the asset's status). */
export const TRUCK_STATUS_LABELS: Record<string, string> = { active: 'In service', out_of_service: 'Out of service', retired: 'Retired' }

const TruckStatusBadge = ({ status }: { status: string }) => (
  <Badge size='sm' variant={status === 'active' ? 'tonalSuccess' : status === 'out_of_service' ? 'destructive' : 'secondary'} data-truck-status={status}>
    {TRUCK_STATUS_LABELS[status] || status.replace(/_/g, ' ')}
  </Badge>
)

export default TruckStatusBadge

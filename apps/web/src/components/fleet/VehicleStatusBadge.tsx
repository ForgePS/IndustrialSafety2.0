import { VEHICLE_STATUS_LABELS, type VehicleStatus } from '@/lib/forgeFleetRules'

const TONES: Record<string, string> = {
  active: 'bg-success/15 text-success',
  inactive: 'bg-secondary text-textSecondary',
  out_of_service: 'bg-destructive/15 text-destructive',
  removed: 'bg-secondary text-textSecondary',
  sold: 'bg-secondary text-textSecondary',
  disposed: 'bg-secondary text-textSecondary'
}

/** Port slice 11: a vehicle's service status. */
const VehicleStatusBadge = ({ status }: { status: string }) => (
  <span className={'inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ' + (TONES[status] || TONES.inactive)} data-vehicle-status={status}>
    {VEHICLE_STATUS_LABELS[status as VehicleStatus] || status}
  </span>
)

export const VehiclePill = ({ tone, children }: { tone: 'ok' | 'critical' | 'pending' | 'muted'; children: React.ReactNode }) => (
  <span
    className={
      'inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ' +
      { ok: 'bg-success/15 text-success', critical: 'bg-destructive/15 text-destructive', pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', muted: 'bg-secondary text-textSecondary' }[tone]
    }
    data-tone={tone}
  >
    {children}
  </span>
)

export default VehicleStatusBadge

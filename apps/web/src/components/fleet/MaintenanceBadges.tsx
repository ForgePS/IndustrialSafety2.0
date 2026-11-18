import { TbTruck } from 'react-icons/tb'

import FleetTabs, { type FleetTabKey } from '@/components/fleet/FleetTabs'
import type { ExpiryState, MaintenanceDueState } from '@/lib/forgeFleetRules'
import { MAINTENANCE_DUE_LABELS } from '@/lib/forgeFleetMaintenanceRules'

const TONES = {
  critical: 'bg-destructive/15 text-destructive',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  ok: 'bg-success/15 text-success',
  muted: 'bg-secondary text-textSecondary'
} as const

export type FleetTone = keyof typeof TONES

export const FleetPill = ({ tone, children, ...rest }: { tone: FleetTone; children: React.ReactNode; [data: `data-${string}`]: string }) => (
  <span className={'inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ' + TONES[tone]} data-tone={tone} {...rest}>
    {children}
  </span>
)

const DUE_TONES: Record<MaintenanceDueState, FleetTone> = { overdue: 'critical', due_soon: 'warning', scheduled: 'ok', unscheduled: 'muted', done: 'muted' }

export const MaintenanceDueBadge = ({ state }: { state: MaintenanceDueState }) => (
  <FleetPill tone={DUE_TONES[state]} data-due-state={state}>
    {MAINTENANCE_DUE_LABELS[state]}
  </FleetPill>
)

const EXPIRY_TONES: Record<ExpiryState, FleetTone> = { expired: 'critical', expiring: 'warning', ok: 'ok', none: 'muted' }

/** A date with its expiry colour: red expired, amber expiring within the warning window. */
export const ExpiryBadge = ({ state, label }: { state: ExpiryState; label: string }) => (
  <FleetPill tone={EXPIRY_TONES[state]} data-expiry={state}>
    {label}
  </FleetPill>
)

/** Title, subtitle, actions and the Fleet tab row, for the maintenance, drivers and settings pages. */
export const FleetPageHeader = ({
  active,
  permissions,
  title,
  subtitle,
  actions
}: {
  active: FleetTabKey
  permissions: string[]
  title: string
  subtitle: string
  actions?: React.ReactNode
}) => (
  <>
    <div className='flex flex-wrap items-end justify-between gap-4'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbTruck />
          {title}
        </h1>
        <p className='text-textSecondary mt-2'>{subtitle}</p>
      </div>
      {actions ? <div className='flex flex-wrap gap-2'>{actions}</div> : null}
    </div>
    <FleetTabs active={active} permissions={permissions} />
  </>
)

/** The viewer's allowed permission keys, for FleetTabs and button checks. */
export const allowedKeys = (context: { access: { effective: Array<{ permissionKey: string; allowed: boolean }> } }) =>
  context.access.effective.filter(item => item.allowed).map(item => item.permissionKey)

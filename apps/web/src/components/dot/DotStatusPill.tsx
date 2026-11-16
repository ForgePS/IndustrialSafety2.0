/** Worksheet / issue colours: 1.0 used green for on file, red for missing or expired, pink for expiring. */
const TONES = {
  ok: 'bg-success/15 text-success',
  critical: 'bg-destructive/15 text-destructive',
  pending: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  muted: 'bg-secondary text-textSecondary'
} as const

export type DotTone = keyof typeof TONES

const DotStatusPill = ({ tone, children }: { tone: DotTone; children: React.ReactNode }) => (
  <span className={'inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ' + TONES[tone]} data-tone={tone}>
    {children}
  </span>
)

export const issueTone = (kind: string): DotTone => (kind === 'expiring' || kind === 'sampleDue' ? 'pending' : 'critical')

export default DotStatusPill

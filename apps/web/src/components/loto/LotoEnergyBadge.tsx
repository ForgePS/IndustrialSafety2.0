import { lotoEnergyBadge } from '@/lib/forgeLotoRules'

/** Coloured energy badge (1.0 colours): the tag code if there is one, otherwise the energy letter. */
const LotoEnergyBadge = ({ code, energyType, label }: { code?: string | null; energyType?: string | null; label?: string }) => {
  const badge = lotoEnergyBadge(code, energyType)
  const text = code?.trim() || badge.letter || '?'

  return (
    <span
      className='inline-flex min-w-9 items-center justify-center rounded px-2 py-0.5 text-xs font-bold'
      style={{ background: badge.bg, color: badge.fg }}
      title={label || badge.label}
    >
      {text}
    </span>
  )
}

export default LotoEnergyBadge

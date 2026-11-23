import type { Standing } from '@/lib/forgeContractorRules'

/** Port slice 15: cleared / not cleared badge with the reasons on hover and for screen readers. */
const StandingBadge = ({ standing }: { standing: Standing }) => {
  const tone = !standing.cleared ? 'bg-error/10 text-error' : standing.warnings.length ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
  const label = !standing.cleared ? 'Not cleared' : standing.warnings.length ? 'Cleared, expiring soon' : 'Cleared'
  const detail = [...standing.problems, ...standing.warnings].map(item => item.message).join('; ')

  return (
    <span className={'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ' + tone} title={detail || undefined} data-standing={standing.cleared ? 'cleared' : 'not-cleared'}>
      {label}
      {detail ? <span className='sr-only'>: {detail}</span> : null}
    </span>
  )
}

export const ProblemList = ({ standing }: { standing: Standing }) =>
  standing.problems.length || standing.warnings.length ? (
    <ul className='flex flex-col gap-1 text-sm' data-standing-problems>
      {standing.problems.map(item => (
        <li key={item.code} className='text-error'>
          {item.message}
        </li>
      ))}
      {standing.warnings.map(item => (
        <li key={item.code} className='text-warning'>
          {item.message}
        </li>
      ))}
    </ul>
  ) : null

export default StandingBadge

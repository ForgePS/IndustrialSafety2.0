import Link from 'next/link'

import { todayIso } from '@/lib/forgeEnvironmental'
import { frequencyLabel, obligationState, obligationTypeLabel } from '@/lib/forgeEnvironmentalRules'

const STATE_TEXT: Record<string, string> = { overdue: 'Overdue', due_soon: 'Due soon', ok: '', inactive: 'Paused' }

/** Port slice 17: obligations with their next due date and whether they are overdue. */
const ObligationTable = ({ obligations, empty, showPermit = false }: { obligations: any[]; empty: string; showPermit?: boolean }) => {
  const today = todayIso()

  if (!obligations.length) return <p className='text-textSecondary text-sm'>{empty}</p>

  return (
    <table className='w-full border-collapse text-sm' data-obligation-list>
      <thead>
        <tr className='border-b text-left'>
          <th className='py-2 pr-4 font-semibold'>Obligation</th>
          <th className='py-2 pr-4 font-semibold'>Type</th>
          <th className='py-2 pr-4 font-semibold'>How often</th>
          {showPermit ? <th className='py-2 pr-4 font-semibold'>Permit</th> : null}
          <th className='py-2 font-semibold'>Next due</th>
        </tr>
      </thead>
      <tbody>
        {obligations.map(item => {
          const state = obligationState(item, today)

          return (
            <tr key={item.id} className={'border-b last:border-0 ' + (state === 'inactive' ? 'text-textSecondary' : '')} data-obligation={item.title}>
              <td className='py-2 pr-4'>
                <Link href={'/environmental/obligations/' + item.id} className='text-primary font-medium hover:underline'>
                  {item.title}
                </Link>
              </td>
              <td className='py-2 pr-4'>{obligationTypeLabel(item.obligation_type)}</td>
              <td className='py-2 pr-4'>{frequencyLabel(item.frequency)}</td>
              {showPermit ? <td className='py-2 pr-4'>{item.forge_env_permits?.title || '—'}</td> : null}
              <td className='py-2' data-obligation-state={state}>
                {item.next_due_on || '—'}
                {STATE_TEXT[state] ? <span className={state === 'overdue' ? 'text-error font-semibold' : state === 'due_soon' ? 'text-warning font-semibold' : ''}> ({STATE_TEXT[state]})</span> : null}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default ObligationTable

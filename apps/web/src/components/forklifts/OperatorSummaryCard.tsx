import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import type { ForkliftRights } from '@/lib/forgeForkliftAccess'
import { listOperators, viewGrant } from '@/lib/forgeForkliftAccess'
import { matchesStanding, operatorStandings } from '@/lib/forgeForkliftOperators'

/** Port slice 19: operator counts on the Forklifts overview, each linking to the filtered operator list. */
const OperatorSummaryCard = async ({ organizationId, rights }: { organizationId: string; rights: ForkliftRights }) => {
  if (!viewGrant(rights)) return null

  const operators = await listOperators({ organizationId, rights })
  const { standings, settings } = await operatorStandings(organizationId, operators)
  const count = (filter: string) => operators.filter(operator => matchesStanding(standings.get(operator.id) || 'none', filter)).length

  const tiles = [
    { key: 'current', label: 'Authorized to operate', tone: '' },
    { key: 'expiring', label: `Re-evaluation due within ${settings.expiry_notice_days} days`, tone: 'text-warning' },
    { key: 'expired', label: 'Evaluation expired', tone: 'text-error' },
    { key: 'refresher', label: 'Need refresher training', tone: 'text-error' },
    { key: 'suspended', label: 'Suspended', tone: 'text-error' }
  ]

  return (
    <Card data-operator-summary>
      <CardHeader className='flex flex-row items-center justify-between gap-2'>
        <CardTitle className='text-lg'>Operators</CardTitle>
        <Link href='/forklifts/operators' className='text-primary text-sm hover:underline'>
          All operators
        </Link>
      </CardHeader>
      <CardContent className='grid gap-3 sm:grid-cols-3 lg:grid-cols-5'>
        {tiles.map(tile => {
          const value = count(tile.key)

          return (
            <Link key={tile.key} href={`/forklifts/operators?standing=${tile.key}`} className='hover:border-primary rounded-md border p-3' data-operator-count={tile.key}>
              <p className={'text-2xl font-bold ' + (value && tile.tone ? tile.tone : '')}>{value}</p>
              <p className='text-textSecondary text-xs'>{tile.label}</p>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default OperatorSummaryCard

import Link from 'next/link'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { forkliftRights, operatorForPerson, rightsAt } from '@/lib/forgeForkliftAccess'
import { operatorStandings } from '@/lib/forgeForkliftOperators'
import { formatDate, STANDING_LABELS, standingTone } from '@/lib/forgeForkliftRules'

/**
 * Port slice 19: the person's forklift authorization on their personnel page (1.0 listed "Forklift qualification"
 * with the person's qualifications). Shown only when the viewer's forklift grant covers the person's location and
 * the person has an operator row.
 */
const PersonnelForkliftCard = async ({
  organizationId,
  userId,
  access,
  personnelId,
  locationId
}: {
  organizationId: string
  userId: string
  access: { effective: EffectivePermission[] }
  personnelId: string
  locationId: string | null
}) => {
  if (!access.effective.some(item => item.permissionKey.startsWith('forklifts.') && item.allowed)) return null

  const rights = await forkliftRights(organizationId, userId, access)

  if (!rightsAt(rights, locationId).view) return null

  const operator = await operatorForPerson(organizationId, personnelId)

  if (!operator) return null

  const { standings } = await operatorStandings(organizationId, [operator])
  const standing = standings.get(operator.id) || 'none'

  return (
    <Card data-testid='personnel-forklift-card'>
      <CardHeader className='flex flex-row items-center justify-between gap-2'>
        <CardTitle>Forklift authorization</CardTitle>
        <Link href={`/forklifts/operators/${operator.id}`} className='text-primary text-sm hover:underline' data-personnel-forklift-link>
          Open authorization
        </Link>
      </CardHeader>
      <CardContent className='flex flex-wrap items-center gap-4 text-sm'>
        <Badge variant={standingTone(standing)} data-operator-standing={standing}>
          {STANDING_LABELS[standing]}
        </Badge>
        <span>Classes {operator.truck_classes.join(', ')}</span>
        <span className='text-textSecondary'>Expires {formatDate(operator.expires_on)}</span>
      </CardContent>
    </Card>
  )
}

export default PersonnelForkliftCard

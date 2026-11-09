'use server'

import { revalidatePath } from 'next/cache'

import { runForgeAiMonitoringCycle } from '@/lib/forgeAiWatchNotify'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

// Recalculate every facility and division indicator now, then let Watch react to the new scores.
export const recalculateForgeAiRisk = async () => {
  const context = await requireTenantPermission('forge_ai.manage_watchers')

  try {
    const cycle = await runForgeAiMonitoringCycle({
      organizationId: context.activeOrganization.id,
      triggerType: 'manual',
      actorUserId: context.user.id
    })

    revalidatePath('/ai/risk')
    revalidatePath('/ai/watch')

    const scored = cycle.risk.scopes.filter(scope => scope.score != null).length

    return {
      message:
        'Recalculated ' +
        cycle.risk.scopes.length +
        ' scope(s) with model v' +
        cycle.risk.modelVersion +
        ': ' +
        scored +
        ' scored, ' +
        (cycle.risk.scopes.length - scored) +
        ' without enough data.'
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Risk recalculation failed.' }
  }
}

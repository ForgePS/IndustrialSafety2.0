'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { restoreVehicle } from '@/app/(back)/fleet/vehicleActions'

/** Port slice 11: put a removed vehicle back in the fleet as inactive (fleet.retire). */
const VehicleRestoreButton = ({ vehicleId }: { vehicleId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size='sm'
      variant='outline'
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await restoreVehicle({ vehicleId })

          if (result.error) toast('error', result.error)
          else {
            toast('success', result.message || 'Restored.')
            router.refresh()
          }
        })
      }
    >
      Restore
    </Button>
  )
}

export default VehicleRestoreButton

'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

type Result = { error?: string; message?: string }

/** Port slice 14: a button that runs one server action, with an optional confirm, then refreshes. */
const ActionButton = ({
  run,
  label,
  confirm,
  variant = 'outline',
  goTo,
  ...rest
}: {
  run: () => Promise<Result>
  label: string
  confirm?: string
  variant?: 'outline' | 'default' | 'destructive'
  goTo?: string
} & Record<`data-${string}`, string | boolean>) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type='button'
      variant={variant}
      disabled={pending}
      {...rest}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return
        startTransition(async () => {
          const result = await run()

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Done.')
          if (goTo) router.push(goTo)
          else router.refresh()
        })
      }}
    >
      {pending ? 'Working...' : label}
    </Button>
  )
}

export default ActionButton

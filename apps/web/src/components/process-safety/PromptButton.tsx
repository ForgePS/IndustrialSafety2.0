'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

type Result = { error?: string; message?: string }

/** Port slice 16: a button that asks for a reason, then runs one server action with it. */
const PromptButton = ({ run, label, question, variant = 'outline', ...rest }: { run: (reason: string) => Promise<Result>; label: string; question: string; variant?: 'outline' | 'destructive' } & Record<`data-${string}`, string | boolean>) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type='button'
      variant={variant}
      disabled={pending}
      {...rest}
      onClick={() => {
        const reason = window.prompt(question)

        if (reason === null) return
        startTransition(async () => {
          const result = await run(reason)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Done.')
          router.refresh()
        })
      }}
    >
      {pending ? 'Working...' : label}
    </Button>
  )
}

export default PromptButton

'use client'

import { useCallback, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

export type ActionResult = { ok: boolean; error?: string; conflict?: boolean; [key: string]: any }
export type Notice = { tone: 'ok' | 'error'; text: string } | null

// Runs a server action inside a transition, surfaces its message, and refreshes server data on success
// or on an optimistic-lock conflict so the user sees the latest version.
export const useActionRunner = () => {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<Notice>(null)

  const run = useCallback(
    (fn: () => Promise<ActionResult>, success?: string, after?: (result: ActionResult) => void) =>
      start(async () => {
        setNotice(null)

        try {
          const result = await fn()

          if (!result.ok) {
            setNotice({ tone: 'error', text: result.error || 'Something went wrong.' })
            if (result.conflict) router.refresh()

            return
          }

          after?.(result)
          setNotice(success ? { tone: result.warning ? 'error' : 'ok', text: result.warning ? `${success} ${result.warning}` : success } : null)
          router.refresh()
        } catch {
          setNotice({ tone: 'error', text: 'The request failed. Check your connection and try again.' })
        }
      }),
    [router]
  )

  return { pending, notice, setNotice, run }
}

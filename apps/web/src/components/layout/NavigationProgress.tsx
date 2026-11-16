'use client'

import { useEffect, useState } from 'react'

import { usePathname, useSearchParams } from 'next/navigation'

/**
 * A thin bar across the top of the screen from the moment an in-app link is clicked until the new page
 * arrives. App Router keeps the old page on screen while the server renders the next one; on a slow page
 * that looks like a click that did nothing. `loading.tsx` only covers top-level module changes, so this
 * covers every link (list rows, cards, tabs).
 */
const NavigationProgress = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [active, setActive] = useState(false)

  // The new page has rendered.
  useEffect(() => setActive(false), [pathname, searchParams])

  useEffect(() => {
    // Capture phase: next/link calls preventDefault in its own handler, so a bubbling listener can't tell a
    // client navigation from a cancelled click.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as Element | null)?.closest?.('a')

      if (!anchor || !anchor.href || anchor.hasAttribute('download')) return
      if (anchor.target && anchor.target !== '_self') return

      const url = new URL(anchor.href, window.location.href)

      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return

      setActive(true)
    }

    const stop = () => setActive(false)

    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', stop)

    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', stop)
    }
  }, [])

  // Never leave the bar up if a navigation fails or is abandoned.
  useEffect(() => {
    if (!active) return

    const timer = window.setTimeout(() => setActive(false), 20000)

    return () => window.clearTimeout(timer)
  }, [active])

  if (!active) return null

  return (
    <div role='progressbar' aria-label='Loading page' data-testid='navigation-progress' className='pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1 overflow-hidden'>
      <div className='bg-primary h-full w-full animate-pulse' />
    </div>
  )
}

export default NavigationProgress

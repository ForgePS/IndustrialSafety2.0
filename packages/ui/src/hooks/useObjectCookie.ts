// React Imports
import { useMemo } from 'react'

// Third-party Imports
import { useCookie } from 'react-use'

/** Cookie attributes passed through to js-cookie (via react-use). Without `expires` the cookie ends with the browser session. */
export type ObjectCookieOptions = { expires?: number; path?: string; sameSite?: 'strict' | 'lax' | 'none'; secure?: boolean }

export const useObjectCookie = <T>(key: string, fallback?: T | null, options?: ObjectCookieOptions): [T, (newVal: T) => void] => {
  // Hooks
  const [valStr, updateCookie] = useCookie(key)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<T>(() => (valStr ? JSON.parse(valStr) : fallback), [valStr])

  const updateValue = (newVal: T) => {
    updateCookie(JSON.stringify(newVal), options)
  }

  return [value, updateValue]
}

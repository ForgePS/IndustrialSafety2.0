/**
 * Helpers for reading past the Supabase API row cap (`max_rows`, 1,000 in supabase/config.toml). `.limit(n)`
 * can't raise that cap, so anything that must see every row pages with `.range()`.
 */

const PAGE = 1000

/**
 * Every row of a query, a page at a time. `build` returns a fresh query each call (a builder can't be reused
 * once it has run) and must end in an order on a unique column so pages don't overlap or skip rows.
 */
export const fetchAllRows = async <T = any>(build: () => any, failure: string): Promise<T[]> => {
  const rows: T[] = []

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)

    if (error) throw new Error(failure + ': ' + error.message)

    rows.push(...((data || []) as T[]))

    if (!data || data.length < PAGE) return rows
  }
}

/** Splits a list for `.in()` lookups, so each request stays short and under the row cap. */
export const inChunks = <T>(items: T[], size = 200): T[][] => {
  const out: T[][] = []

  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))

  return out
}

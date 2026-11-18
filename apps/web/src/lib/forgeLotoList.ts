/**
 * Batch 1: pure helpers for organizing the LOTO procedure list and the lockout search
 * (summary counts, filters, sorting, paging, URL params). No imports, so unit tests can load it.
 */

export const LOTO_PAGE_SIZES = [10, 25, 50, 100] as const
export const LOTO_DEFAULT_PAGE_SIZE = 25

export const LOTO_SORT_KEYS = ['title', 'number', 'status', 'review', 'updated'] as const
export type LotoSortKey = (typeof LOTO_SORT_KEYS)[number]
export type SortDir = 'asc' | 'desc'

/** `active` hides retired procedures (the default view); `all` shows every status. */
export type LotoListParams = {
  q: string
  status: string
  location: string
  division: string
  sort: LotoSortKey
  dir: SortDir
  page: number
  size: number
}

export const LOTO_LIST_DEFAULTS: LotoListParams = {
  q: '',
  status: 'active',
  location: '',
  division: '',
  sort: 'updated',
  dir: 'desc',
  page: 1,
  size: LOTO_DEFAULT_PAGE_SIZE
}

type RawParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || ''

const positiveInt = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const parseLotoListParams = (raw: RawParams): LotoListParams => {
  const sort = first(raw.sort) as LotoSortKey
  const dir = first(raw.dir)
  const size = positiveInt(first(raw.size), LOTO_DEFAULT_PAGE_SIZE)

  return {
    q: first(raw.q).trim().slice(0, 200),
    status: first(raw.status).trim() || LOTO_LIST_DEFAULTS.status,
    location: first(raw.location).trim(),
    division: first(raw.division).trim(),
    sort: LOTO_SORT_KEYS.includes(sort) ? sort : LOTO_LIST_DEFAULTS.sort,
    dir: dir === 'asc' || dir === 'desc' ? dir : LOTO_SORT_KEYS.includes(sort) && sort !== 'updated' ? 'asc' : LOTO_LIST_DEFAULTS.dir,
    page: positiveInt(first(raw.page), 1),
    size: (LOTO_PAGE_SIZES as readonly number[]).includes(size) ? size : LOTO_DEFAULT_PAGE_SIZE
  }
}

/** Query string for the list, leaving out defaults. Any change other than `page` sends you back to page 1. */
export const lotoListQuery = (current: LotoListParams, patch: Partial<LotoListParams> = {}) => {
  const next: LotoListParams = { ...current, ...patch }

  if (!('page' in patch)) next.page = 1

  const params = new URLSearchParams()

  if (next.q) params.set('q', next.q)
  if (next.status !== LOTO_LIST_DEFAULTS.status) params.set('status', next.status)
  if (next.location) params.set('location', next.location)
  if (next.division) params.set('division', next.division)

  if (next.sort !== LOTO_LIST_DEFAULTS.sort || next.dir !== LOTO_LIST_DEFAULTS.dir) {
    params.set('sort', next.sort)
    params.set('dir', next.dir)
  }

  if (next.page > 1) params.set('page', String(next.page))
  if (next.size !== LOTO_DEFAULT_PAGE_SIZE) params.set('size', String(next.size))

  const query = params.toString()

  return query ? '?' + query : ''
}

/** Clicking a column: same column flips direction, a new one starts ascending (updated starts newest first). */
export const nextSort = (current: LotoListParams, key: LotoSortKey): Pick<LotoListParams, 'sort' | 'dir'> =>
  current.sort === key ? { sort: key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { sort: key, dir: key === 'updated' ? 'desc' : 'asc' }

export type LotoListRow = {
  id: string
  procedure_number: string
  title: string
  status: string
  next_review_date: string | null
  updated_at: string | null
  assetName: string | null
  assetNumber: string | null
  locationId: string | null
  locationName: string | null
  divisionId: string | null
  divisionName: string | null
}

export const LOTO_NO_LOCATION = 'none'

export const filterLotoRows = <T extends LotoListRow>(rows: T[], params: Pick<LotoListParams, 'q' | 'status' | 'location' | 'division'>) => {
  const q = params.q.trim().toLowerCase()

  return rows.filter(row => {
    if (params.status === 'active' ? row.status === 'retired' : params.status !== 'all' && row.status !== params.status) return false
    if (params.location && (params.location === LOTO_NO_LOCATION ? row.locationId : row.locationId !== params.location)) return false
    if (params.division && (params.division === LOTO_NO_LOCATION ? row.divisionId : row.divisionId !== params.division)) return false
    if (!q) return true

    return [row.procedure_number, row.title, row.assetName, row.assetNumber, row.locationName, row.divisionName].some(value =>
      String(value || '').toLowerCase().includes(q)
    )
  })
}

const STATUS_ORDER: Record<string, number> = { draft: 1, review: 2, approved: 3, retired: 4 }

const compareText = (a: string | null, b: string | null) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' })

/** Sorted copy. Blank review dates always go last; ties fall back to the procedure number. */
export const sortLotoRows = <T extends LotoListRow>(rows: T[], sort: LotoSortKey, dir: SortDir) => {
  const sign = dir === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    let result = 0

    if (sort === 'review') {
      if (!a.next_review_date || !b.next_review_date) {
        if (a.next_review_date !== b.next_review_date) return a.next_review_date ? -1 : 1
      } else result = sign * a.next_review_date.localeCompare(b.next_review_date)
    } else if (sort === 'updated') result = sign * String(a.updated_at || '').localeCompare(String(b.updated_at || ''))
    else if (sort === 'status') result = sign * ((STATUS_ORDER[a.status] || 9) - (STATUS_ORDER[b.status] || 9))
    else if (sort === 'title') result = sign * compareText(a.title, b.title)
    else result = sign * compareText(a.procedure_number, b.procedure_number)

    return result || compareText(a.procedure_number, b.procedure_number)
  })
}

export const paginate = <T>(rows: T[], page: number, size: number) => {
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, page), pageCount)
  const start = (current - 1) * size

  return {
    rows: rows.slice(start, start + size),
    page: current,
    pageCount,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(start + size, total)
  }
}

export type LotoListStats = { procedures: number; drafts: number; reviews: number; active: number; openLockouts: number }

/** 1.0's summary cards. Retired procedures are not counted; open lockouts are passed in. */
export const lotoListStats = (procedures: Array<{ status: string }>, openLockouts: number): LotoListStats => {
  const current = procedures.filter(item => item.status !== 'retired')

  return {
    procedures: current.length,
    drafts: current.filter(item => item.status === 'draft').length,
    reviews: current.filter(item => item.status === 'review').length,
    active: current.filter(item => item.status === 'approved').length,
    openLockouts
  }
}

/** Distinct {id, name} options, sorted by name, with a "none" entry when some rows have no value. */
export const distinctOptions = (rows: Array<{ id: string | null; name: string | null }>) => {
  const map = new Map<string, string>()
  let missing = false

  for (const row of rows) {
    if (row.id) map.set(row.id, row.name || row.id)
    else missing = true
  }

  const options = Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => compareText(a.name, b.name))

  return missing ? [...options, { id: LOTO_NO_LOCATION, name: 'Not set' }] : options
}

// ---------------------------------------------------------------------------
// Lockout search
// ---------------------------------------------------------------------------

export type LockoutSearch = { q: string; holder: string; asset: string; procedure: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const parseLockoutSearch = (raw: RawParams): LockoutSearch => {
  const holder = first(raw.holder).trim()
  const asset = first(raw.asset).trim()
  const procedure = first(raw.procedure).trim()

  return {
    q: first(raw.q).trim().slice(0, 100),
    holder: lockHolderFromKey(holder) ? holder : '',
    asset: UUID.test(asset) ? asset : '',
    procedure: UUID.test(procedure) ? procedure : ''
  }
}

/** A lock holder is a person (`p:<personnel id>`) or a typed name (`n:<lower-case name>`). */
export const lockHolderKey = (lock: { personnel_id: string | null; holder_name: string | null }) =>
  lock.personnel_id ? 'p:' + lock.personnel_id : 'n:' + String(lock.holder_name || '').trim().toLowerCase()

export const lockHolderFromKey = (key: string): { personnelId: string } | { name: string } | null => {
  if (key.startsWith('p:') && UUID.test(key.slice(2))) return { personnelId: key.slice(2) }
  if (key.startsWith('n:') && key.slice(2).trim()) return { name: key.slice(2).trim() }

  return null
}

/** Strip characters that would break a PostgREST `or=(...ilike...)` filter, and the LIKE wildcards `%` / `*`. */
export const searchTermForIlike = (value: string) =>
  value
    .replace(/[,()"'\\:%*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const lockoutSearchQuery = (view: 'open' | 'history', search: LockoutSearch) => {
  const params = new URLSearchParams()

  if (view === 'history') params.set('view', 'history')
  if (search.q) params.set('q', search.q)
  if (search.holder) params.set('holder', search.holder)
  if (search.asset) params.set('asset', search.asset)
  if (search.procedure) params.set('procedure', search.procedure)

  const query = params.toString()

  return query ? '?' + query : ''
}

/**
 * Left-menu groups, matching 1.0's Industrial menu (forge-platform
 * packages/contracts/src/industrial.ts, INDUSTRIAL_MODULE_REGISTRY). A menu entry's category names
 * its group; Creator can move an entry by editing that category. Groups appear in 1.0's order;
 * Forge AI has no 1.0 counterpart and sits just before System Tools. Any other category comes after
 * the known groups, before System Tools.
 */
export const NAV_GROUP_ORDER = [
  'People & Training',
  'Incident & Claims',
  'Risk & Prevention',
  'Compliance Programs',
  'Equipment & Operations',
  'High-Risk Work',
  'Facility & Operations Safety',
  'Emergency Management',
  'Forge AI',
  'System Tools'
] as const

const LAST_GROUP = 'System Tools'

export type NavEntry = { id: string; label: string; route: string | null; category: string; sortOrder: number }

export type NavGroup<T extends NavEntry> = { name: string; items: T[] }

const rank = (name: string) => {
  const index = (NAV_GROUP_ORDER as readonly string[]).indexOf(name)

  if (index >= 0) return name === LAST_GROUP ? NAV_GROUP_ORDER.length + 1 : index

  return NAV_GROUP_ORDER.length
}

/** Menu entries grouped by category, groups in 1.0's order, entries by sort order within each. */
export const groupNavigation = <T extends NavEntry>(items: readonly T[]): NavGroup<T>[] => {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const name = item.category?.trim() || LAST_GROUP
    const list = groups.get(name) ?? []

    list.push(item)
    groups.set(name, list)
  }

  return [...groups.entries()]
    .map(([name, list]) => ({ name, items: [...list].sort((a, b) => a.sortOrder - b.sortOrder) }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
}

const matches = (pathname: string, route: string) => pathname === route || pathname.startsWith(route.replace(/\/+$/, '') + '/')

/**
 * The route of the entry for the current page: the longest one the path falls under, so
 * /ai/watch marks AI Watch, not Forge AI as well, and /company/settings/forms marks Form Designer.
 */
export const activeRoute = (pathname: string, routes: readonly (string | null)[]) =>
  routes
    .filter((route): route is string => Boolean(route) && matches(pathname, route as string))
    .sort((a, b) => b.length - a.length)[0] ?? null

import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@repo/supabase/server'

import { DOCUMENT_COLUMNS, grantFor, type DocumentAccess, type DocumentContext } from '@/lib/forgeDocumentAccess'
import { BUILT_IN_DOCUMENT_FOLDERS, REVIEW_INTERVAL_OPTIONS, compareFolderNames, documentReaches, type AudienceMember, type Distribution } from '@/lib/forgeDocumentRules'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { getTenantContext } from '@/lib/forgeTenantContext'

/**
 * Port slice 12: server helpers for the Document Control library and document record pages (agent A).
 * Same access rules as forgeDocumentAccess.documentAccessFor, computed in bulk for the library list.
 */

const db = () => createServiceRoleClient() as any

export const DOCUMENT_PERMISSION_KEYS = ['documents.view', 'documents.manage', 'documents.approve', 'documents.view_acknowledgments', 'documents.settings'] as const

const loadDocumentsContext = async () => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return null

  const access = await getEffectiveTenantAccess({ organizationId: context.activeOrganization.id, userId: context.user.id })
  const permission = access.effective.find(item => (DOCUMENT_PERMISSION_KEYS as readonly string[]).includes(item.permissionKey) && item.allowed)

  if (!permission) return null

  return { ...context, user: context.user, activeOrganization: context.activeOrganization, permission, access } as DocumentContext & typeof context & { access: typeof access }
}

/** For route handlers: the context when the user holds any Document Control permission, else null. */
export const documentsContextOrNull = loadDocumentsContext

/** For pages: like requireTenantPermission, for any Document Control permission. */
export const requireDocumentsAccess = async () => {
  const context = await loadDocumentsContext()

  if (!context) redirect('/dashboard')

  return context
}

export const allowedKeys = (context: { access: { effective: Array<{ permissionKey: string; allowed: boolean }> } }) =>
  context.access.effective.filter(item => item.allowed).map(item => item.permissionKey)

/** The current user's location / department / role data that distribution rules match on. */
export const loadAudienceMember = async (organizationId: string, userId: string): Promise<AudienceMember> => {
  const supabase = db()

  const [{ data: person }, { data: locations }, { data: roles }] = await Promise.all([
    supabase.from('forge_personnel').select('location_id, department_id').eq('organization_id', organizationId).eq('auth_user_id', userId).is('archived_at', null).limit(1).maybeSingle(),
    supabase.from('forge_tenant_user_location_access').select('location_id').eq('organization_id', organizationId).eq('user_id', userId),
    supabase.from('forge_tenant_user_roles').select('role_id').eq('organization_id', organizationId).eq('user_id', userId)
  ])

  return {
    locationIds: [...new Set<string>([person?.location_id, ...(locations || []).map((row: any) => row.location_id)].filter(Boolean))],
    departmentIds: person?.department_id ? [person.department_id] : [],
    roleIds: (roles || []).map((row: any) => row.role_id)
  }
}

type ScopeDoc = { location_id: string | null; owner_user_id: string | null; created_by: string | null }

/** A synchronous scope check for one permission, for filtering many documents at once. */
const scopeChecker = async (context: DocumentContext, permissionKey: string): Promise<(doc: ScopeDoc) => boolean> => {
  const grant = grantFor(context, permissionKey)

  if (!grant) return () => false
  if (!grant.scope || grant.scope === 'organization') return () => true

  const userId = context.user.id
  const own = (doc: ScopeDoc) => doc.owner_user_id === userId || doc.created_by === userId

  if (grant.scope !== 'location' && grant.scope !== 'division') return own

  const assignments = await getTenantScopeAssignments({ organizationId: context.activeOrganization.id, userId })
  let locationIds = assignments.locationIds as string[]

  if (grant.scope === 'division') {
    const { data } = assignments.divisionIds.length
      ? await db().from('locations').select('id').eq('organization_id', context.activeOrganization.id).in('division_id', assignments.divisionIds)
      : { data: [] }

    locationIds = ((data || []) as { id: string }[]).map(row => row.id)
  }

  const allowed = new Set(locationIds)

  return doc => own(doc) || Boolean(doc.location_id && allowed.has(doc.location_id))
}

export type LibraryRow = { id: string; document_number: string; name: string; category: string | null; location_id: string | null; status: string; [key: string]: any; access: DocumentAccess }

/** Every document the user can open (active or archived), with what they may do with each. */
export const loadLibraryDocuments = async (context: DocumentContext, { archived = false }: { archived?: boolean } = {}): Promise<LibraryRow[]> => {
  const organizationId = context.activeOrganization.id
  let query = db().from('forge_documents').select(DOCUMENT_COLUMNS).eq('organization_id', organizationId)

  query = archived ? query.not('archived_at', 'is', null).order('archived_at', { ascending: false }) : query.is('archived_at', null).order('name')

  const { data } = await query
  const docs = (data || []) as any[]

  if (!docs.length) return []

  const [manage, approve, viewAcknowledgments] = await Promise.all([
    scopeChecker(context, 'documents.manage'),
    scopeChecker(context, 'documents.approve'),
    scopeChecker(context, 'documents.view_acknowledgments')
  ])

  const canView = Boolean(grantFor(context, 'documents.view'))
  const published = docs.filter(doc => doc.status === 'published' && !doc.archived_at)
  let reaches: (id: string) => boolean = () => false

  if (canView && published.length) {
    const [member, { data: rows }] = await Promise.all([
      loadAudienceMember(organizationId, context.user.id),
      db()
        .from('forge_document_distributions')
        .select('document_id, scope_type, scope_id')
        .eq('organization_id', organizationId)
        .in(
          'document_id',
          published.map(doc => doc.id)
        )
    ])

    const byDoc = new Map<string, Distribution[]>()

    for (const row of (rows || []) as any[]) byDoc.set(row.document_id, [...(byDoc.get(row.document_id) || []), { scope_type: row.scope_type, scope_id: row.scope_id }])
    reaches = id => documentReaches(byDoc.get(id) || [], member)
  }

  return docs
    .map(doc => {
      const access: DocumentAccess = {
        manage: manage(doc),
        approve: approve(doc),
        viewAcknowledgments: viewAcknowledgments(doc),
        read: canView && doc.status === 'published' && !doc.archived_at && reaches(doc.id)
      }

      return { ...doc, access }
    })
    .filter(doc => doc.access.manage || doc.access.approve || doc.access.viewAcknowledgments || doc.access.read)
}

export type NamedOption = { id: string; name: string }

export const loadLocations = async (organizationId: string): Promise<(NamedOption & { active: boolean })[]> => {
  const { data } = await db().from('locations').select('id, name, is_active').eq('organization_id', organizationId).order('name')

  return ((data || []) as any[]).map(row => ({ id: row.id, name: row.name, active: row.is_active !== false }))
}

/** Locations, departments and roles for the distribution editor. */
export const loadDistributionOptions = async (organizationId: string) => {
  const [locations, { data: departments }, { data: roles }] = await Promise.all([
    loadLocations(organizationId),
    db().from('forge_departments').select('id, name, is_active').eq('organization_id', organizationId).order('name'),
    db().from('forge_tenant_roles').select('id, name, is_active').eq('organization_id', organizationId).order('sort_order').order('name')
  ])

  return {
    location: locations.filter(row => row.active).map(({ id, name }) => ({ id, name })),
    department: ((departments || []) as any[]).filter(row => row.is_active !== false).map(row => ({ id: row.id as string, name: row.name as string })),
    role: ((roles || []) as any[]).filter(row => row.is_active !== false).map(row => ({ id: row.id as string, name: row.name as string }))
  }
}

/** Active members of the organization (for the owner picker). */
export const loadMembers = async (organizationId: string): Promise<NamedOption[]> => {
  const { data: members } = await db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true)
  const ids = [...new Set<string>((members || []).map((row: any) => row.user_id))]

  return (await userNames(ids)).sort((a, b) => a.name.localeCompare(b.name))
}

/** Display names for user ids (profile name, else email). */
export const userNames = async (ids: (string | null | undefined)[]): Promise<NamedOption[]> => {
  const unique = [...new Set(ids.filter(Boolean) as string[])]

  if (!unique.length) return []

  const { data } = await db().from('users').select('user_id, name, email').in('user_id', unique)

  return unique.map(id => {
    const row = ((data || []) as any[]).find(item => item.user_id === id)

    return { id, name: row?.name || row?.email || 'Unknown user' }
  })
}

/** Stored folders plus document counts per category (active documents), for mergeDocumentFolders. */
export const loadFolderInputs = async (organizationId: string) => {
  const [{ data: stored }, { data: docs }] = await Promise.all([
    db().from('forge_document_folders').select('id, name').eq('organization_id', organizationId),
    db().from('forge_documents').select('category, archived_at').eq('organization_id', organizationId)
  ])

  const counts = new Map<string, { category: string; count: number }>()

  for (const doc of (docs || []) as any[]) {
    if (!doc.category) continue
    const key = String(doc.category).toLowerCase()
    const entry = counts.get(key) || { category: doc.category, count: 0 }

    if (!doc.archived_at) entry.count += 1
    counts.set(key, entry)
  }

  return { stored: ((stored || []) as any[]).map(row => ({ id: row.id as string, name: row.name as string })), categoryCounts: [...counts.values()] }
}

/** Options for the create / edit document form. Location managers only see their own locations. */
export const loadDocumentFormOptions = async (context: DocumentContext, current?: { locationId: string | null; interval: number | null }) => {
  const organizationId = context.activeOrganization.id
  const grant = grantFor(context, 'documents.manage')
  const [locations, members, folderInputs] = await Promise.all([loadLocations(organizationId), loadMembers(organizationId), loadFolderInputs(organizationId)])
  const limited = grant?.scope === 'location' || grant?.scope === 'division'
  let allowedLocations = locations.filter(location => location.active || location.id === current?.locationId)

  if (limited) {
    const check = await scopeChecker(context, 'documents.manage')

    allowedLocations = allowedLocations.filter(location => location.id === current?.locationId || check({ location_id: location.id, owner_user_id: null, created_by: null }))
  }

  const folders = [...new Set([...BUILT_IN_DOCUMENT_FOLDERS, ...folderInputs.stored.map(row => row.name), ...folderInputs.categoryCounts.map(row => row.category)])].sort((a, b) =>
    compareFolderNames(a, b)
  )

  const intervals = [...new Set<number>([...REVIEW_INTERVAL_OPTIONS, ...(current?.interval ? [current.interval] : [])])].sort((a, b) => a - b)

  return {
    locations: allowedLocations.map(({ id, name }) => ({ id, name })),
    members,
    folders,
    intervals,
    allowCompanyWide: !limited
  }
}

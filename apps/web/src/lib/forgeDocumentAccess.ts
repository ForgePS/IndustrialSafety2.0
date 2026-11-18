import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { documentReaches, type AudienceMember, type Distribution } from '@/lib/forgeDocumentRules'

/**
 * Port slice 12: who can see and manage a controlled document, and the shared loaders. Server only. Every
 * Document Control page, action and route checks access through here.
 *
 * - documents.view: published documents distributed to you (see forge_document_reaches_user). Obsolete,
 *   draft and in-review documents are hidden from view-only users, and they can only open the current version.
 * - documents.manage / documents.approve / documents.view_acknowledgments: every document in the grant's scope.
 *   organization = all; location / division = documents at your locations / divisions (company-wide documents,
 *   with no location, need organization scope); own = documents you own or created.
 */

const db = () => createServiceRoleClient() as any

export type DocumentGrant = { scope: string | null } | null

export type DocumentContext = {
  user: { id: string; email?: string | null }
  activeOrganization: { id: string; name?: string | null }
  permission: { scope: string | null }
  access: { effective: { permissionKey: string; allowed: boolean; scope: string | null }[] }
}

export type DocumentScopeRow = {
  organization_id: string
  location_id: string | null
  owner_user_id?: string | null
  created_by?: string | null
}

export const DOCUMENT_COLUMNS =
  'id, organization_id, document_number, name, description, category, location_id, status, owner_user_id, review_interval_months, review_due_on, last_reviewed_on, last_reviewed_by, requires_acknowledgment, current_version_id, obsolete_reason, obsoleted_at, obsoleted_by, archived_at, archived_by, created_by, updated_by, created_at, updated_at'

export const VERSION_COLUMNS =
  'id, organization_id, document_id, version_number, file_name, content_type, size_bytes, storage_path, change_summary, status, submitted_by, submitted_at, approved_by, approved_at, effective_on, approval_note, rejected_by, rejected_at, rejection_reason, superseded_at, created_by, created_at'

export const grantFor = (context: Pick<DocumentContext, 'access'>, permissionKey: string): DocumentGrant => {
  const grant = context.access.effective.find(item => item.permissionKey === permissionKey && item.allowed)

  return grant ? { scope: grant.scope ?? 'organization' } : null
}

const locationDivisions = async (organizationId: string, locationId: string) => {
  const { data } = await db().from('locations').select('division_id').eq('organization_id', organizationId).eq('id', locationId).maybeSingle()

  return data?.division_id as string | null | undefined
}

export const documentWithinScope = async ({
  organizationId,
  userId,
  scope,
  doc
}: {
  organizationId: string
  userId: string
  scope: string | null
  doc: DocumentScopeRow
}) => {
  if (doc.organization_id !== organizationId) return false
  if (!scope || scope === 'organization') return true
  if (doc.owner_user_id === userId || doc.created_by === userId) return true
  if (scope === 'own' || scope === 'assigned' || !doc.location_id) return false

  const assignments = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location') return assignments.locationIds.includes(doc.location_id)

  if (scope === 'division') {
    const divisionId = await locationDivisions(organizationId, doc.location_id)

    return Boolean(divisionId && assignments.divisionIds.includes(divisionId))
  }

  return false
}

/**
 * The PostgREST `or=()` filter limiting a forge_documents query to a grant's scope, or null for organization
 * scope. Returned as a string because awaiting a query builder runs it.
 */
export const documentScopeFilter = async ({ organizationId, userId, scope }: { organizationId: string; userId: string; scope: string | null }) => {
  if (!scope || scope === 'organization') return null

  const filters = [`owner_user_id.eq.${userId}`, `created_by.eq.${userId}`]

  if (scope === 'location' || scope === 'division') {
    const assignments = await getTenantScopeAssignments({ organizationId, userId })
    let locationIds = assignments.locationIds

    if (scope === 'division' && assignments.divisionIds.length) {
      const { data } = await db().from('locations').select('id').eq('organization_id', organizationId).in('division_id', assignments.divisionIds)

      locationIds = ((data || []) as { id: string }[]).map(row => row.id)
    } else if (scope === 'division') {
      locationIds = []
    }

    if (locationIds.length) filters.push(`location_id.in.(${locationIds.join(',')})`)
  }

  return filters.join(',')
}

/** Whether the user reaches the document through its distribution (database rule). */
export const documentReachesUser = async (documentId: string, userId: string) => {
  const { data, error } = await db().rpc('forge_document_reaches_user', { p_document_id: documentId, p_user_id: userId })

  if (error) throw new Error('Unable to check the document distribution: ' + error.message)

  return Boolean(data)
}

export type DocumentAccess = {

  /** Can see every state of the document (manager, approver or acknowledgment viewer in scope). */
  manage: boolean
  approve: boolean
  viewAcknowledgments: boolean

  /** View-only access: published and distributed to the user. */
  read: boolean
}

/** What the current user may do with a document, or null when they can't open it at all. */
export const documentAccessFor = async (context: DocumentContext, doc: DocumentScopeRow & { id: string; status: string; archived_at: string | null }): Promise<DocumentAccess | null> => {
  const organizationId = context.activeOrganization.id
  const userId = context.user.id

  if (doc.organization_id !== organizationId) return null

  const within = async (key: string) => {
    const grant = grantFor(context, key)

    return grant ? documentWithinScope({ organizationId, userId, scope: grant.scope, doc }) : false
  }

  const [manage, approve, viewAcknowledgments] = await Promise.all([within('documents.manage'), within('documents.approve'), within('documents.view_acknowledgments')])

  const read =
    Boolean(grantFor(context, 'documents.view')) && doc.status === 'published' && !doc.archived_at && (await documentReachesUser(doc.id, userId))

  if (!manage && !approve && !viewAcknowledgments && !read) return null

  return { manage, approve, viewAcknowledgments, read }
}

export const loadDocument = async (organizationId: string, documentId: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null

  const { data } = await db().from('forge_documents').select(DOCUMENT_COLUMNS).eq('organization_id', organizationId).eq('id', documentId).maybeSingle()

  return data as any | null
}

export const loadVersions = async (organizationId: string, documentId: string) => {
  const { data } = await db()
    .from('forge_document_versions')
    .select(VERSION_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('document_id', documentId)
    .order('version_number', { ascending: false })

  return (data || []) as any[]
}

export const loadDistributions = async (organizationId: string, documentId: string): Promise<Distribution[]> => {
  const { data } = await db().from('forge_document_distributions').select('scope_type, scope_id').eq('organization_id', organizationId).eq('document_id', documentId)

  return (data || []) as Distribution[]
}

export type DocumentSettings = {
  allow_self_approval: boolean
  default_review_interval_months: number
  review_warning_days: number
}

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = { allow_self_approval: false, default_review_interval_months: 12, review_warning_days: 30 }

export const loadDocumentSettings = async (organizationId: string): Promise<DocumentSettings> => {
  const { data } = await db()
    .from('forge_document_settings')
    .select('allow_self_approval, default_review_interval_months, review_warning_days')
    .eq('organization_id', organizationId)
    .maybeSingle()

  return { ...DEFAULT_DOCUMENT_SETTINGS, ...(data || {}) }
}

export const documentActivity = async ({
  organizationId,
  documentId,
  versionId = null,
  actorUserId,
  type,
  message,
  metadata = {}
}: {
  organizationId: string
  documentId: string
  versionId?: string | null
  actorUserId: string | null
  type: string
  message: string
  metadata?: Record<string, unknown>
}) => {
  await db().from('forge_document_activity').insert({
    organization_id: organizationId,
    document_id: documentId,
    version_id: versionId,
    actor_user_id: actorUserId,
    activity_type: type,
    message: message.slice(0, 1000),
    metadata
  })
}

// ---------------------------------------------------------------------------
// Audience (who must read and acknowledge)
// ---------------------------------------------------------------------------

export type AudiencePerson = AudienceMember & {
  userId: string
  personnelId: string | null
  name: string
  email: string | null
}

/**
 * Every active member who holds documents.view, with the location / department / role data distribution rules
 * match on. Same matching as forge_document_reaches_user.
 */
export const documentViewers = async (organizationId: string): Promise<AudiencePerson[]> => {
  const supabase = db()

  const { data: members } = await supabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true)
  const userIds = [...new Set<string>((members || []).map((row: any) => row.user_id))]

  if (!userIds.length) return []

  const [{ data: personnel }, { data: locationAccess }, { data: roles }, { data: users }] = await Promise.all([
    supabase
      .from('forge_personnel')
      .select('id, auth_user_id, first_name, last_name, preferred_name, email, location_id, department_id')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .in('auth_user_id', userIds),
    supabase.from('forge_tenant_user_location_access').select('user_id, location_id').eq('organization_id', organizationId).in('user_id', userIds),
    supabase.from('forge_tenant_user_roles').select('user_id, role_id').eq('organization_id', organizationId).in('user_id', userIds),
    supabase.from('users').select('user_id, name, email').in('user_id', userIds)
  ])

  const viewers = await Promise.all(
    userIds.map(async userId => {
      const access = await getEffectiveTenantAccess({ organizationId, userId })

      return access.effective.some(item => item.permissionKey === 'documents.view' && item.allowed) ? userId : null
    })
  )

  return viewers
    .filter((userId): userId is string => Boolean(userId))
    .map(userId => {
      const person = (personnel || []).find((row: any) => row.auth_user_id === userId)
      const profile = (users || []).find((row: any) => row.user_id === userId)
      const personName = person ? [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(' ') : ''

      return {
        userId,
        personnelId: person?.id ?? null,
        name: personName || profile?.name || profile?.email || 'Unknown user',
        email: person?.email || profile?.email || null,
        locationIds: [
          ...new Set<string>([person?.location_id, ...(locationAccess || []).filter((row: any) => row.user_id === userId).map((row: any) => row.location_id)].filter(Boolean))
        ],
        departmentIds: person?.department_id ? [person.department_id] : [],
        roleIds: (roles || []).filter((row: any) => row.user_id === userId).map((row: any) => row.role_id)
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The people a document's distribution reaches. */
export const documentAudience = async (organizationId: string, documentId: string, viewers?: AudiencePerson[]) => {
  const [people, distributions] = await Promise.all([viewers ? Promise.resolve(viewers) : documentViewers(organizationId), loadDistributions(organizationId, documentId)])

  return people.filter(person => documentReaches(distributions, person))
}

/** Published documents the user must still acknowledge (current version, distributed to them). */
export const pendingAcknowledgments = async (organizationId: string, userId: string) => {
  const supabase = db()

  const { data: docs } = await supabase
    .from('forge_documents')
    .select(DOCUMENT_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('status', 'published')
    .eq('requires_acknowledgment', true)
    .is('archived_at', null)
    .not('current_version_id', 'is', null)
    .order('name')

  const list = (docs || []) as any[]

  if (!list.length) return []

  const { data: acks } = await supabase
    .from('forge_document_acknowledgments')
    .select('version_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .in(
      'version_id',
      list.map(doc => doc.current_version_id)
    )

  const done = new Set<string>((acks || []).map((row: any) => row.version_id))
  const open = list.filter(doc => !done.has(doc.current_version_id))
  const reached = await Promise.all(open.map(async doc => ((await documentReachesUser(doc.id, userId)) ? doc : null)))

  return reached.filter(Boolean) as any[]
}

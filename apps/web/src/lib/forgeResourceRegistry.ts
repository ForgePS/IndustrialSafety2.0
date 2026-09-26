import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess, type EffectivePermission } from './forgeEffectiveAccess'
import { getTenantScopeAssignments } from './forgeScope'
import { getTenantContext, type TenantContextOrganization } from './forgeTenantContext'

type TenantUser = NonNullable<Awaited<ReturnType<typeof getTenantContext>>['user']>

export type ForgeResourceType =
  | 'observation'
  | 'risk_register'
  | 'jsa'
  | 'corrective_action'
  | 'task'
  | 'incident'
  | 'inspection'
  | 'inspection_finding'
  | 'asset'
  | 'loto_procedure'
  | 'loto_application'
  | 'training_course'
  | 'training_assignment'
  | 'personnel'
  | 'support_ticket'

export type ForgeResourceScopeMode =
  | 'ORGANIZATION'
  | 'LOCATION'
  | 'DIVISION'
  | 'LOCATION_DIVISION'
  | 'CUSTOM'

export type ForgeResourceDescriptor = {
  resourceType: ForgeResourceType
  /** INTERNAL only — never accept table names from the client. */
  table: string
  featureKey: string | null
  defaultViewPermission: string
  defaultManagePermission: string
  scopeMode: ForgeResourceScopeMode
  numberColumn?: string
  titleColumn?: string
  statusColumn?: string
  archivedColumn?: string
}

export type ResolvedForgeResource = {
  resourceType: ForgeResourceType
  resourceId: string
  organizationId: string
  locationId: string | null
  divisionId: string | null
  featureKey: string | null
  archived: boolean
  lifecycleState: string | null
  /** Server-only row payload — do not serialize to clients. */
  source: Record<string, unknown>
}

export const FORGE_RESOURCE_TYPES: ForgeResourceType[] = [
  'observation',
  'risk_register',
  'jsa',
  'corrective_action',
  'task',
  'incident',
  'inspection',
  'inspection_finding',
  'asset',
  'loto_procedure',
  'loto_application',
  'training_course',
  'training_assignment',
  'personnel',
  'support_ticket'
]

const RESOURCE_DESCRIPTORS: Record<ForgeResourceType, ForgeResourceDescriptor> = {
  observation: {
    resourceType: 'observation',
    table: 'forge_observations',
    featureKey: 'observations',
    defaultViewPermission: 'observations.view',
    defaultManagePermission: 'observations.edit',
    scopeMode: 'LOCATION_DIVISION',
    numberColumn: 'observation_number',
    titleColumn: 'title',
    statusColumn: 'status',
    archivedColumn: 'archived_at'
  },
  risk_register: {
    resourceType: 'risk_register',
    table: 'forge_risks',
    featureKey: 'risk_register',
    defaultViewPermission: 'risk_register.view',
    defaultManagePermission: 'risk_register.edit',
    scopeMode: 'LOCATION_DIVISION',
    numberColumn: 'risk_number',
    titleColumn: 'title',
    statusColumn: 'status',
    archivedColumn: 'archived_at'
  },
  jsa: {
    resourceType: 'jsa',
    table: 'forge_jsas',
    featureKey: 'jsa_jha',
    defaultViewPermission: 'jsa_jha.view',
    defaultManagePermission: 'jsa_jha.edit',
    scopeMode: 'LOCATION_DIVISION',
    numberColumn: 'jsa_number',
    titleColumn: 'title',
    statusColumn: 'status',
    archivedColumn: 'archived_at'
  },
  corrective_action: {
    resourceType: 'corrective_action',
    table: 'forge_corrective_actions',
    featureKey: 'corrective_actions',
    defaultViewPermission: 'corrective_actions.view',
    defaultManagePermission: 'corrective_actions.edit',
    scopeMode: 'LOCATION_DIVISION',
    numberColumn: 'action_number',
    titleColumn: 'title',
    statusColumn: 'status',
    archivedColumn: 'archived_at'
  },
  task: {
    resourceType: 'task',
    table: 'forge_tasks',
    featureKey: 'tasks',
    defaultViewPermission: 'tasks.view',
    defaultManagePermission: 'tasks.edit',
    scopeMode: 'LOCATION_DIVISION',
    numberColumn: 'task_number',
    titleColumn: 'title',
    statusColumn: 'status',
    archivedColumn: 'archived_at'
  },
  incident: {
    resourceType: 'incident',
    table: 'forge_incidents',
    featureKey: 'incidents',
    defaultViewPermission: 'incidents.view',
    defaultManagePermission: 'incidents.edit',
    scopeMode: 'LOCATION_DIVISION',
    numberColumn: 'incident_number',
    titleColumn: 'summary',
    statusColumn: 'status'
    // no archived_at column
  },
  inspection: {
    resourceType: 'inspection',
    table: 'forge_inspections',
    featureKey: 'inspections',
    defaultViewPermission: 'inspections.view',
    defaultManagePermission: 'inspections.edit',
    scopeMode: 'LOCATION_DIVISION',
    numberColumn: 'inspection_number',
    titleColumn: 'template_name_snapshot',
    statusColumn: 'status'
    // no archived_at column
  },
  inspection_finding: {
    resourceType: 'inspection_finding',
    table: 'forge_inspection_findings',
    featureKey: 'inspections',
    defaultViewPermission: 'inspections.view',
    defaultManagePermission: 'inspections.edit',
    scopeMode: 'CUSTOM',
    titleColumn: 'title',
    statusColumn: 'status'
    // no location_id / division_id / archived_at — scope via parent inspection
  },
  asset: {
    resourceType: 'asset',
    table: 'forge_assets',
    featureKey: 'assets_equipment',
    defaultViewPermission: 'assets_equipment.view',
    defaultManagePermission: 'assets_equipment.edit',
    scopeMode: 'LOCATION_DIVISION',
    numberColumn: 'asset_number',
    titleColumn: 'name',
    statusColumn: 'status',
    archivedColumn: 'retired_at'
  },
  loto_procedure: {
    resourceType: 'loto_procedure',
    table: 'forge_loto_procedures',
    featureKey: 'loto',
    defaultViewPermission: 'loto.view',
    defaultManagePermission: 'loto.edit',
    scopeMode: 'CUSTOM',
    numberColumn: 'procedure_number',
    titleColumn: 'title',
    statusColumn: 'status',
    archivedColumn: 'retired_at'
    // no location_id / division_id — scope via linked asset
  },
  loto_application: {
    resourceType: 'loto_application',
    table: 'forge_loto_applications',
    featureKey: 'loto',
    defaultViewPermission: 'loto.view',
    defaultManagePermission: 'loto.execute',
    scopeMode: 'CUSTOM',
    statusColumn: 'status'
    // no location_id / division_id / number — scope via linked asset
  },
  training_course: {
    resourceType: 'training_course',
    table: 'forge_training_courses',
    featureKey: 'training',
    defaultViewPermission: 'training.view',
    defaultManagePermission: 'training.assign',
    scopeMode: 'ORGANIZATION',
    numberColumn: 'course_code',
    titleColumn: 'title'
    // no location_id / division_id / status / archived_at
  },
  training_assignment: {
    resourceType: 'training_assignment',
    table: 'forge_training_assignments',
    featureKey: 'training',
    defaultViewPermission: 'training.view',
    defaultManagePermission: 'training.assign',
    scopeMode: 'CUSTOM',
    statusColumn: 'status'
    // no location_id / division_id — scope via personnel
  },
  personnel: {
    resourceType: 'personnel',
    table: 'forge_personnel',
    featureKey: 'personnel',
    defaultViewPermission: 'personnel.view',
    defaultManagePermission: 'personnel.edit',
    scopeMode: 'CUSTOM',
    numberColumn: 'employee_number',
    titleColumn: 'last_name',
    statusColumn: 'employment_status',
    archivedColumn: 'archived_at'
  },
  support_ticket: {
    resourceType: 'support_ticket',
    table: 'forge_support_tickets',
    featureKey: 'customer_support',
    defaultViewPermission: 'customer_support.view',
    defaultManagePermission: 'customer_support.company_reply',
    scopeMode: 'CUSTOM',
    numberColumn: 'ticket_number',
    titleColumn: 'subject',
    statusColumn: 'status'
    // no location_id / division_id / archived_at
  }
}

export const isForgeResourceType = (value: string): value is ForgeResourceType =>
  (FORGE_RESOURCE_TYPES as string[]).includes(value)

export const getResourceDescriptor = (
  resourceType: string
): ForgeResourceDescriptor | null => {
  if (!isForgeResourceType(resourceType)) return null
  return RESOURCE_DESCRIPTORS[resourceType]
}

/** Compatibility wrapper for callers that previously used getResourceTableMeta. */
export const getResourceTableMeta = (resourceType: ForgeResourceType) => {
  const descriptor = RESOURCE_DESCRIPTORS[resourceType]
  return {
    table: descriptor.table,
    numberColumn: descriptor.numberColumn,
    titleColumn: descriptor.titleColumn,
    permissionKey: descriptor.defaultViewPermission
  }
}

const asRow = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const asNullableString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

type OrgScopedQuery = {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
      }
    }
  }
}

const orgTable = (table: string): OrgScopedQuery => {
  const supabase = createServiceRoleClient() as any
  return supabase.from(table) as OrgScopedQuery
}

const enrichScopeFromRelated = async ({
  organizationId,
  resourceType,
  row
}: {
  organizationId: string
  resourceType: ForgeResourceType
  row: Record<string, unknown>
}): Promise<{ locationId: string | null; divisionId: string | null }> => {
  let locationId = asNullableString(row.location_id)
  let divisionId = asNullableString(row.division_id)

  if (resourceType === 'inspection_finding') {
    const inspectionId = asNullableString(row.inspection_id)
    if (inspectionId) {
      const { data } = await orgTable('forge_inspections')
        .select('location_id, division_id')
        .eq('organization_id', organizationId)
        .eq('id', inspectionId)
        .maybeSingle()
      const parent = asRow(data)
      if (parent) {
        locationId = asNullableString(parent.location_id)
        divisionId = asNullableString(parent.division_id)
      }
    }
    return { locationId, divisionId }
  }

  if (resourceType === 'loto_procedure' || resourceType === 'loto_application') {
    const assetId = asNullableString(row.asset_id)
    if (assetId) {
      const { data } = await orgTable('forge_assets')
        .select('location_id, division_id')
        .eq('organization_id', organizationId)
        .eq('id', assetId)
        .maybeSingle()
      const asset = asRow(data)
      if (asset) {
        locationId = asNullableString(asset.location_id)
        divisionId = asNullableString(asset.division_id)
      }
    }
    return { locationId, divisionId }
  }

  if (resourceType === 'training_assignment') {
    const personnelId = asNullableString(row.personnel_id)
    if (personnelId) {
      const { data } = await orgTable('forge_personnel')
        .select('location_id, division_id, auth_user_id')
        .eq('organization_id', organizationId)
        .eq('id', personnelId)
        .maybeSingle()
      const personnel = asRow(data)
      if (personnel) {
        locationId = asNullableString(personnel.location_id)
        divisionId = asNullableString(personnel.division_id)
        row._personnel_auth_user_id = personnel.auth_user_id
      }
    }
    return { locationId, divisionId }
  }

  return { locationId, divisionId }
}

export const resolveForgeResource = async ({
  organizationId,
  resourceType,
  resourceId
}: {
  organizationId: string
  resourceType: ForgeResourceType | string
  resourceId: string
}): Promise<{ resource: ResolvedForgeResource; error?: undefined } | { resource?: undefined; error: string }> => {
  const descriptor = getResourceDescriptor(resourceType)
  if (!descriptor) return { error: 'Unsupported resource type.' }
  if (!resourceId) return { error: 'Record not found.' }

  const { data, error } = await orgTable(descriptor.table)
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', resourceId)
    .maybeSingle()

  if (error) return { error: error.message }
  const row = asRow(data)
  if (!row) return { error: 'Record not found.' }

  const orgId = asNullableString(row.organization_id)
  if (!orgId || orgId !== organizationId) return { error: 'Record not found.' }

  const enriched = await enrichScopeFromRelated({
    organizationId,
    resourceType: descriptor.resourceType,
    row
  })

  const archivedValue = descriptor.archivedColumn ? row[descriptor.archivedColumn] : null
  const archived = Boolean(archivedValue)
  const lifecycleState = descriptor.statusColumn
    ? asNullableString(row[descriptor.statusColumn])
    : null

  return {
    resource: {
      resourceType: descriptor.resourceType,
      resourceId,
      organizationId: orgId,
      locationId: enriched.locationId,
      divisionId: enriched.divisionId,
      featureKey: descriptor.featureKey,
      archived,
      lifecycleState,
      source: row
    }
  }
}

const matchesLocationScope = (
  locationId: string | null,
  locationIds: string[]
): boolean => Boolean(locationId && locationIds.includes(locationId))

const matchesDivisionScope = (
  divisionId: string | null,
  divisionIds: string[]
): boolean => Boolean(divisionId && divisionIds.includes(divisionId))

const isOwnOrAssigned = (resource: ResolvedForgeResource, userId: string): boolean => {
  const source = resource.source
  const createdBy = asNullableString(source.created_by)
  const assignedUser =
    asNullableString(source.assigned_user_id) ||
    asNullableString(source.assigned_to_user_id) ||
    asNullableString(source.custodian_user_id)
  const reportedBy = asNullableString(source.reported_by_user_id)
  const startedBy = asNullableString(source.started_by)
  const inspector = asNullableString(source.inspector_user_id)

  return (
    createdBy === userId ||
    assignedUser === userId ||
    reportedBy === userId ||
    startedBy === userId ||
    inspector === userId
  )
}

const customResourceWithinScope = async ({
  organizationId,
  userId,
  scope,
  resource
}: {
  organizationId: string
  userId: string
  scope: string | null
  resource: ResolvedForgeResource
}): Promise<boolean> => {
  const source = resource.source

  if (resource.resourceType === 'support_ticket') {
    const requester = asNullableString(source.requester_user_id)
    if (requester === userId) return true
    if (scope === 'organization') return true

    const access = await getEffectiveTenantAccess({ organizationId, userId })
    const companyAccess = access.effective.some(
      item =>
        (item.permissionKey === 'customer_support.company_view' ||
          item.permissionKey === 'customer_support.company_reply') &&
        item.allowed
    )
    return companyAccess
  }

  if (resource.resourceType === 'personnel') {
    const authUserId = asNullableString(source.auth_user_id)
    if (scope === 'organization') return true
    if (scope === 'own') return authUserId === userId
    if (scope === 'assigned') {
      return (
        authUserId === userId || asNullableString(source.supervisor_user_id) === userId
      )
    }
    if (scope === 'location') {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      return matchesLocationScope(resource.locationId, locationIds) || authUserId === userId
    }
    if (scope === 'division') {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      return matchesDivisionScope(resource.divisionId, divisionIds) || authUserId === userId
    }
    return authUserId === userId
  }

  if (resource.resourceType === 'training_assignment') {
    const personnelAuth = asNullableString(source._personnel_auth_user_id)
    if (scope === 'organization') return true
    if (scope === 'own' || scope === 'assigned') return personnelAuth === userId
    if (scope === 'location') {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      return matchesLocationScope(resource.locationId, locationIds) || personnelAuth === userId
    }
    if (scope === 'division') {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      return matchesDivisionScope(resource.divisionId, divisionIds) || personnelAuth === userId
    }
    return false
  }

  if (
    resource.resourceType === 'loto_procedure' ||
    resource.resourceType === 'loto_application' ||
    resource.resourceType === 'inspection_finding'
  ) {
    if (scope === 'organization') return true
    if (scope === 'own' || scope === 'assigned') return isOwnOrAssigned(resource, userId)
    if (scope === 'location') {
      if (!resource.locationId) return false
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      return matchesLocationScope(resource.locationId, locationIds) || isOwnOrAssigned(resource, userId)
    }
    if (scope === 'division') {
      if (!resource.divisionId) return false
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      return matchesDivisionScope(resource.divisionId, divisionIds) || isOwnOrAssigned(resource, userId)
    }
    return false
  }

  return false
}

export const resourceWithinEffectiveScope = async ({
  organizationId,
  userId,
  scope,
  resource
}: {
  organizationId: string
  userId: string
  scope: string | null
  resource: ResolvedForgeResource
}): Promise<boolean> => {
  if (resource.organizationId !== organizationId) return false

  const descriptor = RESOURCE_DESCRIPTORS[resource.resourceType]

  if (descriptor.scopeMode === 'CUSTOM') {
    return customResourceWithinScope({ organizationId, userId, scope, resource })
  }

  if (descriptor.scopeMode === 'ORGANIZATION' || scope === 'organization') {
    return true
  }

  if (scope === 'own' || scope === 'assigned') {
    return isOwnOrAssigned(resource, userId)
  }

  const assignments = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location' || descriptor.scopeMode === 'LOCATION') {
    // Null location_id is only reachable under organization scope.
    if (!resource.locationId) return false
    return (
      matchesLocationScope(resource.locationId, assignments.locationIds) ||
      isOwnOrAssigned(resource, userId)
    )
  }

  if (scope === 'division' || descriptor.scopeMode === 'DIVISION') {
    if (!resource.divisionId) return false
    return (
      matchesDivisionScope(resource.divisionId, assignments.divisionIds) ||
      isOwnOrAssigned(resource, userId)
    )
  }

  if (descriptor.scopeMode === 'LOCATION_DIVISION') {
    // Permission scope may still be location or division; LOCATION_DIVISION allows either match.
    const locationOk = matchesLocationScope(resource.locationId, assignments.locationIds)
    const divisionOk = matchesDivisionScope(resource.divisionId, assignments.divisionIds)
    if (locationOk || divisionOk) return true
    return isOwnOrAssigned(resource, userId)
  }

  return false
}

export type ForgeResourceAccessOk = {
  ok: true
  context: {
    user: TenantUser
    organizations: TenantContextOrganization[]
    activeOrganization: TenantContextOrganization
  }
  access: Awaited<ReturnType<typeof getEffectiveTenantAccess>>
  permission: EffectivePermission
  resource: ResolvedForgeResource
}

export type ForgeResourceAccessDenied = {
  ok: false
  error: string
}

export type ForgeResourceAccessResult = ForgeResourceAccessOk | ForgeResourceAccessDenied

const requireForgeResourceAccess = async ({
  resourceType,
  resourceId,
  permissionKey,
  mode
}: {
  resourceType: string
  resourceId: string
  permissionKey?: string
  mode: 'view' | 'manage'
}): Promise<ForgeResourceAccessResult> => {
  const context = await getTenantContext()
  if (!context.user || !context.activeOrganization) {
    return { ok: false, error: 'Not found.' }
  }

  if (!isForgeResourceType(resourceType)) {
    return { ok: false, error: 'Not found.' }
  }

  const descriptor = RESOURCE_DESCRIPTORS[resourceType]
  const requiredPermission =
    permissionKey ||
    (mode === 'manage' ? descriptor.defaultManagePermission : descriptor.defaultViewPermission)

  const access = await getEffectiveTenantAccess({
    organizationId: context.activeOrganization.id,
    userId: context.user.id
  })

  const permission = access.effective.find(
    item => item.permissionKey === requiredPermission && item.allowed
  )
  if (!permission) {
    return { ok: false, error: 'Not found.' }
  }

  const resolved = await resolveForgeResource({
    organizationId: context.activeOrganization.id,
    resourceType,
    resourceId
  })
  if (resolved.error || !resolved.resource) {
    return { ok: false, error: 'Not found.' }
  }

  if (resolved.resource.organizationId !== context.activeOrganization.id) {
    return { ok: false, error: 'Not found.' }
  }

  const inScope = await resourceWithinEffectiveScope({
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    scope: permission.scope,
    resource: resolved.resource
  })
  if (!inScope) {
    return { ok: false, error: 'Not found.' }
  }

  return {
    ok: true,
    context: {
      user: context.user,
      organizations: context.organizations,
      activeOrganization: context.activeOrganization
    },
    access,
    permission,
    resource: resolved.resource
  }
}

export const requireForgeResourceView = async ({
  resourceType,
  resourceId,
  permissionKey
}: {
  resourceType: string
  resourceId: string
  permissionKey?: string
}): Promise<ForgeResourceAccessResult> =>
  requireForgeResourceAccess({ resourceType, resourceId, permissionKey, mode: 'view' })

export const requireForgeResourceManage = async ({
  resourceType,
  resourceId,
  permissionKey
}: {
  resourceType: string
  resourceId: string
  permissionKey?: string
}): Promise<ForgeResourceAccessResult> =>
  requireForgeResourceAccess({ resourceType, resourceId, permissionKey, mode: 'manage' })

export const requireCompatibleForgeResources = async ({
  sourceResourceType,
  sourceResourceId,
  targetResourceType,
  targetResourceId
}: {
  sourceResourceType: string
  sourceResourceId: string
  targetResourceType: string
  targetResourceId: string
}): Promise<
  | {
      ok: true
      context: ForgeResourceAccessOk['context']
      access: ForgeResourceAccessOk['access']
      source: ResolvedForgeResource
      target: ResolvedForgeResource
      sourcePermission: EffectivePermission
      targetPermission: EffectivePermission
    }
  | ForgeResourceAccessDenied
> => {
  const sourceAccess = await requireForgeResourceManage({
    resourceType: sourceResourceType,
    resourceId: sourceResourceId
  })
  if (!sourceAccess.ok) {
    return { ok: false, error: 'Not found.' }
  }

  const targetViewPermission = getResourceDescriptor(targetResourceType)?.defaultViewPermission
  const targetAccess = await requireForgeResourceView({
    resourceType: targetResourceType,
    resourceId: targetResourceId,
    permissionKey: targetViewPermission || undefined
  })
  if (!targetAccess.ok) {
    return { ok: false, error: 'Not found.' }
  }

  if (sourceAccess.resource.organizationId !== targetAccess.resource.organizationId) {
    return { ok: false, error: 'Not found.' }
  }

  if (
    sourceAccess.context.activeOrganization.id !== sourceAccess.resource.organizationId ||
    targetAccess.context.activeOrganization.id !== targetAccess.resource.organizationId
  ) {
    return { ok: false, error: 'Not found.' }
  }

  return {
    ok: true,
    context: sourceAccess.context,
    access: sourceAccess.access,
    source: sourceAccess.resource,
    target: targetAccess.resource,
    sourcePermission: sourceAccess.permission,
    targetPermission: targetAccess.permission
  }
}

/** Thin compatibility loader — prefer resolveForgeResource / requireForgeResource*. */
export const loadOrgResource = async ({
  organizationId,
  resourceType,
  resourceId
}: {
  organizationId: string
  resourceType: ForgeResourceType
  resourceId: string
}) => {
  const resolved = await resolveForgeResource({ organizationId, resourceType, resourceId })
  if (resolved.error || !resolved.resource) {
    return { error: resolved.error || 'Record not found.', record: null as Record<string, unknown> | null }
  }
  return { error: null as string | null, record: resolved.resource.source }
}

export const resourceDisplayLabel = (
  resourceType: ForgeResourceType,
  record: Record<string, unknown>
) => {
  const meta = RESOURCE_DESCRIPTORS[resourceType]
  const number = meta.numberColumn ? String(record[meta.numberColumn] || '') : ''

  let title = ''
  if (resourceType === 'personnel') {
    const first = String(record.first_name || '')
    const last = String(record.last_name || '')
    title = [first, last].filter(Boolean).join(' ')
  } else if (meta.titleColumn) {
    title = String(record[meta.titleColumn] || '')
  }

  if (number && title) return number + ' · ' + title
  return number || title || String(record.id || resourceType)
}

export const hasEffectivePermission = (
  access: Awaited<ReturnType<typeof getEffectiveTenantAccess>>,
  permissionKey: string
) => access.effective.some(item => item.permissionKey === permissionKey && item.allowed)

type EffectiveTenantAccess = Awaited<ReturnType<typeof getEffectiveTenantAccess>>

const isResolvedForgeResource = (
  value: ResolvedForgeResource | { resourceType: string; resourceId: string }
): value is ResolvedForgeResource =>
  'organizationId' in value && typeof (value as ResolvedForgeResource).organizationId === 'string'

/**
 * Authoritative check that a specific permission is allowed AND its own scope
 * covers the target resource. Prefer this over hasEffectivePermission whenever
 * the permission gates a resource-scoped operation.
 */
export const requireForgePermissionForResource = async ({
  permissionKey,
  resource,
  access: preloadedAccess,
  organizationId: organizationIdInput,
  userId: userIdInput
}: {
  permissionKey: string
  resource: ResolvedForgeResource | { resourceType: string; resourceId: string }
  access?: EffectiveTenantAccess
  organizationId?: string
  userId?: string
}): Promise<
  | {
      ok: true
      permission: EffectivePermission
      access: EffectiveTenantAccess
      resource: ResolvedForgeResource
      organizationId: string
      userId: string
    }
  | ForgeResourceAccessDenied
> => {
  let organizationId = organizationIdInput
  let userId = userIdInput

  if (!organizationId || !userId) {
    const context = await getTenantContext()
    if (!context.user || !context.activeOrganization) {
      return { ok: false, error: 'Not found.' }
    }
    organizationId = organizationId || context.activeOrganization.id
    userId = userId || context.user.id
  }

  let resolved: ResolvedForgeResource
  if (isResolvedForgeResource(resource)) {
    resolved = resource
  } else {
    if (!isForgeResourceType(resource.resourceType)) {
      return { ok: false, error: 'Not found.' }
    }
    const loaded = await resolveForgeResource({
      organizationId,
      resourceType: resource.resourceType,
      resourceId: resource.resourceId
    })
    if (loaded.error || !loaded.resource) {
      return { ok: false, error: 'Not found.' }
    }
    resolved = loaded.resource
  }

  if (resolved.organizationId !== organizationId) {
    return { ok: false, error: 'Not found.' }
  }

  const access =
    preloadedAccess ||
    (await getEffectiveTenantAccess({
      organizationId,
      userId
    }))

  const permission = access.effective.find(
    item => item.permissionKey === permissionKey && item.allowed
  )
  if (!permission) {
    return { ok: false, error: 'Not found.' }
  }

  const inScope = await resourceWithinEffectiveScope({
    organizationId,
    userId,
    scope: permission.scope,
    resource: resolved
  })
  if (!inScope) {
    return { ok: false, error: 'Not found.' }
  }

  return {
    ok: true,
    permission,
    access,
    resource: resolved,
    organizationId,
    userId
  }
}

/** Boolean helper for permission + that permission's resource scope. */
export const permissionAllowsResource = async ({
  access,
  permissionKey,
  organizationId,
  userId,
  resource
}: {
  access?: EffectiveTenantAccess
  permissionKey: string
  organizationId?: string
  userId?: string
  resource: ResolvedForgeResource | { resourceType: string; resourceId: string }
}): Promise<boolean> => {
  const result = await requireForgePermissionForResource({
    permissionKey,
    resource,
    access,
    organizationId,
    userId
  })
  return result.ok
}

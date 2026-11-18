import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { jsaWithinScope } from '@/lib/forgeJsa'

/**
 * Authoritative JSA assignment validation.
 * Service role performs authorized mutation.
 * Service role DOES NOT determine authorization — this helper does.
 * Used by create JSA action, AI draft execution, and template create paths.
 */
export type ResolveJsaAssignmentInput = {
  organizationId: string
  userId: string
  /** Effective permission scope for jsa_jha.create (or equivalent). */
  scope: string | null
  locationId?: string | null
  divisionId?: string | null
  preparedByPersonnelId?: string | null
}

export type ResolveJsaAssignmentResult =
  | {
      ok: true
      locationId: string | null
      divisionId: string | null
      preparedByPersonnelId: string | null
      preparedByUserId: string | null
    }
  | { ok: false; error: string }

const clean = (value: string | null | undefined) => {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

export const resolveAndAuthorizeJsaAssignment = async ({
  organizationId,
  userId,
  scope,
  locationId,
  divisionId,
  preparedByPersonnelId
}: ResolveJsaAssignmentInput): Promise<ResolveJsaAssignmentResult> => {
  const supabase = createServiceRoleClient() as any
  const location = clean(locationId)
  const division = clean(divisionId)
  const preparedBy = clean(preparedByPersonnelId)

  if (location) {
    const { data } = await supabase
      .from('locations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', location)
      .maybeSingle()
    if (!data) {
      return { ok: false, error: 'Selected location is invalid for this organization.' }
    }
  }

  if (division) {
    const { data } = await supabase
      .from('divisions')
      .select('id, location_id')
      .eq('organization_id', organizationId)
      .eq('id', division)
      .maybeSingle()
    if (!data) {
      return { ok: false, error: 'Selected division is invalid for this organization.' }
    }
    if (location && data.location_id && data.location_id !== location) {
      return {
        ok: false,
        error: 'Selected division does not belong to the selected location.'
      }
    }
  }

  let preparedByUserId: string | null = null
  if (preparedBy) {
    const { data: person } = await supabase
      .from('forge_personnel')
      .select('id, auth_user_id')
      .eq('organization_id', organizationId)
      .eq('id', preparedBy)
      .maybeSingle()
    if (!person) {
      return { ok: false, error: 'Selected personnel is invalid for this organization.' }
    }
    preparedByUserId = (person.auth_user_id as string | null) || null
  }

  const candidate = {
    organization_id: organizationId,
    created_by: userId,
    prepared_by_personnel_id: preparedBy,
    location_id: location,
    division_id: division
  }

  const allowed = await jsaWithinScope({
    organizationId,
    userId,
    scope,
    jsa: candidate
  })

  if (!allowed) {
    return {
      ok: false,
      error: 'The selected JSA assignment is outside your permission scope.'
    }
  }

  return {
    ok: true,
    locationId: location,
    divisionId: division,
    preparedByPersonnelId: preparedBy,
    preparedByUserId
  }
}

/**
 * Resolve the requester's current jsa_jha.create scope at AI execution time.
 * Approval by a privileged admin must not expand an employee's out-of-scope request.
 */
export const resolveRequesterJsaCreateScope = async ({
  organizationId,
  requesterUserId
}: {
  organizationId: string
  requesterUserId: string
}): Promise<{ ok: true; scope: string | null } | { ok: false; error: string }> => {
  const access = await getEffectiveTenantAccess({
    organizationId,
    userId: requesterUserId
  })

  const permission = access.effective.find(
    item => item.permissionKey === 'jsa_jha.create' && item.allowed
  )

  if (!permission) {
    return {
      ok: false,
      error: 'Original requester no longer has jsa_jha.create permission.'
    }
  }

  return { ok: true, scope: permission.scope }
}

/**
 * True when this JSA row is the currently executable ACTIVE revision.
 */
export const assertJsaIsExecutableActive = async ({
  organizationId,
  jsaId
}: {
  organizationId: string
  jsaId: string
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const supabase = createServiceRoleClient() as any
  const { data: jsa } = await supabase
    .from('forge_jsas')
    .select('id, status, parent_jsa_id, active_version_id, archived_at')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (!jsa) return { ok: false, error: 'JSA not found.' }
  if (jsa.archived_at) return { ok: false, error: 'Archived JSAs cannot be executed.' }
  if (jsa.status !== 'active') {
    return {
      ok: false,
      error: 'Only an ACTIVE JSA revision may be executed. Current status: ' + jsa.status + '.'
    }
  }

  const rootId = jsa.parent_jsa_id || jsa.id
  const { data: root } = await supabase
    .from('forge_jsas')
    .select('id, active_version_id, status')
    .eq('organization_id', organizationId)
    .eq('id', rootId)
    .maybeSingle()

  if (!root) return { ok: false, error: 'JSA lineage root not found.' }

  if (root.active_version_id && root.active_version_id !== jsaId) {
    return {
      ok: false,
      error: 'Execution is only allowed against the current active revision for this JSA lineage.'
    }
  }

  // Legacy single-row active JSAs (no pointer yet): the row itself must be active.
  if (!root.active_version_id && jsaId !== rootId && jsa.status === 'active') {
    // Child active without root pointer — treat as invalid lineage state.
    return {
      ok: false,
      error: 'JSA lineage active_version_id is missing; activate through controlled lifecycle first.'
    }
  }

  return { ok: true }
}

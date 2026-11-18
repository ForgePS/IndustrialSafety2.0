import { createServiceRoleClient } from '@repo/supabase/server'

export type RiskCalculationResult = {
  matrixId: string
  matrixVersion: number
  matrixKey: string
  likelihoodKey: string
  likelihoodLabel: string
  severityKey: string
  severityLabel: string
  score: number
  bandKey: string
  bandLabel: string
  requiresReview: boolean
  requiresApproval: boolean
}

export type RiskMatrixSummary = {
  id: string
  organizationId: string | null
  matrixKey: string
  name: string
  description: string | null
  version: number
  isCore: boolean
  isDefault: boolean
  isActive: boolean
}

type LikelihoodRow = {
  id: string
  level_key: string
  label: string
  description: string | null
  numeric_value: number
  sort_order: number
}

type SeverityRow = {
  id: string
  level_key: string
  label: string
  description: string | null
  numeric_value: number
  sort_order: number
}

type BandRow = {
  id: string
  band_key: string
  label: string
  description: string | null
  sort_order: number
  requires_review: boolean
  requires_approval: boolean
}

type CellRow = {
  id: string
  likelihood_level_id: string
  severity_level_id: string
  score: number
  risk_band_id: string
}

export type RiskMatrixDetail = RiskMatrixSummary & {
  likelihoodLevels: LikelihoodRow[]
  severityLevels: SeverityRow[]
  bands: BandRow[]
  cells: CellRow[]
}

const asRow = <T extends Record<string, unknown>>(value: unknown): T | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as T
}

const mapMatrix = (row: Record<string, unknown>): RiskMatrixSummary => ({
  id: String(row.id),
  organizationId: row.organization_id ? String(row.organization_id) : null,
  matrixKey: String(row.matrix_key),
  name: String(row.name),
  description: row.description == null ? null : String(row.description),
  version: Number(row.version),
  isCore: Boolean(row.is_core),
  isDefault: Boolean(row.is_default),
  isActive: Boolean(row.is_active)
})

export const getRiskMatrix = async (matrixId: string): Promise<RiskMatrixDetail | null> => {
  const supabase = createServiceRoleClient() as any

  const { data: matrixRow } = await supabase
    .from('forge_risk_matrices')
    .select('*')
    .eq('id', matrixId)
    .maybeSingle()

  const matrix = asRow<Record<string, unknown>>(matrixRow)
  if (!matrix) return null

  const [{ data: likelihoods }, { data: severities }, { data: bands }, { data: cells }] =
    await Promise.all([
      supabase
        .from('forge_risk_likelihood_levels')
        .select('*')
        .eq('risk_matrix_id', matrixId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('forge_risk_severity_levels')
        .select('*')
        .eq('risk_matrix_id', matrixId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('forge_risk_bands')
        .select('*')
        .eq('risk_matrix_id', matrixId)
        .order('sort_order', { ascending: true }),
      supabase.from('forge_risk_matrix_cells').select('*').eq('risk_matrix_id', matrixId)
    ])

  return {
    ...mapMatrix(matrix),
    likelihoodLevels: (likelihoods || []) as LikelihoodRow[],
    severityLevels: (severities || []) as SeverityRow[],
    bands: (bands || []) as BandRow[],
    cells: (cells || []) as CellRow[]
  }
}

export const getActiveRiskMatrix = async ({
  organizationId
}: {
  organizationId: string
}): Promise<RiskMatrixDetail | null> => {
  const supabase = createServiceRoleClient() as any

  const { data: tenantDefault } = await supabase
    .from('forge_risk_matrices')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('is_default', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (tenantDefault?.id) {
    return getRiskMatrix(String(tenantDefault.id))
  }

  const { data: coreDefault } = await supabase
    .from('forge_risk_matrices')
    .select('id')
    .is('organization_id', null)
    .eq('is_active', true)
    .eq('is_default', true)
    .eq('matrix_key', 'forge.core.5x5')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!coreDefault?.id) return null
  return getRiskMatrix(String(coreDefault.id))
}

export const validateRiskMatrix = async (matrixId: string) => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_validate_risk_matrix', {
    p_matrix_id: matrixId
  })

  if (error) {
    return { ok: false as const, error: error.message || 'Unable to validate risk matrix.' }
  }

  const result = asRow<Record<string, unknown>>(data) || {}
  if (result.ok === true) {
    return {
      ok: true as const,
      likelihoodCount: Number(result.likelihood_count || 0),
      severityCount: Number(result.severity_count || 0),
      bandCount: Number(result.band_count || 0),
      cellCount: Number(result.cell_count || 0),
      expectedCells: Number(result.expected_cells || 0)
    }
  }

  return {
    ok: false as const,
    error: String(result.error || 'Risk matrix is incomplete.')
  }
}

export const calculateRisk = async ({
  matrixId,
  likelihoodKey,
  severityKey
}: {
  matrixId: string
  likelihoodKey: string
  severityKey: string
}): Promise<{ ok: true; result: RiskCalculationResult } | { ok: false; error: string }> => {
  const matrix = await getRiskMatrix(matrixId)
  if (!matrix) return { ok: false, error: 'Risk matrix not found.' }
  if (!matrix.isActive) return { ok: false, error: 'Risk matrix is not active.' }

  const likelihood = matrix.likelihoodLevels.find(item => item.level_key === likelihoodKey)
  const severity = matrix.severityLevels.find(item => item.level_key === severityKey)

  if (!likelihood) return { ok: false, error: 'Likelihood level is not valid for this matrix.' }
  if (!severity) return { ok: false, error: 'Severity level is not valid for this matrix.' }

  const cell = matrix.cells.find(
    item =>
      item.likelihood_level_id === likelihood.id && item.severity_level_id === severity.id
  )
  if (!cell) {
    return { ok: false, error: 'No risk cell is defined for this likelihood and severity.' }
  }

  const band = matrix.bands.find(item => item.id === cell.risk_band_id)
  if (!band) return { ok: false, error: 'Risk band is missing for calculated cell.' }

  return {
    ok: true,
    result: {
      matrixId: matrix.id,
      matrixVersion: matrix.version,
      matrixKey: matrix.matrixKey,
      likelihoodKey: likelihood.level_key,
      likelihoodLabel: likelihood.label,
      severityKey: severity.level_key,
      severityLabel: severity.label,
      score: Number(cell.score),
      bandKey: band.band_key,
      bandLabel: band.label,
      requiresReview: Boolean(band.requires_review),
      requiresApproval: Boolean(band.requires_approval)
    }
  }
}

export const cloneRiskMatrixVersion = async ({
  sourceMatrixId,
  organizationId,
  actorUserId,
  matrixKey,
  name,
  description,
  activateAsDefault = false
}: {
  sourceMatrixId: string
  organizationId: string
  actorUserId: string
  matrixKey?: string
  name?: string
  description?: string | null
  activateAsDefault?: boolean
}): Promise<{ ok: true; matrixId: string; version: number } | { ok: false; error: string }> => {
  const source = await getRiskMatrix(sourceMatrixId)
  if (!source) return { ok: false, error: 'Source risk matrix not found.' }

  if (source.organizationId && source.organizationId !== organizationId) {
    return { ok: false, error: 'Source risk matrix is outside this organization.' }
  }

  const supabase = createServiceRoleClient() as any
  const nextKey = matrixKey || source.matrixKey

  const { data: existingVersions } = await supabase
    .from('forge_risk_matrices')
    .select('version')
    .eq('organization_id', organizationId)
    .eq('matrix_key', nextKey)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion =
    Array.isArray(existingVersions) && existingVersions[0]?.version
      ? Number(existingVersions[0].version) + 1
      : source.organizationId === organizationId
        ? source.version + 1
        : 1

  const { data: createdRows, error: createError } = await supabase
    .from('forge_risk_matrices')
    .insert({
      organization_id: organizationId,
      matrix_key: nextKey,
      name: name || source.name,
      description: description === undefined ? source.description : description,
      version: nextVersion,
      is_core: false,
      is_default: false,
      // Draft clones stay inactive until activateRiskMatrix so cells remain editable.
      is_active: false,
      created_by: actorUserId
    })
    .select('id, version')
    .limit(1)

  if (createError || !createdRows?.[0]?.id) {
    return { ok: false, error: createError?.message || 'Unable to clone risk matrix.' }
  }

  const newMatrixId = String(createdRows[0].id)

  const likelihoodIdMap = new Map<string, string>()
  for (const level of source.likelihoodLevels) {
    const { data: rows, error } = await supabase
      .from('forge_risk_likelihood_levels')
      .insert({
        risk_matrix_id: newMatrixId,
        level_key: level.level_key,
        label: level.label,
        description: level.description,
        numeric_value: level.numeric_value,
        sort_order: level.sort_order
      })
      .select('id')
      .limit(1)
    if (error || !rows?.[0]?.id) {
      return { ok: false, error: error?.message || 'Unable to clone likelihood levels.' }
    }
    likelihoodIdMap.set(level.id, String(rows[0].id))
  }

  const severityIdMap = new Map<string, string>()
  for (const level of source.severityLevels) {
    const { data: rows, error } = await supabase
      .from('forge_risk_severity_levels')
      .insert({
        risk_matrix_id: newMatrixId,
        level_key: level.level_key,
        label: level.label,
        description: level.description,
        numeric_value: level.numeric_value,
        sort_order: level.sort_order
      })
      .select('id')
      .limit(1)
    if (error || !rows?.[0]?.id) {
      return { ok: false, error: error?.message || 'Unable to clone severity levels.' }
    }
    severityIdMap.set(level.id, String(rows[0].id))
  }

  const bandIdMap = new Map<string, string>()
  for (const band of source.bands) {
    const { data: rows, error } = await supabase
      .from('forge_risk_bands')
      .insert({
        risk_matrix_id: newMatrixId,
        band_key: band.band_key,
        label: band.label,
        description: band.description,
        sort_order: band.sort_order,
        requires_review: band.requires_review,
        requires_approval: band.requires_approval
      })
      .select('id')
      .limit(1)
    if (error || !rows?.[0]?.id) {
      return { ok: false, error: error?.message || 'Unable to clone risk bands.' }
    }
    bandIdMap.set(band.id, String(rows[0].id))
  }

  const cellRows = source.cells.map(cell => ({
    risk_matrix_id: newMatrixId,
    likelihood_level_id: likelihoodIdMap.get(cell.likelihood_level_id),
    severity_level_id: severityIdMap.get(cell.severity_level_id),
    score: cell.score,
    risk_band_id: bandIdMap.get(cell.risk_band_id)
  }))

  if (
    cellRows.some(
      row => !row.likelihood_level_id || !row.severity_level_id || !row.risk_band_id
    )
  ) {
    return { ok: false, error: 'Unable to remap matrix cells during clone.' }
  }

  const { error: cellError } = await supabase.from('forge_risk_matrix_cells').insert(cellRows)
  if (cellError) {
    return { ok: false, error: cellError.message || 'Unable to clone matrix cells.' }
  }

  const validation = await validateRiskMatrix(newMatrixId)
  if (!validation.ok) {
    return { ok: false, error: validation.error }
  }

  if (activateAsDefault) {
    const activated = await activateRiskMatrix({
      organizationId,
      matrixId: newMatrixId,
      actorUserId
    })
    if (!activated.ok) return activated
  }

  return { ok: true, matrixId: newMatrixId, version: nextVersion }
}

export const activateRiskMatrix = async ({
  organizationId,
  matrixId,
  actorUserId
}: {
  organizationId: string
  matrixId: string
  actorUserId: string
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const supabase = createServiceRoleClient() as any
  const matrix = await getRiskMatrix(matrixId)
  if (!matrix) return { ok: false, error: 'Risk matrix not found.' }
  if (matrix.organizationId !== organizationId) {
    return { ok: false, error: 'Only tenant matrices can be activated as the organization default.' }
  }

  const validation = await validateRiskMatrix(matrixId)
  if (!validation.ok) return { ok: false, error: validation.error }

  const { error: clearError } = await supabase
    .from('forge_risk_matrices')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('is_default', true)

  if (clearError) {
    return { ok: false, error: clearError.message || 'Unable to clear previous default matrix.' }
  }

  const { error: activateError } = await supabase
    .from('forge_risk_matrices')
    .update({
      is_default: true,
      is_active: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', matrixId)
    .eq('organization_id', organizationId)

  if (activateError) {
    return { ok: false, error: activateError.message || 'Unable to activate risk matrix.' }
  }

  void actorUserId
  return { ok: true }
}

export const ensureTenantDefaultRiskMatrix = async ({
  organizationId,
  actorUserId
}: {
  organizationId: string
  actorUserId: string
}) => {
  const existing = await getActiveRiskMatrix({ organizationId })
  if (existing?.organizationId === organizationId) {
    return { ok: true as const, matrixId: existing.id, created: false }
  }

  const supabase = createServiceRoleClient() as any
  const { data: coreRow } = await supabase
    .from('forge_risk_matrices')
    .select('id')
    .is('organization_id', null)
    .eq('matrix_key', 'forge.core.5x5')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!coreRow?.id) {
    return { ok: false as const, error: 'Forge core risk matrix is missing.' }
  }

  const cloned = await cloneRiskMatrixVersion({
    sourceMatrixId: String(coreRow.id),
    organizationId,
    actorUserId,
    matrixKey: 'tenant.default.5x5',
    name: 'Organization Risk Matrix',
    activateAsDefault: true
  })

  if (!cloned.ok) return cloned
  return { ok: true as const, matrixId: cloned.matrixId, created: true }
}

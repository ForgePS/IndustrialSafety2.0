import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { getTrainingOverview } from '@/lib/forgeTraining'
import { getScopedIncidents } from '@/lib/forgeIncidents'
import { getScopedInspections } from '@/lib/forgeInspections'
import { getScopedAssets } from '@/lib/forgeAssets'
import { getScopedQrCodes } from '@/lib/forgeQr'

type Capability = {
  id: string
  capability_key: string
  name: string
  description: string | null
  required_permission_key: string | null
  capability_type: string
  sensitive: boolean
  requires_approval: boolean
  effectivePermission?: EffectivePermission | null
}

type ForgeAiToolCall = {
  call_id: string
  name: string
  arguments: string
}

type RuntimeContext = {
  user: { id: string }
  activeOrganization: { id: string; name: string }
  access: { effective: EffectivePermission[] }
  capabilities: Capability[]
  permissionByKey: Map<string, EffectivePermission>
}

const searchMatch = (values: unknown[], query: string) => {
  if (!query.trim()) return true
  const needle = query.trim().toLowerCase()

  return values.some(value =>
    value != null && String(value).toLowerCase().includes(needle)
  )
}

const limitValue = (value: unknown, fallback = 15) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), 1), 50)
}

const parseArguments = (value: string) => {
  try {
    const parsed = JSON.parse(value || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const definitions: Record<string, any> = {
  company_snapshot: {
    type: 'function',
    name: 'company_snapshot',
    description: 'Get a permission-aware operational safety snapshot for the current Forge tenant. Use this for status, workload, open items, overdue training, incidents, inspections and assets.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false
    }
  },
  search_personnel: {
    type: 'function',
    name: 'search_personnel',
    description: 'Search personnel the current user is authorized to view. Returns only basic non-sensitive workforce fields.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, employee number, Location or Division search text.' },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  search_training: {
    type: 'function',
    name: 'search_training',
    description: 'Search training courses, assignments and completions within the current user permission scope.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Course, employee, code, status or result search text.' },
        overdue_only: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      },
      required: ['query','overdue_only'],
      additionalProperties: false
    }
  },
  search_incidents: {
    type: 'function',
    name: 'search_incidents',
    description: 'Search incident records within the user permission scope. Does not return restricted medical, claims or investigation data.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Incident number, summary, type, severity, status or Location.' },
        status: { type: ['string','null'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      },
      required: ['query','status'],
      additionalProperties: false
    }
  },
  search_inspections: {
    type: 'function',
    name: 'search_inspections',
    description: 'Search inspections within the user permission scope by number, template, Location, status or result.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        status: { type: ['string','null'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      },
      required: ['query','status'],
      additionalProperties: false
    }
  },
  search_assets: {
    type: 'function',
    name: 'search_assets',
    description: 'Search Assets & Equipment within the user permission scope by asset number, name, type, manufacturer, model, serial, status, Location or custodian.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        status: { type: ['string','null'] },
        include_retired: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      },
      required: ['query','status','include_retired'],
      additionalProperties: false
    }
  },
  search_qr: {
    type: 'function',
    name: 'search_qr',
    description: 'Search managed Forge QR records within scope. Never returns the private QR scan token.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  explain_access: {
    type: 'function',
    name: 'explain_access',
    description: 'Explain the current user effective Forge permissions and data scopes. Useful when the user asks why they can or cannot see or do something.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        module: { type: ['string','null'], description: 'Optional feature or permission-group filter.' }
      },
      required: ['module'],
      additionalProperties: false
    }
  }
}

export const getForgeAiToolDefinitions = (capabilities: Capability[]) =>
  capabilities
    .filter(capability => capability.capability_type !== 'action')
    .map(capability => definitions[capability.capability_key])
    .filter(Boolean)

const getPermission = (
  context: RuntimeContext,
  key: string
): EffectivePermission | null => {
  const permission = context.permissionByKey.get(key)
  return permission?.allowed ? permission : null
}

const executeCompanySnapshot = async (context: RuntimeContext) => {
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const result: Record<string, unknown> = {
    organization: context.activeOrganization.name,
    generated_at: new Date().toISOString()
  }

  const personnelPermission = getPermission(context, 'personnel.view')
  if (personnelPermission) {
    const personnel = await getScopedPersonnel({ organizationId, userId, permission: personnelPermission })
    result.personnel = { visible_count: personnel.length }
  }

  const trainingPermission = getPermission(context, 'training.view')
  if (trainingPermission) {
    const training = await getTrainingOverview({ organizationId, userId, permission: trainingPermission })
    const today = new Date().toISOString().slice(0, 10)
    const overdue = training.assignments.filter(
      (item: any) => item.due_date && item.due_date < today && !['completed','canceled'].includes(item.status)
    )

    result.training = {
      active_courses: training.courses.length,
      visible_assignments: training.assignments.length,
      overdue_assignments: overdue.length,
      visible_completions: training.completions.length
    }
  }

  const incidentPermission = getPermission(context, 'incidents.view')
  if (incidentPermission) {
    const incidents = await getScopedIncidents({ organizationId, userId, permission: incidentPermission })
    result.incidents = {
      visible_count: incidents.length,
      open_count: incidents.filter((item: any) => !['closed'].includes(item.status)).length,
      submitted_count: incidents.filter((item: any) => item.status === 'submitted').length
    }
  }

  const inspectionPermission = getPermission(context, 'inspections.view')
  if (inspectionPermission) {
    const inspections = await getScopedInspections({ organizationId, userId, permission: inspectionPermission })
    result.inspections = {
      visible_count: inspections.length,
      open_count: inspections.filter((item: any) => !['closed'].includes(item.status)).length,
      submitted_count: inspections.filter((item: any) => item.status === 'submitted').length
    }
  }

  const assetPermission = getPermission(context, 'assets_equipment.view')
  if (assetPermission) {
    const assets = await getScopedAssets({ organizationId, userId, permission: assetPermission })
    result.assets = {
      visible_count: assets.length,
      out_of_service: assets.filter((item: any) => item.status === 'out_of_service').length,
      maintenance: assets.filter((item: any) => item.status === 'maintenance').length,
      poor_or_unserviceable: assets.filter((item: any) => ['poor','unserviceable'].includes(item.condition)).length
    }
  }

  return result
}

const executeToolValue = async ({
  context,
  capability,
  args
}: {
  context: RuntimeContext
  capability: Capability
  args: Record<string, any>
}) => {
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const permission = capability.effectivePermission || (
    capability.required_permission_key
      ? getPermission(context, capability.required_permission_key)
      : null
  )

  switch (capability.capability_key) {
    case 'company_snapshot':
      return executeCompanySnapshot(context)

    case 'search_personnel': {
      if (!permission) return { denied: true, reason: 'Personnel permission is not available.' }
      const rows = await getScopedPersonnel({ organizationId, userId, permission })
      const limit = limitValue(args.limit)

      return rows
        .filter((item: any) => searchMatch([
          item.first_name,
          item.last_name,
          item.employee_number,
          item.locations?.name,
          item.locations?.code,
          item.divisions?.name,
          item.divisions?.code
        ], args.query || ''))
        .slice(0, limit)
        .map((item: any) => ({
          record_type: 'personnel',
          id: item.id,
          employee_number: item.employee_number,
          name: [item.first_name, item.last_name].filter(Boolean).join(' '),
          job_title: item.job_title || item.title || item.rank || null,
          status: item.employment_status || item.status || null,
          location: item.locations?.name || null,
          division: item.divisions?.name || null
        }))
    }

    case 'search_training': {
      if (!permission) return { denied: true, reason: 'Training permission is not available.' }
      const data = await getTrainingOverview({ organizationId, userId, permission })
      const limit = limitValue(args.limit)
      const query = args.query || ''
      const today = new Date().toISOString().slice(0, 10)

      const assignments = data.assignments
        .filter((item: any) => {
          const overdue = item.due_date && item.due_date < today && !['completed','canceled'].includes(item.status)
          if (args.overdue_only && !overdue) return false

          return searchMatch([
            item.forge_training_courses?.title,
            item.forge_training_courses?.course_code,
            item.forge_personnel?.first_name,
            item.forge_personnel?.last_name,
            item.forge_personnel?.employee_number,
            item.status
          ], query)
        })
        .slice(0, limit)
        .map((item: any) => ({
          record_type: 'training_assignment',
          id: item.id,
          course: item.forge_training_courses?.title || null,
          course_code: item.forge_training_courses?.course_code || null,
          personnel: item.forge_personnel
            ? [item.forge_personnel.first_name, item.forge_personnel.last_name].filter(Boolean).join(' ')
            : null,
          employee_number: item.forge_personnel?.employee_number || null,
          status: item.status,
          due_date: item.due_date,
          overdue: Boolean(item.due_date && item.due_date < today && !['completed','canceled'].includes(item.status))
        }))

      const completions = args.overdue_only
        ? []
        : data.completions
            .filter((item: any) => searchMatch([
              item.forge_training_courses?.title,
              item.forge_training_courses?.course_code,
              item.forge_personnel?.first_name,
              item.forge_personnel?.last_name,
              item.forge_personnel?.employee_number,
              item.result,
              item.approval_status
            ], query))
            .slice(0, limit)
            .map((item: any) => ({
              record_type: 'training_completion',
              id: item.id,
              course: item.forge_training_courses?.title || null,
              course_code: item.forge_training_courses?.course_code || null,
              personnel: item.forge_personnel
                ? [item.forge_personnel.first_name, item.forge_personnel.last_name].filter(Boolean).join(' ')
                : null,
              completed_at: item.completed_at,
              result: item.result,
              approval_status: item.approval_status,
              expires_at: item.expires_at
            }))

      return { assignments, completions }
    }

    case 'search_incidents': {
      if (!permission) return { denied: true, reason: 'Incident permission is not available.' }
      const rows = await getScopedIncidents({ organizationId, userId, permission })
      const limit = limitValue(args.limit)

      return rows
        .filter((item: any) => {
          if (args.status && item.status !== args.status) return false

          return searchMatch([
            item.incident_number,
            item.summary,
            item.incident_type,
            item.severity,
            item.status,
            item.locations?.name,
            item.divisions?.name
          ], args.query || '')
        })
        .slice(0, limit)
        .map((item: any) => ({
          record_type: 'incident',
          id: item.id,
          incident_number: item.incident_number,
          status: item.status,
          type: item.incident_type,
          severity: item.severity,
          occurred_at: item.occurred_at,
          summary: item.summary,
          location: item.locations?.name || null,
          division: item.divisions?.name || null
        }))
    }

    case 'search_inspections': {
      if (!permission) return { denied: true, reason: 'Inspection permission is not available.' }
      const rows = await getScopedInspections({ organizationId, userId, permission })
      const limit = limitValue(args.limit)

      return rows
        .filter((item: any) => {
          if (args.status && item.status !== args.status) return false

          return searchMatch([
            item.inspection_number,
            item.status,
            item.result,
            item.template_name_snapshot,
            item.forge_inspection_templates?.name,
            item.forge_inspection_templates?.inspection_type,
            item.locations?.name,
            item.divisions?.name
          ], args.query || '')
        })
        .slice(0, limit)
        .map((item: any) => ({
          record_type: 'inspection',
          id: item.id,
          inspection_number: item.inspection_number,
          status: item.status,
          result: item.result,
          inspection_date: item.inspection_date,
          template: item.template_name_snapshot || item.forge_inspection_templates?.name || null,
          location: item.locations?.name || null,
          division: item.divisions?.name || null
        }))
    }

    case 'search_assets': {
      if (!permission) return { denied: true, reason: 'Assets & Equipment permission is not available.' }
      const rows = await getScopedAssets({
        organizationId,
        userId,
        permission,
        includeRetired: Boolean(args.include_retired)
      })
      const limit = limitValue(args.limit)

      return rows
        .filter((item: any) => {
          if (args.status && item.status !== args.status) return false

          return searchMatch([
            item.asset_number,
            item.name,
            item.asset_type,
            item.status,
            item.condition,
            item.criticality,
            item.manufacturer,
            item.model,
            item.serial_number,
            item.locations?.name,
            item.divisions?.name,
            item.forge_personnel?.first_name,
            item.forge_personnel?.last_name
          ], args.query || '')
        })
        .slice(0, limit)
        .map((item: any) => ({
          record_type: 'asset',
          id: item.id,
          asset_number: item.asset_number,
          name: item.name,
          type: item.asset_type,
          status: item.status,
          condition: item.condition,
          criticality: item.criticality,
          manufacturer: item.manufacturer,
          model: item.model,
          serial_number: item.serial_number,
          location: item.locations?.name || null,
          division: item.divisions?.name || null,
          custodian: item.forge_personnel
            ? [item.forge_personnel.first_name, item.forge_personnel.last_name].filter(Boolean).join(' ')
            : null,
          warranty_expires_on: item.warranty_expires_on
        }))
    }

    case 'search_qr': {
      if (!permission) return { denied: true, reason: 'QR Management permission is not available.' }
      const rows = await getScopedQrCodes({ organizationId, userId, permission })
      const limit = limitValue(args.limit)

      return rows
        .filter((item: any) => searchMatch([
          item.qr_number,
          item.name,
          item.description,
          item.status,
          item.default_action,
          item.targetAsset?.asset_number,
          item.targetAsset?.name
        ], args.query || ''))
        .slice(0, limit)
        .map((item: any) => ({
          record_type: 'managed_qr',
          id: item.id,
          qr_number: item.qr_number,
          name: item.name,
          status: item.status,
          default_action: item.default_action,
          target_asset_number: item.targetAsset?.asset_number || null,
          target_asset_name: item.targetAsset?.name || null,
          scan_count: Number(item.scan_count || 0),
          last_scanned_at: item.last_scanned_at
        }))
    }

    case 'explain_access': {
      const moduleFilter = String(args.module || '').trim().toLowerCase()

      return context.access.effective
        .filter(permissionItem => {
          if (!moduleFilter) return true
          return [
            permissionItem.featureKey,
            permissionItem.group,
            permissionItem.permissionKey
          ]
            .filter(Boolean)
            .some(value => String(value).toLowerCase().includes(moduleFilter))
        })
        .map(permissionItem => ({
          permission: permissionItem.permissionKey,
          name: permissionItem.name,
          allowed: permissionItem.allowed,
          scope: permissionItem.scope,
          source: permissionItem.source,
          roles: permissionItem.assignedRoles,
          feature_available: permissionItem.featureAvailable
        }))
    }

    default:
      return { denied: true, reason: 'Capability is not implemented in this Forge version.' }
  }
}

export const executeForgeAiTool = async ({
  context,
  conversationId,
  call
}: {
  context: RuntimeContext
  conversationId: string
  call: ForgeAiToolCall
}) => {
  const capability = context.capabilities.find(item => item.capability_key === call.name)
  const args = parseArguments(call.arguments)
  const supabase = createServiceRoleClient() as any

  if (!capability) {
    return {
      denied: true,
      reason: 'This AI capability is not enabled or permitted for the current tenant/user.'
    }
  }

  const { data: toolRun } = await supabase
    .from('forge_ai_tool_runs')
    .insert({
      organization_id: context.activeOrganization.id,
      conversation_id: conversationId,
      user_id: context.user.id,
      capability_id: capability.id,
      capability_key: capability.capability_key,
      required_permission_key: capability.required_permission_key,
      status: 'running',
      input: args
    })
    .select('id')
    .single()

  const started = Date.now()

  try {
    const value = await executeToolValue({ context, capability, args })
    const count = Array.isArray(value)
      ? value.length
      : value && typeof value === 'object'
        ? Object.values(value as Record<string, unknown>).reduce(
            (sum, item) => sum + (Array.isArray(item) ? item.length : 0),
            0
          )
        : 0

    if (toolRun?.id) {
      await supabase
        .from('forge_ai_tool_runs')
        .update({
          status: (value as any)?.denied ? 'denied' : 'completed',
          result_summary: (value as any)?.denied
            ? String((value as any).reason || 'Denied')
            : 'Returned ' + String(count) + ' record/result item(s).',
          result_metadata: {
            result_count: count,
            duration_ms: Date.now() - started
          },
          completed_at: new Date().toISOString()
        })
        .eq('id', toolRun.id)
    }

    return value
  } catch (error) {
    if (toolRun?.id) {
      await supabase
        .from('forge_ai_tool_runs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown tool error',
          result_metadata: { duration_ms: Date.now() - started },
          completed_at: new Date().toISOString()
        })
        .eq('id', toolRun.id)
    }

    return {
      error: true,
      message: 'Forge could not complete this data lookup.'
    }
  }
}

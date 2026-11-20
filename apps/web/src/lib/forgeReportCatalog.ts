import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getScopedAssets } from '@/lib/forgeAssets'
import { capaReportFacts } from '@/lib/forgeCapaReportRules'
import { getScopedCorrectiveActions } from '@/lib/forgeCorrectiveActions'
import { getScopedDriverFiles } from '@/lib/forgeDot'
import { getScopedIncidents } from '@/lib/forgeIncidents'
import { getScopedInspections } from '@/lib/forgeInspections'
import { getScopedLockouts, getScopedLotoProcedures } from '@/lib/forgeLoto'
import { getScopedOshaCases } from '@/lib/forgeOsha'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { getScopedTasks } from '@/lib/forgeTasks'
import { getScopedWcCases } from '@/lib/forgeWorkersComp'
import { daysBetween, humanizeKey, isoDay, type ReportDefinitionMeta, type ReportParams, type ReportRecord } from '@/lib/forgeReportRules'

/**
 * Port slice 13: the built-in reports. Each one reads its module's own scoped loader, with the person's
 * permission for that module, so a report never shows a record the person couldn't open in the module itself.
 * 1.0 ran raw SQL per report and let anyone with basic Industrial access run all of them.
 *
 * The catalog lives in code, as in 1.0; saved reports point at a key here.
 */

export type ReportLoadContext = {
  organizationId: string
  userId: string
  permission: EffectivePermission
  params: ReportParams
  today: string
}

export type ReportDefinition = ReportDefinitionMeta & {
  load: (context: ReportLoadContext) => Promise<ReportRecord[]>
}

const personName = (person: any) =>
  person ? [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(' ') || person.employee_number || null : null

const lookupName = (value: any) => (value && typeof value === 'object' && !Array.isArray(value) ? value.name || null : Array.isArray(value) ? value[0]?.name || null : null)

const labels = (keys: string[]) => keys.map(key => ({ key, label: humanizeKey(key) }))

const SENSITIVE = 'reporting.view_sensitive'

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

const incidentRecords = async ({ organizationId, userId, permission }: ReportLoadContext, only?: (row: any) => boolean) => {
  const rows = await getScopedIncidents({ organizationId, userId, permission })

  return rows
    .filter((row: any) => !only || only(row))
    .map(
      (row: any): ReportRecord => ({
        day: isoDay(row.occurred_at),
        locationId: row.location_id,
        status: row.status,
        cells: {
          incident_number: row.incident_number,
          occurred_at: row.occurred_at,
          incident_type: humanizeKey(row.incident_type),
          severity: humanizeKey(row.severity),
          status: humanizeKey(row.status),
          location: lookupName(row.locations),
          division: lookupName(row.divisions),
          summary: row.summary,
          reported_by: personName(row.forge_personnel),
          involves_injury: Boolean(row.involves_injury),
          involves_vehicle: Boolean(row.involves_vehicle),
          property_damage: Boolean(row.property_damage),
          osha_review: Boolean(row.osha_review_flag),
          workers_comp_review: Boolean(row.workers_comp_review_flag),
          closed_at: row.closed_at
        }
      })
    )
}

const INCIDENT_COLUMNS: ReportDefinitionMeta['columns'] = [
  { key: 'incident_number', label: 'Incident', type: 'text' },
  { key: 'occurred_at', label: 'Occurred', type: 'datetime' },
  { key: 'incident_type', label: 'Type', type: 'text' },
  { key: 'severity', label: 'Severity', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'division', label: 'Division', type: 'text' },
  { key: 'summary', label: 'Summary', type: 'text' },
  { key: 'reported_by', label: 'Reported by', type: 'text' },
  { key: 'involves_injury', label: 'Injury', type: 'boolean' },
  { key: 'involves_vehicle', label: 'Vehicle', type: 'boolean' },
  { key: 'property_damage', label: 'Property damage', type: 'boolean' },
  { key: 'osha_review', label: 'OSHA review', type: 'boolean' },
  { key: 'workers_comp_review', label: "Workers' comp review", type: 'boolean' },
  { key: 'closed_at', label: 'Closed', type: 'date' }
]

const INCIDENT_STATUSES = labels(['draft', 'submitted', 'approved', 'closed'])

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export const REPORTS: ReportDefinition[] = [
  {
    key: 'incidents.log',
    name: 'Incident log',
    description: 'Every incident in the period, with type, severity, status and what it involved. Group by type, severity or location for counts.',
    module: 'Incidents',
    permission: 'incidents.view',
    columns: INCIDENT_COLUMNS,
    dateLabel: 'Occurred',
    defaultPreset: '90d',
    statuses: INCIDENT_STATUSES,
    groupable: ['incident_type', 'severity', 'status', 'location', 'division'],
    load: context => incidentRecords(context)
  },
  {
    key: 'incidents.near_misses',
    name: 'Near misses',
    description: 'Incidents recorded as near misses.',
    module: 'Incidents',
    permission: 'incidents.view',
    columns: INCIDENT_COLUMNS.filter(column => !['involves_injury', 'osha_review', 'workers_comp_review'].includes(column.key)),
    dateLabel: 'Occurred',
    defaultPreset: '90d',
    statuses: INCIDENT_STATUSES,
    groupable: ['status', 'location', 'division'],
    load: context => incidentRecords(context, row => row.incident_type === 'near_miss')
  },
  {
    key: 'osha.log_300',
    name: 'OSHA 300 log',
    description:
      'Recordable cases for a calendar year, as on the OSHA 300 log. Privacy cases show "Privacy case" instead of the name. Group by outcome or injury type for the 300A totals.',
    module: 'OSHA',
    permission: 'osha.view',
    columns: [
      { key: 'case_number', label: 'Case no.', type: 'text' },
      { key: 'employee_name', label: 'Employee', type: 'text' },
      { key: 'job_title', label: 'Job title', type: 'text' },
      { key: 'injury_date', label: 'Date of injury or onset', type: 'date' },
      { key: 'event_location', label: 'Where the event occurred', type: 'text' },
      { key: 'injury_description', label: 'Injury or illness, parts of body, cause', type: 'text' },
      { key: 'case_outcome', label: 'Outcome', type: 'text' },
      { key: 'days_away', label: 'Days away', type: 'number' },
      { key: 'restricted_days', label: 'Days on job transfer or restriction', type: 'number' },
      { key: 'injury_or_illness', label: 'Injury or illness type', type: 'text' },
      { key: 'location', label: 'Establishment', type: 'text' },
      { key: 'status', label: 'Case status', type: 'text' }
    ],
    defaultPreset: 'all',
    usesYear: true,
    statuses: labels(['open', 'closed']),
    groupable: ['case_outcome', 'injury_or_illness', 'location'],
    load: async ({ organizationId, userId, permission, params, today }) => {
      const year = params.year || Number(today.slice(0, 4))
      const rows = await getScopedOshaCases({ organizationId, userId, permission, year })

      return rows
        .filter((row: any) => row.recordability === 'recordable')
        .map(
          (row: any): ReportRecord => ({
            day: isoDay(row.injury_date),
            locationId: row.location_id,
            status: row.status,
            cells: {
              case_number: row.case_number,
              employee_name: row.is_privacy_case ? 'Privacy case' : row.employee_name,
              job_title: row.job_title,
              injury_date: row.injury_date,
              event_location: row.event_location,
              injury_description: row.injury_description,
              case_outcome: row.date_of_death ? 'Death' : humanizeKey(row.case_outcome),
              days_away: Number(row.days_away) || 0,
              restricted_days: Number(row.restricted_days) || 0,
              injury_or_illness: humanizeKey(row.case_type),
              location: lookupName(row.locations),
              status: humanizeKey(row.status)
            }
          })
        )
    }
  },
  {
    key: 'workers_comp.cases',
    name: "Workers' comp cases",
    description: "Workers' comp cases by injury date, with stage, carrier, claim and next action. Body parts and claim notes need the sensitive-columns permission.",
    module: "Workers' Comp",
    permission: 'workers_comp.view',
    columns: [
      { key: 'case_number', label: 'Case', type: 'text' },
      { key: 'employee_name', label: 'Employee', type: 'text' },
      { key: 'injury_date', label: 'Injury date', type: 'date' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'stage', label: 'Stage', type: 'text' },
      { key: 'severity', label: 'Severity', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'carrier', label: 'Carrier', type: 'text' },
      { key: 'claim_number', label: 'Claim number', type: 'text' },
      { key: 'adjuster', label: 'Adjuster', type: 'text' },
      { key: 'next_action', label: 'Next action', type: 'text' },
      { key: 'next_action_due', label: 'Next action due', type: 'date' },
      { key: 'osha_recordable', label: 'OSHA recordable', type: 'boolean' },
      { key: 'days_open', label: 'Days open', type: 'number' },
      { key: 'body_parts', label: 'Body parts', type: 'text', sensitivePermission: SENSITIVE },
      { key: 'claim_notes', label: 'Claim notes', type: 'text', sensitivePermission: SENSITIVE }
    ],
    dateLabel: 'Injury date',
    defaultPreset: '12m',
    statuses: labels(['active', 'closed']),
    groupable: ['status', 'stage', 'severity', 'location', 'carrier'],
    load: async ({ organizationId, userId, permission, today }) => {
      const rows = await getScopedWcCases({ organizationId, userId, permission })

      return rows.map((row: any): ReportRecord => {
        const injury = isoDay(row.injury_date)
        const end = isoDay(row.closed_at) || today

        return {
          day: injury,
          locationId: row.location_id,
          status: row.status,
          cells: {
            case_number: row.case_number,
            employee_name: row.employee_name,
            injury_date: row.injury_date,
            status: humanizeKey(row.status),
            stage: humanizeKey(row.stage),
            severity: humanizeKey(row.severity),
            location: lookupName(row.locations),
            carrier: row.is_self_pay ? 'Self-pay' : lookupName(row.forge_wc_carriers),
            claim_number: row.claim_number,
            adjuster: row.adjuster_name,
            next_action: row.next_action_label,
            next_action_due: row.next_action_due,
            osha_recordable: Boolean(row.osha_recordable),
            days_open: injury ? Math.max(0, daysBetween(injury, end)) : null,
            body_parts: row.body_parts,
            claim_notes: row.claim_notes
          }
        }
      })
    }
  },
  {
    key: 'inspections.log',
    name: 'Inspection log',
    description: 'Inspections by inspection date, with template, status and result.',
    module: 'Inspections',
    permission: 'inspections.view',
    columns: [
      { key: 'inspection_number', label: 'Inspection', type: 'text' },
      { key: 'inspection_date', label: 'Date', type: 'date' },
      { key: 'template', label: 'Template', type: 'text' },
      { key: 'inspection_type', label: 'Type', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'result', label: 'Result', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'division', label: 'Division', type: 'text' },
      { key: 'completed_at', label: 'Completed', type: 'date' },
      { key: 'closed_at', label: 'Closed', type: 'date' }
    ],
    dateLabel: 'Inspection date',
    defaultPreset: '90d',
    statuses: labels(['draft', 'in_progress', 'submitted', 'approved', 'closed']),
    groupable: ['template', 'inspection_type', 'status', 'result', 'location'],
    load: async ({ organizationId, userId, permission }) => {
      const rows = await getScopedInspections({ organizationId, userId, permission })

      return rows.map(
        (row: any): ReportRecord => ({
          day: isoDay(row.inspection_date),
          locationId: row.location_id,
          status: row.status,
          cells: {
            inspection_number: row.inspection_number,
            inspection_date: row.inspection_date,
            template: row.template_name_snapshot || row.forge_inspection_templates?.name || null,
            inspection_type: humanizeKey(row.forge_inspection_templates?.inspection_type),
            status: humanizeKey(row.status),
            result: humanizeKey(row.result),
            location: lookupName(row.locations),
            division: lookupName(row.divisions),
            completed_at: row.completed_at,
            closed_at: row.closed_at
          }
        })
      )
    }
  },
  {
    key: 'corrective_actions.register',
    name: 'Corrective action register',
    description: 'Corrective actions raised in the period, with owner, due date and whether they closed on time. Pick "Overdue" for the overdue list.',
    module: 'Corrective Actions',
    permission: 'corrective_actions.view',
    columns: [
      { key: 'action_number', label: 'CAPA', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'severity', label: 'Severity', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'owner', label: 'Owner', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'created_at', label: 'Raised', type: 'date' },
      { key: 'due_at', label: 'Due', type: 'date' },
      { key: 'closed_at', label: 'Closed', type: 'date' },
      { key: 'days_overdue', label: 'Days overdue', type: 'number' },
      { key: 'closed_on_time', label: 'Closed on time', type: 'boolean' }
    ],
    dateLabel: 'Raised',
    defaultPreset: '90d',
    statuses: [
      { key: 'open', label: 'Open (not closed or canceled)' },
      { key: 'overdue', label: 'Overdue' },
      { key: 'closed', label: 'Closed' },
      { key: 'canceled', label: 'Canceled' }
    ],
    groupable: ['severity', 'status', 'source', 'owner', 'location'],
    load: async ({ organizationId, userId, permission, today }) => {
      const rows = await getScopedCorrectiveActions({ organizationId, userId, permission })

      return rows.map((row: any): ReportRecord => {
        const facts = capaReportFacts(row, today)

        return {
          day: facts.createdDay || null,
          locationId: row.location_id,

          // The status filter offers open / overdue / closed / canceled rather than every workflow step.
          status: facts.isOverdue ? 'overdue' : facts.isOpen ? 'open' : row.status,
          cells: {
            action_number: row.action_number,
            title: row.title,
            severity: humanizeKey(row.severity),
            status: humanizeKey(row.status),
            source: humanizeKey(row.source_type),
            owner: personName(row.forge_personnel),
            location: lookupName(row.locations),
            created_at: row.created_at,
            due_at: row.due_at,
            closed_at: facts.closedDay || null,
            days_overdue: facts.isOverdue ? daysBetween(facts.dueDay, today) : null,
            closed_on_time: facts.onTime
          }
        }
      })
    }
  },
  {
    key: 'personnel.roster',
    name: 'Personnel roster',
    description: 'Current personnel with job, department, position, location and hire date. Email and phone need the personnel sensitive-data permission.',
    module: 'Personnel',
    permission: 'personnel.view',
    columns: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'employee_number', label: 'Employee no.', type: 'text' },
      { key: 'employment_status', label: 'Status', type: 'text' },
      { key: 'employment_type', label: 'Type', type: 'text' },
      { key: 'job_title', label: 'Job title', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'position', label: 'Position', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'hire_date', label: 'Hire date', type: 'date' },
      { key: 'company_driver', label: 'Company driver', type: 'boolean' },
      { key: 'dot_driver', label: 'DOT driver', type: 'boolean' },
      { key: 'email', label: 'Email', type: 'text', sensitivePermission: 'personnel.view_sensitive' },
      { key: 'phone', label: 'Phone', type: 'text', sensitivePermission: 'personnel.view_sensitive' }
    ],
    dateLabel: 'Hire date',
    defaultPreset: 'all',
    groupable: ['employment_status', 'employment_type', 'department', 'position', 'location'],
    load: async ({ organizationId, userId, permission }) => {
      const rows = await getScopedPersonnel({ organizationId, userId, permission })

      return rows.map(
        (row: any): ReportRecord => ({
          day: isoDay(row.hire_date),
          locationId: row.location_id,
          status: row.employment_status,
          cells: {
            name: personName(row),
            employee_number: row.employee_number,
            employment_status: humanizeKey(row.employment_status),
            employment_type: humanizeKey(row.employment_type),
            job_title: row.job_title,
            department: lookupName(row.department),
            position: lookupName(row.position),
            location: lookupName(row.locations),
            hire_date: row.hire_date,
            company_driver: Boolean(row.is_company_driver),
            dot_driver: Boolean(row.is_dot_driver),
            email: row.email,
            phone: row.phone
          }
        })
      )
    }
  },
  {
    key: 'loto.procedures',
    name: 'LOTO procedure inventory',
    description: 'Lockout/tagout procedures with revision, asset and review date. Pick "Review due" for the ones overdue or due within 30 days.',
    module: 'Lockout / Tagout',
    permission: 'loto.view',
    columns: [
      { key: 'procedure_number', label: 'Procedure', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'revision', label: 'Revision', type: 'number' },
      { key: 'asset', label: 'Asset', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'effective_date', label: 'Effective', type: 'date' },
      { key: 'next_review_date', label: 'Next review', type: 'date' },
      { key: 'days_until_review', label: 'Days until review', type: 'number' }
    ],
    defaultPreset: 'all',
    statuses: [...labels(['draft', 'review', 'approved']), { key: 'review_due', label: 'Review due (overdue or within 30 days)' }],
    groupable: ['status', 'location'],
    load: async ({ organizationId, userId, permission, params, today }) => {
      const rows = await getScopedLotoProcedures({ organizationId, userId, permission })

      return rows
        .filter((row: any) => !row.retired_at)
        .map((row: any): ReportRecord => {
          const review = isoDay(row.next_review_date)
          const daysUntil = review ? daysBetween(today, review) : null
          const reviewDue = daysUntil !== null && daysUntil <= 30

          return {
            day: null,
            locationId: row.forge_assets?.location_id || null,
            status: params.status === 'review_due' ? (reviewDue ? 'review_due' : row.status) : row.status,
            cells: {
              procedure_number: row.procedure_number,
              title: row.title,
              status: humanizeKey(row.status),
              revision: Number(row.revision_number) || 0,
              asset: row.forge_assets ? [row.forge_assets.asset_number, row.forge_assets.name].filter(Boolean).join(' · ') : null,
              location: lookupName(row.forge_assets?.locations),
              effective_date: row.effective_date,
              next_review_date: row.next_review_date,
              days_until_review: daysUntil
            }
          }
        })
    }
  },
  {
    key: 'loto.lockouts',
    name: 'Lockout history',
    description: 'Lockouts started in the period, with procedure, asset, lock holders and whether energy control and restoration were verified.',
    module: 'Lockout / Tagout',
    permission: 'loto.view',
    columns: [
      { key: 'lockout_number', label: 'Lockout', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'procedure', label: 'Procedure', type: 'text' },
      { key: 'asset', label: 'Asset', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'work_description', label: 'Work', type: 'text' },
      { key: 'started_at', label: 'Started', type: 'datetime' },
      { key: 'completed_at', label: 'Completed', type: 'datetime' },
      { key: 'lock_holders', label: 'Lock holders', type: 'text' },
      { key: 'locks', label: 'Locks', type: 'number' },
      { key: 'energy_verified', label: 'Energy control verified', type: 'boolean' },
      { key: 'restoration_verified', label: 'Restoration verified', type: 'boolean' }
    ],
    dateLabel: 'Started',
    defaultPreset: '90d',
    statuses: labels(['in_progress', 'verified', 'completed', 'canceled']),
    groupable: ['status', 'procedure', 'asset', 'location'],
    load: async ({ organizationId, userId, permission }) => {
      const rows = await getScopedLockouts({ organizationId, userId, permission, view: 'all' })

      return rows.map((row: any): ReportRecord => {
        const locks = (row.forge_loto_application_locks || []) as any[]
        const procedure = row.forge_loto_procedures

        return {
          day: isoDay(row.started_at),
          locationId: row.forge_assets?.location_id || null,
          status: row.status,
          cells: {
            lockout_number: row.lockout_number,
            status: humanizeKey(row.status),
            procedure: procedure ? [procedure.procedure_number, procedure.title].filter(Boolean).join(' · ') : null,
            asset: row.forge_assets ? [row.forge_assets.asset_number, row.forge_assets.name].filter(Boolean).join(' · ') : null,
            location: lookupName(row.forge_assets?.locations),
            work_description: row.work_description,
            started_at: row.started_at,
            completed_at: row.completed_at,
            lock_holders: [...new Set(locks.map(lock => lock.holder_name).filter(Boolean))].join(', ') || null,
            locks: locks.length,
            energy_verified: Boolean(row.energy_control_verified || row.zero_energy_confirmed),
            restoration_verified: Boolean(row.restoration_verified)
          }
        }
      })
    }
  },
  {
    key: 'assets.register',
    name: 'Asset register',
    description: 'Assets and equipment in service, with type, status, condition, criticality, custodian and warranty.',
    module: 'Assets & Equipment',
    permission: 'assets_equipment.view',
    columns: [
      { key: 'asset_number', label: 'Asset', type: 'text' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'asset_type', label: 'Type', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'condition', label: 'Condition', type: 'text' },
      { key: 'criticality', label: 'Criticality', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'custodian', label: 'Custodian', type: 'text' },
      { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'serial_number', label: 'Serial', type: 'text' },
      { key: 'in_service_date', label: 'In service', type: 'date' },
      { key: 'warranty_expires_on', label: 'Warranty ends', type: 'date' }
    ],
    defaultPreset: 'all',
    statuses: labels(['active', 'maintenance', 'out_of_service']),
    groupable: ['asset_type', 'status', 'condition', 'criticality', 'location'],
    load: async ({ organizationId, userId, permission }) => {
      const rows = await getScopedAssets({ organizationId, userId, permission })

      return rows.map(
        (row: any): ReportRecord => ({
          day: null,
          locationId: row.location_id,
          status: row.status,
          cells: {
            asset_number: row.asset_number,
            name: row.name,
            asset_type: humanizeKey(row.asset_type),
            status: humanizeKey(row.status),
            condition: humanizeKey(row.condition),
            criticality: humanizeKey(row.criticality),
            location: lookupName(row.locations),
            custodian: personName(row.forge_personnel),
            manufacturer: row.manufacturer,
            model: row.model,
            serial_number: row.serial_number,
            in_service_date: row.in_service_date,
            warranty_expires_on: row.warranty_expires_on
          }
        })
      )
    }
  },
  {
    key: 'dot.driver_files',
    name: 'DOT driver qualification',
    description: "Driver qualification files with license, medical card, MVR and eye-exam expirations, the next date due and what's missing.",
    module: 'DOT',
    permission: 'dot.view',
    columns: [
      { key: 'driver', label: 'Driver', type: 'text' },
      { key: 'file_number', label: 'File', type: 'text' },
      { key: 'license', label: 'License', type: 'text' },
      { key: 'license_expires_on', label: 'License expires', type: 'date' },
      { key: 'medical_certificate_expires_on', label: 'Medical card expires', type: 'date' },
      { key: 'mvr_expires_on', label: 'MVR due', type: 'date' },
      { key: 'eye_exam_expires_on', label: 'Eye exam expires', type: 'date' },
      { key: 'next_due', label: 'Next due', type: 'date' },
      { key: 'days_until_due', label: 'Days until due', type: 'number' },
      { key: 'standing', label: 'Standing', type: 'text' },
      { key: 'issues', label: 'Issues', type: 'text' }
    ],
    defaultPreset: 'all',
    statuses: [
      { key: 'expired', label: 'Expired' },
      { key: 'due_soon', label: 'Due within 30 days' },
      { key: 'current', label: 'Current' }
    ],
    groupable: ['standing'],
    load: async ({ organizationId, userId, permission, today }) => {
      const files = await getScopedDriverFiles({ organizationId, userId, permission, todayIso: today })

      return files.map((file: any): ReportRecord => {
        const raw = file.raw || {}
        const nextDue = isoDay(file.nextDue)
        const daysUntil = nextDue ? daysBetween(today, nextDue) : null
        const standing = daysUntil === null ? 'current' : daysUntil < 0 ? 'expired' : daysUntil <= 30 ? 'due_soon' : 'current'
        const issues = Array.isArray(file.issues) ? file.issues.map((issue: any) => (typeof issue === 'string' ? issue : issue?.label || issue?.message || '')).filter(Boolean) : []

        return {
          day: null,
          locationId: file.person?.location_id || null,
          status: standing,
          cells: {
            driver: file.name || personName(file.person),
            file_number: file.file_number,
            license: [raw.license_class, raw.license_state, raw.license_number].filter(Boolean).join(' ') || null,
            license_expires_on: raw.license_expires_on || null,
            medical_certificate_expires_on: raw.medical_certificate_expires_on || null,
            mvr_expires_on: raw.mvr_expires_on || null,
            eye_exam_expires_on: raw.diabetic_eye_exam_expires_on || null,
            next_due: nextDue,
            days_until_due: daysUntil,
            standing: standing === 'due_soon' ? 'Due within 30 days' : humanizeKey(standing),
            issues: issues.join('; ') || null
          }
        }
      })
    }
  },
  {
    key: 'tasks.list',
    name: 'Tasks',
    description: 'Tasks by due date, with assignee, priority and whether they are overdue.',
    module: 'Tasks',
    permission: 'tasks.view',
    columns: [
      { key: 'task_number', label: 'Task', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'priority', label: 'Priority', type: 'text' },
      { key: 'assignee', label: 'Assigned to', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'due_at', label: 'Due', type: 'date' },
      { key: 'completed_at', label: 'Completed', type: 'date' },
      { key: 'days_overdue', label: 'Days overdue', type: 'number' }
    ],
    dateLabel: 'Due',
    defaultPreset: 'all',
    statuses: [...labels(['open', 'in_progress', 'blocked', 'completed', 'canceled']), { key: 'overdue', label: 'Overdue' }],
    groupable: ['status', 'priority', 'assignee', 'location', 'source'],
    load: async ({ organizationId, userId, permission, params, today }) => {
      const rows = await getScopedTasks({ organizationId, userId, permission })

      return rows
        .filter((row: any) => !row.archived_at)
        .map((row: any): ReportRecord => {
          const due = isoDay(row.due_at)
          const open = !['completed', 'canceled'].includes(row.status)
          const overdue = open && Boolean(due) && (due as string) < today

          return {
            day: due,
            locationId: row.location_id,
            status: params.status === 'overdue' ? (overdue ? 'overdue' : row.status) : row.status,
            cells: {
              task_number: row.task_number,
              title: row.title,
              status: humanizeKey(row.status),
              priority: humanizeKey(row.priority),
              assignee: personName(row.forge_personnel),
              location: lookupName(row.locations),
              source: humanizeKey(row.source_type),
              due_at: row.due_at,
              completed_at: row.completed_at,
              days_overdue: overdue ? daysBetween(due as string, today) : null
            }
          }
        })
    }
  }
]

const byKey = new Map(REPORTS.map(report => [report.key, report]))

export const getReportDefinition = (key: string) => byKey.get(key) || null

/** The catalog without the loaders, for client components. */
export const reportMeta = (report: ReportDefinition): ReportDefinitionMeta => {
  const meta: Partial<ReportDefinition> = { ...report }

  delete meta.load

  return meta as ReportDefinitionMeta
}

import { createServiceRoleClient } from '@repo/supabase/server'

import type { FormField } from '@/lib/forgeFormRules'
import { normalizeFormSchema } from '@/lib/forgeFormRules'
import type { ParsedImportTemplate } from '@/lib/forgeFormImportRules'
import { FORM_IMPORT_SOURCE_SYSTEM, mapLegacyAnswers, parseFormCatalog } from '@/lib/forgeFormImportRules'

/**
 * Port slice 9: imports a Forge 1.0 form catalog (templates and submissions) into forge_form_templates /
 * forge_form_submissions. Server only; callers check forms.manage.
 *
 * Idempotent by source_system 'forge_1x' + source_id:
 * - a template seen before is updated (working copy, and version 1 when it was never published) only while
 *   nobody changed it in 2.0 since: it has no version after 1 and its working copy still matches version 1;
 * - a submission seen before is skipped.
 * Dry run makes the same decisions without writing.
 */

export type FormImportSummary = {
  dryRun: boolean
  templates: { inFile: number; created: number; updated: number; skipped: number }
  submissions: { inFile: number; created: number; skipped: number; unlinked: number }
  problems: string[]
}

const MAX_PROBLEMS = 200
const CHUNK = 100

const chunks = <T>(list: T[], size = CHUNK) => {
  const out: T[][] = []

  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))

  return out
}

// jsonb does not keep key order, so compare with sorted keys.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter(key => (value as Record<string, unknown>)[key] !== undefined)
        .map(key => [key, canonical((value as Record<string, unknown>)[key])])
    )
  }

  return value
}

const sameJson = (left: unknown, right: unknown) => JSON.stringify(canonical(left ?? null)) === JSON.stringify(canonical(right ?? null))

type TemplateTarget = { id: string | null; versionId: string | null; fields: FormField[]; idMap: Record<string, string>; title: string }

export const runFormCatalogImport = async ({
  organizationId,
  userId,
  payload,
  dryRun
}: {
  organizationId: string
  userId: string
  payload: unknown
  dryRun: boolean
}): Promise<FormImportSummary> => {
  const supabase = createServiceRoleClient() as any
  const catalog = parseFormCatalog(payload)
  const problems: string[] = [...catalog.problems]

  const summary: FormImportSummary = {
    dryRun,
    templates: { inFile: catalog.templates.length, created: 0, updated: 0, skipped: 0 },
    submissions: { inFile: catalog.submissions.length, created: 0, skipped: 0, unlinked: 0 },
    problems
  }

  const addProblem = (message: string) => {
    if (problems.length < MAX_PROBLEMS) problems.push(message)
  }

  // Templates already imported, from this file or linked by submissions in it.
  const sourceIds = [...new Set([...catalog.templates.map(item => item.sourceId), ...catalog.submissions.map(item => item.templateSourceId).filter(Boolean)])] as string[]
  const existing = new Map<string, any>()

  for (const part of chunks(sourceIds)) {
    const { data, error } = await supabase
      .from('forge_form_templates')
      .select('id, title, description, category, status, schema, current_version, source_id')
      .eq('organization_id', organizationId)
      .eq('source_system', FORM_IMPORT_SOURCE_SYSTEM)
      .in('source_id', part)

    if (error) throw new Error('Unable to read form templates: ' + error.message)
    for (const row of data || []) existing.set(row.source_id, row)
  }

  const latestVersions = new Map<string, { id: string; version: number; schema: unknown }>()
  const existingIds = [...existing.values()].map(row => row.id)

  for (const part of chunks(existingIds)) {
    const { data, error } = await supabase
      .from('forge_form_template_versions')
      .select('id, template_id, version, schema')
      .eq('organization_id', organizationId)
      .in('template_id', part)
      .order('version', { ascending: false })

    if (error) throw new Error('Unable to read form versions: ' + error.message)

    for (const row of data || []) if (!latestVersions.has(row.template_id)) latestVersions.set(row.template_id, row)
  }

  const targets = new Map<string, TemplateTarget>()
  const now = new Date().toISOString()

  const publishVersionOne = async (templateId: string, template: ParsedImportTemplate) => {
    const { data, error } = await supabase
      .from('forge_form_template_versions')
      .insert({ organization_id: organizationId, template_id: templateId, version: 1, title: template.title, schema: template.schema, published_by: userId, published_at: now })
      .select('id')
      .single()

    if (error) throw new Error(`Unable to publish "${template.title}": ${error.message}`)

    return data.id as string
  }

  for (const template of catalog.templates) {
    for (const problem of template.problems) addProblem(problem)

    const target: TemplateTarget = { id: null, versionId: null, fields: template.schema.fields, idMap: template.idMap, title: template.title }

    targets.set(template.sourceId, target)

    if (!template.schema.fields.length || template.problems.some(problem => /too large/.test(problem))) {
      summary.templates.skipped += 1
      continue
    }

    const row = existing.get(template.sourceId)

    if (!row) {
      summary.templates.created += 1
      if (dryRun) continue

      const { data, error } = await supabase
        .from('forge_form_templates')
        .insert({
          organization_id: organizationId,
          title: template.title,
          description: template.description,
          category: template.category,
          status: template.status,
          schema: template.schema,
          current_version: template.publish ? 1 : 0,
          source_system: FORM_IMPORT_SOURCE_SYSTEM,
          source_id: template.sourceId,
          created_by: userId,
          updated_by: userId,
          archived_at: template.status === 'archived' ? now : null,
          archived_by: template.status === 'archived' ? userId : null
        })
        .select('id')
        .single()

      if (error) throw new Error(`Unable to import "${template.title}": ${error.message}`)

      target.id = data.id
      if (template.publish) target.versionId = await publishVersionOne(data.id, template)
      continue
    }

    const latest = latestVersions.get(row.id) || null

    target.id = row.id
    target.versionId = latest?.id ?? null

    if (latest) target.fields = normalizeFormSchema(latest.schema).schema.fields
    else target.fields = normalizeFormSchema(row.schema).schema.fields

    const changedInTwo = (latest && latest.version > 1) || row.current_version > 1 || (latest && !sameJson(latest.schema, row.schema))

    if (changedInTwo) {
      summary.templates.skipped += 1
      if (!sameJson(row.schema, template.schema)) addProblem(`${template.title}: changed in 2.0 since the last import, so it was not overwritten.`)
      continue
    }

    const unchanged =
      sameJson(row.schema, template.schema) &&
      row.title === template.title &&
      (row.description ?? null) === template.description &&
      (row.category ?? null) === template.category &&
      (Boolean(latest) || !template.publish)

    if (unchanged) {
      summary.templates.skipped += 1
      continue
    }

    summary.templates.updated += 1
    target.fields = template.schema.fields
    if (dryRun) continue

    const publishNow = template.publish && !latest

    const { error } = await supabase
      .from('forge_form_templates')
      .update({
        title: template.title,
        description: template.description,
        category: template.category,
        schema: template.schema,
        ...(publishNow ? { current_version: 1, status: template.status } : {}),
        updated_by: userId,
        updated_at: now
      })
      .eq('organization_id', organizationId)
      .eq('id', row.id)

    if (error) throw new Error(`Unable to update "${template.title}": ${error.message}`)
    if (publishNow) target.versionId = await publishVersionOne(row.id, template)
  }

  // Templates referenced by submissions but not in this file (imported earlier).
  for (const [sourceId, row] of existing) {
    if (targets.has(sourceId)) continue

    const latest = latestVersions.get(row.id) || null

    targets.set(sourceId, {
      id: row.id,
      versionId: latest?.id ?? null,
      fields: normalizeFormSchema(latest ? latest.schema : row.schema).schema.fields,
      idMap: {},
      title: row.title
    })
  }

  if (!catalog.submissions.length) return summary

  // Submissions already imported.
  const seenSubmissions = new Set<string>()

  for (const part of chunks(catalog.submissions.map(item => item.sourceId))) {
    const { data, error } = await supabase
      .from('forge_form_submissions')
      .select('source_id')
      .eq('organization_id', organizationId)
      .eq('source_system', FORM_IMPORT_SOURCE_SYSTEM)
      .in('source_id', part)

    if (error) throw new Error('Unable to read form submissions: ' + error.message)
    for (const row of data || []) seenSubmissions.add(row.source_id)
  }

  const prepared: Array<{ submission: (typeof catalog.submissions)[number]; target: TemplateTarget; answers: Record<string, unknown>; employeeNumber: string | null }> = []

  for (const submission of catalog.submissions) {
    if (seenSubmissions.has(submission.sourceId)) {
      summary.submissions.skipped += 1
      continue
    }

    const target = submission.templateSourceId ? targets.get(submission.templateSourceId) : null

    if (!target || (!target.id && !dryRun) || (dryRun && !target.id && !catalog.templates.some(item => item.sourceId === submission.templateSourceId && item.schema.fields.length))) {
      summary.submissions.unlinked += 1
      summary.submissions.skipped += 1
      addProblem(`Submission ${submission.sourceId}: its form (${submission.templateSourceId || 'none'}) is not in the file and was not imported before.`)
      continue
    }

    const mapped = mapLegacyAnswers(target.fields, target.idMap, submission.rawAnswers, submission.submittedAt)

    if (mapped.problems.some(problem => /too large/.test(problem))) {
      summary.submissions.skipped += 1
      addProblem(`Submission ${submission.sourceId}: the answers are too large to import.`)
      continue
    }

    for (const problem of mapped.problems) addProblem(`Submission ${submission.sourceId}: ${problem}`)

    prepared.push({ submission, target, answers: mapped.answers, employeeNumber: mapped.employeeNumber })
  }

  summary.submissions.created = prepared.length

  if (dryRun || !prepared.length) return summary

  // Subjects by employee number.
  const numbers = [...new Set(prepared.map(item => item.employeeNumber).filter(Boolean))] as string[]
  const personnelByNumber = new Map<string, string>()

  for (const part of chunks(numbers)) {
    const { data } = await supabase
      .from('forge_personnel')
      .select('id, employee_number')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .in('employee_number', part)

    for (const row of data || []) personnelByNumber.set(row.employee_number, row.id)
  }

  for (const part of chunks(prepared, 50)) {
    const rows = []

    for (const item of part) {
      const { data: number, error: numberError } = await supabase.rpc('next_forge_form_submission_number', { p_organization_id: organizationId })

      if (numberError) throw new Error('Unable to number form submissions: ' + numberError.message)

      const { submission, target } = item
      const archived = submission.status === 'archived'

      rows.push({
        organization_id: organizationId,
        submission_number: number,
        template_id: target.id,
        template_version_id: target.versionId,
        title: (submission.title === 'Form submission' ? target.title : submission.title).slice(0, 300) || 'Form submission',
        status: submission.status,
        answers: item.answers,
        subject_personnel_id: (item.employeeNumber && personnelByNumber.get(item.employeeNumber)) || null,
        submitted_by: null,
        submitted_at: submission.status === 'draft' ? null : submission.submittedAt || submission.createdAt || now,
        source_system: FORM_IMPORT_SOURCE_SYSTEM,
        source_id: submission.sourceId,
        created_by: userId,
        updated_by: userId,
        created_at: submission.createdAt || submission.submittedAt || now,
        archived_at: archived ? now : null,
        archived_by: archived ? userId : null
      })
    }

    const { data: inserted, error } = await supabase.from('forge_form_submissions').insert(rows).select('id, source_id')

    if (error) throw new Error('Unable to import form submissions: ' + error.message)

    const activity = (inserted || []).map((row: { id: string; source_id: string }) => ({
      organization_id: organizationId,
      submission_id: row.id,
      activity_type: 'imported',
      message: 'Imported from Forge 1.0.',
      actor_user_id: userId,
      metadata: { source_system: FORM_IMPORT_SOURCE_SYSTEM, source_id: row.source_id }
    }))

    if (activity.length) await supabase.from('forge_form_submission_activity').insert(activity)
  }

  return summary
}

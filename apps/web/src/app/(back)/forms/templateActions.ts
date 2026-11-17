'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { countAnswerFields, parseTemplateCsv, titleFromFilename } from '@/lib/forgeFormBuilderRules'
import type { FormSchema } from '@/lib/forgeFormRules'
import { normalizeFormSchema } from '@/lib/forgeFormRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

/**
 * Port slice 9 (piece A): form template builder actions. Every action needs forms.manage.
 * - saveFormTemplateDraft: creates or updates the working copy (schema after normalizeFormSchema).
 * - publishFormTemplate: saves the working copy and freezes it as version current_version + 1.
 * - archive / restore / duplicate, and importChecklistCsv (a CSV into a new draft).
 * Audit rows go to forge_creator_audit_log with entity_type 'form_template'.
 */

export type TemplateDetails = {
  id?: string | null
  title: string
  description?: string | null
  category?: string | null
  locationId?: string | null
  divisionId?: string | null
  schema: unknown
}

export type TemplateActionResult =
  | { ok: true; id: string; message: string; schema?: FormSchema; warnings?: string[]; version?: number; status?: string }
  | { ok: false; error: string; errors?: string[] }

const clean = (value: unknown, max: number) => {
  const text = typeof value === 'string' ? value.trim() : ''

  return text ? text.slice(0, max) : null
}

const audit = async ({
  supabase,
  actorUserId,
  organizationId,
  action,
  entityId,
  before,
  after
}: {
  supabase: any
  actorUserId: string
  organizationId: string
  action: string
  entityId: string
  before?: unknown
  after?: unknown
}) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: 'form_template',
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

const revalidate = (id?: string) => {
  revalidatePath('/forms')
  if (id) revalidatePath(`/forms/templates/${id}`)
}

/** Labels the builder sent without a label are dropped by normalizeFormSchema; say so. */
const unlabelledWarnings = (raw: unknown) => {
  const list = raw && typeof raw === 'object' ? (raw as { fields?: unknown }).fields : null

  if (!Array.isArray(list)) return []

  const count = list.filter(item => {
    const field = (item || {}) as Record<string, unknown>

    return !String(field.label ?? '').trim() && !(field.type === 'content' && String(field.content ?? '').trim())
  }).length

  return count ? [`${count} field${count === 1 ? '' : 's'} without a label ${count === 1 ? 'was' : 'were'} removed.`] : []
}

const manageContext = async () => {
  const context = await requireTenantPermission('forms.manage')

  return { context, organizationId: context.activeOrganization.id as string, userId: context.user.id as string, supabase: createServiceRoleClient() as any }
}

const loadTemplate = async (supabase: any, organizationId: string, id: string) => {
  const { data } = await supabase.from('forge_form_templates').select('*').eq('organization_id', organizationId).eq('id', id).maybeSingle()

  return data
}

/** Checks the details and location / division (must belong to the company) and returns the columns to write. */
const prepare = async (supabase: any, organizationId: string, details: TemplateDetails) => {
  const title = clean(details.title, 200)

  if (!title) return { error: 'Give the form a title.' }

  const [locationId, divisionId] = [clean(details.locationId, 64), clean(details.divisionId, 64)]

  if (locationId) {
    const { data } = await supabase.from('locations').select('id').eq('organization_id', organizationId).eq('id', locationId).maybeSingle()

    if (!data) return { error: 'That location is not part of this company.' }
  }

  if (divisionId) {
    const { data } = await supabase.from('divisions').select('id').eq('organization_id', organizationId).eq('id', divisionId).maybeSingle()

    if (!data) return { error: 'That division is not part of this company.' }
  }

  const { schema, errors } = normalizeFormSchema(details.schema)

  return {
    columns: {
      title,
      description: clean(details.description, 4000),
      category: clean(details.category, 100),
      location_id: locationId,
      division_id: divisionId,
      schema
    },
    schema,
    errors: [...unlabelledWarnings(details.schema), ...errors]
  }
}

const writeDraft = async ({
  supabase,
  organizationId,
  userId,
  details,
  columns
}: {
  supabase: any
  organizationId: string
  userId: string
  details: TemplateDetails
  columns: Record<string, unknown>
}): Promise<{ id: string; before: any; after: any } | { error: string }> => {
  const now = new Date().toISOString()

  if (!details.id) {
    const { data, error } = await supabase
      .from('forge_form_templates')
      .insert({ ...columns, organization_id: organizationId, status: 'draft', created_by: userId, updated_by: userId })
      .select('*')
      .single()

    if (error || !data) return { error: error?.message || 'Unable to create the form.' }

    await audit({ supabase, actorUserId: userId, organizationId, action: 'form_template.created', entityId: data.id, after: data })

    return { id: data.id, before: null, after: data }
  }

  const before = await loadTemplate(supabase, organizationId, details.id)

  if (!before) return { error: 'Form not found.' }
  if (before.status === 'archived') return { error: 'This form is archived. Restore it before editing.' }

  const { data, error } = await supabase
    .from('forge_form_templates')
    .update({ ...columns, updated_by: userId, updated_at: now })
    .eq('organization_id', organizationId)
    .eq('id', details.id)
    .select('*')
    .single()

  if (error || !data) return { error: error?.message || 'Unable to save the form.' }

  return { id: data.id, before, after: data }
}

export const saveFormTemplateDraft = async (details: TemplateDetails): Promise<TemplateActionResult> => {
  const { organizationId, userId, supabase } = await manageContext()
  const prepared = await prepare(supabase, organizationId, details)

  if ('error' in prepared) return { ok: false, error: prepared.error as string }

  const written = await writeDraft({ supabase, organizationId, userId, details, columns: prepared.columns })

  if ('error' in written) return { ok: false, error: written.error }

  if (written.before) {
    await audit({ supabase, actorUserId: userId, organizationId, action: 'form_template.updated', entityId: written.id, before: written.before, after: written.after })
  }

  revalidate(written.id)

  return {
    ok: true,
    id: written.id,
    schema: prepared.schema,
    warnings: prepared.errors,
    status: written.after.status,
    message: prepared.errors.length ? 'Draft saved. Fix the problems listed before publishing.' : 'Draft saved.'
  }
}

/**
 * Saves the builder's working copy and publishes it as the next version. Refused (nothing written) when the
 * form has no fields to answer or the schema has problems. Earlier versions are never changed.
 */
export const publishFormTemplate = async (details: TemplateDetails): Promise<TemplateActionResult> => {
  const { organizationId, userId, supabase } = await manageContext()
  const prepared = await prepare(supabase, organizationId, details)

  if ('error' in prepared) return { ok: false, error: prepared.error as string }

  if (prepared.errors.length) return { ok: false, error: 'Fix these problems before publishing.', errors: prepared.errors }
  if (!countAnswerFields(prepared.schema.fields)) return { ok: false, error: 'Add at least one question before publishing.' }

  const written = await writeDraft({ supabase, organizationId, userId, details, columns: prepared.columns })

  if ('error' in written) return { ok: false, error: written.error }

  const previous = Number(written.after.current_version || 0)
  const version = previous + 1

  const { data: versionRow, error: versionError } = await supabase
    .from('forge_form_template_versions')
    .insert({
      organization_id: organizationId,
      template_id: written.id,
      version,
      title: prepared.columns.title,
      schema: prepared.schema,
      published_by: userId
    })
    .select('id, version, published_at')
    .single()

  if (versionError || !versionRow) {
    return {
      ok: false,
      error: versionError?.code === '23505' ? 'Someone else published this form at the same time. Reload and try again.' : versionError?.message || 'Unable to publish.'
    }
  }

  const { data: after, error } = await supabase
    .from('forge_form_templates')
    .update({ current_version: version, status: 'active', updated_by: userId, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', written.id)
    .eq('current_version', previous)
    .select('*')
    .maybeSingle()

  if (error || !after) return { ok: false, error: error?.message || 'The form changed while publishing. Reload and try again.' }

  await audit({
    supabase,
    actorUserId: userId,
    organizationId,
    action: 'form_template.published',
    entityId: written.id,
    before: written.before ? { status: written.before.status, current_version: written.before.current_version } : null,
    after: { status: 'active', current_version: version, version_id: versionRow.id, field_count: prepared.schema.fields.length }
  })

  revalidate(written.id)

  return { ok: true, id: written.id, schema: prepared.schema, version, status: 'active', message: `Published version ${version}.` }
}

const setArchived = async (id: string, archive: boolean): Promise<TemplateActionResult> => {
  const { organizationId, userId, supabase } = await manageContext()
  const before = await loadTemplate(supabase, organizationId, id)

  if (!before) return { ok: false, error: 'Form not found.' }
  if (archive === (before.status === 'archived')) return { ok: true, id, status: before.status, message: archive ? 'Already archived.' : 'Not archived.' }

  const now = new Date().toISOString()
  const status = archive ? 'archived' : Number(before.current_version) > 0 ? 'active' : 'draft'

  const { error } = await supabase
    .from('forge_form_templates')
    .update({ status, archived_at: archive ? now : null, archived_by: archive ? userId : null, updated_by: userId, updated_at: now })
    .eq('organization_id', organizationId)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  await audit({
    supabase,
    actorUserId: userId,
    organizationId,
    action: archive ? 'form_template.archived' : 'form_template.restored',
    entityId: id,
    before: { status: before.status },
    after: { status }
  })

  revalidate(id)

  return { ok: true, id, status, message: archive ? 'Form archived. Existing submissions are kept.' : 'Form restored.' }
}

export const archiveFormTemplate = async (id: string) => setArchived(id, true)

export const restoreFormTemplate = async (id: string) => setArchived(id, false)

/** A new draft with the same details and working copy, titled "Copy of ...". */
export const duplicateFormTemplate = async (id: string): Promise<TemplateActionResult> => {
  const { organizationId, userId, supabase } = await manageContext()
  const source = await loadTemplate(supabase, organizationId, id)

  if (!source) return { ok: false, error: 'Form not found.' }

  const { data, error } = await supabase
    .from('forge_form_templates')
    .insert({
      organization_id: organizationId,
      title: `Copy of ${source.title}`.slice(0, 200),
      description: source.description,
      category: source.category,
      location_id: source.location_id,
      division_id: source.division_id,
      schema: normalizeFormSchema(source.schema).schema,
      status: 'draft',
      created_by: userId,
      updated_by: userId
    })
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: error?.message || 'Unable to duplicate the form.' }

  await audit({ supabase, actorUserId: userId, organizationId, action: 'form_template.duplicated', entityId: data.id, after: { ...data, duplicated_from: id } })
  revalidate()

  return { ok: true, id: data.id, status: 'draft', message: 'Copy created as a draft.' }
}

const MAX_IMPORT_BYTES = 1_000_000

/** A CSV checklist or field sheet into a new template draft (see parseTemplateCsv for the layouts). */
export const importChecklistCsv = async ({
  filename,
  text,
  title,
  category
}: {
  filename: string
  text: string
  title?: string | null
  category?: string | null
}): Promise<TemplateActionResult> => {
  const { organizationId, userId, supabase } = await manageContext()

  if (!/\.csv$/i.test(String(filename || ''))) return { ok: false, error: 'Upload a .csv file. Excel files: save the sheet as CSV first.' }
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The file is empty.' }
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'The file is too large (1 MB at most).' }

  let parsed

  try {
    parsed = parseTemplateCsv(text, titleFromFilename(filename))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not read the CSV.' }
  }

  const { schema, errors } = normalizeFormSchema({ fields: parsed.fields })

  if (!schema.fields.length) return { ok: false, error: 'No fields found in the file.' }

  const { data, error } = await supabase
    .from('forge_form_templates')
    .insert({
      organization_id: organizationId,
      title: (clean(title, 200) || parsed.title).slice(0, 200),
      category: clean(category, 100),
      description: `Imported from ${String(filename).replace(/^.*[\\/]/, '').slice(0, 200)}.`,
      schema,
      status: 'draft',
      source_system: 'checklist_import',
      created_by: userId,
      updated_by: userId
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message || 'Unable to create the form.' }

  await audit({
    supabase,
    actorUserId: userId,
    organizationId,
    action: 'form_template.imported',
    entityId: data.id,
    after: { filename, mode: parsed.mode, field_count: schema.fields.length }
  })

  revalidate()

  const warnings = [...parsed.warnings, ...errors]

  return { ok: true, id: data.id, schema, warnings, status: 'draft', message: `Imported ${countAnswerFields(schema.fields)} questions into a new draft.` }
}

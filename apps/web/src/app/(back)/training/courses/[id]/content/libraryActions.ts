'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { trainingErrorMessage } from '@/lib/forgeTrainingLms'
import { MATERIAL_TOPICS, parseQuestionCsv, parseQuestionText } from '@/lib/forgeTrainingReportRules'
import type { ImportedQuestion } from '@/lib/forgeTrainingReportRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { error?: string; message?: string; id?: string }
export type ImportPreview = { questions: ImportedQuestion[]; errors: string[] }

const IMPORT_MAX_BYTES = 15 * 1024 * 1024

const refresh = (courseId: string) => {
  revalidatePath(`/training/courses/${courseId}/content`)
  revalidatePath('/training/library')
}

const contentContext = async () => {
  const context = await requireTenantPermission('training.manage_content')

  return { context, organizationId: context.activeOrganization.id, supabase: createServiceRoleClient() as any }
}

/** Text from a pasted block or an uploaded .txt, .csv or .pdf, parsed into questions. */
const readImport = async (form: FormData): Promise<ImportPreview> => {
  const file = form.get('file')
  const pasted = String(form.get('text') || '')

  if (file instanceof File && file.size > 0) {
    if (file.size > IMPORT_MAX_BYTES) return { questions: [], errors: ['Files must be under 15 MB.'] }

    const name = file.name.toLowerCase()

    if (name.endsWith('.csv')) return parseQuestionCsv(await file.text())
    if (name.endsWith('.txt')) return parseQuestionText(await file.text())

    if (name.endsWith('.pdf')) {
      const bytes = new Uint8Array(await file.arrayBuffer())

      if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') return { questions: [], errors: ['That file is not a PDF.'] }

      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(bytes)
      const { text } = await extractText(pdf, { mergePages: true })

      return parseQuestionText(Array.isArray(text) ? text.join('\n') : text)
    }

    return { questions: [], errors: ['Choose a .txt, .csv or .pdf file. Save Excel sheets as CSV first.'] }
  }

  if (!pasted.trim()) return { questions: [], errors: ['Paste questions or choose a file.'] }

  return /^[^\n]*\b(question|stem|prompt)\b[^\n]*[,;\t]/i.test(pasted.trimStart()) ? parseQuestionCsv(pasted) : parseQuestionText(pasted)
}

/** Parses without saving, so the author can check what will be added. */
export const previewQuestionImport = async (form: FormData): Promise<ImportPreview> => {
  await contentContext()

  return readImport(form)
}

/**
 * Adds parsed questions to a draft version, all or nothing. Questions only go into drafts: a published
 * version is frozen (the version guard refuses it too).
 */
export const importQuestions = async (form: FormData): Promise<Result & { added?: number }> => {
  const { context, organizationId, supabase } = await contentContext()
  const versionId = String(form.get('versionId') || '')
  const { data: version } = await supabase.from('forge_training_course_versions').select('id, course_id, status').eq('organization_id', organizationId).eq('id', versionId).maybeSingle()

  if (!version) return { error: 'Version not found.' }
  if (version.status !== 'draft') return { error: 'Questions can only be imported into a draft. Start a new draft first.' }

  const parsed = await readImport(form)

  if (parsed.errors.length) return { error: `Fix these first: ${parsed.errors.slice(0, 5).join(' ')}${parsed.errors.length > 5 ? ` (and ${parsed.errors.length - 5} more)` : ''}` }
  if (!parsed.questions.length) return { error: 'No questions to import.' }

  const { data: last } = await supabase.from('forge_training_questions').select('sort_order').eq('version_id', versionId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const start = Number(last?.sort_order || 0)

  const rows = parsed.questions.map((question, index) => ({
    organization_id: organizationId,
    version_id: versionId,
    stem: question.stem.slice(0, 2000),
    choices: question.choices.map(choice => choice.slice(0, 500)),
    correct_index: question.correctIndex,
    explanation: question.explanation ? question.explanation.slice(0, 2000) : null,
    sort_order: start + (index + 1) * 10,
    is_active: true
  }))

  const { error } = await supabase.from('forge_training_questions').insert(rows)

  if (error) return { error: trainingErrorMessage(error, 'Unable to import the questions.') }

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'training.questions_imported', entityType: 'training_course_version', entityId: versionId, afterValue: { added: rows.length } })
  refresh(version.course_id)
  revalidatePath(`/training/courses/${version.course_id}`)

  return { added: rows.length, message: `${rows.length} question${rows.length === 1 ? '' : 's'} added to the draft.` }
}

// ---------------------------------------------------------------------------
// Library: folders and topics
// ---------------------------------------------------------------------------

export const saveMaterialFolder = async ({ courseId, folderId, name }: { courseId: string; folderId?: string; name: string }): Promise<Result> => {
  const { context, organizationId, supabase } = await contentContext()
  const clean = name.trim()

  if (!clean || clean.length > 200) return { error: 'Folder names are 1-200 characters.' }

  const query = folderId
    ? supabase.from('forge_training_material_folders').update({ name: clean }).eq('organization_id', organizationId).eq('course_id', courseId).eq('id', folderId).select('id').maybeSingle()
    : supabase.from('forge_training_material_folders').insert({ organization_id: organizationId, course_id: courseId, name: clean, created_by: context.user.id }).select('id').single()

  const { data, error } = await query

  if (error) return { error: error.code === '23505' ? 'This course already has a folder with that name.' : trainingErrorMessage(error) }
  if (!data) return { error: 'Folder not found.' }

  refresh(courseId)

  return { id: data.id, message: folderId ? 'Folder renamed.' : 'Folder added.' }
}

/** Deleting a folder moves its materials to "No folder" (1.0 moved them to Uncategorized). */
export const deleteMaterialFolder = async ({ courseId, folderId }: { courseId: string; folderId: string }): Promise<Result> => {
  const { organizationId, supabase } = await contentContext()
  const { error } = await supabase.from('forge_training_material_folders').delete().eq('organization_id', organizationId).eq('course_id', courseId).eq('id', folderId)

  if (error) return { error: trainingErrorMessage(error) }

  refresh(courseId)

  return { message: 'Folder removed. Its materials are now in No folder.' }
}

export const setMaterialPlacement = async ({ courseId, materialId, folderId, topic }: { courseId: string; materialId: string; folderId: string | null; topic: string }): Promise<Result> => {
  const { organizationId, supabase } = await contentContext()

  if (!(MATERIAL_TOPICS as readonly string[]).includes(topic)) return { error: 'Pick a topic.' }

  const { data, error } = await supabase
    .from('forge_training_materials')
    .update({ folder_id: folderId || null, topic })
    .eq('organization_id', organizationId)
    .eq('course_id', courseId)
    .eq('id', materialId)
    .select('id')
    .maybeSingle()

  if (error) return { error: trainingErrorMessage(error) }
  if (!data) return { error: 'Material not found.' }

  refresh(courseId)

  return { message: 'Material saved.' }
}

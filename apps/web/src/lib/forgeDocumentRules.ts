/**
 * Port slice 12: Document Control rules (pure, unit-tested). Statuses, labels, folders (ported from 1.0's
 * document-control-folders.ts), review due states, file checks and who a document is distributed to.
 */

export const DOCUMENT_STATUSES = ['draft', 'in_review', 'published', 'obsolete'] as const
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export const VERSION_STATUSES = ['draft', 'in_review', 'approved', 'superseded'] as const
export type VersionStatus = (typeof VERSION_STATUSES)[number]

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
  obsolete: 'Obsolete'
}

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Current',
  superseded: 'Superseded'
}

/** Tailwind classes for a status badge. */
export const statusTone = (status: string) => {
  if (status === 'published' || status === 'approved') return 'bg-green-100 text-green-800'
  if (status === 'in_review') return 'bg-amber-100 text-amber-800'
  if (status === 'obsolete' || status === 'superseded') return 'bg-gray-200 text-gray-700'

  return 'bg-blue-100 text-blue-800'
}

export const DISTRIBUTION_SCOPES = ['organization', 'location', 'department', 'role'] as const
export type DistributionScope = (typeof DISTRIBUTION_SCOPES)[number]

export const DISTRIBUTION_SCOPE_LABELS: Record<DistributionScope, string> = {
  organization: 'Everyone in the company',
  location: 'Location',
  department: 'Department',
  role: 'Role'
}

export type Distribution = { scope_type: string; scope_id: string | null }

export type AudienceMember = {
  locationIds: string[]
  departmentIds: string[]
  roleIds: string[]
}

/**
 * Whether a document reaches a person (same rule as the database's forge_document_reaches_user). No
 * distribution rows means the whole company, as in 1.0.
 */
export const documentReaches = (distributions: Distribution[], member: AudienceMember) => {
  if (!distributions.length) return true

  return distributions.some(row => {
    if (row.scope_type === 'organization') return true
    if (!row.scope_id) return false
    if (row.scope_type === 'location') return member.locationIds.includes(row.scope_id)
    if (row.scope_type === 'department') return member.departmentIds.includes(row.scope_id)
    if (row.scope_type === 'role') return member.roleIds.includes(row.scope_id)

    return false
  })
}

/** Clean distribution input: known scopes only, ids for everything but organization, no duplicates. */
export const normalizeDistributions = (rows: { scope_type: string; scope_id?: string | null }[]): Distribution[] => {
  const seen = new Set<string>()
  const result: Distribution[] = []

  for (const row of rows) {
    const scopeType = String(row.scope_type || '').trim().toLowerCase()

    if (!(DISTRIBUTION_SCOPES as readonly string[]).includes(scopeType)) continue
    const scopeId = scopeType === 'organization' ? null : String(row.scope_id || '').trim() || null

    if (scopeType !== 'organization' && !scopeId) continue
    const key = scopeType + ':' + (scopeId || '')

    if (seen.has(key)) continue
    seen.add(key)
    result.push({ scope_type: scopeType, scope_id: scopeId })
  }

  // "Everyone" makes the other rows pointless.
  return result.some(row => row.scope_type === 'organization') ? [{ scope_type: 'organization', scope_id: null }] : result
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export type ReviewState = 'none' | 'ok' | 'due_soon' | 'overdue'

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  none: 'No review date',
  ok: 'On schedule',
  due_soon: 'Review due soon',
  overdue: 'Review overdue'
}

export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10)

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000)

/** Days from today to the review date (negative = overdue), or null without a date. */
export const daysUntil = (dueOn: string | null | undefined, now = new Date()) => {
  if (!dueOn || Number.isNaN(Date.parse(`${dueOn.slice(0, 10)}T00:00:00Z`))) return null

  return dayNumber(dueOn) - dayNumber(todayIso(now))
}

export const reviewState = (dueOn: string | null | undefined, warningDays = 30, now = new Date()): ReviewState => {
  const days = daysUntil(dueOn, now)

  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days <= warningDays) return 'due_soon'

  return 'ok'
}

/** Add whole months to a yyyy-mm-dd date, clamping to the month's last day (Postgres date + interval). */
export const addMonths = (iso: string, months: number) => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()

  target.setUTCDate(Math.min(day, lastDay))

  return target.toISOString().slice(0, 10)
}

export const REVIEW_INTERVAL_OPTIONS = [6, 12, 24, 36, 60] as const

// ---------------------------------------------------------------------------
// Folders (1.0 document-control-folders.ts)
// ---------------------------------------------------------------------------

export const BUILT_IN_DOCUMENT_FOLDERS = ['EHS Policies'] as const
export const MAX_FOLDER_NAME_LENGTH = 120

export type DocumentFolderSummary = {

  /** Stored folder id; null for built-in folders and categories without a stored folder. */
  id: string | null
  name: string
  documentCount: number
  builtIn: boolean
  canRename: boolean
  canDelete: boolean
}

/** Trim and collapse whitespace. Null when empty or too long. */
export const normalizeFolderName = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()

  if (!name || name.length > MAX_FOLDER_NAME_LENGTH) return null

  return name
}

export const folderKey = (name: string) => name.trim().toLowerCase()

export const isBuiltInFolder = (name: string, builtIns: readonly string[] = BUILT_IN_DOCUMENT_FOLDERS) =>
  builtIns.some(builtIn => folderKey(builtIn) === folderKey(name))

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export const compareFolderNames = (a: string, b: string) => nameCollator.compare(a, b)

export type FolderRenameCheck = { ok: true; name: string; caseOnly: boolean } | { ok: false; message: string }

export const checkFolderRename = (folders: readonly DocumentFolderSummary[], from: unknown, to: unknown): FolderRenameCheck => {
  const oldName = normalizeFolderName(from)
  const newName = normalizeFolderName(to)

  if (!oldName || !newName) return { ok: false, message: `Enter a folder name (up to ${MAX_FOLDER_NAME_LENGTH} characters).` }

  const current = folders.find(folder => folderKey(folder.name) === folderKey(oldName))

  if (!current) return { ok: false, message: 'Folder not found.' }
  if (!current.canRename) return { ok: false, message: `"${current.name}" can't be renamed.` }

  const caseOnly = folderKey(oldName) === folderKey(newName)

  if (!caseOnly && folders.some(folder => folderKey(folder.name) === folderKey(newName))) {
    return { ok: false, message: `A folder named "${newName}" already exists.` }
  }

  return { ok: true, name: newName, caseOnly }
}

export const mergeDocumentFolders = (input: {
  stored: ReadonlyArray<{ id: string; name: string }>
  categoryCounts: ReadonlyArray<{ category: string | null; count: number }>
  builtIns?: readonly string[]
}): DocumentFolderSummary[] => {
  const counts = new Map<string, number>()
  const categoryNames = new Map<string, string>()

  for (const row of input.categoryCounts) {
    const name = row.category?.trim()

    if (!name) continue
    const key = folderKey(name)

    counts.set(key, (counts.get(key) ?? 0) + row.count)
    if (!categoryNames.has(key)) categoryNames.set(key, name)
  }

  const byKey = new Map<string, DocumentFolderSummary>()

  const add = (id: string | null, name: string, builtIn: boolean) => {
    const key = folderKey(name)

    if (byKey.has(key)) return
    byKey.set(key, { id, name, documentCount: counts.get(key) ?? 0, builtIn, canRename: !builtIn, canDelete: !builtIn })
  }

  for (const name of input.builtIns ?? BUILT_IN_DOCUMENT_FOLDERS) add(null, name, true)
  for (const row of input.stored) add(row.id, row.name, false)
  for (const name of categoryNames.values()) add(null, name, false)

  return [...byKey.values()].sort((a, b) => compareFolderNames(a.name, b.name))
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

export const DOCUMENT_FILE_TYPES = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/msword': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'image/jpeg': 'JPEG image',
  'image/png': 'PNG image',
  'image/webp': 'WebP image',
  'text/plain': 'Text'
} as const

export type DocumentContentType = keyof typeof DOCUMENT_FILE_TYPES

const OFFICE_BY_EXTENSION: Record<string, DocumentContentType> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint'
}

export const fileExtension = (fileName: string) => {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName.trim())

  return match ? match[1].toLowerCase() : ''
}

/**
 * The file's real type from its first bytes (and, for Office files, which share container formats, its
 * extension). Null when the file isn't one of the allowed types. 1.0 trusted the browser's MIME type.
 */
export const sniffDocumentType = (bytes: Uint8Array, fileName: string): DocumentContentType | null => {
  const at = (offset: number, text: string) => [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0))
  const extension = fileExtension(fileName)

  if (at(0, '%PDF-')) return 'application/pdf'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && at(1, 'PNG')) return 'image/png'
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp'

  // ZIP container: docx / xlsx / pptx.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return ['docx', 'xlsx', 'pptx'].includes(extension) ? OFFICE_BY_EXTENSION[extension] : null
  }

  // OLE compound file: doc / xls / ppt.
  if ([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((value, i) => bytes[i] === value)) {
    return ['doc', 'xls', 'ppt'].includes(extension) ? OFFICE_BY_EXTENSION[extension] : null
  }

  if (extension === 'txt' && bytes.length > 0) {
    const sample = bytes.subarray(0, Math.min(bytes.length, 4096))

    if (sample.every(value => value === 9 || value === 10 || value === 13 || value >= 32)) return 'text/plain'
  }

  return null
}

export const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._ ()-]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200) || 'document'

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`

  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`
}

// ---------------------------------------------------------------------------
// What can be done with a version / document
// ---------------------------------------------------------------------------

export type VersionLike = { status: string; submitted_by: string | null }
export type DocumentLike = { status: string; archived_at: string | null }

export const isActiveDocument = (doc: DocumentLike) => !doc.archived_at && doc.status !== 'obsolete'

export const canUploadVersion = (doc: DocumentLike) => isActiveDocument(doc)

export const canSubmitVersion = (doc: DocumentLike, version: VersionLike, versions: VersionLike[]) =>
  isActiveDocument(doc) && version.status === 'draft' && !versions.some(other => other.status === 'in_review')

export const canDecideVersion = (doc: DocumentLike, version: VersionLike, userId: string, allowSelfApproval: boolean) =>
  isActiveDocument(doc) && version.status === 'in_review' && (allowSelfApproval || !version.submitted_by || version.submitted_by !== userId)

export const canObsolete = (doc: DocumentLike) => !doc.archived_at && (doc.status === 'published' || doc.status === 'in_review')

export const canConfirmReview = (doc: DocumentLike) => !doc.archived_at && doc.status === 'published'

/** Acknowledgment progress for a document's current version. */
export const acknowledgmentSummary = (audienceUserIds: string[], acknowledgedUserIds: string[]) => {
  const audience = new Set(audienceUserIds)
  const done = new Set(acknowledgedUserIds.filter(id => audience.has(id)))

  return {
    audience: audience.size,
    acknowledged: done.size,
    pending: audience.size - done.size,
    percent: audience.size ? Math.round((done.size / audience.size) * 100) : 0
  }
}

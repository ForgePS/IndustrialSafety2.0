/**
 * Port slice 12: Document Control library rules (pure, unit-tested). Document form validation, library
 * filtering and who may download which version. No runtime imports so node tests can load it directly.
 */

export type DocumentFormInput = {
  documentNumber?: string | null
  name?: string | null
  description?: string | null
  category?: string | null
  locationId?: string | null
  ownerUserId?: string | null
  reviewIntervalMonths?: string | number | null
  reviewDueOn?: string | null
  requiresAcknowledgment?: boolean | null
}

export type DocumentFormValues = {
  document_number: string | null
  name: string
  description: string | null
  category: string | null
  location_id: string | null
  owner_user_id: string | null
  review_interval_months: number | null
  review_due_on: string | null
  requires_acknowledgment: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value

/**
 * Checks the create / edit document form. A blank number means "give it the next DOC-000001 number"; a blank
 * review interval means the company default.
 */
export const parseDocumentInput = (input: DocumentFormInput): { values: DocumentFormValues; errors: Record<string, string> } => {
  const errors: Record<string, string> = {}
  const documentNumber = text(input.documentNumber).toUpperCase() || null
  const name = text(input.name)
  const description = typeof input.description === 'string' ? input.description.trim() || null : null
  const category = text(input.category) || null
  const locationId = text(input.locationId) || null
  const ownerUserId = text(input.ownerUserId) || null
  const intervalRaw = input.reviewIntervalMonths === null || input.reviewIntervalMonths === undefined ? '' : String(input.reviewIntervalMonths).trim()
  const interval = intervalRaw ? Number(intervalRaw) : null
  const reviewDueOn = text(input.reviewDueOn) || null

  if (documentNumber && documentNumber.length > 60) errors.documentNumber = 'Use 60 characters or fewer.'
  if (documentNumber && !/^[A-Z0-9][A-Z0-9 ._/-]*$/.test(documentNumber)) errors.documentNumber = 'Use letters, numbers, spaces, dots, dashes or slashes.'
  if (!name) errors.name = 'Enter a document name.'
  else if (name.length > 300) errors.name = 'Use 300 characters or fewer.'
  if (description && description.length > 4000) errors.description = 'Use 4000 characters or fewer.'
  if (category && category.length > 120) errors.category = 'Use 120 characters or fewer.'
  if (locationId && !UUID.test(locationId)) errors.locationId = 'Pick a location from the list.'
  if (ownerUserId && !UUID.test(ownerUserId)) errors.ownerUserId = 'Pick an owner from the list.'
  if (interval !== null && (!Number.isInteger(interval) || interval < 1 || interval > 60)) errors.reviewIntervalMonths = 'Choose 1 to 60 months.'
  if (reviewDueOn && !validDate(reviewDueOn)) errors.reviewDueOn = 'Enter a valid date.'

  return {
    values: {
      document_number: documentNumber,
      name,
      description,
      category,
      location_id: locationId,
      owner_user_id: ownerUserId,
      review_interval_months: interval,
      review_due_on: reviewDueOn,
      requires_acknowledgment: input.requiresAcknowledgment !== false
    },
    errors
  }
}

export type LibraryFilters = { q?: string; status?: string; location?: string; folder?: string }

export type LibraryDocument = {
  document_number: string
  name: string
  description?: string | null
  category: string | null
  location_id: string | null
  status: string
}

/** Library search and filters. location "company" = company-wide documents; folder "none" = not in a folder. */
export const filterLibraryDocuments = <T extends LibraryDocument>(docs: T[], filters: LibraryFilters): T[] => {
  const q = text(filters.q).toLowerCase()
  const folder = text(filters.folder).toLowerCase()

  return docs.filter(doc => {
    if (q && ![doc.document_number, doc.name, doc.description, doc.category].filter(Boolean).join(' ').toLowerCase().includes(q)) return false
    if (filters.status && doc.status !== filters.status) return false
    if (filters.location === 'company' && doc.location_id) return false
    if (filters.location && filters.location !== 'company' && doc.location_id !== filters.location) return false
    if (folder === 'none' && doc.category) return false
    if (folder && folder !== 'none' && (doc.category || '').trim().toLowerCase() !== folder) return false

    return true
  })
}

export type DownloadAccess = { manage: boolean; approve: boolean; viewAcknowledgments: boolean; read: boolean }

/**
 * Whether a user may download a version. Managers, approvers and acknowledgment viewers in scope may open any
 * version; view-only users only the current approved version of a published document.
 */
export const canDownloadVersion = (
  access: DownloadAccess | null,
  doc: { status: string; current_version_id: string | null; archived_at: string | null },
  version: { id: string; status: string }
) => {
  if (!access) return false
  if (access.manage || access.approve || access.viewAcknowledgments) return true

  return access.read && doc.status === 'published' && !doc.archived_at && doc.current_version_id === version.id && version.status === 'approved'
}

/** The next version number for a document. */
export const nextVersionNumber = (versions: { version_number: number }[]) => versions.reduce((max, version) => Math.max(max, version.version_number), 0) + 1

/** PostgREST ilike pattern that matches the text exactly (case-insensitive), escaping % _ and \. */
export const exactIlike = (value: string) => value.replace(/[\\%_]/g, char => '\\' + char)

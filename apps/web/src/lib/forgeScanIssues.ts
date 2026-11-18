/**
 * Port slice 10: issue reports from a QR scan (1.0 industrial-public-qr.service reportIssue and
 * qr-scan-asset createQrIssueCorrectiveAction). Pure: no database, no Next, no '@/' imports, so the unit
 * tests can load it directly. The server side lives in app/scan/[token]/report (action, photo route).
 *
 * A report creates a Corrective Action. The CAPA's severity and due date come from the issue priority;
 * an immediate hazard raises the priority to at least high.
 */

export const ISSUE_REPORT_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export type IssueReportPriority = (typeof ISSUE_REPORT_PRIORITIES)[number]

export const ISSUE_PRIORITY_LABELS: Record<IssueReportPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical — stop work'
}

export const ISSUE_CATEGORIES = [
  { key: 'equipment_damage', label: 'Equipment damage' },
  { key: 'guarding', label: 'Missing or broken guarding' },
  { key: 'leak_spill', label: 'Leak or spill' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'housekeeping', label: 'Housekeeping' },
  { key: 'ppe', label: 'PPE' },
  { key: 'other', label: 'Other' }
] as const

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number]['key']

export const issueCategoryLabel = (key: string | null | undefined) => ISSUE_CATEGORIES.find(item => item.key === key)?.label || null

export const ISSUE_TITLE_MAX = 200
export const ISSUE_DESCRIPTION_MAX = 5000
export const ISSUE_REPORTER_NAME_MAX = 120

export const ISSUE_PHOTO_MAX = 3
export const ISSUE_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const ISSUE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Uploads allowed per QR code in the window below (public QRs can be scanned by anyone). */
export const ISSUE_UPLOADS_PER_WINDOW = 30
export const ISSUE_UPLOAD_WINDOW_MINUTES = 10

/** Days until the CAPA is due, by issue priority. */
export const ISSUE_DUE_DAYS: Record<IssueReportPriority, number> = { critical: 1, high: 7, medium: 14, low: 30 }

/** forge_corrective_actions.severity for an issue priority. */
export const ISSUE_CAPA_SEVERITY: Record<IssueReportPriority, 'low' | 'moderate' | 'high' | 'critical'> = {
  low: 'low',
  medium: 'moderate',
  high: 'high',
  critical: 'critical'
}

/** forge_corrective_actions.source_type for scan issues (the closest value in the corrective_actions.source_type lookup). */
export const ISSUE_CAPA_SOURCE_TYPE = 'asset'

export const parseIssuePriority = (value: unknown): IssueReportPriority =>
  (ISSUE_REPORT_PRIORITIES as readonly string[]).includes(String(value)) ? (value as IssueReportPriority) : 'medium'

/** An immediate hazard is at least high priority. */
export const effectiveIssuePriority = (priority: IssueReportPriority, immediateHazard: boolean): IssueReportPriority =>
  immediateHazard && (priority === 'low' || priority === 'medium') ? 'high' : priority

/** Due date (ISO, end of the due day in UTC) for a CAPA opened from an issue of this priority. */
export const issueDueAt = (priority: IssueReportPriority, now: Date = new Date()) => {
  const due = new Date(now.getTime() + ISSUE_DUE_DAYS[priority] * 86_400_000)

  due.setUTCHours(23, 59, 59, 0)

  return due.toISOString()
}

/** Notices for critical issues and immediate hazards are marked urgent. */
export const isUrgentIssue = (priority: IssueReportPriority, immediateHazard: boolean) => immediateHazard || priority === 'critical'

export const defaultIssueTitle = (targetName: string) => `Issue reported for ${targetName || 'scanned item'}`.slice(0, ISSUE_TITLE_MAX)

export type IssueReportInput = {
  title: string
  description: string
  priority: IssueReportPriority
  category: IssueCategory | null
  immediateHazard: boolean
  outOfService: boolean
  reporterName: string | null
  uploadIds: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value)).replace(/\u0000/g, '').trim()

const truthy = (value: unknown) => value === true || value === 'true' || value === 'on' || value === '1'

/**
 * Validates a submitted issue report. The title falls back to the target name. Unknown categories are
 * dropped, unknown priorities become medium, and upload ids must be UUIDs (at most ISSUE_PHOTO_MAX).
 */
export const validateIssueReport = (
  raw: Record<string, unknown>,
  { targetName }: { targetName: string }
): { ok: true; value: IssueReportInput } | { ok: false; errors: Record<string, string> } => {
  const errors: Record<string, string> = {}
  const title = text(raw.title) || defaultIssueTitle(targetName)
  const description = text(raw.description)
  const reporterName = text(raw.reporterName) || null
  const categoryRaw = text(raw.category)
  const category = ISSUE_CATEGORIES.some(item => item.key === categoryRaw) ? (categoryRaw as IssueCategory) : null
  const uploadsRaw = Array.isArray(raw.uploadIds) ? raw.uploadIds : []
  const uploadIds = [...new Set(uploadsRaw.map(item => text(item).toLowerCase()))]

  if (title.length > ISSUE_TITLE_MAX) errors.title = `Keep the title under ${ISSUE_TITLE_MAX} characters.`
  if (!description) errors.description = 'Describe the issue.'
  else if (description.length > ISSUE_DESCRIPTION_MAX) errors.description = `Keep the description under ${ISSUE_DESCRIPTION_MAX} characters.`
  if (reporterName && reporterName.length > ISSUE_REPORTER_NAME_MAX) errors.reporterName = `Keep your name under ${ISSUE_REPORTER_NAME_MAX} characters.`
  if (uploadIds.length > ISSUE_PHOTO_MAX) errors.photos = `Attach up to ${ISSUE_PHOTO_MAX} photos.`
  else if (uploadIds.some(id => !UUID.test(id))) errors.photos = 'A photo upload was not recognized. Remove it and try again.'

  if (Object.keys(errors).length) return { ok: false, errors }

  return {
    ok: true,
    value: {
      title,
      description,
      priority: parseIssuePriority(text(raw.priority)),
      category,
      immediateHazard: truthy(raw.immediateHazard),
      outOfService: truthy(raw.outOfService),
      reporterName,
      uploadIds
    }
  }
}

/**
 * Whether the report marks the equipment out of service: only for asset and vehicle targets and viewers allowed to
 * use the out-of-service action. An immediate hazard implies it (as in 1.0) for those viewers.
 */
export const shouldMarkOutOfService = ({
  targetType,
  viewerMayMarkOutOfService,
  requested,
  immediateHazard
}: {
  targetType: string
  viewerMayMarkOutOfService: boolean
  requested: boolean
  immediateHazard: boolean
}) => (targetType === 'asset' || targetType === 'vehicle') && viewerMayMarkOutOfService && (requested || immediateHazard)

/** Image type from the first bytes of a file (never trust the browser's content type alone). */
export const sniffImageType = (bytes: Uint8Array): (typeof ISSUE_PHOTO_TYPES)[number] | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a)
    return 'image/png'
  if (bytes.length >= 12 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF' && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP')
    return 'image/webp'

  return null
}

export const safePhotoName = (name: string | null | undefined, type: string) => {
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'

  return (name || '').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || `issue-photo.${ext}`
}

/** CAPA description: the reporter's words plus where it came from (QR, report, category, hazard). */
export const issueCapaDescription = ({
  description,
  qrNumber,
  targetName,
  reportId,
  category,
  immediateHazard,
  reporter,
  outOfService,
  photoCount,
  noun = 'equipment'
}: {
  description: string
  qrNumber: string
  targetName: string
  reportId: string
  category: string | null
  immediateHazard: boolean
  reporter: string
  outOfService: boolean
  photoCount: number
  noun?: 'equipment' | 'vehicle'
}) =>
  [
    description,
    '',
    `Reported from a scan of QR ${qrNumber} (${targetName}) by ${reporter}.`,
    category ? `Category: ${issueCategoryLabel(category) || category}.` : null,
    immediateHazard ? 'The reporter flagged this as an immediate hazard.' : null,
    outOfService ? `The ${noun} was marked out of service with this report.` : null,
    photoCount ? `${photoCount} photo${photoCount === 1 ? '' : 's'} attached to the scan issue report.` : null,
    `Scan issue report: ${reportId}`
  ]
    .filter(line => line !== null)
    .join('\n')

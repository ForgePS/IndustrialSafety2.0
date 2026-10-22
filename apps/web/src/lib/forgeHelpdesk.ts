// Shared Help Desk vocabulary. Safe to import from server and client components.

export const HELPDESK_STATUSES = [
  'new',
  'triage',
  'assigned',
  'in_progress',
  'waiting_on_customer',
  'waiting_on_forge',
  'resolved',
  'closed',
  'reopened'
] as const
export type HelpdeskStatus = (typeof HELPDESK_STATUSES)[number]

export const HELPDESK_ACTIVE_STATUSES: HelpdeskStatus[] = [
  'new',
  'triage',
  'assigned',
  'in_progress',
  'waiting_on_customer',
  'waiting_on_forge',
  'reopened'
]

export const HELPDESK_PRIORITIES = ['p1_critical', 'p2_high', 'p3_normal', 'p4_low'] as const
export type HelpdeskPriority = (typeof HELPDESK_PRIORITIES)[number]

export const HELPDESK_DISPOSITIONS = [
  'duplicate',
  'known_issue',
  'feature_request',
  'cannot_reproduce',
  'configuration_issue',
  'training_issue',
  'third_party_issue',
  'bug_confirmed',
  'working_as_designed'
] as const
export type HelpdeskDisposition = (typeof HELPDESK_DISPOSITIONS)[number]

// Mirrors forge_support_status_transitions (actor_scope = 'staff'); the database remains authoritative.
const WORKING = ['assigned', 'in_progress', 'waiting_on_customer', 'waiting_on_forge', 'resolved']

export const STAFF_STATUS_TRANSITIONS: Record<string, string[]> = {
  new: ['triage', ...WORKING],
  triage: WORKING,
  assigned: ['triage', 'in_progress', 'waiting_on_customer', 'waiting_on_forge', 'resolved'],
  in_progress: ['assigned', 'waiting_on_customer', 'waiting_on_forge', 'resolved'],
  waiting_on_customer: ['in_progress', 'assigned', 'waiting_on_forge', 'resolved'],
  waiting_on_forge: ['in_progress', 'assigned', 'waiting_on_customer', 'resolved'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['triage', ...WORKING]
}

export const HELPDESK_SLA_STATES = ['on_track', 'at_risk', 'breached', 'paused', 'completed'] as const
export type HelpdeskSlaState = (typeof HELPDESK_SLA_STATES)[number]

export const statusLabels: Record<string, string> = {
  new: 'New',
  triage: 'Triage',
  assigned: 'Assigned',
  in_progress: 'In progress',
  waiting_on_customer: 'Waiting on customer',
  waiting_on_forge: 'Waiting on Forge',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened'
}

// Customer-facing wording for statuses.
export const customerStatusLabels: Record<string, string> = {
  ...statusLabels,
  new: 'Submitted',
  triage: 'Under review',
  assigned: 'Assigned to Forge',
  waiting_on_customer: 'Waiting on you',
  waiting_on_forge: 'Waiting on Forge'
}

export const priorityLabels: Record<string, string> = {
  p1_critical: 'P1 Critical',
  p2_high: 'P2 High',
  p3_normal: 'P3 Normal',
  p4_low: 'P4 Low'
}

export const severityDescriptions: Record<string, string> = {
  p1_critical: 'Work is stopped or a safety-critical process is blocked',
  p2_high: 'A key workflow is impaired with no reasonable workaround',
  p3_normal: 'Something is not working but a workaround exists',
  p4_low: 'Question, minor issue or request'
}

export const dispositionLabels: Record<string, string> = {
  duplicate: 'Duplicate',
  known_issue: 'Known issue',
  feature_request: 'Feature request',
  cannot_reproduce: 'Cannot reproduce',
  configuration_issue: 'Configuration issue',
  training_issue: 'Training issue',
  third_party_issue: 'Third-party issue',
  bug_confirmed: 'Bug confirmed',
  working_as_designed: 'Working as designed'
}

export const slaLabels: Record<string, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  breached: 'Breached',
  paused: 'Paused',
  completed: 'Completed'
}

export const sourceLabels: Record<string, string> = {
  web: 'Web',
  mobile: 'Mobile',
  ask_forge: 'Ask Forge',
  email: 'Email',
  phone: 'Phone',
  internal: 'Internal',
  api: 'API'
}

export const incidentStatusLabels: Record<string, string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved'
}

export const incidentImpactLabels: Record<string, string> = { minor: 'Minor', major: 'Major', critical: 'Critical' }

export const componentStatusLabels: Record<string, string> = {
  operational: 'Operational',
  degraded_performance: 'Degraded performance',
  partial_outage: 'Partial outage',
  major_outage: 'Major outage',
  maintenance: 'Maintenance'
}

export const announcementTypeLabels: Record<string, string> = {
  planned_maintenance: 'Planned maintenance',
  platform_update: 'Platform update',
  known_issue: 'Known issue',
  feature_release: 'Feature release',
  support_hours: 'Support hours',
  training_event: 'Training event',
  system_notice: 'System notice'
}

export const knowledgeStatusLabels: Record<string, string> = {
  draft: 'Draft',
  review: 'In review',
  published: 'Published',
  archived: 'Archived'
}

export const knowledgeVisibilityLabels: Record<string, string> = {
  public_customer: 'Public',
  authenticated_users: 'Signed-in users',
  tenant_only: 'One tenant only',
  forge_internal: 'Forge internal'
}

export const developmentStateLabels: Record<string, string> = {
  open: 'Open',
  triaged: 'Triaged',
  in_progress: 'In progress',
  in_review: 'In review',
  fixed: 'Fixed',
  released: 'Released',
  wont_fix: "Won't fix",
  duplicate: 'Duplicate',
  closed: 'Closed'
}

export const developmentTypeLabels: Record<string, string> = {
  bug: 'Bug',
  feature_request: 'Feature request',
  improvement: 'Improvement',
  known_issue: 'Known issue',
  task: 'Task'
}

export const developmentProviderLabels: Record<string, string> = {
  forge_internal: 'Forge internal',
  github: 'GitHub',
  jira: 'Jira',
  azure_devops: 'Azure DevOps',
  linear: 'Linear',
  other: 'Other'
}

export const aiSuggestionLabels: Record<string, string> = {
  summarize: 'Summarize ticket',
  suggest_response: 'Draft reply',
  suggest_priority: 'Suggest priority',
  suggest_category: 'Suggest request type',
  suggest_module: 'Suggest product area',
  similar_tickets: 'Similar tickets',
  duplicate_detection: 'Possible duplicates',
  knowledge_search: 'Related articles',
  troubleshooting: 'Troubleshooting steps',
  likely_cause: 'Likely cause',
  suggest_assignee: 'Suggest assignee',
  platform_incident: 'Platform incident check',
  knowledge_draft: 'Draft help article'
}

export type BadgeTone = 'destructive' | 'tonalPrimary' | 'tonalSuccess' | 'outline' | 'secondary' | 'accent'

export const priorityTone = (priority: string): BadgeTone =>
  priority === 'p1_critical' ? 'destructive' : priority === 'p2_high' ? 'accent' : 'outline'

export const statusTone = (status: string): BadgeTone =>
  status === 'resolved' || status === 'closed'
    ? 'tonalSuccess'
    : status === 'waiting_on_customer'
      ? 'accent'
      : status === 'new' || status === 'reopened'
        ? 'tonalPrimary'
        : 'outline'

export const slaTone = (state: string | null | undefined): BadgeTone =>
  state === 'breached' ? 'destructive' : state === 'at_risk' ? 'accent' : state === 'completed' ? 'tonalSuccess' : 'outline'

export const componentTone = (status: string): BadgeTone =>
  status === 'operational'
    ? 'tonalSuccess'
    : status === 'major_outage' || status === 'partial_outage'
      ? 'destructive'
      : 'accent'

export const label = (map: Record<string, string>, value: string | null | undefined) =>
  value ? map[value] || value.replaceAll('_', ' ') : '—'

export const formatDuration = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '—'
  const abs = Math.abs(minutes)

  if (abs < 60) return `${Math.floor(abs)}m`
  if (abs < 60 * 24) return `${Math.floor(abs / 60)}h ${Math.floor(abs % 60)}m`

  return `${Math.floor(abs / 1440)}d ${Math.floor((abs % 1440) / 60)}h`
}

export const dueIn = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return null
  const minutes = (new Date(iso).getTime() - now) / 60000

  return minutes >= 0 ? `due in ${formatDuration(minutes)}` : `${formatDuration(minutes)} overdue`
}

export const SAVED_REPLY_PLACEHOLDERS = [
  'requester_name',
  'ticket_number',
  'tenant_name',
  'product_name',
  'support_agent_name'
] as const

export const renderSavedReply = (body: string, values: Partial<Record<(typeof SAVED_REPLY_PLACEHOLDERS)[number], string>>) =>
  body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) =>
    (SAVED_REPLY_PLACEHOLDERS as readonly string[]).includes(key) ? values[key as keyof typeof values] ?? '' : match
  )

export type TechnicalContextInput = {
  route?: string
  page_url?: string
  browser_name?: string
  browser_version?: string
  os_name?: string
  device_type?: 'desktop' | 'tablet' | 'mobile' | 'unknown'
  viewport_width?: number
  viewport_height?: number
  is_mobile?: boolean
  app_version?: string
  build_version?: string
  client_timezone?: string
  client_timestamp?: string
  client_error_id?: string
  correlation_id?: string
}

const stripSecrets = (value: string) => {
  try {
    const url = new URL(value)

    url.search = ''
    url.hash = ''

    return url.toString()
  } catch {
    return value.split('?')[0].split('#')[0]
  }
}

// Browser-side capture of non-sensitive technical context. Query strings and fragments are
// stripped because they can contain tokens; no cookies, storage or headers are read.
export const captureTechnicalContext = (extra?: { route?: string; clientErrorId?: string }): TechnicalContextInput => {
  if (typeof window === 'undefined') return {}
  const ua = navigator.userAgent

  const browser =
    /Edg\/([\d.]+)/.exec(ua)
      ? { name: 'Edge', version: /Edg\/([\d.]+)/.exec(ua)![1] }
      : /Chrome\/([\d.]+)/.exec(ua) && !/Chromium/.test(ua)
        ? { name: 'Chrome', version: /Chrome\/([\d.]+)/.exec(ua)![1] }
        : /Firefox\/([\d.]+)/.exec(ua)
          ? { name: 'Firefox', version: /Firefox\/([\d.]+)/.exec(ua)![1] }
          : /Version\/([\d.]+).*Safari/.exec(ua)
            ? { name: 'Safari', version: /Version\/([\d.]+).*Safari/.exec(ua)![1] }
            : { name: 'Other', version: '' }

  const os = /Windows NT 10/.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS ' + ((/OS (\d+[_\d]*)/.exec(ua)?.[1] || '').replaceAll('_', '.'))
      : /Android ([\d.]+)/.exec(ua)
        ? 'Android ' + /Android ([\d.]+)/.exec(ua)![1]
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Other'

  const isTablet = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
  const isMobile = /Mobi|iPhone|Android/.test(ua) && !isTablet

  return {
    route: (extra?.route || window.location.pathname).slice(0, 500),
    page_url: stripSecrets(window.location.href).slice(0, 1000),
    browser_name: browser.name,
    browser_version: browser.version.split('.').slice(0, 2).join('.'),
    os_name: os.trim(),
    device_type: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    is_mobile: isMobile || isTablet,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    build_version: process.env.NEXT_PUBLIC_BUILD_ID || undefined,
    client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    client_timestamp: new Date().toISOString(),
    client_error_id: extra?.clientErrorId
  }
}

// Minimal, safe Markdown subset for help article bodies: ## / ### headings, ordered and
// bulleted lists, **bold** and paragraphs. Rendered as React text nodes, never raw HTML.
export type KnowledgeBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'paragraph'; text: string }

export const parseKnowledgeBody = (body: string): KnowledgeBlock[] => {
  const blocks: KnowledgeBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }

  const flushList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items })
    list = null
  }

  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    const heading = /^(#{2,3})\s+(.*)$/.exec(line)
    const item = /^(\d+\.|[-*])\s+(.*)$/.exec(line)

    if (!line) {
      flushParagraph()
      flushList()
    } else if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', level: heading[1].length as 2 | 3, text: heading[2] })
    } else if (item) {
      flushParagraph()
      const ordered = item[1].endsWith('.')
      const current = list as { ordered: boolean; items: string[] } | null

      if (!current || current.ordered !== ordered) {
        flushList()
        list = { ordered, items: [item[2]] }
      } else current.items.push(item[2])
    } else {
      flushList()
      paragraph.push(line)
    }
  }

  flushParagraph()
  flushList()

  return blocks
}

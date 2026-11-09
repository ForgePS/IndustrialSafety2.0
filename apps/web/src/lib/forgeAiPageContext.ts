// Which Forge record a page shows, from its path. Pure, so it runs in the browser and in tests.
// The server still re-checks the user's access to the record before the assistant uses it.

export type PageRecordType = 'incident' | 'inspection' | 'asset' | 'personnel' | 'training_course' | 'qr' | 'loto' | 'task'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

const RECORD_PAGES: Array<{ pattern: RegExp; type: PageRecordType; label: string }> = [
  { pattern: new RegExp(`^/incidents/(${UUID})(?:/|$)`, 'i'), type: 'incident', label: 'this incident' },
  { pattern: new RegExp(`^/inspections/(${UUID})(?:/|$)`, 'i'), type: 'inspection', label: 'this inspection' },
  { pattern: new RegExp(`^/assets/(${UUID})(?:/|$)`, 'i'), type: 'asset', label: 'this asset' },
  { pattern: new RegExp(`^/personnel/(${UUID})(?:/|$)`, 'i'), type: 'personnel', label: 'this person' },
  { pattern: new RegExp(`^/training/courses/(${UUID})(?:/|$)`, 'i'), type: 'training_course', label: 'this training course' },
  { pattern: new RegExp(`^/qr/(${UUID})(?:/|$)`, 'i'), type: 'qr', label: 'this QR code' },
  { pattern: new RegExp(`^/loto/(${UUID})(?:/|$)`, 'i'), type: 'loto', label: 'this LOTO procedure' },
  { pattern: new RegExp(`^/tasks/(${UUID})(?:/|$)`, 'i'), type: 'task', label: 'this task' }
]

export const recordContextForPath = (pathname: string | null | undefined) => {
  if (!pathname) return null

  for (const page of RECORD_PAGES) {
    const match = pathname.match(page.pattern)

    if (match) return { type: page.type, id: match[1].toLowerCase(), label: page.label }
  }

  return null
}

// Starting prompts for a page that is not a single record, by its area.
const AREA_PROMPTS: Array<{ prefix: string; prompts: string[] }> = [
  {
    prefix: '/incidents',
    prompts: ['Show me open incidents that need attention.', 'Are incidents trending up at any location?', 'Which incidents are waiting for review?']
  },
  {
    prefix: '/inspections',
    prompts: ['Show inspections that are still open or waiting for review.', 'Which inspection findings are overdue?', 'Which locations have failed inspections not closed?']
  },
  {
    prefix: '/training',
    prompts: ['What training assignments are overdue in my scope?', 'Which locations have the biggest training gaps?', 'Which certifications expire in the next 30 days?']
  },
  {
    prefix: '/assets',
    prompts: ['Which assets are out of service or in poor condition?', 'What maintenance is overdue?', 'Which LOTO procedures are due for review?']
  },
  {
    prefix: '/corrective-actions',
    prompts: ['Which corrective actions are overdue?', 'What corrective actions are waiting for verification?', 'Summarize open corrective actions by location.']
  }
]

export const GENERAL_PROMPTS = [
  'Give me a safety snapshot of what I can see in Forge.',
  'What needs my attention first today?',
  'What do you recommend we do next?',
  'Which facilities have the highest risk right now?'
]

export const promptsForPath = (pathname: string | null | undefined) =>
  AREA_PROMPTS.find(area => pathname === area.prefix || pathname?.startsWith(area.prefix + '/'))?.prompts || GENERAL_PROMPTS

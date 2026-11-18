// Forge AI agent registry and intent routing. Each specialised agent is a focus prompt, a tool
// allowlist and execution limits. An agent never widens access: its tools are intersected with
// the capabilities the signed-in user already has (tenant settings + RBAC + sensitivity).
// Routing is deterministic and explainable: an explicit choice wins, then the record the user is
// looking at, then keyword intent scoring; anything ambiguous goes to the general assistant.
// Pure module, so Node tests can load it.

export type ForgeAiAgentKey =
  | 'knowledge'
  | 'incident'
  | 'inspection'
  | 'compliance'
  | 'risk'
  | 'reporting'
  | 'monitoring'
  | 'workflow'

export type ForgeAiAgent = {
  key: ForgeAiAgentKey
  name: string
  summary: string
  // Capabilities this agent may use (still subject to the user's own enabled capabilities).
  tools: readonly string[]
  maxToolCalls: number
  maxRounds: number
  // Weighted intent keywords (lower-case; matched on word starts).
  keywords: Readonly<Record<string, number>>
  // Record-context types that route straight to this agent.
  contextTypes: readonly string[]
}

const COMMON = ['explain_access'] as const

export const FORGE_AI_AGENTS: readonly ForgeAiAgent[] = [
  {
    key: 'knowledge',
    name: 'Knowledge Agent',
    summary: 'Answers from your approved policies, SOPs, manuals and Forge help articles, with citations.',
    tools: ['knowledge_search', 'search_help_articles', ...COMMON],
    maxToolCalls: 4,
    maxRounds: 3,
    keywords: { policy: 3, policies: 3, sop: 3, procedure: 2, manual: 3, handbook: 3, document: 2, guideline: 2, 'how do i': 2, 'how to': 2, 'what does our': 3, requirement: 1 },
    contextTypes: []
  },
  {
    key: 'incident',
    name: 'Incident Intelligence Agent',
    summary: 'Searches and analyses incidents and observations, finds similar events and patterns.',
    tools: ['search_incidents', 'analytics_incidents', 'search_observations', 'analyze_observations', 'record_context', 'search_tasks', 'company_snapshot', ...COMMON],
    maxToolCalls: 6,
    maxRounds: 4,
    keywords: { incident: 3, injury: 3, 'near miss': 3, 'near-miss': 3, accident: 3, observation: 2, 'first aid': 3, recordable: 2, slip: 2, fall: 1, laceration: 3, strain: 2, 'root cause': 2, investigation: 2 },
    contextTypes: ['incident']
  },
  {
    key: 'inspection',
    name: 'Inspection Intelligence Agent',
    summary: 'Reviews inspections, findings and equipment condition, including repeat and overdue findings.',
    tools: ['search_inspections', 'analytics_inspections', 'search_assets', 'analytics_assets', 'search_loto', 'record_context', ...COMMON],
    maxToolCalls: 6,
    maxRounds: 4,
    keywords: { inspection: 3, inspect: 3, finding: 3, audit: 2, checklist: 2, equipment: 2, asset: 2, maintenance: 2, 'out of service': 3, forklift: 2, guard: 1, 'pm ': 1 },
    contextTypes: ['inspection', 'asset', 'qr', 'loto']
  },
  {
    key: 'compliance',
    name: 'Compliance Intelligence Agent',
    summary: 'Checks training, qualification, LOTO and JSA coverage against what Forge records show.',
    tools: ['search_training', 'analytics_training', 'search_personnel', 'search_loto', 'search_jsas', 'knowledge_search', 'record_context', ...COMMON],
    maxToolCalls: 6,
    maxRounds: 4,
    keywords: { compliance: 3, compliant: 3, training: 3, certification: 3, certified: 3, qualified: 2, overdue: 1, expired: 2, expiring: 2, osha: 2, regulation: 2, loto: 2, lockout: 2, 'jsa': 2, jha: 2 },
    contextTypes: ['personnel', 'training_course']
  },
  {
    key: 'risk',
    name: 'Risk Intelligence Agent',
    summary: 'Explains risk register entries, hazard patterns and controls using Forge’s scored risk matrices.',
    tools: ['get_risk_indicators', 'search_risks', 'explain_risk', 'search_jsas', 'analyze_observations', 'analytics_incidents', 'search_watch_alerts', ...COMMON],
    maxToolCalls: 6,
    maxRounds: 4,
    keywords: { risk: 3, hazard: 3, 'risk register': 4, control: 1, mitigation: 2, exposure: 2, severity: 1, likelihood: 2, 'residual': 2, 'highest risk': 4, dangerous: 2 },
    contextTypes: []
  },
  {
    key: 'reporting',
    name: 'Reporting Agent',
    summary: 'Builds summaries and trend reports from Forge analytics for managers and executives.',
    tools: ['analytics_executive_summary', 'get_risk_indicators', 'analytics_incidents', 'analytics_training', 'analytics_inspections', 'analytics_assets', 'analyze_observations', 'company_snapshot', ...COMMON],
    maxToolCalls: 8,
    maxRounds: 4,
    keywords: { report: 3, summary: 2, summarize: 2, summarise: 2, trend: 3, executive: 3, monthly: 2, quarter: 2, weekly: 2, dashboard: 2, metrics: 2, kpi: 3, 'year to date': 2, ytd: 2 },
    contextTypes: []
  },
  {
    key: 'monitoring',
    name: 'Proactive Monitoring Agent',
    summary: 'Explains Forge Watch alerts — what triggered them and what needs attention first.',
    tools: ['search_watch_alerts', 'get_risk_indicators', 'search_tasks', 'search_training', 'search_inspections', 'search_assets', ...COMMON],
    maxToolCalls: 6,
    maxRounds: 4,
    keywords: { alert: 3, alerts: 3, watch: 2, 'needs attention': 3, 'what should i': 2, priority: 1, priorities: 2, urgent: 2, today: 1, 'this week': 1, flagged: 2 },
    contextTypes: []
  },
  {
    key: 'workflow',
    name: 'Workflow Assistance Agent',
    summary: 'Prepares Forge changes (tasks, findings, maintenance, draft JSAs) for human approval.',
    tools: ['prepare_action', 'draft_jsa', 'search_tasks', 'record_context', ...COMMON],
    maxToolCalls: 4,
    maxRounds: 3,
    keywords: { create: 3, assign: 3, schedule: 2, draft: 2, add: 1, 'log a': 2, 'open a': 2, 'set up': 1, task: 2, 'corrective action': 2, approve: 1 },
    contextTypes: ['task']
  }
]

export const FORGE_AI_AGENT_KEYS = FORGE_AI_AGENTS.map(agent => agent.key)

export const getForgeAiAgent = (key: string | null | undefined) => FORGE_AI_AGENTS.find(agent => agent.key === key) || null

export type ForgeAiRoute = {
  agentKey: ForgeAiAgentKey | 'general'
  intent: string
  reason: 'explicit' | 'record_context' | 'keywords' | 'ambiguous' | 'no_match'
  confidence: number
  scores: Partial<Record<ForgeAiAgentKey, number>>
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const scoreIntent = (message: string) => {
  const text = ' ' + message.toLowerCase().replace(/\s+/g, ' ') + ' '
  const scores: Partial<Record<ForgeAiAgentKey, number>> = {}

  for (const agent of FORGE_AI_AGENTS) {
    let score = 0

    for (const [keyword, weight] of Object.entries(agent.keywords)) {
      if (new RegExp('(^|[^a-z])' + escapeRegExp(keyword.trim()), 'i').test(text)) score += weight
    }

    if (score > 0) scores[agent.key] = score
  }

  return scores
}

// Minimum score to route, and the margin the winner needs over the runner-up.
const MIN_SCORE = 3
const MIN_MARGIN = 2

export const routeForgeAiRequest = ({
  message,
  requestedAgent,
  recordContextType
}: {
  message: string
  requestedAgent?: string | null
  recordContextType?: string | null
}): ForgeAiRoute => {
  const scores = scoreIntent(message)
  const explicit = requestedAgent && requestedAgent !== 'auto' ? getForgeAiAgent(requestedAgent) : null

  if (explicit) return { agentKey: explicit.key, intent: explicit.key, reason: 'explicit', confidence: 1, scores }

  if (recordContextType) {
    const byContext = FORGE_AI_AGENTS.find(agent => agent.contextTypes.includes(recordContextType))

    if (byContext) return { agentKey: byContext.key, intent: byContext.key, reason: 'record_context', confidence: 0.9, scores }
  }

  const ranked = (Object.entries(scores) as Array<[ForgeAiAgentKey, number]>).sort((a, b) => b[1] - a[1])
  const [top, second] = ranked

  if (!top || top[1] < MIN_SCORE) return { agentKey: 'general', intent: 'general', reason: 'no_match', confidence: 0, scores }

  if (second && top[1] - second[1] < MIN_MARGIN) {
    return { agentKey: 'general', intent: top[0] + '+' + second[0], reason: 'ambiguous', confidence: 0.4, scores }
  }

  return {
    agentKey: top[0],
    intent: top[0],
    reason: 'keywords',
    confidence: Math.min(0.95, 0.5 + (top[1] - (second?.[1] || 0)) / 10),
    scores
  }
}

// The agent's allowlist intersected with what this user may use. General keeps everything enabled.
export const selectAgentCapabilities = <T extends { capability_key: string }>(agentKey: string, enabled: T[]) => {
  const agent = getForgeAiAgent(agentKey)

  if (!agent) return enabled

  return enabled.filter(capability => agent.tools.includes(capability.capability_key))
}

export const agentLimits = (agentKey: string, tenant: { maxToolCalls: number }) => {
  const agent = getForgeAiAgent(agentKey)

  return {
    maxToolCalls: agent ? Math.min(agent.maxToolCalls, tenant.maxToolCalls) : tenant.maxToolCalls,
    maxRounds: agent ? agent.maxRounds : 5
  }
}

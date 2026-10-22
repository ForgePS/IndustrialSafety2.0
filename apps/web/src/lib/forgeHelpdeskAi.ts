import { createHash } from 'node:crypto'

import { createServiceRoleClient } from '@repo/supabase/server'

import { runOpenAiForgeAssistant } from '@/lib/forgeAiProvider'
import { searchKnowledge, parseKnowledgeBody } from '@/lib/forgeHelpdeskKnowledge'
import { findSimilarTickets, getHelpdeskSettings } from '@/lib/forgeHelpdeskData'
import { aiSuggestionLabels, priorityLabels, HELPDESK_ACTIVE_STATUSES } from '@/lib/forgeHelpdesk'

const db = () => createServiceRoleClient() as any

export const HELPDESK_SUGGESTION_TYPES = Object.keys(aiSuggestionLabels)

type ArticleContext = { slug: string; title: string; summary: string; body: string }

export type AskForgeAnswer = {
  answer: string | null
  steps: string[]
  provider: string
  model: string | null
}

export type SuggestionOutput = { text: string; data: Record<string, unknown> }

export interface HelpdeskAiProvider {
  readonly name: string
  readonly model: string | null
  answerQuestion(question: string, articles: ArticleContext[]): Promise<AskForgeAnswer>
  writeText(kind: 'summary' | 'reply' | 'troubleshooting' | 'cause' | 'article', prompt: string, fallback: () => string): Promise<string>
}

const stepsFromArticle = (body: string) =>
  parseKnowledgeBody(body)
    .filter(block => block.type === 'list')
    .flatMap(block => (block as { items: string[] }).items)
    .map(item => item.replace(/\*\*/g, ''))
    .slice(0, 6)

// Deterministic provider: answers only from published Forge help articles. Always available.
class KnowledgeExtractiveProvider implements HelpdeskAiProvider {
  readonly name = 'knowledge_extractive'
  readonly model = 'forge-kb-v1'

  async answerQuestion(_question: string, articles: ArticleContext[]): Promise<AskForgeAnswer> {
    const top = articles[0]

    if (!top) return { answer: null, steps: [], provider: this.name, model: this.model }

    const firstParagraph = parseKnowledgeBody(top.body).find(block => block.type === 'paragraph')

    return {
      answer: `From "${top.title}": ${top.summary || (firstParagraph && 'text' in firstParagraph ? firstParagraph.text : '')}`.trim(),
      steps: stepsFromArticle(top.body),
      provider: this.name,
      model: this.model
    }
  }

  async writeText(_kind: string, _prompt: string, fallback: () => string) {
    return fallback()
  }
}

class OpenAiHelpdeskProvider implements HelpdeskAiProvider {
  readonly name = 'openai'

  constructor(readonly model: string) {}

  private async run(instructions: string, content: string, maxOutputTokens = 900) {
    const result = await runOpenAiForgeAssistant({
      model: this.model,
      reasoningEffort: 'low',
      maxOutputTokens,
      maxToolCalls: 0,
      instructions,
      messages: [{ role: 'user', content }],
      tools: [],
      executeTool: async () => ({}),
      safetyIdentifier: 'forge-helpdesk'
    })

    return result.text.trim()
  }

  async answerQuestion(question: string, articles: ArticleContext[]): Promise<AskForgeAnswer> {
    if (!articles.length) return { answer: null, steps: [], provider: this.name, model: this.model }

    const context = articles
      .slice(0, 4)
      .map((a, i) => `[${i + 1}] ${a.title}\n${a.summary}\n${a.body.slice(0, 3000)}`)
      .join('\n\n')

    const text = await this.run(
      'You are the Forge Industrial Safety Help Center assistant. Answer ONLY from the numbered help articles provided. ' +
        'If the articles do not answer the question, reply exactly "NO_ANSWER". Be concise (under 120 words), then list up to 5 short steps, each on its own line starting with "- ". ' +
        'Never invent features, never give legal or medical advice, and tell the user to stop work and contact a supervisor if a safety-critical process is affected.',
      `Question: ${question}\n\nHelp articles:\n${context}`
    )

    if (!text || text.includes('NO_ANSWER')) return { answer: null, steps: [], provider: this.name, model: this.model }
    const lines = text.split('\n')
    const steps = lines.filter(l => /^\s*-\s+/.test(l)).map(l => l.replace(/^\s*-\s+/, '').trim()).slice(0, 5)
    const answer = lines.filter(l => !/^\s*-\s+/.test(l)).join(' ').trim()

    return { answer: answer || null, steps, provider: this.name, model: this.model }
  }

  async writeText(kind: string, prompt: string, fallback: () => string) {
    try {
      const text = await this.run(
        'You assist Forge support agents. Output is a DRAFT reviewed by a human before use. Be factual, concise and specific to the ticket. ' +
          'Do not promise dates, refunds or fixes. Do not include internal notes in anything meant for customers. Task: ' + kind + '.',
        prompt,
        700
      )

      return text || fallback()
    } catch (error) {
      console.error('[helpdesk] AI provider failed, using knowledge fallback', error instanceof Error ? error.message : error)

      return fallback()
    }
  }
}

export const getHelpdeskAiProvider = async (): Promise<HelpdeskAiProvider | null> => {
  const settings = await getHelpdeskSettings()

  if (settings.ai_answer_mode === 'disabled') return null

  if (settings.ai_answer_mode === 'auto' && process.env.OPENAI_API_KEY) {
    return new OpenAiHelpdeskProvider(process.env.FORGE_HELPDESK_AI_MODEL || process.env.FORGE_AI_MODEL || 'gpt-6-sol')
  }

  return new KnowledgeExtractiveProvider()
}

// ---------------------------------------------------------------------------
// Ask Forge (customer)
// ---------------------------------------------------------------------------
export const askForge = async ({
  organizationId,
  userId,
  question,
  productId,
  moduleId
}: {
  organizationId: string
  userId: string
  question: string
  productId: string | null
  moduleId: string | null
}) => {
  const results = await searchKnowledge({ query: question, audience: 'customer', organizationId, userId, limit: 5, source: 'ask_forge' })

  const { data: articleRows } = results.length
    ? await db().from('forge_support_knowledge_articles').select('id,slug,title,summary,body').in('id', results.map(r => r.id))
    : { data: [] }

  const ordered: (ArticleContext & { id: string })[] = results
    .map(r => (articleRows || []).find((a: any) => a.id === r.id))
    .filter(Boolean)

  const provider = await getHelpdeskAiProvider()
  let answer: AskForgeAnswer = { answer: null, steps: [], provider: provider ? provider.name : 'knowledge_search', model: provider?.model || null }

  if (provider) {
    try {
      answer = await provider.answerQuestion(question, ordered)
    } catch (error) {
      console.error('[helpdesk] Ask Forge provider failed, using knowledge fallback', error instanceof Error ? error.message : error)
      answer = await new KnowledgeExtractiveProvider().answerQuestion(question, ordered)
    }
  }

  const { data: session, error } = await db()
    .from('forge_support_assist_sessions')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      product_id: productId,
      module_id: moduleId,
      question,
      answer: answer.answer ? answer.answer.slice(0, 8000) : null,
      answer_provider: answer.provider,
      answer_model: answer.model,
      article_ids: ordered.map(a => a.id),
      troubleshooting_steps: answer.steps.length ? answer.steps.join('\n').slice(0, 4000) : null
    })
    .select('id')
    .single()

  if (error) throw new Error('Unable to save the Ask Forge session.')

  return {
    sessionId: session.id as string,
    answer: answer.answer,
    steps: answer.steps,
    provider: answer.provider,
    articles: results.map(r => ({ id: r.id, slug: r.slug, title: r.title, summary: r.summary }))
  }
}

// ---------------------------------------------------------------------------
// Staff suggestions (stored, never auto-sent)
// ---------------------------------------------------------------------------
const PRIORITY_RULES: { priority: string; pattern: RegExp; reason: string }[] = [
  { priority: 'p1_critical', pattern: /\b(injur|fatal|loto|lockout|energ|stopped (all|work)|cannot (log ?in|access) .*(all|everyone)|outage|wrong (loto|procedure))/i, reason: 'Safety-critical process or widespread outage language' },
  { priority: 'p2_high', pattern: /\b(cannot|can't|unable|fails?|failing|blocked|not (submit|save|load)|error|duplicate records|wrong)\b/i, reason: 'Core workflow failure without stated workaround' },
  { priority: 'p4_low', pattern: /\b(how do i|question|request|would like|feature|idea|training)\b/i, reason: 'Question or request' }
]

const pickPriority = (text: string) => {
  for (const rule of PRIORITY_RULES) if (rule.pattern.test(text)) return rule

  return { priority: 'p3_normal', pattern: /./, reason: 'No urgency signals detected' }
}

const scoreByWords = (text: string, candidates: { id: string; label: string; key?: string }[]) => {
  const words = new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2))

  const scored = candidates
    .map(c => {
      const tokens = (c.label + ' ' + (c.key || '')).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2)
      const score = tokens.reduce((sum, token) => sum + ([...words].some(w => w.startsWith(token.slice(0, 5)) || token.startsWith(w.slice(0, 5))) ? 1 : 0), 0)

      return { ...c, score }
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, 3)
}

export const generateTicketSuggestion = async ({
  ticketId,
  type,
  staffUserId
}: {
  ticketId: string
  type: string
  staffUserId: string
}) => {
  if (!HELPDESK_SUGGESTION_TYPES.includes(type)) throw new Error('Unsupported suggestion type.')

  const { data: ticket, error } = await db()
    .from('forge_support_tickets')
    .select('id,organization_id,ticket_number,subject,description,status,priority,category_id,module_id,product_id,requester_name,resolution_summary,assigned_team_id,organization:organizations(name),module:forge_support_product_areas(label),category:forge_support_categories(label)')
    .eq('id', ticketId)
    .maybeSingle()

  if (error || !ticket) throw new Error('Ticket not found.')

  const [{ data: messages }, { data: context }] = await Promise.all([
    db().from('forge_support_messages').select('author_kind,visibility,message_type,body,created_at').eq('ticket_id', ticketId).is('deleted_at', null).order('created_at', { ascending: false }).limit(12),
    db().from('forge_support_ticket_technical_context').select('route,browser_name,browser_version,os_name,device_type,is_mobile,app_version,client_error_id,module_key').eq('ticket_id', ticketId).maybeSingle()
  ])

  const publicThread = (messages || []).filter((m: any) => m.visibility === 'public').reverse()
  const internalNotes = (messages || []).filter((m: any) => m.visibility === 'internal').reverse()
  const text = `${ticket.subject}\n${ticket.description}\n${publicThread.map((m: any) => m.body).join('\n')}`
  const provider = (await getHelpdeskAiProvider()) || new KnowledgeExtractiveProvider()

  const contextLine = context
    ? [context.os_name, context.browser_name && `${context.browser_name} ${context.browser_version || ''}`.trim(), context.device_type, context.app_version && `app ${context.app_version}`, context.client_error_id && `error ${context.client_error_id}`]
        .filter(Boolean)
        .join(', ')
    : 'not captured'

  const basePrompt =
    `Ticket ${ticket.ticket_number} (${ticket.organization?.name || 'tenant'}), ${priorityLabels[ticket.priority]}, status ${ticket.status}\n` +
    `Request type: ${ticket.category?.label || 'unknown'}; product area: ${ticket.module?.label || 'unknown'}\n` +
    `Technical context: ${contextLine}\nSubject: ${ticket.subject}\nDescription: ${ticket.description}\n` +
    `Customer-visible conversation:\n${publicThread.map((m: any) => `${m.author_kind}: ${m.body}`).join('\n').slice(0, 6000)}`

  let output: SuggestionOutput

  switch (type) {
    case 'summarize': {
      const lastCustomer = [...publicThread].reverse().find((m: any) => m.author_kind === 'customer')

      const fallback = () =>
        `${ticket.requester_name || 'The requester'} reports: ${ticket.subject}. ${ticket.description.split(/(?<=[.!?])\s/)[0]} ` +
        `Device: ${contextLine}. ${publicThread.length} public message(s), ${internalNotes.length} internal note(s).` +
        (lastCustomer ? ` Latest customer message: "${lastCustomer.body.slice(0, 200)}"` : '')

      output = { text: await provider.writeText('summary', basePrompt + `\nInternal notes:\n${internalNotes.map((m: any) => m.body).join('\n').slice(0, 2000)}`, fallback), data: {} }
      break
    }

    case 'suggest_response':
    case 'troubleshooting':

    case 'knowledge_search': {
      const articles = await searchKnowledge({ query: ticket.subject, audience: 'staff', organizationId: ticket.organization_id, userId: staffUserId, limit: 4, source: 'console' })
      const { data: bodies } = articles.length ? await db().from('forge_support_knowledge_articles').select('id,slug,title,summary,body,visibility').in('id', articles.map(a => a.id)) : { data: [] }
      const customerSafe = (bodies || []).filter((b: any) => b.visibility !== 'forge_internal')
      const top = customerSafe[0]

      if (type === 'knowledge_search') {
        output = {
          text: articles.length ? articles.map(a => `• ${a.title} (/help-desk/articles/${a.slug})`).join('\n') : 'No related help articles found.',
          data: { articles: articles.map(a => ({ id: a.id, slug: a.slug, title: a.title, visibility: a.visibility })) }
        }
      } else if (type === 'troubleshooting') {
        const steps = top ? stepsFromArticle(top.body) : []

        if (context?.is_mobile) steps.push('Confirm the app is on the latest version and the device has a stable connection.')
        if (context?.client_error_id) steps.push(`Look up client error ${context.client_error_id} in recent platform incidents and development issues.`)
        const fallback = () => (steps.length ? steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : '1. Reproduce with the reported device and browser.\n2. Check recent changes to the user\'s role and Locations.')

        output = { text: await provider.writeText('troubleshooting', basePrompt + (top ? `\nRelated article: ${top.title}\n${top.body.slice(0, 2500)}` : ''), fallback), data: { article: top ? top.slug : null } }
      } else {
        const fallback = () =>
          `Hi ${ticket.requester_name?.split(' ')[0] || 'there'},\n\nThanks for contacting Forge Support about "${ticket.subject}". ` +
          (top ? `${top.summary}\n\n${stepsFromArticle(top.body).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nThe full guide is here: /help-desk/articles/${top.slug}` : 'We are reviewing the details you provided and will follow up shortly.') +
          `\n\nPlease reply if this doesn't resolve the issue.\n\nForge Support`

        output = {
          text: await provider.writeText('reply', basePrompt + (top ? `\nCustomer-safe article: ${top.title}\n${top.body.slice(0, 2500)}` : '') + '\nWrite a reply to the customer.', fallback),
          data: { article: top ? top.slug : null }
        }
      }

      break
    }

    case 'suggest_priority': {
      const rule = pickPriority(text)

      output = { text: `${priorityLabels[rule.priority]} — ${rule.reason}.`, data: { priority: rule.priority, current: ticket.priority } }
      break
    }

    case 'suggest_category':

    case 'suggest_module': {
      const table = type === 'suggest_category' ? 'forge_support_categories' : 'forge_support_product_areas'
      const keyColumn = type === 'suggest_category' ? 'category_key' : 'area_key'
      const { data: rows } = await db().from(table).select(`id,label,${keyColumn}`).eq('is_active', true)
      const picks = scoreByWords(text, (rows || []).map((r: any) => ({ id: r.id, label: r.label, key: r[keyColumn] })))

      output = {
        text: picks.length ? picks.map((p, i) => `${i + 1}. ${p.label}`).join('\n') : 'No confident match.',
        data: { options: picks.map(p => ({ id: p.id, label: p.label })) }
      }
      break
    }

    case 'similar_tickets':

    case 'duplicate_detection': {
      const similar = await findSimilarTickets(ticket, { sameTenantOnly: type === 'duplicate_detection' })
      const candidates = type === 'duplicate_detection' ? similar.filter((t: any) => HELPDESK_ACTIVE_STATUSES.includes(t.status)) : similar

      output = {
        text: candidates.length ? candidates.map((t: any) => `• ${t.ticket_number} — ${t.subject} (${t.status}${type === 'similar_tickets' ? ', ' + (t.organization?.name || '') : ''})`).join('\n') : 'No similar tickets found.',
        data: { tickets: candidates.map((t: any) => ({ id: t.id, ticket_number: t.ticket_number, subject: t.subject, status: t.status, organization_id: t.organization_id })) }
      }
      break
    }

    case 'likely_cause': {
      const { data: devIssues } = context?.client_error_id
        ? await db().from('forge_support_development_issues').select('issue_number,title,state').ilike('error_identifiers', `%${context.client_error_id}%`).limit(3)
        : { data: [] }

      const fallback = () =>
        devIssues?.length
          ? `Matches ${devIssues.map((d: any) => `${d.issue_number} "${d.title}" (${d.state})`).join(', ')} via error ${context?.client_error_id}.`
          : context?.is_mobile
            ? 'Mobile-specific: likely connectivity, app version or media size. Compare with other reports on the same OS version.'
            : 'Likely configuration: verify role permissions and Location assignments for the affected user.'

      output = { text: await provider.writeText('cause', basePrompt + (devIssues?.length ? `\nKnown development issues: ${JSON.stringify(devIssues)}` : ''), fallback), data: { development_issues: devIssues || [] } }
      break
    }

    case 'suggest_assignee': {
      let memberQuery = db().from('forge_support_team_members').select('user_id,team_id')

      if (ticket.assigned_team_id) memberQuery = memberQuery.eq('team_id', ticket.assigned_team_id)
      const { data: members } = await memberQuery
      const ids = [...new Set((members || []).map((m: any) => m.user_id))]
      const { data: load } = ids.length ? await db().from('forge_support_tickets').select('assigned_user_id').in('assigned_user_id', ids).in('status', HELPDESK_ACTIVE_STATUSES) : { data: [] }
      const { data: names } = ids.length ? await db().from('users').select('user_id,name').in('user_id', ids) : { data: [] }

      const ranked = ids
        .map(id => ({ id, open: (load || []).filter((l: any) => l.assigned_user_id === id).length, name: (names || []).find((n: any) => n.user_id === id)?.name || 'Forge staff' }))
        .sort((a, b) => a.open - b.open)

      output = {
        text: ranked.length ? ranked.slice(0, 3).map(r => `• ${r.name} — ${r.open} open ticket(s)`).join('\n') : 'No team members available.',
        data: { candidates: ranked.slice(0, 3) }
      }
      break
    }

    case 'platform_incident': {
      const since = new Date(Date.now() - 24 * 3600000).toISOString()
      const similar = (await findSimilarTickets(ticket, { sameTenantOnly: false })).filter((t: any) => t.created_at >= since)
      const tenants = new Set(similar.map((t: any) => t.organization_id).concat(ticket.organization_id))
      const { data: incidents } = await db().from('forge_support_platform_incidents').select('id,incident_number,title,status').neq('status', 'resolved')
      const likely = tenants.size >= 3

      output = {
        text:
          (incidents?.length ? `Active incidents: ${incidents.map((i: any) => `${i.incident_number} ${i.title}`).join('; ')}. ` : 'No active platform incidents. ') +
          `${similar.length} similar ticket(s) in the last 24h across ${tenants.size} tenant(s). ` +
          (likely ? 'Pattern suggests a platform incident — consider declaring or linking one.' : 'No cross-tenant pattern detected.'),
        data: { similar_count: similar.length, tenant_count: tenants.size, likely_incident: likely, active_incidents: incidents || [] }
      }
      break
    }

    case 'knowledge_draft': {
      const fallback = () =>
        `## Problem\n${ticket.subject}\n\n${ticket.description}\n\n## Resolution\n${ticket.resolution_summary || 'Describe the fix here.'}\n\n## If this doesn't help\nOpen a ticket from Need Help? and include screenshots.`

      output = {
        text: await provider.writeText('article', basePrompt + `\nResolution: ${ticket.resolution_summary || 'n/a'}\nWrite a customer-safe help article in Markdown with ## headings and numbered steps. Remove tenant names and personal data.`, fallback),
        data: { title: ticket.subject, source_ticket_id: ticket.id }
      }
      break
    }

    default:
      throw new Error('Unsupported suggestion type.')
  }

  const inputDigest = createHash('sha256').update(basePrompt).digest('hex')

  const { data: saved, error: saveError } = await db()
    .from('forge_support_ai_suggestions')
    .insert({
      organization_id: ticket.organization_id,
      ticket_id: ticket.id,
      suggestion_type: type,
      provider: provider.name,
      model: provider.model,
      input_digest: inputDigest,
      output: output.data,
      output_text: output.text.slice(0, 20000),
      generated_by: staffUserId
    })
    .select('id,suggestion_type,provider,model,output,output_text,status,generated_at')
    .single()

  if (saveError) throw new Error('Unable to save the AI suggestion.')
  await db().from('forge_support_events').insert({
    organization_id: ticket.organization_id,
    ticket_id: ticket.id,
    actor_user_id: staffUserId,
    event_type: 'ai_suggestion_generated',
    detail: aiSuggestionLabels[type],
    visibility: 'internal',
    metadata: { suggestion_id: saved.id, provider: provider.name }
  })

  return saved
}

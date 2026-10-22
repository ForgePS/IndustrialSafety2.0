import { createServiceRoleClient } from '@repo/supabase/server'

import { priorityLabels } from '@/lib/forgeHelpdesk'

const db = () => createServiceRoleClient() as any

export type DevelopmentIssuePayload = {
  ticket_number: string
  tenant: string
  product: string
  module: string | null
  summary: string
  description: string
  customer_impact: string
  reproduction_steps: string
  technical_context: Record<string, string | number | boolean | null>
  attachments: { file_name: string; mime_type: string; byte_size: number }[]
  priority: string
  error_identifiers: string[]
  related_tickets: string[]
  known_issue_reference: string | null
}

export type ExternalIssueRef = { external_provider: string; external_issue_id: string; external_url: string }

export interface DevelopmentIssueProvider {
  readonly key: string
  readonly label: string
  isConfigured(): boolean
  createIssue(payload: DevelopmentIssuePayload, title: string): Promise<ExternalIssueRef>
}

export const renderDevelopmentIssueBody = (payload: DevelopmentIssuePayload) =>
  [
    `**Support ticket:** ${payload.ticket_number}`,
    `**Tenant:** ${payload.tenant}`,
    `**Product / module:** ${payload.product}${payload.module ? ' / ' + payload.module : ''}`,
    `**Priority:** ${payload.priority}`,
    '',
    '### Summary',
    payload.summary,
    '',
    '### Description',
    payload.description,
    '',
    '### Customer impact',
    payload.customer_impact || 'Not specified.',
    '',
    '### Reproduction steps',
    payload.reproduction_steps || 'Not specified.',
    '',
    '### Technical context',
    ...Object.entries(payload.technical_context).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `- ${k}: ${v}`),
    '',
    payload.error_identifiers.length ? `### Error identifiers\n${payload.error_identifiers.map(e => `- ${e}`).join('\n')}\n` : '',
    payload.attachments.length ? `### Attachments (in Forge)\n${payload.attachments.map(a => `- ${a.file_name} (${a.mime_type}, ${a.byte_size} bytes)`).join('\n')}\n` : '',
    payload.related_tickets.length ? `### Related tickets\n${payload.related_tickets.join(', ')}\n` : '',
    payload.known_issue_reference ? `### Known issue\n${payload.known_issue_reference}` : ''
  ]
    .filter(line => line !== undefined)
    .join('\n')

class GitHubIssuesProvider implements DevelopmentIssueProvider {
  readonly key = 'github'
  readonly label = 'GitHub Issues'

  isConfigured() {
    return Boolean(process.env.FORGE_HELPDESK_GITHUB_TOKEN && /^[\w.-]+\/[\w.-]+$/.test(process.env.FORGE_HELPDESK_GITHUB_REPO || ''))
  }

  async createIssue(payload: DevelopmentIssuePayload, title: string): Promise<ExternalIssueRef> {
    const response = await fetch(`https://api.github.com/repos/${process.env.FORGE_HELPDESK_GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FORGE_HELPDESK_GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ title, body: renderDevelopmentIssueBody(payload), labels: ['forge-support'] }),
      cache: 'no-store'
    })

    const json = await response.json().catch(() => ({}))

    if (!response.ok || !json?.number || !json?.html_url) throw new Error('GitHub rejected the issue.')

    return { external_provider: 'github', external_issue_id: String(json.number), external_url: String(json.html_url) }
  }
}

const providers: DevelopmentIssueProvider[] = [new GitHubIssuesProvider()]

export const listConfiguredDevelopmentProviders = () => providers.filter(p => p.isConfigured()).map(p => ({ key: p.key, label: p.label }))

export const getDevelopmentProvider = (key: string) => providers.find(p => p.key === key && p.isConfigured()) || null

export const buildDevelopmentIssuePayload = async (ticketId: string, overrides: Partial<DevelopmentIssuePayload> = {}): Promise<DevelopmentIssuePayload> => {
  const d = db()

  const { data: ticket, error } = await d
    .from('forge_support_tickets')
    .select('id,ticket_number,subject,description,priority,organization:organizations(name),product:forge_support_products(name),module:forge_support_product_areas(label)')
    .eq('id', ticketId)
    .maybeSingle()

  if (error || !ticket) throw new Error('Ticket not found.')

  const [{ data: context }, { data: attachments }, { data: relations }] = await Promise.all([
    d.from('forge_support_ticket_technical_context').select('route,browser_name,browser_version,os_name,device_type,viewport_width,viewport_height,app_version,build_version,client_timezone,correlation_id,client_error_id,module_key').eq('ticket_id', ticketId).maybeSingle(),
    d.from('forge_support_attachments').select('file_name,mime_type,byte_size').eq('ticket_id', ticketId).is('deleted_at', null),
    d.from('forge_support_ticket_relations').select('source_ticket_id,target_ticket_id').or(`source_ticket_id.eq.${ticketId},target_ticket_id.eq.${ticketId}`).is('archived_at', null)
  ])

  const relatedIds = (relations || []).map((r: any) => (r.source_ticket_id === ticketId ? r.target_ticket_id : r.source_ticket_id))
  const { data: related } = relatedIds.length ? await d.from('forge_support_tickets').select('ticket_number').in('id', relatedIds) : { data: [] }
  const technical: Record<string, string | number | boolean | null> = {}

  for (const [key, value] of Object.entries(context || {})) technical[key] = value as string | number | null

  return {
    ticket_number: ticket.ticket_number,
    tenant: ticket.organization?.name || 'Unknown tenant',
    product: ticket.product?.name || 'Forge',
    module: ticket.module?.label || null,
    summary: ticket.subject,
    description: ticket.description,
    customer_impact: '',
    reproduction_steps: '',
    technical_context: technical,
    attachments: attachments || [],
    priority: priorityLabels[ticket.priority] || ticket.priority,
    error_identifiers: context?.client_error_id ? [context.client_error_id] : [],
    related_tickets: (related || []).map((r: any) => r.ticket_number),
    known_issue_reference: null,
    ...overrides
  }
}

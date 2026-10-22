import { createServiceRoleClient } from '@repo/supabase/server'

// Platform notification service. Domain modules (Help Desk today) write events and
// deliveries in the database; this module reads inboxes and drains the email outbox
// through a provider adapter so no vendor is wired into the ticket domain.

export type NotificationDelivery = {
  id: string
  title: string
  body: string | null
  link_path: string | null
  read_at: string | null
  created_at: string
  recipient_audience: 'customer' | 'internal'
  event: { source_module: string; event_type: string } | null
}

export const listInbox = async (userId: string, { limit = 50, unreadOnly = false } = {}) => {
  const db = createServiceRoleClient() as any
  let query = db
    .from('forge_notification_deliveries')
    .select('id,title,body,link_path,read_at,created_at,recipient_audience,event:forge_notification_events(source_module,event_type)')
    .eq('recipient_user_id', userId)
    .eq('channel', 'in_app')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200))

  if (unreadOnly) query = query.is('read_at', null)
  const { data, error } = await query

  if (error) throw new Error('Unable to load notifications.')

  return (data || []) as NotificationDelivery[]
}

export const unreadCount = async (userId: string) => {
  const db = createServiceRoleClient() as any

  const { count } = await db
    .from('forge_notification_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_user_id', userId)
    .eq('channel', 'in_app')
    .is('read_at', null)

  return count || 0
}

export const markNotificationsRead = async (userId: string, ids: string[] | 'all') => {
  const db = createServiceRoleClient() as any
  let query = db
    .from('forge_notification_deliveries')
    .update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('recipient_user_id', userId)
    .eq('channel', 'in_app')
    .is('read_at', null)

  if (ids !== 'all') {
    if (!ids.length) return 0
    query = query.in('id', ids.slice(0, 200))
  }

  const { data, error } = await query.select('id')

  if (error) throw new Error('Unable to update notifications.')

  return (data || []).length
}

// ---------------------------------------------------------------------------
// Email delivery
// ---------------------------------------------------------------------------
export type EmailMessage = { to: string; subject: string; text: string; html: string }
export type EmailSendResult = { ok: true; providerMessageId: string | null } | { ok: false; error: string; retryable: boolean }

export interface EmailAdapter {
  readonly name: string
  send(message: EmailMessage): Promise<EmailSendResult>
}

class ResendEmailAdapter implements EmailAdapter {
  readonly name = 'resend'

  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
        cache: 'no-store'
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        return { ok: false, error: String(payload?.message || payload?.error || response.statusText).slice(0, 500), retryable: response.status >= 500 || response.status === 429 }
      }

      return { ok: true, providerMessageId: payload?.id || null }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message.slice(0, 500) : 'Email request failed.', retryable: true }
    }
  }
}

export const getEmailAdapter = (): EmailAdapter | null => {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.FORGE_NOTIFICATIONS_EMAIL_FROM

  if (apiKey && from) return new ResendEmailAdapter(apiKey, from)

  return null
}

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') + (process.env.BASEPATH || '')

export const renderNotificationEmail = (delivery: { title: string; body: string | null; link_path: string | null }) => {
  const link = delivery.link_path && appUrl() ? appUrl() + delivery.link_path : null
  const text = [delivery.title, '', delivery.body || '', link ? '\nOpen in Forge: ' + link : ''].join('\n').trim()

  const html =
    `<div style="font-family:Arial,sans-serif;max-width:560px">` +
    `<h2 style="font-size:18px">${escapeHtml(delivery.title)}</h2>` +
    (delivery.body ? `<p style="white-space:pre-wrap">${escapeHtml(delivery.body)}</p>` : '') +
    (link ? `<p><a href="${escapeHtml(link)}">Open in Forge</a></p>` : '') +
    `<p style="color:#777;font-size:12px">You are receiving this because of your Forge notification settings.</p></div>`

  return { subject: delivery.title.slice(0, 200), text, html }
}

const MAX_ATTEMPTS = 5

export const dispatchPendingEmails = async ({ limit = 50, adapter = getEmailAdapter() }: { limit?: number; adapter?: EmailAdapter | null } = {}) => {
  const db = createServiceRoleClient() as any

  const { data: pending, error } = await db
    .from('forge_notification_deliveries')
    .select('id,recipient_user_id,recipient_audience,title,body,link_path,attempts,event:forge_notification_events(visibility)')
    .eq('channel', 'email')
    .eq('status', 'pending')
    .order('created_at')
    .limit(Math.min(limit, 200))

  if (error) throw new Error('Unable to read the email outbox.')
  const summary = { processed: 0, sent: 0, failed: 0, skipped: 0 }

  if (!pending?.length) return summary

  const userIds = [...new Set<string>(pending.map((row: any) => row.recipient_user_id))]
  const { data: users } = await db.from('users').select('user_id,email').in('user_id', userIds)
  const emails = new Map<string, string>((users || []).map((row: any) => [row.user_id, row.email]))

  for (const delivery of pending as any[]) {
    summary.processed += 1
    const now = new Date().toISOString()
    const to = emails.get(delivery.recipient_user_id)


    // Defense in depth: internal events never go to customer recipients (also enforced by a DB trigger).
    if (delivery.event?.visibility === 'internal' && delivery.recipient_audience !== 'internal') {
      await db.from('forge_notification_deliveries').update({ status: 'skipped', last_error: 'Blocked: internal content for customer recipient.', updated_at: now }).eq('id', delivery.id)
      summary.skipped += 1
      continue
    }

    if (!adapter || !to) {
      await db
        .from('forge_notification_deliveries')
        .update({ status: 'skipped', last_error: adapter ? 'Recipient has no email address.' : 'No email provider is configured.', updated_at: now })
        .eq('id', delivery.id)
        .eq('status', 'pending')
      summary.skipped += 1
      continue
    }

    const result = await adapter.send({ to, ...renderNotificationEmail(delivery) })
    const attempts = (delivery.attempts || 0) + 1

    if (result.ok) {
      await db
        .from('forge_notification_deliveries')
        .update({ status: 'sent', sent_at: now, attempts, provider: adapter.name, provider_message_id: result.providerMessageId, last_error: null, updated_at: now })
        .eq('id', delivery.id)
      summary.sent += 1
    } else {
      await db
        .from('forge_notification_deliveries')
        .update({
          status: result.retryable && attempts < MAX_ATTEMPTS ? 'pending' : 'failed',
          attempts,
          provider: adapter.name,
          last_error: result.error,
          updated_at: now
        })
        .eq('id', delivery.id)
      summary.failed += 1
    }
  }

  return summary
}

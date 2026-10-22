/**
 * FIS-HD-01 — Help Desk database regression.
 *  - concurrency-safe SUP-YYYY-###### numbering and idempotent creation
 *  - relationship validation (cross-tenant location, non-member requester)
 *  - tenant isolation on every customer RPC (spoofed / mismatched organization)
 *  - internal-note protection and staff permission denials
 *  - optimistic locking, status rules, resolution summary requirement
 *  - assignment, priority history, tags, watchers, related tickets, staff and customer close
 *  - SLA pause on waiting-on-customer, resume on customer reply, at-risk and breach evaluation
 *  - CSAT 1-5, one per ticket, immutable
 *  - duplicate merge keeps all data and closes the duplicate only
 *  - knowledge visibility (public / authenticated / tenant-only / internal)
 *  - platform incidents: INC numbering, permission, never auto-close tickets
 *  - AI suggestion output immutability and one-time decision
 *  - append-only audit log, no anon/authenticated table access
 * Run: node apps/web/tests/fis-hd01-helpdesk-db.cjs
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.API_URL || 'http://127.0.0.1:35421'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.ANON_KEY
if (!KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.')

const OWNER = '20000000-0000-4000-8000-000000000001'
const AGENT = '20000000-0000-4000-8000-000000000004'
const DEMO_ORG = '20000000-0000-4000-8000-000000000100'
const DEMO_USER = '20000000-0000-4000-8000-000000000002'
const DEMO_LOC = '20000000-0000-4000-8000-000000000300'
const NS_ORG = '40000000-0000-4000-8000-000000000100'
const NS_ADMIN = '40000000-0000-4000-8000-000000000001'
const NS_USER = '40000000-0000-4000-8000-000000000002'
const STRANGER = '9f000000-0000-4000-8000-0000000000ff'

async function request(method, urlPath, body, key = KEY) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

const rpc = (name, args) => request('POST', '/rest/v1/rpc/' + name, args)
const first = data => (Array.isArray(data) ? data[0] : data)
const stamp = () => Date.now() + '-' + Math.floor(Math.random() * 100000)
let passed = 0

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function ok(label) {
  passed += 1
  console.log('  PASS ' + label)
}

function expectOk(result, label) {
  assert(result.ok && result.data?.ok !== false, label + ' failed: ' + result.status + ' ' + JSON.stringify(result.data))
  return result.data
}

function expectDenied(result, pattern, label) {
  const text = JSON.stringify(result.data || '')
  assert(!result.ok || result.data?.ok === false, label + ' must be denied, got ' + result.status + ' ' + text)
  assert(pattern.test(text), label + ' denial must explain the rule, got ' + text)
  ok(label + ' denied')
}

async function getOne(table, filter, select = '*') {
  const { data } = await request('GET', `/rest/v1/${table}?${filter}&select=${select}`)
  return first(data)
}

async function catalog() {
  const product = await getOne('forge_support_products', 'product_key=eq.forge_industrial_safety', 'id')
  const category = await getOne('forge_support_categories', 'category_key=eq.technical_issue', 'id')
  assert(product?.id && category?.id, 'seeded product and category are required')
  return { productId: product.id, categoryId: category.id }
}

async function createTicket(cat, { org = NS_ORG, user = NS_USER, subject, key, extra = {} } = {}) {
  return rpc('forge_support_create_ticket', {
    p_organization_id: org,
    p_requester_user_id: user,
    p_payload: {
      subject: subject || 'HD-DB regression ' + stamp(),
      description: 'Automated help desk regression ticket created by fis-hd01-helpdesk-db.cjs.',
      product_id: cat.productId,
      category_id: cat.categoryId,
      customer_reported_severity: 'p3_normal',
      source: 'web',
      technical_context: { route: '/help-desk/tickets/new', browser_name: 'node', device_type: 'desktop' },
      ...extra
    },
    p_idempotency_key: key || null
  })
}

async function ticket(id) {
  return getOne('forge_support_tickets', 'id=eq.' + id)
}

async function numbering(cat) {
  console.log('Numbering and idempotency')
  const results = await Promise.all(Array.from({ length: 12 }, () => createTicket(cat)))
  const numbers = results.map(r => expectOk(r, 'concurrent create').ticket_number)
  assert(numbers.every(n => /^SUP-\d{4}-\d{6}$/.test(n)), 'ticket numbers must be SUP-YYYY-###### ' + numbers.join(','))
  assert(new Set(numbers).size === numbers.length, 'concurrent creates must yield unique numbers ' + numbers.join(','))
  ok('12 concurrent tickets got unique SUP numbers')

  const key = 'hd-db-' + stamp()
  const a = expectOk(await createTicket(cat, { key }), 'idempotent create #1')
  const b = expectOk(await createTicket(cat, { key, subject: 'Different subject same key' }), 'idempotent create #2')
  assert(a.ticket_id === b.ticket_id && b.duplicate === true, 'same idempotency key must return the original ticket')
  ok('idempotency key returns the original ticket')
}

async function validation(cat) {
  console.log('Relationship validation')
  expectDenied(await createTicket(cat, { extra: { location_id: DEMO_LOC } }), /Location is not part of this company/, 'cross-tenant location')
  expectDenied(await createTicket(cat, { user: STRANGER }), /not an active member/, 'non-member requester')
  expectDenied(await createTicket(cat, { subject: 'no' }), /Subject must be/, 'short subject')
  expectDenied(await createTicket(cat, { extra: { source: 'email' } }), /Invalid ticket source/, 'unsupported source')
}

async function isolationAndPermissions(cat) {
  console.log('Tenant isolation and permission denials')
  const ns = expectOk(await createTicket(cat), 'northstar ticket')
  const demo = expectOk(await createTicket(cat, { org: DEMO_ORG, user: DEMO_USER }), 'demo ticket')

  const reply = (ticketId, org, actor = NS_USER) =>
    rpc('forge_support_add_message', {
      p_ticket_id: ticketId, p_actor_user_id: actor, p_actor_type: 'customer',
      p_message_type: 'customer_message', p_body: 'Cross-tenant probe', p_organization_id: org
    })
  expectDenied(await reply(demo.ticket_id, NS_ORG), /Ticket not found/, 'customer reply on another tenant ticket')
  expectDenied(await reply(demo.ticket_id, DEMO_ORG), /Ticket not found/, 'customer reply with spoofed organization')
  expectDenied(
    await rpc('forge_support_apply_ticket_change', {
      p_ticket_id: demo.ticket_id, p_actor_user_id: NS_USER, p_actor_type: 'customer',
      p_changes: { status: 'closed' }, p_organization_id: NS_ORG
    }),
    /Ticket not found/,
    'customer close on another tenant ticket'
  )
  expectDenied(
    await rpc('forge_support_submit_csat', {
      p_ticket_id: demo.ticket_id, p_requester_user_id: NS_USER, p_organization_id: NS_ORG, p_rating: 1
    }),
    /Ticket not found/,
    'CSAT on another tenant ticket'
  )
  expectDenied(
    await rpc('forge_support_add_message', {
      p_ticket_id: ns.ticket_id, p_actor_user_id: NS_USER, p_actor_type: 'customer',
      p_message_type: 'internal_note', p_body: 'Customer trying to write an internal note', p_organization_id: NS_ORG
    }),
    /Customers can only send customer messages/,
    'customer internal note'
  )
  expectDenied(
    await rpc('forge_support_apply_ticket_change', {
      p_ticket_id: ns.ticket_id, p_actor_user_id: NS_USER, p_actor_type: 'customer',
      p_changes: { priority: 'p1_critical' }, p_organization_id: NS_ORG
    }),
    /Customers can only reopen or close/,
    'customer priority change'
  )

  // Tenant admins are not Forge staff: every staff RPC must refuse them.
  expectDenied(
    await rpc('forge_support_add_message', {
      p_ticket_id: ns.ticket_id, p_actor_user_id: NS_ADMIN, p_actor_type: 'staff',
      p_message_type: 'support_reply', p_body: 'Tenant admin impersonating support'
    }),
    /permission to reply/,
    'tenant admin staff reply'
  )
  expectDenied(
    await rpc('forge_support_add_message', {
      p_ticket_id: ns.ticket_id, p_actor_user_id: NS_ADMIN, p_actor_type: 'staff',
      p_message_type: 'internal_note', p_body: 'Tenant admin internal note'
    }),
    /permission to add internal notes/,
    'tenant admin internal note'
  )
  expectDenied(
    await rpc('forge_support_apply_ticket_change', {
      p_ticket_id: ns.ticket_id, p_actor_user_id: NS_ADMIN, p_actor_type: 'staff', p_changes: { priority: 'p1_critical' }
    }),
    /Access denied/,
    'tenant admin staff change'
  )
  expectDenied(
    await rpc('forge_support_merge_tickets', {
      p_duplicate_ticket_id: ns.ticket_id, p_canonical_ticket_id: demo.ticket_id, p_actor_user_id: NS_ADMIN
    }),
    /permission to merge/,
    'tenant admin merge'
  )
  expectDenied(
    await rpc('forge_support_merge_tickets', {
      p_duplicate_ticket_id: ns.ticket_id, p_canonical_ticket_id: demo.ticket_id, p_actor_user_id: AGENT
    }),
    /same customer tenant/,
    'cross-tenant merge'
  )
  expectDenied(
    await rpc('forge_support_add_message', {
      p_ticket_id: ns.ticket_id, p_actor_user_id: AGENT, p_actor_type: 'staff',
      p_message_type: 'internal_note', p_body: 'Mentioning a customer', p_mentions: [NS_USER]
    }),
    /Only Forge support staff can be mentioned/,
    'mentioning a customer'
  )
}

async function lifecycle(cat) {
  console.log('Lifecycle, SLA, optimistic locking, CSAT')
  const created = expectOk(await createTicket(cat), 'lifecycle ticket')
  const id = created.ticket_id
  let sla = await getOne('forge_support_sla_instances', 'ticket_id=eq.' + id)
  assert(sla && sla.first_response_due_at && sla.resolution_due_at, 'SLA instance must be created with due dates')
  ok('SLA instance created on ticket creation')

  expectOk(
    await rpc('forge_support_add_message', {
      p_ticket_id: id, p_actor_user_id: AGENT, p_actor_type: 'staff', p_message_type: 'internal_note',
      p_body: 'INTERNAL-DB-NOTE', p_mentions: [OWNER]
    }),
    'internal note with staff mention'
  )
  let t = await ticket(id)
  assert(!t.first_responded_at, 'internal notes must not count as first response')
  ok('internal note does not satisfy first response')

  const replied = expectOk(
    await rpc('forge_support_add_message', {
      p_ticket_id: id, p_actor_user_id: AGENT, p_actor_type: 'staff', p_message_type: 'support_reply',
      p_body: 'Please send a screenshot.', p_set_status: 'waiting_on_customer'
    }),
    'support reply + waiting on customer'
  )
  t = await ticket(id)
  assert(t.first_responded_at && t.status === 'waiting_on_customer', 'reply must set first response and status')
  sla = await getOne('forge_support_sla_instances', 'ticket_id=eq.' + id)
  assert(sla.first_responded_at, 'SLA first response must be recorded')
  assert(sla.state === 'paused' && sla.paused_at, 'SLA must pause while waiting on customer, got ' + sla.state)
  ok('SLA pauses while waiting on customer')

  expectDenied(
    await rpc('forge_support_apply_ticket_change', {
      p_ticket_id: id, p_actor_user_id: AGENT, p_actor_type: 'staff',
      p_changes: { priority: 'p2_high' }, p_expected_row_version: replied.row_version - 1
    }),
    /changed after you opened it/,
    'stale row_version'
  )

  expectOk(
    await rpc('forge_support_add_message', {
      p_ticket_id: id, p_actor_user_id: NS_USER, p_actor_type: 'customer', p_message_type: 'customer_message',
      p_body: 'Screenshot attached.', p_organization_id: NS_ORG
    }),
    'customer reply'
  )
  t = await ticket(id)
  sla = await getOne('forge_support_sla_instances', 'ticket_id=eq.' + id)
  assert(t.status === 'waiting_on_forge', 'customer reply must move to waiting_on_forge, got ' + t.status)
  assert(sla.state !== 'paused' && !sla.paused_at, 'SLA must resume (waiting on Forge does not pause), got ' + sla.state)
  assert(Number(sla.total_paused_seconds) >= 0, 'paused time must be accumulated')
  ok('customer reply resumes SLA and moves to waiting on Forge')

  expectDenied(
    await rpc('forge_support_apply_ticket_change', {
      p_ticket_id: id, p_actor_user_id: AGENT, p_actor_type: 'staff', p_changes: { status: 'resolved' }
    }),
    /resolution summary is required/,
    'resolve without summary'
  )
  expectDenied(
    await rpc('forge_support_submit_csat', { p_ticket_id: id, p_requester_user_id: NS_USER, p_organization_id: NS_ORG, p_rating: 5 }),
    /Ratings open after the ticket is resolved/,
    'CSAT before resolution'
  )
  expectOk(
    await rpc('forge_support_apply_ticket_change', {
      p_ticket_id: id, p_actor_user_id: AGENT, p_actor_type: 'staff',
      p_changes: { status: 'resolved', resolution_summary: 'Cleared cached session; confirmed with requester.' },
      p_expected_row_version: (await ticket(id)).row_version
    }),
    'resolve with summary'
  )
  sla = await getOne('forge_support_sla_instances', 'ticket_id=eq.' + id)
  assert(sla.state === 'completed', 'resolved tickets complete the SLA, got ' + sla.state)
  ok('resolution completes the SLA')

  expectDenied(
    await rpc('forge_support_submit_csat', { p_ticket_id: id, p_requester_user_id: NS_ADMIN, p_organization_id: NS_ORG, p_rating: 5 }),
    /Only the requester/,
    'CSAT by non-requester'
  )
  expectDenied(
    await rpc('forge_support_submit_csat', { p_ticket_id: id, p_requester_user_id: NS_USER, p_organization_id: NS_ORG, p_rating: 6 }),
    /rating from 1 to 5/,
    'CSAT out of range'
  )
  const csat = expectOk(
    await rpc('forge_support_submit_csat', {
      p_ticket_id: id, p_requester_user_id: NS_USER, p_organization_id: NS_ORG, p_rating: 4, p_comment: 'Quick fix.'
    }),
    'CSAT submit'
  )
  expectDenied(
    await rpc('forge_support_submit_csat', { p_ticket_id: id, p_requester_user_id: NS_USER, p_organization_id: NS_ORG, p_rating: 1 }),
    /already rated/,
    'second CSAT'
  )
  expectDenied(
    await request('PATCH', '/rest/v1/forge_support_customer_satisfaction?id=eq.' + csat.csat_id, { rating: 1 }),
    /cannot be modified/,
    'CSAT direct update'
  )
  expectDenied(
    await request('DELETE', '/rest/v1/forge_support_customer_satisfaction?id=eq.' + csat.csat_id),
    /cannot be modified/,
    'CSAT direct delete'
  )

  const reopened = expectOk(
    await rpc('forge_support_apply_ticket_change', {
      p_ticket_id: id, p_actor_user_id: NS_USER, p_actor_type: 'customer',
      p_changes: { status: 'reopened' }, p_organization_id: NS_ORG, p_reason: 'Issue came back.'
    }),
    'customer reopen'
  )
  assert(reopened.status === 'reopened', 'customer reopen must set reopened')
  t = await ticket(id)
  assert(t.reopen_count === 1 && !t.resolved_at, 'reopen must clear resolution timestamps and count the reopen')
  ok('customer reopen clears resolution state')

  const internal = await request('GET', `/rest/v1/forge_support_messages?ticket_id=eq.${id}&visibility=eq.internal&select=id,body`)
  assert(internal.data.length === 1 && internal.data[0].body === 'INTERNAL-DB-NOTE', 'internal note must be stored as internal')
  const mention = await getOne('forge_support_message_mentions', 'message_id=eq.' + internal.data[0].id)
  assert(mention?.mentioned_user_id === OWNER, 'mention must be recorded')
  ok('internal note visibility and mention recorded')

  const audit = await request(
    'GET',
    `/rest/v1/forge_creator_audit_log?entity_type=eq.support_ticket&entity_id=eq.${id}&select=id,action,actor_type`
  )
  const actions = audit.data.map(a => a.action)
  for (const expected of ['helpdesk.ticket.created', 'helpdesk.message.support_reply', 'helpdesk.message.internal_note', 'helpdesk.csat.submitted', 'helpdesk.ticket.reopened']) {
    assert(actions.includes(expected), 'audit trail must include ' + expected + ' got ' + actions.join(','))
  }
  ok('audit trail covers ticket lifecycle')

  expectDenied(
    await request('PATCH', '/rest/v1/forge_creator_audit_log?id=eq.' + audit.data[0].id, { action: 'tampered' }),
    /append-only/,
    'audit log update'
  )
  expectDenied(await request('DELETE', '/rest/v1/forge_creator_audit_log?id=eq.' + audit.data[0].id), /append-only/, 'audit log delete')

  const history = await request('GET', `/rest/v1/forge_support_ticket_status_history?ticket_id=eq.${id}&select=to_status&order=id.asc`)
  const statuses = (history.data || []).map(h => h.to_status)
  assert(statuses.join('>') === 'new>waiting_on_customer>waiting_on_forge>resolved>reopened', 'status history must be complete, got ' + statuses.join('>'))
  ok('status history is complete')
}

async function triage(cat) {
  console.log('Assignment, priority, tags, watchers, relations, close')
  const created = expectOk(await createTicket(cat), 'triage ticket')
  const id = created.ticket_id
  const change = (changes, actor = OWNER, extra = {}) =>
    rpc('forge_support_apply_ticket_change', { p_ticket_id: id, p_actor_user_id: actor, p_actor_type: 'staff', p_changes: changes, ...extra })

  expectDenied(await change({ assigned_user_id: NS_ADMIN }), /Assignee must be an active Forge support team member/, 'assigning a tenant user')
  expectOk(await change({ assigned_user_id: AGENT }, OWNER, { p_reason: 'Queue balancing' }), 'assign to agent')
  let t = await ticket(id)
  assert(t.assigned_user_id === AGENT && t.status === 'assigned', 'assignment must set assignee and move new to assigned, got ' + t.status)
  const assignment = await getOne('forge_support_ticket_assignments', `ticket_id=eq.${id}&to_user_id=eq.${AGENT}`)
  assert(assignment?.assigned_by === OWNER, 'assignment history must be recorded')
  const event = await getOne('forge_notification_events', `resource_id=eq.${id}&event_type=eq.ticket_assigned`, 'id')
  const delivery = event && (await getOne('forge_notification_deliveries', `event_id=eq.${event.id}&recipient_user_id=eq.${AGENT}`, 'id,channel'))
  assert(delivery, 'assignee must receive an assignment notification')
  ok('assignment recorded, status moves to assigned, assignee notified')

  expectOk(await change({ priority: 'p2_high' }, AGENT, { p_reason: 'Blocks inspections' }), 'priority change')
  const priority = await getOne('forge_support_ticket_priority_history', `ticket_id=eq.${id}&to_priority=eq.p2_high`)
  assert(priority?.from_priority === 'p3_normal' && priority.changed_by === AGENT, 'priority history must be recorded')
  const sla = await getOne('forge_support_sla_instances', 'ticket_id=eq.' + id)
  assert(sla.priority === 'p2_high', 'SLA must follow the new priority, got ' + sla.priority)
  expectDenied(await change({ priority: 'p9' }, AGENT), /Invalid priority/, 'invalid priority')
  ok('priority change recorded and SLA re-targeted')

  const globalTag = await getOne('forge_support_tags', 'slug=eq.mobile&organization_id=is.null', 'id')
  const foreign = await request('POST', '/rest/v1/forge_support_tags', {
    organization_id: DEMO_ORG, label: 'demo-only', slug: 'demo-only-' + Date.now()
  })
  const foreignTag = first(foreign.data)
  assert(globalTag && foreignTag?.id, 'tag fixtures required')
  const tags = (add, remove = [], actor = AGENT) =>
    rpc('forge_support_set_ticket_tags', { p_ticket_id: id, p_actor_user_id: actor, p_add: add, p_remove: remove })
  expectDenied(await tags([globalTag.id], [], NS_ADMIN), /permission to tag/, 'tenant admin tagging')
  expectDenied(await tags([foreignTag.id]), /not available for this ticket/, 'another tenant tag')
  expectOk(await tags([globalTag.id]), 'add tag')
  assert(await getOne('forge_support_ticket_tags', `ticket_id=eq.${id}&tag_id=eq.${globalTag.id}`), 'tag must be attached')
  expectOk(await tags([], [globalTag.id]), 'remove tag')
  assert(!(await getOne('forge_support_ticket_tags', `ticket_id=eq.${id}&tag_id=eq.${globalTag.id}`)), 'tag must be removed')
  ok('tags add/remove with tenant-scoped tag isolation')

  const watch = (user, on, actor = AGENT) =>
    rpc('forge_support_set_watcher', { p_ticket_id: id, p_actor_user_id: actor, p_user_id: user, p_watch: on })
  expectDenied(await watch(DEMO_USER, true), /Watchers must be Forge support staff or active users in this company/, 'cross-tenant watcher')
  expectDenied(await watch(NS_ADMIN, true, NS_ADMIN), /permission to manage watchers/, 'tenant admin managing watchers')
  const watched = expectOk(await watch(NS_ADMIN, true), 'add customer watcher')
  assert(watched.watcher_type === 'customer', 'company colleague must be a customer watcher')
  expectOk(await watch(OWNER, true), 'add staff watcher')
  assert((await getOne('forge_support_ticket_watchers', `ticket_id=eq.${id}&user_id=eq.${OWNER}`))?.watcher_type === 'internal', 'staff watcher must be internal')
  expectOk(await watch(NS_ADMIN, false), 'remove watcher')
  assert(!(await getOne('forge_support_ticket_watchers', `ticket_id=eq.${id}&user_id=eq.${NS_ADMIN}`)), 'watcher must be removed')
  ok('watchers scoped to staff and same-company users')

  const sibling = expectOk(await createTicket(cat), 'related ticket')
  const demo = expectOk(await createTicket(cat, { org: DEMO_ORG, user: DEMO_USER }), 'other tenant ticket')
  const link = (target, type = 'related') =>
    rpc('forge_support_link_tickets', { p_source_ticket_id: id, p_target_ticket_id: target, p_relation_type: type, p_actor_user_id: AGENT })
  expectDenied(await link(demo.ticket_id), /same customer tenant/, 'cross-tenant relation')
  expectDenied(await link(id), /cannot be linked to itself/, 'self relation')
  expectDenied(await link(sibling.ticket_id, 'duplicate_of'), /Use Merge/, 'duplicate via relation')
  expectOk(await link(sibling.ticket_id), 'relate tickets')
  const relation = await getOne('forge_support_ticket_relations', `source_ticket_id=eq.${id}&target_ticket_id=eq.${sibling.ticket_id}`)
  assert(relation?.relation_type === 'related' && relation.organization_id === NS_ORG, 'relation must be stored in the tenant')
  ok('related tickets linked within the tenant only')

  expectDenied(await change({ status: 'closed', resolution_summary: 'Skip resolve' }, AGENT), /Cannot move from Assigned to Closed/, 'staff close before resolve')
  expectOk(await change({ status: 'resolved', resolution_summary: 'Re-synced the device.' }, AGENT), 'staff resolve')
  expectOk(await change({ status: 'closed' }, AGENT), 'staff close')
  t = await ticket(id)
  assert(t.status === 'closed' && t.closed_at, 'staff close must set closed_at')
  ok('staff close follows resolve')

  const own = expectOk(await createTicket(cat), 'customer close ticket')
  const closed = expectOk(
    await rpc('forge_support_apply_ticket_change', {
      p_ticket_id: own.ticket_id, p_actor_user_id: NS_USER, p_actor_type: 'customer',
      p_changes: { status: 'closed' }, p_organization_id: NS_ORG, p_reason: 'Figured it out.'
    }),
    'customer close'
  )
  assert(closed.status === 'closed', 'customer close must close the ticket')
  ok('customer can close their own ticket')
}

async function slaAtRisk(cat) {
  console.log('SLA at-risk evaluation')
  const created = expectOk(await createTicket(cat), 'at-risk ticket')
  const before = await getOne('forge_support_sla_instances', 'ticket_id=eq.' + created.ticket_id)
  assert(before.state === 'on_track', 'fresh SLA must be on track, got ' + before.state)
  const nearDue = new Date(new Date(before.first_response_due_at).getTime() - 60 * 1000).toISOString()
  expectOk(await rpc('forge_support_evaluate_sla', { p_now: nearDue, p_ticket_id: created.ticket_id }), 'evaluate SLA near due')
  const after = await getOne('forge_support_sla_instances', 'ticket_id=eq.' + created.ticket_id)
  assert(after.state === 'at_risk', 'SLA one minute before first response due must be at risk, got ' + after.state)
  const t = await ticket(created.ticket_id)
  assert(t.sla_state === 'at_risk', 'ticket must mirror the at-risk state, got ' + t.sla_state)
  const event = await getOne('forge_support_sla_events', `ticket_id=eq.${created.ticket_id}&event_type=eq.at_risk`, 'id')
  assert(event, 'at-risk transition must be recorded')
  ok('SLA near its target evaluates to at risk')
}

async function slaBreach(cat) {
  console.log('SLA breach evaluation')
  const seeded = await getOne('forge_support_tickets', 'ticket_number=like.SUP-*-000003', 'id,ticket_number')
  const seededSla = seeded && (await getOne('forge_support_sla_instances', 'ticket_id=eq.' + seeded.id))
  assert(seededSla?.state === 'breached', 'seeded SUP-...-000003 must be breached, got ' + seededSla?.state)
  ok('seeded P1 ticket is breached')

  const created = expectOk(await createTicket(cat), 'breach ticket')
  const future = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString()
  expectOk(await rpc('forge_support_evaluate_sla', { p_now: future, p_ticket_id: created.ticket_id }), 'evaluate SLA in the future')
  const sla = await getOne('forge_support_sla_instances', 'ticket_id=eq.' + created.ticket_id)
  assert(sla.state === 'breached' && sla.first_response_breached_at, 'overdue SLA must breach, got ' + sla.state)
  ok('overdue SLA evaluates to breached')
}

async function merge(cat) {
  console.log('Duplicate merge')
  const dup = expectOk(await createTicket(cat, { user: NS_ADMIN }), 'duplicate ticket')
  const canon = expectOk(await createTicket(cat), 'canonical ticket')
  expectOk(
    await rpc('forge_support_add_message', {
      p_ticket_id: dup.ticket_id, p_actor_user_id: NS_ADMIN, p_actor_type: 'customer', p_message_type: 'customer_message',
      p_body: 'Detail only on the duplicate.', p_organization_id: NS_ORG
    }),
    'message on duplicate'
  )
  const before = await request('GET', `/rest/v1/forge_support_messages?ticket_id=eq.${dup.ticket_id}&select=id`)
  expectOk(
    await rpc('forge_support_merge_tickets', {
      p_duplicate_ticket_id: dup.ticket_id, p_canonical_ticket_id: canon.ticket_id, p_actor_user_id: AGENT, p_reason: 'Same root cause'
    }),
    'merge'
  )
  const d = await ticket(dup.ticket_id)
  const c = await ticket(canon.ticket_id)
  assert(d.merged_into_ticket_id === canon.ticket_id && d.status === 'closed' && d.disposition === 'duplicate', 'duplicate must be closed and linked')
  assert(c.status === 'new' && !c.merged_into_ticket_id, 'canonical ticket must stay open')
  const after = await request('GET', `/rest/v1/forge_support_messages?ticket_id=eq.${dup.ticket_id}&select=id`)
  assert(after.data.length === before.data.length + 1, 'merge must keep duplicate messages and add a notice')
  const watcher = await getOne('forge_support_ticket_watchers', `ticket_id=eq.${canon.ticket_id}&user_id=eq.${NS_ADMIN}`)
  assert(watcher, 'duplicate requester must follow the canonical ticket')
  ok('merge preserves data, closes duplicate, adds requester as watcher')

  expectDenied(
    await rpc('forge_support_add_message', {
      p_ticket_id: dup.ticket_id, p_actor_user_id: NS_ADMIN, p_actor_type: 'customer', p_message_type: 'customer_message',
      p_body: 'Reply on merged ticket', p_organization_id: NS_ORG
    }),
    /was merged into/,
    'reply on merged ticket'
  )
}

async function knowledge() {
  console.log('Knowledge visibility')
  const search = (query, audience, org, drafts = false) =>
    rpc('forge_support_search_knowledge', { p_query: query, p_audience: audience, p_organization_id: org, p_include_drafts: drafts })
  const slugs = result => (result.data || []).map(r => r.slug)

  assert(slugs(await search('northstar forklift', 'customer', NS_ORG)).includes('northstar-inspection-conventions'), 'tenant article visible to its tenant')
  assert(!slugs(await search('northstar forklift', 'customer', DEMO_ORG)).includes('northstar-inspection-conventions'), 'tenant article hidden from other tenants')
  ok('tenant-only article scoped to its tenant')
  assert(!slugs(await search('runbook triage err-upl-413', 'customer', NS_ORG)).includes('runbook-mobile-submission-failures'), 'internal runbook hidden from customers')
  assert(slugs(await search('runbook triage err-upl-413', 'staff', null)).includes('runbook-mobile-submission-failures'), 'internal runbook visible to staff')
  ok('forge-internal article only visible to staff')
  assert(!slugs(await search('osha privacy case', 'customer', NS_ORG)).includes('osha-300-privacy-cases'), 'drafts hidden from customers')
  assert(slugs(await search('osha privacy case', 'staff', null, true)).includes('osha-300-privacy-cases'), 'drafts visible to staff when requested')
  ok('draft articles hidden from customers')
}

async function incidents(cat) {
  console.log('Platform incidents')
  const component = await getOne('forge_support_platform_components', 'is_active=eq.true&order=sort_order.asc', 'id')
  const fields = {
    title: 'HD-DB regression incident ' + stamp(),
    public_message: 'Investigating elevated errors.',
    impact: 'minor',
    is_public: true,
    components: [{ component_id: component.id, status: 'degraded_performance' }],
    tenant_ids: [NS_ORG]
  }
  expectDenied(await rpc('forge_support_create_incident', { p_actor_user_id: AGENT, p_fields: fields }), /permission to declare/, 'support agent declare incident')
  expectDenied(await rpc('forge_support_create_incident', { p_actor_user_id: NS_ADMIN, p_fields: fields }), /permission to declare/, 'tenant admin declare incident')
  const inc = expectOk(await rpc('forge_support_create_incident', { p_actor_user_id: OWNER, p_fields: fields }), 'owner declare incident')
  assert(/^INC-\d{4}-\d{4}$/.test(inc.incident_number), 'incident number must be INC-YYYY-#### got ' + inc.incident_number)
  ok('incident declared with INC number')

  const linked = expectOk(await createTicket(cat), 'incident ticket')
  expectOk(
    await rpc('forge_support_link_incident_ticket', { p_incident_id: inc.incident_id, p_ticket_id: linked.ticket_id, p_actor_user_id: AGENT, p_link: true }),
    'link ticket to incident'
  )
  const row = await getOne('forge_support_platform_incidents', 'id=eq.' + inc.incident_id, 'row_version')
  expectDenied(
    await rpc('forge_support_post_incident_update', {
      p_incident_id: inc.incident_id, p_actor_user_id: OWNER, p_status: 'monitoring', p_message: 'Bulk resolve early',
      p_is_public: true, p_notify_customers: false, p_ticket_action: 'resolved', p_expected_row_version: row.row_version
    }),
    /only available when resolving/,
    'bulk ticket action before resolution'
  )
  const update = expectOk(
    await rpc('forge_support_post_incident_update', {
      p_incident_id: inc.incident_id, p_actor_user_id: OWNER, p_status: 'resolved', p_message: 'Fix deployed.',
      p_is_public: true, p_notify_customers: true, p_ticket_action: 'none', p_expected_row_version: row.row_version,
      p_resolution: { resolution: 'Rolled back the faulty release.' }
    }),
    'resolve incident'
  )
  const t = await ticket(linked.ticket_id)
  assert(!['resolved', 'closed'].includes(t.status), 'resolving an incident must never auto-close linked tickets, got ' + t.status)
  assert(update.customers_notified === 1, 'linked ticket requester must be notified')
  ok('incident resolution notifies but does not close linked tickets')
}

async function aiSuggestions(cat) {
  console.log('AI suggestions')
  const t = expectOk(await createTicket(cat), 'AI ticket')
  const inserted = await request('POST', '/rest/v1/forge_support_ai_suggestions', {
    organization_id: NS_ORG, ticket_id: t.ticket_id, suggestion_type: 'summarize', provider: 'regression',
    output: { text: 'Original' }, output_text: 'Original', generated_by: AGENT
  })
  assert(inserted.ok, 'suggestion insert failed ' + JSON.stringify(inserted.data))
  const s = first(inserted.data)
  expectDenied(await request('PATCH', '/rest/v1/forge_support_ai_suggestions?id=eq.' + s.id, { output_text: 'Rewritten' }), /immutable/, 'AI output rewrite')
  expectDenied(await rpc('forge_support_decide_ai_suggestion', { p_suggestion_id: s.id, p_actor_user_id: NS_ADMIN, p_decision: 'accepted' }), /Access denied/, 'tenant admin AI decision')

  // Read-only Forge staff hold helpdesk.support.view but must not decide reply drafts.
  const setAgentRole = role => request('PATCH', '/rest/v1/forge_platform_users?user_id=eq.' + AGENT, { platform_role: role })
  const demoted = await setAgentRole('forge_read_only')
  assert(demoted.ok && first(demoted.data), 'could not switch agent to forge_read_only ' + JSON.stringify(demoted.data))
  try {
    expectDenied(await rpc('forge_support_decide_ai_suggestion', { p_suggestion_id: s.id, p_actor_user_id: AGENT, p_decision: 'accepted' }), /Access denied/, 'read-only staff AI decision')
  } finally {
    const restored = await setAgentRole('forge_support')
    assert(restored.ok, 'could not restore agent role ' + JSON.stringify(restored.data))
  }

  expectOk(await rpc('forge_support_decide_ai_suggestion', { p_suggestion_id: s.id, p_actor_user_id: AGENT, p_decision: 'accepted', p_final_output: 'Edited' }), 'accept suggestion')
  expectDenied(await rpc('forge_support_decide_ai_suggestion', { p_suggestion_id: s.id, p_actor_user_id: AGENT, p_decision: 'rejected' }), /already accepted/, 'second AI decision')
  const decided = await getOne('forge_support_ai_suggestions', 'id=eq.' + s.id)
  assert(decided.final_output === 'Edited' && decided.output_text === 'Original', 'accepted output must keep the original and record the edit')
  ok('AI suggestion decision recorded once with original preserved')
}

async function directAccess() {
  console.log('Direct table access')
  if (!ANON) {
    console.log('  SKIP anon key not configured')
    return
  }
  for (const table of ['forge_support_tickets', 'forge_support_messages', 'forge_support_attachments', 'forge_support_knowledge_articles']) {
    const res = await request('GET', `/rest/v1/${table}?select=id&limit=1`, null, ANON)
    assert(!res.ok || (Array.isArray(res.data) && res.data.length === 0), table + ' must not be readable with the anon key')
  }
  ok('help desk tables are not readable with the anon key')
}

;(async () => {
  const cat = await catalog()
  await numbering(cat)
  await validation(cat)
  await isolationAndPermissions(cat)
  await lifecycle(cat)
  await triage(cat)
  await slaAtRisk(cat)
  await slaBreach(cat)
  await merge(cat)
  await knowledge()
  await incidents(cat)
  await aiSuggestions(cat)
  await directAccess()
  console.log(`\nFIS-HD-01 help desk DB regression: ${passed} checks passed.`)
})().catch(error => {
  console.error('\nFAIL ' + error.message)
  process.exit(1)
})

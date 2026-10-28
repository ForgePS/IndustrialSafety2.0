/**
 * PR #12 review fixes: database checks for completing content-only training and for closing a workers' comp
 * case atomically.
 * Run: node apps/web/tests/port-review-fixes-db.cjs
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-7)

async function request(pathname, options = {}) {
  const token = options.token || SERVICE_ROLE_KEY
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: { apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error((data && data.message) || String(response.status))
    error.code = data && data.code
    throw error
  }
  return data
}

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

async function expectFailure(promise, message, code) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected ${code}, got ${error.code}: ${error.message})`)
    console.log('  ok - ' + message)
    return
  }
  throw new Error('FAIL: ' + message + ' (unexpectedly succeeded)')
}

const rpc = (name, body, options = {}) => request('/rest/v1/rpc/' + name, { method: 'POST', body, token: options.token })

async function main() {
  console.log('PR #12 review fix DB checks')
  const [org] = await request('/rest/v1/organizations', { method: 'POST', body: { name: 'Review Fixes ' + RUN, slug: 'review-fixes-' + RUN, status: 'active', created_by: ADMIN } })
  const ORG = org.id

  try {
    const [person] = await request('/rest/v1/forge_personnel', {
      method: 'POST',
      body: { organization_id: ORG, first_name: 'Review', last_name: 'Learner', employment_status: 'active', created_by: ADMIN, updated_by: ADMIN }
    })

    // A content-only course: one required section, no questions, acknowledgement required.
    const course = async (title, { quiz }) => {
      const [row] = await request('/rest/v1/forge_training_courses', { method: 'POST', body: { organization_id: ORG, title, validity_months: 6, created_by: ADMIN, updated_by: ADMIN } })
      const [version] = await request('/rest/v1/forge_training_course_versions', {
        method: 'POST',
        body: { organization_id: ORG, course_id: row.id, version_number: 1, requires_acknowledgement: true, acknowledgement_text: 'I understand.', created_by: ADMIN }
      })
      const [section] = await request('/rest/v1/forge_training_sections', { method: 'POST', body: { organization_id: ORG, version_id: version.id, title: 'S', body: 'B', sort_order: 1, is_required: true } })
      if (quiz) await request('/rest/v1/forge_training_questions', { method: 'POST', body: { organization_id: ORG, version_id: version.id, stem: 'Q', choices: ['a', 'b'], correct_index: 0, sort_order: 1 } })
      await rpc('forge_publish_training_version', { p_organization_id: ORG, p_version_id: version.id, p_actor_user_id: ADMIN })
      const [assignment] = await request('/rest/v1/forge_training_assignments', { method: 'POST', body: { organization_id: ORG, course_id: row.id, personnel_id: person.id, status: 'assigned', assigned_by: ADMIN } })
      return { course: row, version, section, assignment }
    }

    const readOnly = await course('Read only ' + RUN, { quiz: false })
    const withQuiz = await course('With quiz ' + RUN, { quiz: true })
    const complete = (target, acknowledged, overrides = {}) =>
      rpc('forge_complete_training_without_quiz', { p_organization_id: ORG, p_assignment_id: target.assignment.id, p_channel: 'online', p_acknowledged: acknowledged, p_actor_user_id: ADMIN, ...overrides })

    await expectFailure(complete(readOnly, true), 'a course cannot be completed before its required sections', '23514')
    await request('/rest/v1/forge_training_progress', {
      method: 'POST',
      body: [readOnly, withQuiz].map(item => ({ assignment_id: item.assignment.id, organization_id: ORG, version_id: item.version.id, sections_completed: [item.section.id], content_completed_at: new Date().toISOString() }))
    })
    await expectFailure(complete(withQuiz, true), 'a course with a quiz cannot skip it', '23514')
    await expectFailure(complete(readOnly, false), 'the acknowledgement is required when the version asks for it', '23514')
    await expectFailure(complete(readOnly, true, { p_channel: 'paper' }), 'only online and kiosk completions', '22023')
    const completionId = await complete(readOnly, true)
    const [completion] = await request(`/rest/v1/forge_training_completions?id=eq.${completionId}&select=*`)
    assert(completion.result === 'completed' && completion.source === 'online' && completion.approval_status === 'approved' && /^CERT-/.test(completion.certificate_number) && completion.expires_at, 'the course completes with a certificate and expiry')
    const [progress] = await request(`/rest/v1/forge_training_progress?assignment_id=eq.${readOnly.assignment.id}&select=acknowledged_at,acknowledgement_text`)
    assert(progress.acknowledged_at && progress.acknowledgement_text === 'I understand.', 'the acknowledgement is recorded')
    await expectFailure(complete(readOnly, true), 'a finished course cannot be completed twice', '23514')

    // Closing a workers' comp case: version-checked, and the open period closes with it or not at all.
    const [wc] = await request('/rest/v1/forge_wc_cases', {
      method: 'POST',
      body: { organization_id: ORG, case_number: `WCR-${RUN}`, employee_name: 'Review Learner', injury_date: '2026-10-01', reported_date: '2026-10-01', stage: 'treatment', created_by: ADMIN, updated_by: ADMIN }
    })
    const [period] = await request('/rest/v1/forge_wc_work_status_periods', { method: 'POST', body: { organization_id: ORG, case_id: wc.id, work_status: 'off_work', start_date: '2026-10-01', created_by: ADMIN } })
    const [current] = await request(`/rest/v1/forge_wc_cases?id=eq.${wc.id}&select=row_version`)
    const close = version => rpc('forge_close_wc_case', { p_organization_id: ORG, p_case_id: wc.id, p_expected_version: version, p_today: '2026-10-20', p_actor_user_id: ADMIN })

    await expectFailure(close(current.row_version - 1), 'a stale copy cannot close the case', '40001')
    const [stillOpen] = await request(`/rest/v1/forge_wc_work_status_periods?id=eq.${period.id}&select=end_date`)
    assert(stillOpen.end_date === null, 'a refused close leaves the work-status period open')

    const closed = await close(current.row_version)
    const [ended] = await request(`/rest/v1/forge_wc_work_status_periods?id=eq.${period.id}&select=end_date`)
    assert(closed.status === 'closed' && closed.stage === 'closed' && closed.closed_by === ADMIN && ended.end_date === '2026-10-20', 'closing ends the period and closes the case together')
    await expectFailure(close(closed.row_version), 'a closed case cannot be closed again', '23514')

    const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
    })
    const { access_token: token } = await tokenResponse.json()
    await expectFailure(
      rpc('forge_complete_training_without_quiz', { p_organization_id: ORG, p_assignment_id: withQuiz.assignment.id, p_channel: 'online', p_acknowledged: true, p_actor_user_id: ADMIN }, { token }),
      'members cannot call the completion function'
    )
    await expectFailure(rpc('forge_close_wc_case', { p_organization_id: ORG, p_case_id: wc.id, p_expected_version: 1, p_today: '2026-10-20', p_actor_user_id: ADMIN }, { token }), 'members cannot call the close function')

    console.log('All PR #12 review fix DB checks passed.')
  } finally {
    await request(`/rest/v1/organizations?id=eq.${ORG}`, { method: 'DELETE' }).catch(() => {})
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})

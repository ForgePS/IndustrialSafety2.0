/**
 * Port slice 3 (Industrial 1.0 -> 2.0): training LMS database contract checks.
 * Run: node apps/web/tests/port-s3-training-lms-db.cjs
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
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-7)

async function request(pathname, options = {}) {
  const token = options.token || SERVICE_ROLE_KEY
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    const error = new Error(String((data && data.message) || response.status))
    error.code = data && data.code
    throw error
  }
  return data
}

const rpc = (fn, args, options = {}) => request('/rest/v1/rpc/' + fn, { ...options, method: 'POST', body: args })
const insert = async (table, body) => (await request('/rest/v1/' + table, { method: 'POST', body }))[0]
const patch = (table, filter, body) => request(`/rest/v1/${table}?${filter}`, { method: 'PATCH', body })
const remove = (table, filter) => request(`/rest/v1/${table}?${filter}`, { method: 'DELETE' })

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

async function expectFailure(promise, message, { code, pattern } = {}) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected ${code}, got ${error.code}: ${error.message})`)
    if (pattern && !pattern.test(error.message)) throw new Error(`FAIL: ${message} (unexpected message: ${error.message})`)
    console.log('  ok - ' + message)
    return error
  }
  throw new Error('FAIL: ' + message + ' (unexpectedly succeeded)')
}

const course = (title, validity = 12) =>
  insert('forge_training_courses', { organization_id: ORG, title: `${title} ${RUN}`, validity_months: validity, created_by: ADMIN, updated_by: ADMIN })

const person = name =>
  insert('forge_personnel', { organization_id: ORG, first_name: name, last_name: `Learner ${RUN}`, employment_status: 'active', created_by: ADMIN, updated_by: ADMIN })

const assign = (courseId, personnelId) =>
  insert('forge_training_assignments', { organization_id: ORG, course_id: courseId, personnel_id: personnelId, status: 'assigned', assigned_by: ADMIN })

const draftVersion = (courseId, extra = {}) =>
  insert('forge_training_course_versions', { organization_id: ORG, course_id: courseId, version_number: 1, created_by: ADMIN, updated_by: ADMIN, ...extra })

const question = (versionId, stem, correct = 1, choices = ['Wrong A', 'Right', 'Wrong B']) =>
  insert('forge_training_questions', { organization_id: ORG, version_id: versionId, stem, choices, correct_index: correct })

const correctAnswers = async questionIds => {
  const rows = await request(`/rest/v1/forge_training_questions?id=in.(${questionIds.join(',')})&select=id,correct_index`)
  const byId = new Map(rows.map(row => [row.id, row.correct_index]))
  return questionIds.map(id => byId.get(id))
}

async function main() {
  console.log('Port slice 3: training LMS DB checks')
  const created = { courses: [], people: [], orgs: [], links: [] }

  try {
    const lockout = await course('Lockout Basics')
    created.courses.push(lockout.id)
    const learner = await person('Alex')
    created.people.push(learner.id)

    console.log('Versions, content and publishing')
    const v1 = await draftVersion(lockout.id)
    assert(v1.status === 'draft' && v1.passing_percent === 70, 'new versions start as drafts with a 70% pass mark (1.0 default)')
    await expectFailure(question(v1.id, 'Bad', 3), 'the correct answer must be one of the choices', { code: '23514' })
    await expectFailure(question(v1.id, 'Bad', 0, ['Only one']), 'questions need 2 to 6 choices', { code: '23514' })
    await expectFailure(question(v1.id, 'Bad', 0, ['A', '']), 'choices cannot be blank', { code: '23514' })

    await expectFailure(rpc('forge_publish_training_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: ADMIN }), 'an empty version cannot be published', { code: '23514' })

    const section = await insert('forge_training_sections', { organization_id: ORG, version_id: v1.id, title: 'Energy sources', body: 'Identify every energy source.', sort_order: 1 })
    for (const stem of ['Q1', 'Q2', 'Q3']) await question(v1.id, stem)
    await patch('forge_training_course_versions', `id=eq.${v1.id}`, { quiz_question_count: 4 })
    await expectFailure(
      rpc('forge_publish_training_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: ADMIN }),
      'a quiz cannot draw more questions than the bank holds',
      { code: '23514' }
    )
    await patch('forge_training_course_versions', `id=eq.${v1.id}`, { quiz_question_count: 3 })

    const published = await rpc('forge_publish_training_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: ADMIN })
    assert(published.status === 'published' && published.published_by === ADMIN, 'publishing records who published')

    await expectFailure(patch('forge_training_course_versions', `id=eq.${v1.id}`, { passing_percent: 50 }), 'published versions are frozen', { code: '23514' })
    await expectFailure(patch('forge_training_sections', `id=eq.${section.id}`, { body: 'Changed' }), 'published sections are frozen', { code: '23514' })
    await expectFailure(question(v1.id, 'Late question'), 'questions cannot be added to a published version', { code: '23514' })
    await expectFailure(remove('forge_training_course_versions', `id=eq.${v1.id}`), 'published versions cannot be deleted', { code: '23514' })

    const v2 = await rpc('forge_clone_training_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: ADMIN })
    const v2Questions = await request(`/rest/v1/forge_training_questions?version_id=eq.${v2.id}&select=id`)
    const v2Sections = await request(`/rest/v1/forge_training_sections?version_id=eq.${v2.id}&select=id`)
    assert(v2.version_number === 2 && v2.status === 'draft' && v2Questions.length === 3 && v2Sections.length === 1, 'cloning makes draft v2 with copies of the sections and questions')
    await expectFailure(rpc('forge_clone_training_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: ADMIN }), 'only one draft per course', { code: '23505' })
    await remove('forge_training_course_versions', `id=eq.${v2.id}`)
    const gone = await request(`/rest/v1/forge_training_questions?version_id=eq.${v2.id}&select=id`)
    assert(gone.length === 0, 'a draft version can be discarded with its content')

    console.log('Attempts and grading')
    const assignment = await assign(lockout.id, learner.id)
    await expectFailure(
      rpc('forge_start_training_attempt', { p_organization_id: ORG, p_assignment_id: assignment.id, p_channel: 'online', p_actor_user_id: ADMIN }),
      'the quiz stays locked until required sections are finished',
      { code: '23514', pattern: /required sections/ }
    )

    await insert('forge_training_progress', { assignment_id: assignment.id, organization_id: ORG, version_id: v1.id, sections_completed: [section.id], content_completed_at: new Date().toISOString() })
    const attempt = await rpc('forge_start_training_attempt', { p_organization_id: ORG, p_assignment_id: assignment.id, p_channel: 'online', p_actor_user_id: ADMIN })
    assert(attempt.question_ids.length === 3 && attempt.attempt_number === 1 && attempt.status === 'in_progress', 'starting draws the quiz questions')
    const again = await rpc('forge_start_training_attempt', { p_organization_id: ORG, p_assignment_id: assignment.id, p_channel: 'online', p_actor_user_id: ADMIN })
    assert(again.id === attempt.id, 'starting again resumes the open attempt')
    const [inProgress] = await request(`/rest/v1/forge_training_assignments?id=eq.${assignment.id}&select=status`)
    assert(inProgress.status === 'in_progress', 'the assignment moves to in progress')

    await expectFailure(
      rpc('forge_submit_training_attempt', { p_organization_id: ORG, p_attempt_id: attempt.id, p_answers: [1, 1], p_acknowledged: false, p_actor_user_id: ADMIN }),
      'every question must be answered',
      { code: '22023' }
    )
    await expectFailure(
      rpc('forge_submit_training_attempt', { p_organization_id: ORG, p_attempt_id: attempt.id, p_answers: [1, 1, 9], p_acknowledged: false, p_actor_user_id: ADMIN }),
      'answers must be one of the choices',
      { code: '22023' }
    )

    const answers = await correctAnswers(attempt.question_ids)
    const graded = await rpc('forge_submit_training_attempt', { p_organization_id: ORG, p_attempt_id: attempt.id, p_answers: answers, p_acknowledged: false, p_actor_user_id: ADMIN })
    assert(graded.status === 'submitted' && graded.score_percent === 100 && graded.passed === true && graded.completion_id, 'a passing submission is graded in the database')

    const [completion] = await request(`/rest/v1/forge_training_completions?id=eq.${graded.completion_id}`)
    const expected = new Date()
    expected.setMonth(expected.getMonth() + 12)
    assert(completion.result === 'passed' && completion.approval_status === 'approved' && completion.source === 'online', 'passing records an approved completion')
    assert(/^CERT-\d{4}-\d{5}$/.test(completion.certificate_number), 'the completion gets a certificate number')
    assert(completion.expires_at.slice(0, 7) === expected.toISOString().slice(0, 7), 'expiry follows the course validity (12 months)')
    const [done] = await request(`/rest/v1/forge_training_assignments?id=eq.${assignment.id}&select=status`)
    assert(done.status === 'completed', 'passing completes the assignment')
    await expectFailure(
      rpc('forge_submit_training_attempt', { p_organization_id: ORG, p_attempt_id: attempt.id, p_answers: answers, p_acknowledged: false, p_actor_user_id: ADMIN }),
      'an attempt cannot be submitted twice',
      { code: '23514' }
    )
    await expectFailure(
      rpc('forge_start_training_attempt', { p_organization_id: ORG, p_assignment_id: assignment.id, p_channel: 'online', p_actor_user_id: ADMIN }),
      'completed training cannot be restarted',
      { code: '23514' }
    )

    console.log('Attempt limits and acknowledgement')
    const forklift = await course('Forklift Rules')
    created.courses.push(forklift.id)
    const fv = await draftVersion(forklift.id, { max_attempts: 1, requires_acknowledgement: true, acknowledgement_text: 'I will follow the forklift rules.' })
    await question(fv.id, 'F1')
    await question(fv.id, 'F2')
    await rpc('forge_publish_training_version', { p_organization_id: ORG, p_version_id: fv.id, p_actor_user_id: ADMIN })
    const forkliftAssignment = await assign(forklift.id, learner.id)
    const fa = await rpc('forge_start_training_attempt', { p_organization_id: ORG, p_assignment_id: forkliftAssignment.id, p_channel: 'kiosk', p_actor_user_id: null })
    assert(fa.channel === 'kiosk', 'kiosk attempts need no section progress when there are no sections')
    const wrong = (await correctAnswers(fa.question_ids)).map(index => (index + 1) % 3)
    await expectFailure(
      rpc('forge_submit_training_attempt', { p_organization_id: ORG, p_attempt_id: fa.id, p_answers: wrong, p_acknowledged: false, p_actor_user_id: null }),
      'the acknowledgement must be confirmed',
      { code: '22023', pattern: /acknowledgement/ }
    )
    const failed = await rpc('forge_submit_training_attempt', { p_organization_id: ORG, p_attempt_id: fa.id, p_answers: wrong, p_acknowledged: true, p_actor_user_id: null })
    assert(failed.passed === false && failed.score_percent === 0 && !failed.completion_id, 'a failing submission records no completion')
    assert(failed.acknowledgement_text === 'I will follow the forklift rules.' && failed.acknowledged_at, 'the acknowledgement text is captured on the attempt')
    await expectFailure(
      rpc('forge_start_training_attempt', { p_organization_id: ORG, p_assignment_id: forkliftAssignment.id, p_channel: 'online', p_actor_user_id: ADMIN }),
      'the attempt limit is enforced',
      { code: '23514', pattern: /No quiz attempts remain/ }
    )

    console.log('Paper quiz results')
    const paperFail = await rpc('forge_record_paper_training_result', { p_organization_id: ORG, p_assignment_id: forkliftAssignment.id, p_percent: 50, p_completed_on: new Date().toISOString().slice(0, 10), p_actor_user_id: ADMIN })
    assert(paperFail.channel === 'paper' && paperFail.passed === false && paperFail.attempt_number === 2, 'a failing paper result is recorded as an attempt')
    const paperPass = await rpc('forge_record_paper_training_result', { p_organization_id: ORG, p_assignment_id: forkliftAssignment.id, p_percent: 85, p_completed_on: '2026-01-15', p_actor_user_id: ADMIN })
    const [paperCompletion] = await request(`/rest/v1/forge_training_completions?id=eq.${paperPass.completion_id}`)
    assert(paperPass.passed && paperCompletion.source === 'paper' && paperCompletion.completed_at.startsWith('2026-01-15'), 'a passing paper result completes with the quiz date')
    assert(paperCompletion.expires_at === '2027-01-15', 'paper completions expire from the quiz date')
    await expectFailure(
      rpc('forge_record_paper_training_result', { p_organization_id: ORG, p_assignment_id: forkliftAssignment.id, p_percent: 90, p_completed_on: '2026-01-15', p_actor_user_id: ADMIN }),
      'a completed assignment takes no more paper results',
      { code: '23514' }
    )
    const third = await assign(forklift.id, learner.id)
    await expectFailure(
      rpc('forge_record_paper_training_result', { p_organization_id: ORG, p_assignment_id: third.id, p_percent: 101, p_completed_on: '2026-01-15', p_actor_user_id: ADMIN }),
      'paper percentages are 0-100',
      { code: '22023' }
    )
    await expectFailure(
      rpc('forge_record_paper_training_result', { p_organization_id: ORG, p_assignment_id: third.id, p_percent: 90, p_completed_on: '2999-01-01', p_actor_user_id: ADMIN }),
      'paper quiz dates cannot be in the future',
      { code: '22023' }
    )

    console.log('Kiosk rate limiting')
    const link = await insert('forge_training_portal_links', { organization_id: ORG, title: 'Break room ' + RUN, token_hash: 'test-hash-' + RUN })
    created.links.push(link.id)
    let blockedUntil = null
    for (let i = 1; i <= 7; i += 1) blockedUntil = await rpc('forge_training_portal_register_failure', { p_link_id: link.id, p_bucket_key: 'ip:1.2.3.4' })
    assert(blockedUntil === null, 'seven failures do not block (1.0 limit is eight)')
    blockedUntil = await rpc('forge_training_portal_register_failure', { p_link_id: link.id, p_bucket_key: 'ip:1.2.3.4' })
    const minutes = (Date.parse(blockedUntil) - Date.now()) / 60000
    assert(minutes > 14 && minutes <= 15.1, 'the eighth failure blocks for 15 minutes')

    console.log('Tenant guards')
    const org = await insert('organizations', { name: 'Training Isolation ' + RUN, slug: 'training-isolation-' + RUN, status: 'active', created_by: ADMIN })
    created.orgs.push(org.id)
    const group = await insert('forge_training_groups', { organization_id: ORG, name: 'Mill crew ' + RUN })
    await expectFailure(insert('forge_training_group_members', { group_id: group.id, personnel_id: learner.id, organization_id: org.id }), 'group members cannot be filed under another organization', { code: '23503' })
    await expectFailure(
      insert('forge_training_course_versions', { organization_id: org.id, course_id: lockout.id, version_number: 9 }),
      'versions cannot use another organization\'s course',
      { code: '23503' }
    )
    await insert('forge_training_group_members', { group_id: group.id, personnel_id: learner.id, organization_id: ORG })
    await insert('forge_training_group_requirements', { group_id: group.id, course_id: lockout.id, organization_id: ORG })
    await remove('forge_training_groups', `id=eq.${group.id}`)

    console.log('Direct access as an authenticated member (demo employee)')
    const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
    })
    const { access_token: token } = await tokenResponse.json()
    for (const table of ['forge_training_questions', 'forge_training_attempts', 'forge_training_portal_links', 'forge_training_portal_sessions', 'forge_training_course_versions']) {
      await expectFailure(request(`/rest/v1/${table}?select=*`, { token }), `members cannot read ${table}`)
    }
    await expectFailure(
      rpc('forge_submit_training_attempt', { p_organization_id: ORG, p_attempt_id: attempt.id, p_answers: answers, p_acknowledged: false, p_actor_user_id: ADMIN }, { token }),
      'members cannot call the grading function'
    )
    await expectFailure(
      rpc('forge_record_paper_training_result', { p_organization_id: ORG, p_assignment_id: third.id, p_percent: 100, p_completed_on: '2026-01-15', p_actor_user_id: ADMIN }, { token }),
      'members cannot record paper results'
    )

    console.log('All port slice 3 training LMS DB checks passed.')
  } finally {
    for (const id of created.links) await remove('forge_training_portal_links', `id=eq.${id}`).catch(() => {})
    for (const id of created.courses) await remove('forge_training_courses', `id=eq.${id}`).catch(() => {})
    for (const id of created.people) await remove('forge_personnel', `id=eq.${id}`).catch(() => {})
    for (const id of created.orgs) await remove('organizations', `id=eq.${id}`).catch(() => {})
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})

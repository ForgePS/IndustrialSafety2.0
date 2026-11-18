/**
 * NX-02H JSA atomic version lifecycle + execution crew/ack/stop-work
 * Run: node apps/web/tests/nx02h-jsa-atomic-db.cjs
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
const ORG_A = '20000000-0000-4000-8000-000000000100'
const USER_A = '20000000-0000-4000-8000-000000000002'
const PERSON_A = '20000000-0000-4000-8000-000000000600'

if (!API_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase URL or service role key.')
  process.exit(1)
}

async function request(pathname, options = {}) {
  const response = await fetch(API_URL + pathname, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
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
    const error = new Error(
      String((data && (data.message || data.error || data.hint)) || response.status + ' ' + text)
    )
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

async function rpc(fn, args) {
  return request('/rest/v1/rpc/' + fn, { method: 'POST', body: args })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function createDraftJsa(title) {
  const number = await rpc('next_forge_jsa_number', { p_organization_id: ORG_A })
  const matrices = await request(
    '/rest/v1/forge_risk_matrices?organization_id=is.null&matrix_key=eq.forge.core.5x5&is_active=eq.true&select=id,version&order=version.desc&limit=1'
  )
  const rows = await request('/rest/v1/forge_jsas', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_number: number,
      title,
      description: 'NX-02H fixture',
      status: 'draft',
      version: 1,
      risk_matrix_id: matrices?.[0]?.id || null,
      risk_matrix_version: matrices?.[0]?.version || null,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(rows?.[0]?.id, 'JSA create failed')
  return rows[0]
}

async function loadJsa(id) {
  const rows = await request(
    '/rest/v1/forge_jsas?id=eq.' + id + '&select=id,status,row_version,parent_jsa_id,active_version_id,version'
  )
  return rows[0]
}

async function seedApprovableContent(jsaId) {
  const steps = await request('/rest/v1/forge_jsa_steps', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_id: jsaId,
      step_number: 1,
      title: 'Step 1',
      sort_order: 10,
      created_by: USER_A
    }
  })
  const stepId = steps[0].id

  const hazards = await request('/rest/v1/forge_jsa_hazards', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_id: jsaId,
      step_id: stepId,
      hazard_description: 'Slip hazard',
      likelihood_key: 'likely',
      severity_key: 'major',
      risk_score: 16,
      risk_band_key: 'high',
      residual_likelihood_key: 'unlikely',
      residual_severity_key: 'minor',
      residual_score: 4,
      residual_band_key: 'low',
      sort_order: 10,
      created_by: USER_A
    }
  })

  await request('/rest/v1/forge_jsa_controls', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_id: jsaId,
      hazard_id: hazards[0].id,
      control_type: 'administrative',
      title: 'Housekeeping',
      sort_order: 10,
      created_by: USER_A
    }
  })
}

async function transition(jsaId, from, to, key, opts = {}) {
  return rpc('forge_perform_jsa_version_transition', {
    p_organization_id: ORG_A,
    p_jsa_id: jsaId,
    p_expected_status: from,
    p_to_status: to,
    p_transition_key: key,
    p_actor_user_id: USER_A,
    p_comment: opts.comment || null,
    p_jsa_patch: {},
    p_metadata: { source: 'nx02h_test' },
    p_idempotency_key: opts.idem || 'jsa-' + key + '-' + jsaId + '-' + Date.now(),
    p_expected_row_version: opts.rowVersion ?? null,
    p_fail_after_domain_update: Boolean(opts.failAfterDomain)
  })
}

async function activate(jsaId, opts = {}) {
  return rpc('forge_activate_jsa_revision', {
    p_organization_id: ORG_A,
    p_jsa_id: jsaId,
    p_actor_user_id: USER_A,
    p_comment: opts.comment || null,
    p_metadata: { source: 'nx02h_test' },
    p_idempotency_key: opts.idem || 'jsa-activate-' + jsaId + '-' + Date.now(),
    p_expected_row_version: opts.rowVersion ?? null,
    p_fail_after_supersede: Boolean(opts.failAfterSupersede)
  })
}

async function main() {
  console.log('NX-02H JSA atomic lifecycle checks...')

  const syncSrc = fs.readFileSync(
    path.join(__dirname, '../src/lib/forgeJsaWorkflowSync.ts'),
    'utf8'
  )
  assert(
    syncSrc.includes("rpc('forge_perform_jsa_version_transition'") ||
      syncSrc.includes('rpc("forge_perform_jsa_version_transition"') ||
      syncSrc.includes("rpc('forge_perform_jsa_version_transition'"),
    'forgeJsaWorkflowSync must call forge_perform_jsa_version_transition'
  )
  assert(
    syncSrc.includes('forge_activate_jsa_revision'),
    'forgeJsaWorkflowSync must call forge_activate_jsa_revision'
  )
  assert(!syncSrc.includes('.from(') || syncSrc.includes("rpc('"), 'sync should prefer RPCs')

  const actionsSrc = fs.readFileSync(
    path.join(__dirname, '../src/app/(back)/jsas/actions.ts'),
    'utf8'
  )
  assert(
    !/status:\s*cleanText\(values\.status\)\s*\|\|\s*scoped\.existing\.status/.test(actionsSrc),
    'updateJsaAction must not write status from form values'
  )
  assert(actionsSrc.includes('createRiskFromJsa'), 'createRiskFromJsa action required')
  assert(actionsSrc.includes('createAssetLinkFromJsa'), 'createAssetLinkFromJsa action required')
  assert(actionsSrc.includes('createAcknowledgement'), 'ack must use createAcknowledgement')

  // --- Approve empty JSA fails ---
  console.log('  approve empty JSA fails')
  const empty = await createDraftJsa('NX-02H empty approve')
  const submitEmpty = await transition(empty.id, 'draft', 'in_review', 'submit', {
    rowVersion: empty.row_version
  })
  assert(submitEmpty?.ok === true, 'Empty JSA can still submit to review')
  const emptyAfterSubmit = await loadJsa(empty.id)
  const approveEmpty = await transition(empty.id, 'in_review', 'approved', 'approve', {
    rowVersion: emptyAfterSubmit.row_version,
    comment: 'attempt'
  })
  assert(approveEmpty?.ok === false, 'Approve empty must fail')
  assert(
    String(approveEmpty?.error || '').toLowerCase().includes('step') ||
      String(approveEmpty?.error || '').toLowerCase().includes('hazard'),
    'Approve empty should mention step/hazard gate'
  )

  // --- Happy path approve + activate atomic + only one active ---
  console.log('  activate atomic + only one active')
  const v1 = await createDraftJsa('NX-02H activate v1')
  await seedApprovableContent(v1.id)
  let cur = await loadJsa(v1.id)
  assert((await transition(v1.id, 'draft', 'in_review', 'submit', { rowVersion: cur.row_version }))?.ok)
  cur = await loadJsa(v1.id)
  assert(
    (await transition(v1.id, 'in_review', 'approved', 'approve', {
      rowVersion: cur.row_version,
      comment: 'ok'
    }))?.ok
  )
  cur = await loadJsa(v1.id)
  const act1 = await activate(v1.id, { rowVersion: cur.row_version })
  assert(act1?.ok === true, 'First activate failed: ' + JSON.stringify(act1))
  cur = await loadJsa(v1.id)
  assert(cur.status === 'active', 'v1 must be active')

  // Create revision as approved candidate
  const revNumber = await rpc('next_forge_jsa_number', { p_organization_id: ORG_A })
  const revRows = await request('/rest/v1/forge_jsas', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_number: revNumber,
      title: 'NX-02H activate v2',
      status: 'draft',
      version: 2,
      parent_jsa_id: v1.id,
      risk_matrix_id: (await loadJsa(v1.id)) && (await request('/rest/v1/forge_jsas?id=eq.' + v1.id + '&select=risk_matrix_id'))[0].risk_matrix_id,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  const v2 = revRows[0]
  await seedApprovableContent(v2.id)
  cur = await loadJsa(v2.id)
  assert((await transition(v2.id, 'draft', 'in_review', 'submit', { rowVersion: cur.row_version }))?.ok)
  cur = await loadJsa(v2.id)
  assert(
    (await transition(v2.id, 'in_review', 'approved', 'approve', {
      rowVersion: cur.row_version,
      comment: 'ok'
    }))?.ok
  )
  cur = await loadJsa(v2.id)
  const act2 = await activate(v2.id, { rowVersion: cur.row_version })
  assert(act2?.ok === true, 'Second activate failed: ' + JSON.stringify(act2))

  const afterV1 = await loadJsa(v1.id)
  const afterV2 = await loadJsa(v2.id)
  assert(afterV1.status === 'superseded', 'Prior active must be superseded')
  assert(afterV2.status === 'active', 'New revision must be active')

  const actives = await request(
    '/rest/v1/forge_jsas?organization_id=eq.' +
      ORG_A +
      '&status=eq.active&or=(id.eq.' +
      v1.id +
      ',id.eq.' +
      v2.id +
      ',parent_jsa_id.eq.' +
      v1.id +
      ')&select=id,status'
  )
  assert((actives || []).length === 1 && actives[0].id === v2.id, 'Only one active in lineage')

  // --- fail_after_supersede rolls back ---
  console.log('  fail_after_supersede rolls back')
  const r1 = await createDraftJsa('NX-02H rollback root')
  await seedApprovableContent(r1.id)
  cur = await loadJsa(r1.id)
  await transition(r1.id, 'draft', 'in_review', 'submit', { rowVersion: cur.row_version })
  cur = await loadJsa(r1.id)
  await transition(r1.id, 'in_review', 'approved', 'approve', {
    rowVersion: cur.row_version,
    comment: 'ok'
  })
  cur = await loadJsa(r1.id)
  await activate(r1.id, { rowVersion: cur.row_version })

  const r2Number = await rpc('next_forge_jsa_number', { p_organization_id: ORG_A })
  const r2Rows = await request('/rest/v1/forge_jsas', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_number: r2Number,
      title: 'NX-02H rollback candidate',
      status: 'draft',
      version: 2,
      parent_jsa_id: r1.id,
      risk_matrix_id: (await request('/rest/v1/forge_jsas?id=eq.' + r1.id + '&select=risk_matrix_id'))[0]
        .risk_matrix_id,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  const r2 = r2Rows[0]
  await seedApprovableContent(r2.id)
  cur = await loadJsa(r2.id)
  await transition(r2.id, 'draft', 'in_review', 'submit', { rowVersion: cur.row_version })
  cur = await loadJsa(r2.id)
  await transition(r2.id, 'in_review', 'approved', 'approve', {
    rowVersion: cur.row_version,
    comment: 'ok'
  })
  cur = await loadJsa(r2.id)

  let rolledBack = false
  try {
    await activate(r2.id, { rowVersion: cur.row_version, failAfterSupersede: true })
  } catch {
    rolledBack = true
  }
  assert(rolledBack, 'fail_after_supersede must raise')
  const r1After = await loadJsa(r1.id)
  const r2After = await loadJsa(r2.id)
  assert(r1After.status === 'active', 'Prior active must remain active after rollback')
  assert(r2After.status === 'approved', 'Candidate must remain approved after rollback')

  // --- non-draft content mutation rejected ---
  console.log('  non-draft content mutation rejected')
  let blocked = false
  try {
    await request('/rest/v1/forge_jsa_steps', {
      method: 'POST',
      body: {
        organization_id: ORG_A,
        jsa_id: r1.id,
        step_number: 99,
        title: 'Should fail',
        sort_order: 99,
        created_by: USER_A
      }
    })
  } catch {
    blocked = true
  }
  assert(blocked, 'Non-draft step insert must be rejected')

  // --- execution activate blocked without acks; allowed with acks; stop work ---
  console.log('  execution activate ack gate + stop work')
  const execNumber = await rpc('next_forge_jsa_execution_number', { p_organization_id: ORG_A })
  const execRows = await request('/rest/v1/forge_jsa_executions', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_id: r1.id,
      execution_number: execNumber,
      status: 'planned',
      created_by: USER_A
    }
  })
  const execution = execRows[0]

  // Resolve a personnel record for ORG_A
  let personnel = await request(
    '/rest/v1/forge_personnel?organization_id=eq.' + ORG_A + '&select=id,auth_user_id&limit=1'
  )
  if (!personnel?.[0]?.id) {
    personnel = [
      {
        id: PERSON_A,
        auth_user_id: USER_A
      }
    ]
    // best-effort; if PERSON_A missing the insert below will fail loudly
  }
  const personId = personnel[0].id
  const personUserId = personnel[0].auth_user_id || USER_A

  await request('/rest/v1/forge_jsa_execution_participants', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      execution_id: execution.id,
      personnel_id: personId,
      user_id: personUserId,
      role: 'crew',
      requires_acknowledgement: true
    }
  })

  const toBriefing = await rpc('forge_perform_jsa_execution_transition', {
    p_organization_id: ORG_A,
    p_execution_id: execution.id,
    p_expected_status: 'planned',
    p_to_status: 'briefing',
    p_actor_user_id: USER_A,
    p_comment: null,
    p_patch: {},
    p_metadata: {},
    p_idempotency_key: 'exec-brief-' + execution.id,
    p_expected_row_version: 1,
    p_fail_after_domain_update: false
  })
  assert(toBriefing?.ok === true, 'planned→briefing failed')

  const blockedActivate = await rpc('forge_perform_jsa_execution_transition', {
    p_organization_id: ORG_A,
    p_execution_id: execution.id,
    p_expected_status: 'briefing',
    p_to_status: 'active',
    p_actor_user_id: USER_A,
    p_comment: null,
    p_patch: {},
    p_metadata: {},
    p_idempotency_key: 'exec-act-block-' + execution.id,
    p_expected_row_version: toBriefing.row_version,
    p_fail_after_domain_update: false
  })
  assert(blockedActivate?.ok === false, 'Activate without acks must fail')
  assert(
    String(blockedActivate?.error || '')
      .toLowerCase()
      .includes('acknowledge'),
    'Missing ack error expected'
  )

  const acks = await request('/rest/v1/forge_record_acknowledgements', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      resource_type: 'jsa',
      resource_id: r1.id,
      resource_version: execution.id,
      acknowledgement_type: 'execution_briefing',
      user_id: personUserId,
      signature_method: 'click_confirm'
    }
  })
  await request(
    '/rest/v1/forge_jsa_execution_participants?execution_id=eq.' +
      execution.id +
      '&personnel_id=eq.' +
      personId,
    {
      method: 'PATCH',
      body: {
        acknowledged_at: new Date().toISOString(),
        acknowledgment_id: acks[0].id
      }
    }
  )

  const allowedActivate = await rpc('forge_perform_jsa_execution_transition', {
    p_organization_id: ORG_A,
    p_execution_id: execution.id,
    p_expected_status: 'briefing',
    p_to_status: 'active',
    p_actor_user_id: USER_A,
    p_comment: null,
    p_patch: {},
    p_metadata: {},
    p_idempotency_key: 'exec-act-ok-' + execution.id,
    p_expected_row_version: toBriefing.row_version,
    p_fail_after_domain_update: false
  })
  assert(allowedActivate?.ok === true, 'Activate with acks must succeed: ' + JSON.stringify(allowedActivate))

  const stopped = await rpc('forge_perform_jsa_execution_transition', {
    p_organization_id: ORG_A,
    p_execution_id: execution.id,
    p_expected_status: 'active',
    p_to_status: 'stopped',
    p_actor_user_id: USER_A,
    p_comment: 'Unsafe condition',
    p_patch: { stop_reason: 'Unsafe condition', stop_requires_revision: true },
    p_metadata: {},
    p_idempotency_key: 'exec-stop-' + execution.id,
    p_expected_row_version: allowedActivate.row_version,
    p_fail_after_domain_update: false
  })
  assert(stopped?.ok === true, 'Stop work failed: ' + JSON.stringify(stopped))

  const execAfter = (
    await request(
      '/rest/v1/forge_jsa_executions?id=eq.' +
        execution.id +
        '&select=status,stop_reason,stopped_at,stop_requires_revision'
    )
  )[0]
  assert(execAfter.status === 'stopped', 'Execution must be stopped')
  assert(execAfter.stop_reason === 'Unsafe condition', 'Stop reason must persist')
  assert(Boolean(execAfter.stopped_at), 'stopped_at must be set')
  assert(execAfter.stop_requires_revision === true, 'stop_requires_revision must be true')

  console.log('NX-02H JSA atomic lifecycle checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

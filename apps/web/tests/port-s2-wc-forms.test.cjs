/**
 * Unit tests for workers' comp case forms: field rules, printed values, layout overrides, email parsing, and the
 * PDF overlay (on a synthetic template generated here; no company forms are used in tests).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s2-wc-forms.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { deflateSync } = require('zlib')
const { PDFDocument, StandardFonts } = require('pdf-lib')

const rules = require(path.join(__dirname, '../src/lib/forgeWcFormsRules.ts'))
const pdf = require(path.join(__dirname, '../src/lib/forgeWcFormsPdf.ts'))

// A small transparent PNG with a horizontal pen stroke, standing in for a drawn signature.
const signaturePng = () => {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = buf => {
    let c = 0xffffffff
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const w = 200
  const h = 50
  const pixels = Buffer.alloc((w * 4 + 1) * h)
  for (let x = 10; x < 190; x++) {
    const o = 25 * (w * 4 + 1) + 1 + x * 4
    pixels[o + 2] = 120
    pixels[o + 3] = 255
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(w, 0)
  header.writeUInt32BE(h, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
}

const syntheticTemplate = async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([612, 792])
  const font = await document.embedFont(StandardFonts.Helvetica)
  page.drawText('Sample Company - HIPAA Authorization (synthetic test form)', { x: 72, y: 720, size: 12, font })
  return document.save()
}

test('fields are cleaned, unknown keys dropped and required fields enforced only when signing', () => {
  const draft = rules.cleanWcFormFields('hipaa_authorization', { patient_name: '  Pat   Lee ', provider_name: 'Clinic', bogus: 'x' })
  assert.deepEqual(draft.values, { patient_name: 'Pat Lee', provider_name: 'Clinic' })
  assert.deepEqual(draft.errors, [])

  const signing = rules.cleanWcFormFields('hipaa_authorization', { patient_name: 'Pat Lee' }, { forSigning: true })
  assert.ok(signing.errors.some(message => /Date of birth is required/.test(message)))
  assert.ok(signing.errors.some(message => /Provider authorized to disclose is required/.test(message)))

  assert.match(rules.cleanWcFormFields('hipaa_authorization', { date_of_birth: '04/12/1980' }).errors[0], /must be a date/)
  assert.match(rules.cleanWcFormFields('hipaa_authorization', { initial_mail_fax: '12' }).errors[0], /letters only/)
  assert.match(rules.cleanWcFormFields('injury_guidelines_ack', { employee_name: 'x'.repeat(121) }).errors[0], /too long/)
})

test('printed values use paper-style dates and the signer line', () => {
  const values = rules.printedValues(
    'hipaa_authorization',
    { patient_name: 'Pat Lee', date_of_birth: '1980-04-12', initial_mail_fax: 'PL' },
    { name: 'Sam Lee', relationship: 'Parent', signedDate: '2026-10-23' }
  )
  assert.deepEqual(values, { patient_name: 'Pat Lee', date_of_birth: '04/12/1980', initial_mail_fax: 'PL', signer_line: 'Sam Lee (Parent)', signed_date: '10/23/2026' })

  const ack = rules.printedValues('injury_guidelines_ack', { employee_name: 'Draft Name' }, { name: 'Pat Lee', relationship: null, signedDate: '2026-10-23' })
  assert.equal(ack.employee_name, 'Pat Lee')
  assert.equal(ack.signer_line, 'Pat Lee')

  // Drafts have no signer yet: nothing is drawn for the signature lines.
  const draft = rules.printedValues('hipaa_authorization', { patient_name: 'Pat Lee' }, { name: null, relationship: 'Self', signedDate: null })
  assert.equal(draft.signer_line, undefined)
  assert.equal(draft.signed_date, undefined)
})

test('template layout overrides accept only sane positions', () => {
  const layout = rules.layoutFor('hipaa_authorization', { patient_name: { x: 0.3, y: 2, size: 40 }, signature: { top: 0.5 } })
  const name = layout.find(item => item.kind === 'text' && item.key === 'patient_name')
  const signature = layout.find(item => item.kind === 'signature')
  assert.equal(name.x, 0.3)
  assert.equal(name.y, rules.WC_FORM_DEFINITIONS.hipaa_authorization.layout.find(item => item.key === 'patient_name').y, 'out-of-range y is ignored')
  assert.equal(name.size, 11, 'out-of-range font size is ignored')
  assert.equal(signature.top, 0.5)
  assert.deepEqual(rules.layoutFor('hipaa_authorization', 'nonsense'), rules.WC_FORM_DEFINITIONS.hipaa_authorization.layout)
})

test('outside email addresses are validated and de-duplicated', () => {
  assert.deepEqual(rules.parseOutsideEmails('Adjuster@Example.com; hr@example.com\nadjuster@example.com bad@ nope'), {
    valid: ['adjuster@example.com', 'hr@example.com'],
    invalid: ['bad@', 'nope']
  })
  assert.equal(rules.wcFormFileName('WC-2026-0001', 'hipaa_authorization'), 'WC-2026-0001 HIPAA Authorization.pdf')
})

test('the filled PDF keeps the original page and adds the values and signature', async () => {
  const template = await syntheticTemplate()
  const filled = await pdf.renderFilledWcForm({
    templateBytes: template,
    layout: rules.layoutFor('hipaa_authorization', null),
    values: rules.printedValues('hipaa_authorization', { patient_name: 'Pat Lee', date_of_birth: '1980-04-12', provider_name: 'Example Clinic' }, { name: 'Pat Lee', relationship: 'Self', signedDate: '2026-10-23' }),
    signaturePng: signaturePng()
  })

  const document = await PDFDocument.load(filled)
  assert.equal(document.getPageCount(), 1)
  assert.deepEqual(document.getPage(0).getSize(), { width: 612, height: 792 })
  assert.ok(filled.byteLength > template.byteLength, 'the overlay adds content')

  const raw = Buffer.from(filled).toString('latin1')
  assert.match(raw, /\/Subtype\s*\/Image/, 'the signature image is embedded')

  // Characters outside the standard fonts are replaced instead of failing the whole print.
  await assert.doesNotReject(pdf.renderFilledWcForm({ templateBytes: template, layout: rules.layoutFor('injury_guidelines_ack', null), values: { employee_name: 'Zoë 李' }, signaturePng: null }))

  await assert.rejects(pdf.inspectWcFormTemplate(Buffer.from('not a pdf')))
  assert.deepEqual(await pdf.inspectWcFormTemplate(template), { pages: 1 })
})

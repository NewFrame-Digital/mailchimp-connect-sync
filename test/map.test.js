import assert from 'node:assert/strict'
import { buildContact, shouldSync, normalizeDate } from '../src/map.js'

const clinic = {
  fieldMap: {
    LASTVISIT: { key: 'contact.last_visit_date', type: 'date' },
    VISITS: 'contact.total_visits',
  },
  tags: ['mailchimp-sync'],
}

function member(overrides = {}) {
  return {
    email_address: 'pat@example.com',
    status: 'subscribed',
    merge_fields: { FNAME: 'Pat', LNAME: 'Lee', LASTVISIT: '03/14/2026', VISITS: '12' },
    ...overrides,
  }
}

// Dates: Jane's MM/DD/YYYY has to become the YYYY-MM-DD GHL expects, or the
// field lands as text and every date filter in GHL silently stops working.
assert.equal(normalizeDate('03/14/2026'), '2026-03-14')
assert.equal(normalizeDate('2026-03-14'), '2026-03-14')
assert.equal(normalizeDate('3/4/2026'), '2026-03-04')
assert.equal(normalizeDate(''), '')
assert.equal(normalizeDate('not a date'), 'not a date')

const contact = buildContact(member(), clinic)
assert.equal(contact.email, 'pat@example.com')
assert.equal(contact.firstName, 'Pat')
assert.equal(contact.lastName, 'Lee')
assert.deepEqual(contact.customFields, [
  { key: 'contact.last_visit_date', fieldValue: '2026-03-14' },
  { key: 'contact.total_visits', fieldValue: '12' },
])
assert.deepEqual(contact.tags, ['mailchimp-sync'])

// A blank on the Mailchimp side must not overwrite a real value already in
// GHL, so blanks are skipped rather than sent as empty strings.
const blank = buildContact(
  member({ merge_fields: { FNAME: 'Pat', LASTVISIT: '', VISITS: '12' } }),
  clinic
)
assert.deepEqual(blank.customFields, [{ key: 'contact.total_visits', fieldValue: '12' }])

// Unmapped merge tags are ignored, not guessed at.
const extra = buildContact(
  member({ merge_fields: { FNAME: 'Pat', VISITS: '3', SOMETHING: 'x' } }),
  clinic
)
assert.deepEqual(extra.customFields, [{ key: 'contact.total_visits', fieldValue: '3' }])

// Custom fields must go to GHL as ids. Sending a key returns 200 and silently
// writes nothing, which is the failure this whole index exists to prevent.
const index = {
  'contact.last_visit_date': 'LBrr4184w3iL3JHxwLmt',
  'contact.total_visits': 'Vz9zLPIVvb6NViRpvYIt',
}
const byId = buildContact(member(), clinic, index)
assert.deepEqual(byId.customFields, [
  { id: 'LBrr4184w3iL3JHxwLmt', field_value: '2026-03-14' },
  { id: 'Vz9zLPIVvb6NViRpvYIt', field_value: '12' },
])

// A key with no matching GHL field must fail loudly rather than being dropped,
// since a dropped field looks identical to a successful sync.
assert.throws(
  () => buildContact(member(), clinic, { 'contact.total_visits': 'x' }),
  /No GHL custom field matches "contact.last_visit_date"/
)

// Opt-outs stay out of GHL. The sync must never be able to resurrect someone
// who unsubscribed.
assert.equal(shouldSync(member(), clinic), true)
assert.equal(shouldSync(member({ status: 'unsubscribed' }), clinic), false)
assert.equal(shouldSync(member({ status: 'cleaned' }), clinic), false)
assert.equal(shouldSync(member({ status: 'transactional' }), clinic), true)
assert.equal(shouldSync(member({ email_address: '' }), clinic), false)

console.log('All mapping tests passed.')

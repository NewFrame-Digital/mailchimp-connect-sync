import assert from 'node:assert/strict'
import { isEmailOptedOut } from '../src/ghl.js'
import { subscriberHash } from '../src/mailchimp.js'

// The shape GHL actually returned for a real email unsubscribe. Note dnd is
// false: checking that flag alone finds nobody, which is the bug this guards.
const realUnsubscribe = {
  dnd: false,
  dndSettings: {
    Call: { status: 'inactive' },
    Email: { status: 'active' },
    SMS: { status: 'inactive' },
  },
}
assert.equal(isEmailOptedOut(realUnsubscribe), true)

// "active" means the DND is active, so the person is opted OUT. "inactive"
// means they are still contactable. The wording inverts and it matters.
assert.equal(
  isEmailOptedOut({ dnd: false, dndSettings: { Email: { status: 'inactive' } } }),
  false
)

// A global do-not-disturb covers email too.
assert.equal(isEmailOptedOut({ dnd: true }), true)

// An untouched contact has no dnd keys at all.
assert.equal(isEmailOptedOut({}), false)
assert.equal(isEmailOptedOut({ dndSettings: {} }), false)

// SMS-only opt-out must not unsubscribe them from email.
assert.equal(
  isEmailOptedOut({ dnd: false, dndSettings: { SMS: { status: 'active' } } }),
  false
)

// Lowercase channel key, in case the API ever varies.
assert.equal(isEmailOptedOut({ dndSettings: { email: { status: 'active' } } }), true)

// Mailchimp addresses members by md5 of the lowercased email.
assert.equal(subscriberHash('Pat@Example.com'), subscriberHash('pat@example.com'))
assert.match(subscriberHash('pat@example.com'), /^[0-9a-f]{32}$/)

console.log('All opt-out tests passed.')

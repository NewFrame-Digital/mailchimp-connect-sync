// GoHighLevel / LeadConnector API writes.

const API = 'https://services.leadconnectorhq.com'
const VERSION = '2021-07-28'

async function ghlRequest(token, method, path, body) {
  // Retries only on rate limiting and 5xx, where trying again is meaningful.
  // A 400 means the payload is wrong and will be wrong again.
  const maxAttempts = 4

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (res.ok) return res.json()

    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt === maxAttempts) {
      const text = await res.text()
      const err = new Error(`GHL ${res.status} on ${path}: ${text.slice(0, 400)}`)
      err.status = res.status
      throw err
    }

    const backoffMs = 1000 * 2 ** (attempt - 1)
    await new Promise((r) => setTimeout(r, backoffMs))
  }
}

export async function listCustomFields(token, locationId) {
  const data = await ghlRequest(
    token,
    'GET',
    `/locations/${locationId}/customFields`
  )
  return (data.customFields || []).map((f) => ({
    id: f.id,
    key: f.fieldKey,
    name: f.name,
    type: f.dataType,
  }))
}

// Create-or-update in one call, matched on email. This is the same behaviour
// as the create-or-update Zap, so contacts see no change in how they're
// deduplicated.
//
// Custom fields must be addressed by their GHL field id. Upsert accepts a
// `key` and returns 200, but silently ignores those entries and leaves the
// values untouched, so the mapping resolves keys to ids before sending.
export async function upsertContact(token, locationId, contact) {
  return ghlRequest(token, 'POST', '/contacts/upsert', {
    locationId,
    ...contact,
  })
}

// Is this contact opted out of email?
//
// Top-level `dnd` means "do not disturb on every channel" and is false for a
// normal email unsubscribe, so checking it alone finds nothing. Channel state
// lives in dndSettings, where status "active" means the DND is active, i.e.
// the person is opted OUT. Channel names are capitalised ("Email").
export function isEmailOptedOut(contact) {
  if (contact?.dnd === true) return true
  const settings = contact?.dndSettings || {}
  const email = settings.Email || settings.email
  return email?.status === 'active'
}

// Every contact in a location. Paged via search, which is the only endpoint
// that reliably returns dndSettings across the whole base.
export async function fetchAllContacts(token, locationId, log) {
  const contacts = []
  let page = 1

  for (;;) {
    const data = await ghlRequest(token, 'POST', '/contacts/search', {
      locationId,
      page,
      pageLimit: 100,
    })
    const batch = data.contacts || []
    contacts.push(...batch)

    if (batch.length < 100) break
    page++
    if (page % 5 === 0) log?.(`  read ${contacts.length} contacts...`)
    // Guard against an unbounded loop if the API ever stops shrinking pages.
    if (page > 200) break
  }

  return contacts
}

// key -> id for one location, so a config written in readable field keys can
// be sent as the ids the API actually honours.
export async function buildFieldKeyIndex(token, locationId) {
  const fields = await listCustomFields(token, locationId)
  const index = {}
  for (const f of fields) {
    if (f.key) index[f.key] = f.id
    // Configs are commonly written without the "contact." prefix.
    if (f.key?.startsWith('contact.')) index[f.key.slice(8)] = f.id
  }
  return index
}

import { createHash } from 'node:crypto'

// Mailchimp API reads. The API key carries its own datacenter as a suffix
// (e.g. abc123-us21), which is what tells us the hostname to call.

function datacenterFromKey(apiKey) {
  const dc = apiKey.split('-')[1]
  if (!dc) {
    throw new Error(
      'Mailchimp API key looks wrong: it should end in a datacenter suffix like "-us21".'
    )
  }
  return dc
}

async function mailchimpGet(apiKey, path, query = {}) {
  const dc = datacenterFromKey(apiKey)
  const url = new URL(`https://${dc}.api.mailchimp.com/3.0${path}`)
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Mailchimp ${res.status} on ${path}: ${body.slice(0, 400)}`)
  }
  return res.json()
}

async function mailchimpPatch(apiKey, path, body) {
  const dc = datacenterFromKey(apiKey)
  const res = await fetch(`https://${dc}.api.mailchimp.com/3.0${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Mailchimp ${res.status} on ${path}: ${text.slice(0, 400)}`)
  }
  return res.json()
}

// Mailchimp addresses members by the md5 of the lowercased email.
export function subscriberHash(email) {
  return createHash('md5').update(String(email).toLowerCase()).digest('hex')
}

// Only ever called to unsubscribe. There is deliberately no re-subscribe path:
// an opt-out must never be undone by a sync.
export async function unsubscribeMember(apiKey, audienceId, email) {
  return mailchimpPatch(
    apiKey,
    `/lists/${audienceId}/members/${subscriberHash(email)}`,
    { status: 'unsubscribed' }
  )
}

// The merge fields defined on an audience, e.g. FNAME, LNAME, and whatever
// Jane writes. Used by the inspect command so a human can see real tag names
// before writing a mapping.
export async function listMergeFields(apiKey, audienceId) {
  const data = await mailchimpGet(apiKey, `/lists/${audienceId}/merge-fields`, {
    count: 1000,
  })
  return (data.merge_fields || []).map((f) => ({
    tag: f.tag,
    name: f.name,
    type: f.type,
  }))
}

export async function listAudiences(apiKey) {
  const data = await mailchimpGet(apiKey, '/lists', { count: 1000 })
  return (data.lists || []).map((l) => ({
    id: l.id,
    name: l.name,
    memberCount: l.stats?.member_count ?? null,
  }))
}

// Members changed since `since` (an ISO string), or all members when since is
// null. Paged, because Mailchimp caps page size at 1000.
//
// since_last_changed is the whole reason this stays cheap: a routine run asks
// only for what moved, so a busy clinic returns tens of rows rather than
// thousands.
export async function fetchChangedMembers(apiKey, audienceId, since, log) {
  const pageSize = 1000
  const members = []
  let offset = 0

  for (;;) {
    const data = await mailchimpGet(apiKey, `/lists/${audienceId}/members`, {
      count: pageSize,
      offset,
      since_last_changed: since || undefined,
      // Trimming the response keeps big audiences from ballooning in memory.
      fields:
        'members.email_address,members.status,members.merge_fields,members.last_changed,total_items',
    })

    const batch = data.members || []
    members.push(...batch)

    if (batch.length < pageSize) break
    offset += pageSize
    log?.(`  fetched ${members.length} of ${data.total_items}...`)
  }

  return members
}

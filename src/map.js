// Translating one Mailchimp member into one GHL contact payload.
//
// The mapping itself lives in each clinic's config, never in here. Jane writes
// different merge tags at different clinics, and GHL custom fields are named by
// whoever set the location up, so a hardcoded pairing would only ever be right
// for one clinic.

// GHL's DATE fields want YYYY-MM-DD. Mailchimp hands back whatever Jane wrote,
// commonly MM/DD/YYYY. Anything unparseable is passed through untouched rather
// than dropped, so a human sees the odd value instead of silence.
function normalizeDate(value) {
  if (value === null || value === undefined) return value
  const raw = String(value).trim()
  if (raw === '') return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const [, month, day, year] = slash
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return raw
}

// fieldIndex maps a config's readable field key to the GHL field id. It is
// required for custom fields to actually write: the API accepts a key, returns
// 200, and ignores it.
export function buildContact(member, clinic, fieldIndex = null) {
  const merge = member.merge_fields || {}
  const contact = { email: member.email_address }

  const firstName = merge[clinic.firstNameTag || 'FNAME']
  const lastName = merge[clinic.lastNameTag || 'LNAME']
  const phone = clinic.phoneTag ? merge[clinic.phoneTag] : merge.PHONE

  if (firstName) contact.firstName = String(firstName).trim()
  if (lastName) contact.lastName = String(lastName).trim()
  if (phone) contact.phone = String(phone).trim()

  const customFields = []
  for (const [mergeTag, spec] of Object.entries(clinic.fieldMap || {})) {
    // A mapping entry is either "GHL_KEY" or { key, type }.
    const key = typeof spec === 'string' ? spec : spec.key
    const type = typeof spec === 'string' ? 'text' : spec.type || 'text'

    let value = merge[mergeTag]
    if (value === undefined || value === null || String(value).trim() === '') {
      // Skip blanks rather than writing empty strings, so a temporarily missing
      // Jane value never wipes what's already in GHL.
      continue
    }

    if (type === 'date') value = normalizeDate(value)

    if (!fieldIndex) {
      // Dry runs render the readable key so a human can check the mapping.
      customFields.push({ key, fieldValue: String(value) })
      continue
    }

    const id = fieldIndex[key]
    if (!id) {
      throw new Error(
        `No GHL custom field matches "${key}" (mapped from Mailchimp tag ${mergeTag}). ` +
          `Run "inspect" to see the real field keys on this location.`
      )
    }
    customFields.push({ id, field_value: String(value) })
  }

  if (customFields.length) contact.customFields = customFields
  if (clinic.tags?.length) contact.tags = clinic.tags
  contact.source = clinic.source || 'Mailchimp sync'

  return contact
}

// Members who shouldn't be written. Unsubscribes and cleaned addresses stay
// out of GHL by default so the sync can't undo someone opting out.
export function shouldSync(member, clinic) {
  const allowed = clinic.syncStatuses || ['subscribed', 'transactional']
  if (!member.email_address) return false
  return allowed.includes(member.status)
}

export { normalizeDate }

import { fetchAllContacts, isEmailOptedOut } from './ghl.js'
import { fetchChangedMembers, unsubscribeMember } from './mailchimp.js'

// GHL -> Mailchimp, opt-outs only.
//
// Someone unsubscribes from a GHL email, GHL sets email DND, and this pushes
// that to Mailchimp. Mailchimp is what feeds Jane, so this is the step that
// stops the clinic emailing someone who already opted out.
//
// Strictly one-way: this can only ever unsubscribe. Nothing here re-subscribes
// anyone, so the forward and reverse passes can never fight over a contact,
// and an opt-out can never be undone by a sync.
export async function reverseSyncClinic(
  clinic,
  { dryRun = false, log = console.log } = {}
) {
  const label = clinic.name || clinic.ghlLocationId
  log(`\n${label}: opt-outs back to Mailchimp${dryRun ? '  (dry run)' : ''}`)

  const contacts = await fetchAllContacts(clinic.ghlToken, clinic.ghlLocationId, log)
  const optedOut = contacts.filter(isEmailOptedOut)
  log(`  ${contacts.length} contacts in GHL, ${optedOut.length} opted out of email`)

  // Current Mailchimp state, so we only write where the two actually disagree.
  const members = await fetchChangedMembers(
    clinic.mailchimpApiKey,
    clinic.audienceId,
    null
  )
  const statusByEmail = new Map()
  for (const m of members) {
    statusByEmail.set(String(m.email_address).toLowerCase(), m.status)
  }

  const result = { clinic: label, optedOut: optedOut.length, toUnsubscribe: [], unsubscribed: 0, notInMailchimp: 0, failures: [] }

  for (const contact of optedOut) {
    const email = contact.email
    if (!email) continue

    const status = statusByEmail.get(String(email).toLowerCase())
    if (status === undefined) {
      result.notInMailchimp++
      continue
    }
    if (status !== 'subscribed' && status !== 'transactional') continue

    result.toUnsubscribe.push(email)
  }

  log(`  ${result.toUnsubscribe.length} still subscribed in Mailchimp, would be unsubscribed`)
  if (result.notInMailchimp) {
    log(`  ${result.notInMailchimp} opted-out contacts aren't in the Mailchimp audience`)
  }

  for (const email of result.toUnsubscribe) {
    if (dryRun) {
      log(`    would unsubscribe ${email}`)
      continue
    }
    try {
      await unsubscribeMember(clinic.mailchimpApiKey, clinic.audienceId, email)
      result.unsubscribed++
      log(`    unsubscribed ${email}`)
    } catch (err) {
      result.failures.push({ email, error: err.message })
      log(`    ! ${email}: ${err.message}`)
    }
  }

  return result
}

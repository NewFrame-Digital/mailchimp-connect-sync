import { fetchChangedMembers } from './mailchimp.js'
import { upsertContact, buildFieldKeyIndex } from './ghl.js'
import { buildContact, shouldSync } from './map.js'

// One clinic, one run.
//
// dryRun does everything except the write, and reports what it would have
// sent. Every clinic should be dry run once before writes are turned on.
export async function syncClinic(clinic, { dryRun = false, since = null, log = console.log } = {}) {
  const label = clinic.name || clinic.audienceId
  log(`\n${label}${dryRun ? '  (dry run, nothing will be written)' : ''}`)
  log(since ? `  changes since ${since}` : '  full sync (no previous run recorded)')

  // Resolve field keys to ids up front. A real run needs the ids; a dry run
  // still resolves them so an unmappable key fails before writes are enabled
  // rather than on the first live sync.
  const fieldIndex = await buildFieldKeyIndex(clinic.ghlToken, clinic.ghlLocationId)

  const members = await fetchChangedMembers(
    clinic.mailchimpApiKey,
    clinic.audienceId,
    since,
    log
  )

  const eligible = members.filter((m) => shouldSync(m, clinic))
  const skipped = members.length - eligible.length

  log(`  ${members.length} changed, ${eligible.length} to sync${skipped ? `, ${skipped} skipped (unsubscribed or cleaned)` : ''}`)

  const result = {
    clinic: label,
    examined: members.length,
    eligible: eligible.length,
    skipped,
    written: 0,
    failures: [],
    samples: [],
  }

  for (const member of eligible) {
    // Dry runs render readable keys; real runs send the ids GHL honours. Both
    // pass the index so a bad mapping surfaces either way.
    const contact = buildContact(member, clinic, dryRun ? null : fieldIndex)

    if (result.samples.length < 5) {
      result.samples.push(dryRun ? buildContact(member, clinic) : contact)
    }

    if (dryRun) {
      // Validate the mapping resolves, without writing.
      buildContact(member, clinic, fieldIndex)
      continue
    }

    try {
      await upsertContact(clinic.ghlToken, clinic.ghlLocationId, contact)
      result.written++
    } catch (err) {
      // One bad record shouldn't end the run for everyone else.
      result.failures.push({ email: member.email_address, error: err.message })
      log(`  ! ${member.email_address}: ${err.message}`)
    }
  }

  if (dryRun) {
    log(`  would write ${eligible.length} contacts. Sample of what they'd look like:`)
    for (const sample of result.samples) {
      log(`    ${JSON.stringify(sample)}`)
    }
  } else {
    log(`  wrote ${result.written}${result.failures.length ? `, ${result.failures.length} failed` : ''}`)
  }

  return result
}

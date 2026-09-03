#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { listMergeFields, listAudiences } from './mailchimp.js'
import { listCustomFields } from './ghl.js'
import { syncClinic } from './sync.js'
import { reverseSyncClinic } from './reverse.js'

const USAGE = `
cliniverse-mailchimp-sync

  inspect <config.json>       show Mailchimp merge tags + GHL custom fields side by side
  audiences <config.json>     list Mailchimp audiences and their IDs
  sync <config.json> --dry    preview both directions without writing anything
  sync <config.json>          run both directions for real

  --forward-only              Mailchimp -> GHL only (skip opt-outs)
  --reverse-only              GHL opt-outs -> Mailchimp only

By default sync runs both directions: contact fields flow Mailchimp to GHL,
and email opt-outs flow GHL back to Mailchimp (which is what tells Jane).

Run inspect first. It prints the real field names on both sides so the
fieldMap in your config can be written against what actually exists.
`

// State lives next to the config so "when did this last run" travels with it.
function statePath(configPath) {
  return join(dirname(resolve(configPath)), '.sync-state.json')
}

async function readState(configPath) {
  const path = statePath(configPath)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    // A corrupt state file shouldn't block a sync; a full sync is safe, just slower.
    return {}
  }
}

async function writeState(configPath, state) {
  await writeFile(statePath(configPath), JSON.stringify(state, null, 2) + '\n')
}

async function loadConfig(configPath) {
  if (!configPath) {
    console.error(USAGE)
    process.exit(1)
  }
  const raw = JSON.parse(await readFile(resolve(configPath), 'utf8'))
  const clinics = Array.isArray(raw) ? raw : raw.clinics || [raw]

  // Secrets can be inlined for a local run or, preferably, referenced by env
  // var name so the config file itself carries no credentials.
  return clinics.map((clinic) => ({
    ...clinic,
    mailchimpApiKey: clinic.mailchimpApiKey || process.env[clinic.mailchimpApiKeyEnv],
    ghlToken: clinic.ghlToken || process.env[clinic.ghlTokenEnv],
  }))
}

function requireCreds(clinic, need) {
  const missing = need.filter((k) => !clinic[k])
  if (missing.length) {
    console.error(
      `\n${clinic.name || 'clinic'}: missing ${missing.join(', ')}.` +
        `\nSet them in the config, or set the env vars named by mailchimpApiKeyEnv / ghlTokenEnv.`
    )
    process.exit(1)
  }
}

async function cmdInspect(clinics) {
  for (const clinic of clinics) {
    requireCreds(clinic, ['mailchimpApiKey', 'ghlToken'])
    console.log(`\n=== ${clinic.name || clinic.audienceId} ===`)

    const [merge, custom] = await Promise.all([
      listMergeFields(clinic.mailchimpApiKey, clinic.audienceId),
      listCustomFields(clinic.ghlToken, clinic.ghlLocationId),
    ])

    console.log('\nMailchimp merge tags (the left side of your fieldMap):')
    for (const f of merge) {
      console.log(`  ${f.tag.padEnd(20)} ${f.name}  [${f.type}]`)
    }

    console.log('\nGHL custom fields (the right side of your fieldMap):')
    for (const f of custom) {
      console.log(`  ${String(f.key).padEnd(36)} ${f.name}  [${f.type}]`)
    }

    const mapped = Object.keys(clinic.fieldMap || {})
    const unmapped = merge
      .map((f) => f.tag)
      .filter((t) => !mapped.includes(t))
      .filter((t) => !['FNAME', 'LNAME', 'PHONE'].includes(t))

    if (unmapped.length) {
      console.log(`\nNot yet in fieldMap: ${unmapped.join(', ')}`)
    }
  }
}

async function cmdAudiences(clinics) {
  for (const clinic of clinics) {
    requireCreds(clinic, ['mailchimpApiKey'])
    const lists = await listAudiences(clinic.mailchimpApiKey)
    console.log(`\n=== ${clinic.name || 'Mailchimp account'} ===`)
    for (const l of lists) {
      console.log(`  ${l.id}  ${l.name}  (${l.memberCount} members)`)
    }
  }
}

async function cmdSync(clinics, configPath, dryRun, directions) {
  const state = await readState(configPath)
  const results = []
  const reverseResults = []

  for (const clinic of clinics) {
    requireCreds(clinic, ['mailchimpApiKey', 'ghlToken'])

    // Opt-outs first. If someone unsubscribed in GHL, Mailchimp learns about
    // it before the forward pass reads Mailchimp's statuses, so the same run
    // stops syncing them rather than waiting for the next one.
    if (directions.reverse) {
      reverseResults.push(await reverseSyncClinic(clinic, { dryRun }))
    }

    if (!directions.forward) continue

    const key = clinic.audienceId
    // A minute of overlap covers clock skew between us and Mailchimp. Re-syncing
    // a contact is harmless because upsert is idempotent; missing one is not.
    const since = state[key]?.lastRun
      ? new Date(new Date(state[key].lastRun).getTime() - 60_000).toISOString()
      : null

    const startedAt = new Date().toISOString()
    const result = await syncClinic(clinic, { dryRun, since })
    results.push(result)

    // Only advance the watermark on a clean real run. If anything failed, the
    // next run re-examines that window rather than skipping past the failures.
    if (!dryRun && result.failures.length === 0) {
      state[key] = { lastRun: startedAt, name: clinic.name }
    }
  }

  if (!dryRun) await writeState(configPath, state)

  const written = results.reduce((n, r) => n + r.written, 0)
  const unsubbed = reverseResults.reduce((n, r) => n + r.unsubscribed, 0)
  const wouldUnsub = reverseResults.reduce((n, r) => n + r.toUnsubscribe.length, 0)
  const failed =
    results.reduce((n, r) => n + r.failures.length, 0) +
    reverseResults.reduce((n, r) => n + r.failures.length, 0)

  if (dryRun) {
    console.log(
      `\nDry run complete.` +
        (directions.reverse ? ` ${wouldUnsub} would be unsubscribed in Mailchimp.` : '')
    )
  } else {
    console.log(
      `\nDone.` +
        (directions.forward ? ` ${written} contacts written to GHL.` : '') +
        (directions.reverse ? ` ${unsubbed} unsubscribed in Mailchimp.` : '') +
        (failed ? ` ${failed} failed.` : '')
    )
  }

  if (failed) process.exitCode = 1
}

async function main() {
  const [command, configPath, ...rest] = process.argv.slice(2)
  const dryRun = rest.includes('--dry') || rest.includes('--dry-run')

  if (!command || command === 'help' || command === '--help') {
    console.log(USAGE)
    return
  }

  const clinics = await loadConfig(configPath)

  switch (command) {
    case 'inspect':
      return cmdInspect(clinics)
    case 'audiences':
      return cmdAudiences(clinics)
    case 'sync': {
      const forwardOnly = rest.includes('--forward-only')
      const reverseOnly = rest.includes('--reverse-only')
      return cmdSync(clinics, configPath, dryRun, {
        forward: !reverseOnly,
        reverse: !forwardOnly,
      })
    }
    default:
      console.error(`Unknown command: ${command}`)
      console.log(USAGE)
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`)
  process.exit(1)
})

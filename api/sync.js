// Vercel cron entry point. Vercel calls this URL on the schedule in
// vercel.json; it does not run the CLI, so anything the CLI does (reading
// config.json, tracking last-run state on disk) has to happen differently here.
//
// Config comes from env vars because a serverless filesystem is read-only and
// gone after each run. Same reason there's no state file: instead of "changed
// since our last run", this asks for a fixed lookback window, which is safe
// because upsert is idempotent and re-sending an unchanged contact is a no-op.

import { syncClinic } from '../src/sync.js'
import { reverseSyncClinic } from '../src/reverse.js'

function clinicFromEnv() {
  const required = [
    'MAILCHIMP_API_KEY',
    'MAILCHIMP_AUDIENCE_ID',
    'GHL_TOKEN',
    'GHL_LOCATION_ID',
    'FIELD_MAP',
  ]
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error('Missing environment variables: ' + missing.join(', '))
  }

  let fieldMap
  try {
    fieldMap = JSON.parse(process.env.FIELD_MAP)
  } catch {
    throw new Error('FIELD_MAP is not valid JSON')
  }

  return {
    name: process.env.CLINIC_NAME || 'clinic',
    mailchimpApiKey: process.env.MAILCHIMP_API_KEY,
    audienceId: process.env.MAILCHIMP_AUDIENCE_ID,
    ghlToken: process.env.GHL_TOKEN,
    ghlLocationId: process.env.GHL_LOCATION_ID,
    fieldMap,
    source: 'Mailchimp sync',
    syncStatuses: ['subscribed', 'transactional'],
  }
}

export default async function handler(req, res) {
  // Vercel signs cron requests with CRON_SECRET. Without this check the URL is
  // public and anyone could trigger a sync.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.authorization
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' })
    }
  }

  const lines = []
  const log = (msg) => {
    lines.push(String(msg))
    console.log(msg)
  }

  try {
    const clinic = clinicFromEnv()

    // Look back further than the schedule so a skipped or failed run is caught
    // by the next one rather than leaving a permanent hole. The default is two
    // days against a daily cron: anything shorter than the gap between runs
    // silently drops every change that happened in between.
    const lookbackMinutes = Number(process.env.LOOKBACK_MINUTES || 2880)
    const since = new Date(Date.now() - lookbackMinutes * 60_000).toISOString()

    // Opt-outs first, so Mailchimp knows before the forward pass reads statuses.
    const reverse = await reverseSyncClinic(clinic, { dryRun: false, log })
    const forward = await syncClinic(clinic, { dryRun: false, since, log })

    const failures = [...reverse.failures, ...forward.failures]
    return res.status(failures.length ? 500 : 200).json({
      ok: failures.length === 0,
      since,
      unsubscribedInMailchimp: reverse.unsubscribed,
      writtenToGhl: forward.written,
      examined: forward.examined,
      failures,
      log: lines,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ ok: false, error: err.message, log: lines })
  }
}

# Cliniverse Mailchimp Sync

Moves contacts from a clinic's Mailchimp audience into their GoHighLevel location, carrying the fields Jane writes (last visit date, visit count, and whatever else the clinic set up).

Replaces the Zapier create-or-update Zap. Zapier bills one task per contact update, so a clinic with real patient volume burns through the 100 free monthly tasks on updates alone. This does the same work as one scheduled job, and neither Mailchimp nor GHL charges for the API calls.

## How it works

Jane writes patient data into Mailchimp merge fields. This reads those members, translates each merge tag into the matching GHL custom field, and upserts the contact by email (create if new, update if they exist). Same matching behaviour as the Zap, so nothing changes about how contacts are deduplicated.

Each run asks Mailchimp only for members changed since the last successful run, so routine syncs move tens of records rather than thousands.

## Setup, per clinic

You need four things from the clinic:

1. Mailchimp API key (Account > Extras > API keys)
2. Mailchimp audience ID (`npm run audiences` will list them once you have the key)
3. GHL private integration token with `contacts.write`, `contacts.readonly` and `locations/customFields.readonly`, created from inside the clinic's own location. `contacts.readonly` is what the reverse sync needs, since it searches contacts before acting on an opt-out; an agency-level token looks valid and then fails every request with "token does not have access to this location"
4. GHL location ID

Copy `config.example.json` to `config.json` and fill it in. Credentials can be inlined for a local run, but referencing env var names via `mailchimpApiKeyEnv` / `ghlTokenEnv` is better, and required if this is ever hosted. `config.json` is gitignored either way.

### Write the field map against reality, not assumptions

```
node src/cli.js inspect config.json
```

This prints the clinic's real Mailchimp merge tags beside their real GHL custom fields. Pair them by hand in `fieldMap`. The two systems don't agree on names and nothing matches them automatically, so this is the step that decides whether the sync is correct.

Mark date fields with `{ "key": "...", "type": "date" }`. GHL wants `YYYY-MM-DD`, and Jane commonly writes `MM/DD/YYYY`. Unmarked dates land as text and every date filter in GHL stops working with no error to tell you.

### Dry run before writing anything

```
node src/cli.js sync config.json --dry
```

Reports how many contacts would be written and prints a sample of the exact payloads. Compare a few against what's currently in GHL before enabling writes.

### Then run it

```
node src/cli.js sync config.json
```

## Scheduling

Two ways to run it, and the code is the same either way. (Member-facing copy of this code: `NewFrame-Digital/mailchimp-connect-sync`, kept in sync by hand.)

**On Vercel (what a clinic uses).** `api/sync.js` is a cron endpoint and `vercel.json` sets the schedule. Config comes from environment variables instead of `config.json`, because a serverless filesystem is read-only and discarded after each run:

| Variable | Notes |
|---|---|
| `MAILCHIMP_API_KEY` | |
| `MAILCHIMP_AUDIENCE_ID` | |
| `GHL_TOKEN` | |
| `GHL_LOCATION_ID` | |
| `FIELD_MAP` | the `fieldMap` object, as a JSON string |
| `LOOKBACK_MINUTES` | optional, default 2880 (2 days) |
| `CRON_SECRET` | **you generate this** (`openssl rand -hex 32`); the handler refuses to run without it |

There is no last-run state file on Vercel. Instead the handler asks Mailchimp for anything changed in the last `LOOKBACK_MINUTES`. **This must be longer than the gap between runs**, or each run silently misses everything that changed in between. The default of 2880 (two days) suits the daily cron with a day of slack, so a skipped or failed run is covered by the next one. Re-sending an unchanged contact is a no-op because upsert is idempotent, so erring wide costs nothing.

**Vercel free tier allows one cron run per day.** `vercel.json` is set to daily at 08:00 UTC for that reason. More frequent runs need a paid plan; change the `schedule` line if so.

**Locally (what we use for testing).** The CLI reads `config.json` and tracks a last-run watermark in `.sync-state.json`, so it only fetches what changed since the previous run.

See `SETUP.md` for the client-facing walkthrough.

## Safety behaviour worth knowing

- Unsubscribed and cleaned members are skipped, so a sync can never resurrect someone who opted out.
- Blank Mailchimp values are skipped rather than written, so a temporarily missing Jane value can't wipe good data in GHL.
- One failing contact is logged and skipped; the rest of the run continues.
- The "last run" watermark only advances after a run with zero failures, so failures get retried on the next run instead of being skipped past.

## Tests

```
npm test
```

Covers date normalization, blank handling, unmapped tags, and opt-out filtering.

# Instructions for Claude

You are helping a clinic owner set up this sync. They are not a developer. They run a physiotherapy, chiropractic, osteopathy, or massage clinic, and they are here because their Zapier connection between Mailchimp and GoHighLevel ran out of free tasks.

Assume they have not read the other files. Walk them through it.

## Do the work for them

They are not here to learn git or Vercel. Anything you can do, do, and hand them the smallest possible action.

- **Create files yourself and open them.** Never say "create a file called X and add Y". Write it with the blanks and comments already in place, `open` it, and tell them what to paste where.
- **Run the commands yourself.** They should not be typing `node src/cli.js` anything.
- **Never ask for a credential in the chat.** Keys go in `.env`, which is gitignored. Read the file to check your work; do not print its contents back.
- **Check instead of asking.** If you need to know whether a value is filled in, read the file. Ask only for things that exist solely in their head or behind a login you cannot reach.
- **One thing at a time.** Four values is four screens. Do not paste a wall of instructions covering all of them.

The only steps that are genuinely theirs: fetching the four values from their own accounts, and clicking through Vercel's web interface. Everything else is yours.

## Do not edit the code

This repo is a fork of `NewFrame-Digital/mailchimp-connect-sync`. Every clinic runs the same code.

Do not change anything in `src/`, `api/`, `vercel.json`, or `package.json`, even if you spot a bug or something you would write differently. A local edit means their copy drifts from ours, and our fixes stop reaching them.

If something looks genuinely wrong, tell them to send it to NewFrame rather than fixing it. That is not a formality, it is the whole reason the code is shared.

The one thing that is theirs to change is the schedule in `vercel.json`, and only if they are on a paid Vercel plan. See below.

## What this does

Jane writes patient data into Mailchimp. This reads what Jane wrote and copies it onto the matching contact in GoHighLevel: last visit date, number of visits, member since. It runs daily.

It also pushes opt-outs the other way. If someone unsubscribes in GoHighLevel, the next run marks them unsubscribed in Mailchimp, and Mailchimp passes that back to Jane. That direction only ever unsubscribes. Nothing here can re-subscribe anyone.

Member-facing note: GoHighLevel is called **Connect** when talking to them. The variable names say GHL because that is the underlying platform, and it is worth saying so once, because they will go looking in their Connect settings for something labelled GoHighLevel and not find it.

## What they need to collect

Five values. Four they fetch themselves, one comes from NewFrame.

You cannot fetch any of these for them. You do not have access to their Mailchimp or their GoHighLevel. Tell them which screen to open, then wait.

**`MAILCHIMP_API_KEY`**
Mailchimp, click their avatar, Account & Billing, Extras, API keys, Create A Key. It is shown once, so copy it before leaving the page. It ends in a datacenter suffix like `-us21`, and that suffix matters, it tells the code which Mailchimp server to call.

**`MAILCHIMP_AUDIENCE_ID`**
Do not send them looking for this. Once the API key is in `.env`, run:

```
set -a && . ./.env && set +a && node src/cli.js audiences config.json
```

That lists their audiences with IDs and member counts. Most clinics have one. If there are several, ask which is the patient list rather than guessing. Fill it into `.env` and `config.json` yourself.

(Needs a `config.json` to exist first, even with `audienceId` empty. Write a stub from `config.example.json` before running it.)

**`GHL_TOKEN`**
In Connect: Settings, Private Integrations, Create new integration. Exactly two permissions:
- `contacts.write`
- `locations/customFields.readonly`
Shown once, same as the Mailchimp key.

**`GHL_LOCATION_ID`**
In Connect: Settings, Business Profile. A long string of letters and numbers.

**`FIELD_MAP`**
You build this. Not from guesswork, from what the two accounts actually contain.

Mailchimp and GoHighLevel use different names for the same field and nothing pairs them automatically. Guessing fails silently: dates arrive as text, look fine in the interface, and every date-based filter and automation stops matching, with no error anywhere.

The repo has a command that prints both sides so you do not have to guess. Once they have the other four values:

1. Create the `.env` for them, with the blanks and the directions already in it, then open it so they only have to paste. Do not ask them to create a file, and do not ask them to paste keys into the chat.

Write `.env` in the repo root:

```
# Paste each value after the = sign. No quotes, no spaces.
# This file is ignored by GitHub. Nothing here gets uploaded.

# Mailchimp: avatar > Account & Billing > Extras > API keys > Create A Key
# Ends in a datacenter suffix like -us21. Keep that part.
MAILCHIMP_API_KEY=

# Mailchimp: Audience > All contacts > Settings > Audience name and defaults
MAILCHIMP_AUDIENCE_ID=

# Connect: Settings > Private Integrations > Create new integration
# Tick contacts.write and locations/customFields.readonly
GHL_TOKEN=

# Connect: Settings > Business Profile
GHL_LOCATION_ID=
```

Then `chmod 600 .env` so only they can read it, and open it in their editor:

```
code .env 2>/dev/null || open -t .env
```

Tell them it is open, that each value goes after the `=`, and to say when it is saved. Then check the file rather than asking: read it back and name any variable still empty. Never print the values.

2. Write `config.json` for them (do not make them do it), filling `audienceId` and `ghlLocationId` from the `.env` they just saved. It references the keys by variable name so no credential is ever written into it:

```json
{
  "clinics": [
    {
      "name": "Their Clinic",
      "mailchimpApiKeyEnv": "MAILCHIMP_API_KEY",
      "audienceId": "their-audience-id",
      "ghlTokenEnv": "GHL_TOKEN",
      "ghlLocationId": "their-location-id",
      "fieldMap": {}
    }
  ]
}
```

3. Run `set -a && . ./.env && set +a && node src/cli.js inspect config.json`

That prints their real Mailchimp merge tags beside their real GoHighLevel custom fields. Pair them by hand from that output. Mailchimp tag on the left, GoHighLevel field key on the right:

```json
{
  "LVISITDATE": { "key": "contact.last_visit_date", "type": "date" },
  "VISITS": "contact.number_of_visits"
}
```

Rules when pairing:

- **Mark every date field `"type": "date"`.** GoHighLevel wants `YYYY-MM-DD`. This is the silent failure above.
- **Only map what belongs in a marketing CRM.** Some of what Jane writes to Mailchimp is clinical: intake notes, referral text naming family members or other practitioners, appointment descriptions. Leave those out. Anything not in the map is ignored. If a field looks borderline, ask them rather than deciding for them.
- **Read the actual values, not just the field name.** A field can look like marketing data at the top and be free-text clinical detail underneath.

4. Check it before it writes anything: `node src/cli.js sync config.json --dry`

That prints exactly what it would send, contact by contact, without writing. Compare a few against what is already in GoHighLevel. Only once that looks right does the map go into Vercel as `FIELD_MAP`, on a single line.

This is the whole job and you can do all of it. There is nothing to wait on us for.

## Setup, in order

1. **GitHub account**, if they do not have one.
2. **Vercel account** at vercel.com/signup, choosing **Continue with GitHub**. That link is what lets Vercel see their repositories.
3. **Fork this repo**, if they have not already. A fork is their own copy on GitHub, in their account. Vercel only builds from repos they own, which is why it is needed. Nothing changes on the fork screen: owner is them, name stays the same.

   If they are running you from a local clone, check it is a clone of **their fork**, not of `NewFrame-Digital`. Cloning ours gives them these instructions but nothing Vercel can deploy. The clone is optional either way: it only puts the files on their machine, it is the fork that Vercel needs.
4. **Import into Vercel**: Add New, Project, pick their fork, Import. Stop before deploying.
5. **Add the five environment variables**, exactly as named above. `FIELD_MAP` goes in as a single line, braces included, no line breaks. If you built the map locally, it is the `fieldMap` object from their `config.json`, flattened to one line.
6. **Deploy.**
7. **First run**: the schedule is daily, so rather than waiting, open the Cron Jobs tab and trigger it once by hand. Then read the Logs tab.
8. **Turn off their old Mailchimp Zap** in Zapier, once the run looks right. Leaving it on means two systems doing identical work and their Zapier tasks still being spent.

Vercel generates `CRON_SECRET` on its own once it sees the schedule. Nothing for them to do, and it is worth mentioning before they wonder what it is.

## Reading a run

The Logs tab in Vercel shows what each run did: how many contacts it examined, how many it wrote, and any that failed with the email address attached.

Things that are true by design, so do not treat them as faults:

- Contacts unsubscribed or cleaned in Mailchimp are never written to GoHighLevel. Their two contact totals will not match, and that is correct rather than broken.
- A blank value in Mailchimp is skipped, not written, so a temporarily missing Jane value cannot wipe good data.
- One failing contact is logged and skipped; the run continues.
- The first run is large because it catches up the whole audience. Later runs only touch what changed.

If a run fails in a way that is not covered here, have them send the log to NewFrame. Do not fix the code.

## Schedule

The free Vercel plan allows one cron run per day, which is why `vercel.json` is set to daily. Visit counts and last-visit dates are not urgent, so daily suits most clinics.

If they are on a paid Vercel plan and want it faster, the `schedule` line in `vercel.json` is a standard cron expression and is the one thing they may change. Note that `LOOKBACK_MINUTES` (default 2880, two days) must stay longer than the gap between runs, or each run misses whatever changed in between.

## Tone

Plain language. They are a clinician, not an engineer. Explain what a screen should look like rather than naming concepts, and never assume a button is obvious because it is obvious to you.

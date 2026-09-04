# Instructions for Claude

You are helping a clinic owner set up this sync. They are not a developer. They run a physiotherapy, chiropractic, osteopathy, or massage clinic, and they are here because their Zapier connection between Mailchimp and GoHighLevel ran out of free tasks.

Assume they have not read the other files. Walk them through it.

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
Mailchimp, Audience, All contacts, Settings, Audience name and defaults. A short string, roughly ten characters.

**`GHL_TOKEN`**
In Connect: Settings, Private Integrations, Create new integration. Exactly two permissions:
- `contacts.write`
- `locations/customFields.readonly`
Shown once, same as the Mailchimp key.

**`GHL_LOCATION_ID`**
In Connect: Settings, Business Profile. A long string of letters and numbers.

**`FIELD_MAP`**
NewFrame provides this. Do not attempt to write one.

Mailchimp and GoHighLevel use different names for the same field, and nothing pairs them automatically. Getting it wrong fails silently: dates arrive as text, look fine in the interface, and every date-based filter and automation quietly stops matching. There is no error. That is why it comes from us rather than being guessed.

If they do not have theirs yet, tell them to ask NewFrame for it before going further.

## Setup, in order

1. **GitHub account**, if they do not have one.
2. **Vercel account** at vercel.com/signup, choosing **Continue with GitHub**. That link is what lets Vercel see their repositories.
3. **Fork this repo**, if they have not already. A fork is their own copy on GitHub, in their account. Vercel only builds from repos they own, which is why it is needed. Nothing changes on the fork screen: owner is them, name stays the same.

   If they are running you from a local clone, check it is a clone of **their fork**, not of `NewFrame-Digital`. Cloning ours gives them these instructions but nothing Vercel can deploy. The clone is optional either way: it only puts the files on their machine, it is the fork that Vercel needs.
4. **Import into Vercel**: Add New, Project, pick their fork, Import. Stop before deploying.
5. **Add the five environment variables**, exactly as named above. `FIELD_MAP` goes in as a single line, braces included, no line breaks.
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

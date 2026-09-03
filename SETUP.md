# Connecting Jane to Connect through Mailchimp

This sets up an automatic sync between your Mailchimp audience and your Connect account. Patient data that Jane writes into Mailchimp (last visit date, visit count) ends up on the matching contact in Connect, updating itself once a day without anyone touching it.

It replaces the Zapier connection. Zapier charges one task per contact update, so a clinic with real patient volume burns through the free monthly allowance on updates alone. This does the same work for nothing.

It runs on your own accounts, so your Mailchimp and Connect keys stay with you. We never hold them.

Budget about 30 minutes. Two free accounts are needed and neither asks for payment details.

## Before you start

Jane needs to already be pushing to Mailchimp. Jane has a native Mailchimp integration, and this sync reads what that integration writes. If Jane isn't connected to Mailchimp yet, that comes first, and it's set up inside Jane rather than here.

Worth deciding early: if your Mailchimp audience holds patients from more than one clinic location, decide whether all of them should land in your Connect account before you switch this on. Easier to answer now than to unpick afterwards.

## Why two accounts

Think of it as a recipe and a kitchen. **GitHub** stores the recipe (the code). **Vercel** is the kitchen that cooks it on a schedule. Vercel has no code of its own, it reads from GitHub, which is why both exist.

You won't be writing code or visiting either site day to day. Once it's running you can forget about both.

## Step 1: create the two accounts

1. **GitHub**: github.com/signup, whichever email you prefer.
2. **Vercel**: vercel.com/signup, and choose **Continue with GitHub**, allowing the connection when asked.

Do it in that order. Signing into Vercel with GitHub is what links them.

## Step 2: copy the code to your GitHub

We'll send you the repository link. Click **Fork**, top right. That puts your own copy in your GitHub account.

## Step 3: gather your five values

Collect these before touching Vercel, because the next step asks for all of them at once.

**Mailchimp API key**: in Mailchimp, your avatar > Account & Billing > Extras > API keys > Create A Key. Copy it when shown, it isn't displayed again.

**Mailchimp audience ID**: Audience > All contacts > Settings > Audience name and defaults. It's the "Audience ID", a short string like `a1b2c3d4e5`.

**Connect private integration token**: in Connect, Settings > Private Integrations > Create new integration. It needs exactly two permissions:

- `contacts.write`
- `locations/customFields.readonly`

Copy the token when shown.

**Connect location ID**: Settings > Business Profile, or read it out of the browser address bar when you're inside your account. A long string of letters and numbers.

**The field map**: this one needs a decision rather than a lookup, so it has its own step below.

## Step 4: work out your field map

This is the step that decides whether the sync is correct, and the only one worth slowing down for.

Mailchimp and Connect use different names for the same thing. Mailchimp calls it `LVISITDATE`, Connect calls it `last_visit_date`, and nothing pairs them up automatically. The field map is you saying which goes where.

Send us your Mailchimp merge tags and your Connect custom fields and we'll write the map for you. That's the fastest path and avoids the failure modes below.

If you'd rather do it yourself, it looks like this:

```json
{
  "LVISITDATE": { "key": "contact.last_visit_date", "type": "date" },
  "VISITS": "contact.number_of_visits"
}
```

Mailchimp's merge tag on the left, your Connect field on the right, prefixed with `contact.`

Two things that bite:

**Mark every date with `"type": "date"`**: Connect wants `YYYY-MM-DD` and Jane usually writes `MM/DD/YYYY`. An unmarked date lands as plain text, and then every date filter in Connect stops working without any error to tell you.

**Only map what you want in Connect**: some of what Jane writes into Mailchimp is clinical rather than marketing. Leave those out. Anything not in the map is ignored.

## Step 5: create the Vercel project

In Vercel: **Add New > Project**, pick the repository you forked, click **Import**.

Stop before deploying. Keys go in first.

## Step 6: add your keys

Vercel calls these Environment Variables, and they live in your account rather than in the code, which is how they stay private.

| Name | Value |
|---|---|
| `MAILCHIMP_API_KEY` | from step 3 |
| `MAILCHIMP_AUDIENCE_ID` | from step 3 |
| `GHL_TOKEN` | your Connect private integration token |
| `GHL_LOCATION_ID` | your Connect location ID |
| `FIELD_MAP` | your field map, pasted as one line |

`FIELD_MAP` has to be a single line with no line breaks. Paste the whole `{...}` block including the braces.

Two names are worth explaining: `GHL_TOKEN` and `GHL_LOCATION_ID` refer to GoHighLevel, the platform Connect is built on. If you go looking in the Connect settings for something labelled GoHighLevel you won't find it, those are the variable names, and the values come from your Connect account as described above.

## Step 7: deploy

Click **Deploy**. About a minute.

Vercel will generate a `CRON_SECRET` on its own once it sees the schedule. Nothing to do, and don't be surprised when it appears. It stops anyone who finds the sync address from triggering it.

## Step 8: check the first run, then turn off the Zap

The schedule runs daily in the early morning, so the first run may be the following day. To see it sooner, open the project in Vercel and trigger the cron job manually from the **Cron Jobs** tab.

Then read the **Logs** tab. A healthy run reports how many contacts it examined and how many it updated.

**Once that looks right, switch off your Mailchimp Zap in Zapier**: leaving both on means two systems doing identical work and your Zapier tasks still being consumed.

## What to expect afterwards

The first run is the big one, since it catches up everything currently in your audience. After that each run only touches what changed, usually a few dozen contacts.

**What syncs:** whatever you put in the field map, going from Mailchimp into Connect.

**What doesn't:** anyone unsubscribed in Mailchimp is never added to Connect. Deliberate, so nobody who opted out gets pulled back in.

**Unsubscribes:** if someone unsubscribes in Connect, the next run marks them unsubscribed in Mailchimp too, and Mailchimp passes that back to Jane. This only ever travels one direction. Nothing here can re-subscribe anyone.

## How often it runs

Once a day. **Vercel's free plan allows one cron run per day**, so that's the ceiling without paying.

Daily suits most clinics, since visit counts and last-visit dates aren't urgent. If you want it faster, that's a paid Vercel plan and we can talk through whether it's worth it for your volume.

## If something looks wrong

Vercel > your project > **Logs**. Every run records what it did, and any contact that failed is logged with its email address.

A few things are true by design and worth knowing before you go debugging:

- Nothing here deletes contacts.
- A blank value in Mailchimp is skipped rather than written, so a temporarily missing Jane value can't wipe good data in Connect.
- One failing contact is logged and skipped, and the rest of the run carries on.
- Worst case a run does nothing and the next one catches up.

If a run shows failures you can't place, send us the log and we'll read it.

## Things worth asking us

- Want other Mailchimp fields synced? Worth deciding together what belongs in Connect and what should stay clinical.
- Audience covering more than one location? Say so before switching it on.
- Want the field map written for you? Send your merge tags and custom fields.
